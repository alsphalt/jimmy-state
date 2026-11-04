import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import { useLibrary, useToast } from './LibraryContext.jsx'
import { resolveSource, fetchWithProgress, saveBlob } from '../lib/download.js'
import { normalizeTrack } from '../lib/track.js'
import { isNativeApp } from '../lib/platform.js'
import { notify } from '../lib/native.js'

const DownloadsContext = createContext(null)

const ACTIVE = new Set(['queued', 'resolving', 'downloading', 'saving'])

function formatFromName(name) {
  const m = /\.([a-z0-9]{2,4})$/i.exec(String(name || ''))
  return m ? m[1].toLowerCase() : 'm4a'
}

function safeName(track) {
  const base = `${track.artist || 'Unknown'} - ${track.title || 'Track'}`.replace(/[\\/:*?"<>|]/g, ' ').trim()
  return `${base.slice(0, 90) || 'jimmy-state-track'}.m4a`
}

export function DownloadsProvider({ children }) {
  const { downloads, mergeDownload, removeDownload, ready, toast } = useLibrary()
  const controllers = useRef(new Map())
  const interruptedChecked = useRef(false)

  /**
   * A row left in an active state means the tab closed mid-transfer. Say so instead
   * of leaving a progress bar that will never move.
   */
  useEffect(() => {
    if (!ready || interruptedChecked.current) return
    interruptedChecked.current = true
    downloads
      .filter((d) => ACTIVE.has(d.status))
      .forEach((d) => {
        mergeDownload(
          {
            ...d,
            status: 'failed',
            error: 'Interrupted — the app was closed before the file finished saving.',
            updatedAt: new Date().toISOString(),
          },
          true,
        )
      })
  }, [ready, downloads, mergeDownload])

  const run = useCallback(
    async (record, controller) => {
      const track = normalizeTrack(record.track || record.trackMeta)
      const id = record.id
      // Local mirror so each patch builds on the previous one (percent -> completed).
      const recordRef = { current: { ...record } }
      const patch = (fields, persist = false) => {
        recordRef.current = { ...recordRef.current, ...fields, updatedAt: new Date().toISOString() }
        return mergeDownload(recordRef.current, persist)
      }

      if (!track?.previewUrl) {
        patch(
          {
            status: 'failed',
            error:
              'No authorized download source for this track. JIMMY STATE only saves audio that the provider publishes for download.',
          },
          true,
        )
        toast('Nothing to download', { title: track?.title, message: 'This track has no authorized file source.', type: 'err' })
        return
      }

      try {
        patch({ status: 'resolving', percent: 0, received: 0, error: null })
        const resolved = await resolveSource(track.previewUrl, recordRef.current.fileName || safeName(track))
        if (controller.signal.aborted) throw Object.assign(new Error('cancelled'), { code: 'ABORTED' })

        patch({
          status: 'downloading',
          fileName: resolved.fileName,
          format: resolved.format || formatFromName(resolved.fileName),
          size: resolved.size || 0,
          contentType: resolved.contentType,
          streamUrl: resolved.streamUrl,
        })

        const blob = await fetchWithProgress(resolved.streamUrl, {
          expectedSize: resolved.size,
          signal: controller.signal,
          onProgress: ({ received, total, percent }) => {
            patch({ received, size: total || resolved.size || 0, percent })
          },
        })

        if (controller.signal.aborted) throw Object.assign(new Error('cancelled'), { code: 'ABORTED' })

        patch({ status: 'saving', percent: 100 })
        const saved = await saveBlob(blob, resolved.fileName)

        patch(
          {
            status: 'completed',
            percent: 100,
            received: blob.size,
            size: blob.size,
            fileName: saved.fileName,
            method: saved.method,
            handle: saved.handle || null,
            uri: saved.uri || null,
            location: saved.location || null,
            completedAt: new Date().toISOString(),
            error: null,
          },
          true,
        )
        const nativeSave = String(saved.method || '').startsWith('native')
        toast('Download complete', {
          title: saved.fileName,
          message: nativeSave
            ? `Saved to ${saved.location}.`
            : saved.method === 'picker'
              ? 'Saved to the folder you chose.'
              : 'Handed to your browser download manager — check your Downloads folder.',
          type: 'ok',
          ttl: 6000,
        })
        // On a phone the user has usually switched apps by the time a file lands, so a
        // toast alone would be missed. The notification carries the real location.
        if (isNativeApp()) {
          notify({
            title: 'Download complete',
            body: `${track.artist ? `${track.artist} — ` : ''}${track.title || saved.fileName} saved to ${saved.location}.`,
          }).catch(() => undefined)
        }
      } catch (err) {
        const aborted = err?.code === 'ABORTED' || err?.name === 'AbortError' || controller.signal.aborted
        const cancelledByUser = err?.code === 'SAVE_CANCELLED'
        patch(
          {
            status: aborted || cancelledByUser ? 'cancelled' : 'failed',
            error: cancelledByUser
              ? 'Save cancelled — the file was not written to the device.'
              : aborted
                ? 'Download cancelled.'
                : err?.message || 'Download failed.',
          },
          true,
        )
        if (!aborted && !cancelledByUser) {
          toast('Download failed', { title: track.title, message: err?.message, type: 'err', ttl: 6000 })
        }
      } finally {
        controllers.current.delete(id)
      }
    },
    [mergeDownload, toast],
  )

  const start = useCallback(
    (rawTrack, { kind = 'audio', fileName = '' } = {}) => {
      const track = normalizeTrack(rawTrack)
      const id = `dl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      const record = {
        id,
        at: new Date().toISOString(),
        title: track.title,
        artist: track.artist,
        artwork: track.artwork,
        kind,
        format: kind === 'video' ? 'mp4' : 'm4a',
        size: 0,
        received: 0,
        percent: 0,
        status: 'queued',
        sourceUrl: track.previewUrl || '',
        fileName: fileName || '',
        track,
      }
      mergeDownload(record, true)
      const controller = new AbortController()
      controllers.current.set(id, controller)
      run(record, controller)
      return id
    },
    [mergeDownload, run],
  )

  const cancel = useCallback(
    (id) => {
      const controller = controllers.current.get(id)
      if (controller) controller.abort()
      const record = downloads.find((d) => d.id === id)
      if (record && !controller) {
        mergeDownload({ ...record, status: 'cancelled', error: 'Download cancelled.' }, true)
      }
    },
    [downloads, mergeDownload],
  )

  const retry = useCallback(
    (id) => {
      const record = downloads.find((d) => d.id === id)
      if (!record) return
      const controller = new AbortController()
      controllers.current.set(id, controller)
      run({ ...record, status: 'queued', percent: 0, received: 0, error: null }, controller)
    },
    [downloads, run],
  )

  const value = {
    downloads,
    start,
    cancel,
    retry,
    remove: removeDownload,
    activeCount: downloads.filter((d) => ACTIVE.has(d.status)).length,
    isDownloading: (key) =>
      downloads.some((d) => ACTIVE.has(d.status) && (d.track?.key || d.trackMeta?.key) === key),
  }

  return <DownloadsContext.Provider value={value}>{children}</DownloadsContext.Provider>
}

export function useDownloads() {
  const ctx = useContext(DownloadsContext)
  if (!ctx) throw new Error('useDownloads must be used inside DownloadsProvider')
  return ctx
}
