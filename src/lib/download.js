import { api } from './api.js'

/**
 * Device file saving.
 *
 * Two paths, in order of preference:
 *  1. File System Access API (showSaveFilePicker) — the user picks the folder, the
 *     file is written to disk and we keep the handle so "Open" works afterwards.
 *  2. A blob URL + <a download> click — the browser (Android Chrome included) hands
 *     the file to its download manager, which writes it to the device Downloads
 *     folder. The page cannot choose that folder; the OS does.
 *
 * Nothing is ever "saved" into the app's own database. The library only keeps a
 * record that a download happened.
 */

export const canPickDestination = () =>
  typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function'

function extFor(name) {
  const m = /\.([a-z0-9]{2,4})$/i.exec(String(name || ''))
  return m ? m[1].toLowerCase() : 'bin'
}

const MIME_BY_EXT = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  mp4: 'video/mp4',
}

function pickerTypes(fileName) {
  const ext = extFor(fileName)
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream'
  return [
    {
      description: `${ext.toUpperCase()} media`,
      accept: { [mime]: [`.${ext}`] },
    },
  ]
}

/** Ask the server whether a URL is an authorized, media-typed source. */
export async function resolveSource(url, fileName) {
  const data = await api.resolveDownload(url, fileName)
  return data
}

/**
 * Stream the file into memory with real progress, abortable.
 *
 * Two independent guards, because a download can fail in two different ways:
 *  - a caller abort (Cancel button) via `signal`
 *  - a stalled source: no bytes for `idleTimeoutMs`, which otherwise leaves the
 *    progress bar frozen forever with no error and no way back.
 */
export async function fetchWithProgress(
  streamUrl,
  { expectedSize = 0, onProgress, signal, idleTimeoutMs = 30000 } = {},
) {
  const controller = new AbortController()
  let stalled = false
  let idleTimer = null

  const forwardAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) forwardAbort()
    else signal.addEventListener('abort', forwardAbort, { once: true })
  }
  const armIdle = () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      stalled = true
      controller.abort()
    }, idleTimeoutMs)
  }

  try {
    const res = await fetch(streamUrl, { signal: controller.signal })
    if (!res.ok) {
      let message = `Download failed (HTTP ${res.status}).`
      try {
        const body = await res.json()
        if (body?.error) message = body.error
      } catch {
        /* not json */
      }
      throw Object.assign(new Error(message), { code: 'DOWNLOAD_HTTP' })
    }

    const total = Number(res.headers.get('content-length') || expectedSize || 0)
    if (!res.body?.getReader) {
      const blob = await res.blob()
      onProgress?.({ received: blob.size, total: blob.size || total, percent: 100 })
      return blob
    }

    const reader = res.body.getReader()
    const chunks = []
    let received = 0
    armIdle()
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read()
      if (done) break
      armIdle()
      chunks.push(value)
      received += value.length
      const pct = total ? Math.min(99, Math.round((received / total) * 100)) : 0
      onProgress?.({ received, total, percent: pct })
    }
    const blob = new Blob(chunks, { type: res.headers.get('content-type') || 'application/octet-stream' })
    onProgress?.({ received, total: total || received, percent: 100 })
    return blob
  } catch (err) {
    if (stalled) {
      throw Object.assign(
        new Error(
          `The download stalled — no data arrived for ${Math.round(idleTimeoutMs / 1000)}s. Use Retry to continue.`,
        ),
        { code: 'DOWNLOAD_STALLED' },
      )
    }
    throw err
  } finally {
    clearTimeout(idleTimer)
    if (signal) signal.removeEventListener('abort', forwardAbort)
  }
}

/**
 * Persist the blob to the device.
 * @returns {{method:'picker'|'browser', fileName:string, handle?:FileSystemFileHandle}}
 */
export async function saveBlob(blob, fileName) {
  if (canPickDestination()) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: pickerTypes(fileName),
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return { method: 'picker', fileName: handle.name || fileName, handle }
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw Object.assign(new Error('Save cancelled — the file was not written.'), { code: 'SAVE_CANCELLED' })
      }
      // Any other failure (permission, unsupported in this context) falls through
      // to the browser download manager instead of losing the file.
      console.warn('[jimmy-state] file picker unavailable, falling back', err?.name)
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke late: revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  return { method: 'browser', fileName }
}

/** Re-open a previously saved file when we hold its handle. */
export async function openSavedFile(handle) {
  if (!handle?.getFile) throw Object.assign(new Error('This file was saved by the browser, not by a file handle. Open it from your Downloads folder.'), { code: 'NO_HANDLE' })
  let permission = await handle.queryPermission?.({ mode: 'read' })
  if (permission !== 'granted') permission = await handle.requestPermission?.({ mode: 'read' })
  if (permission !== 'granted') throw Object.assign(new Error('Permission to read that file was not granted.'), { code: 'NO_PERMISSION' })
  const file = await handle.getFile()
  const url = URL.createObjectURL(file)
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
