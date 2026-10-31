import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Segmented } from '../components/ui.jsx'
import {
  IconAlert,
  IconCheck,
  IconDownload,
  IconExternal,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconX,
} from '../components/Icons.jsx'
import { useDownloads } from '../context/DownloadsContext.jsx'
import { useLibrary, useToast } from '../context/LibraryContext.jsx'
import { canPickDestination, openSavedFile, saveBlob } from '../lib/download.js'
import { formatBytes, timeAgo } from '../lib/format.js'

const STATUS_TEXT = {
  queued: 'Queued',
  resolving: 'Checking the source…',
  downloading: 'Downloading',
  saving: 'Writing to device…',
  completed: 'Saved',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export default function Downloads() {
  const { downloads, start, cancel, retry, remove, activeCount } = useDownloads()
  const { toast } = useToast()
  const { db } = useLibrary()
  const [tab, setTab] = useState('all')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState('audio')
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    if (tab === 'active') return downloads.filter((d) => ['queued', 'resolving', 'downloading', 'saving'].includes(d.status))
    if (tab === 'done') return downloads.filter((d) => d.status === 'completed')
    if (tab === 'failed') return downloads.filter((d) => d.status === 'failed' || d.status === 'cancelled')
    return downloads
  }, [downloads, tab])

  const submitUrl = async (event) => {
    event.preventDefault()
    const raw = url.trim()
    if (!raw) return
    let parsed
    try {
      parsed = new URL(raw)
    } catch {
      toast('Invalid link', { message: 'Paste a full https:// URL to a media file.', type: 'err' })
      return
    }
    if (!/^https:$/.test(parsed.protocol)) {
      toast('Insecure link', { message: 'Only https:// sources can be saved.', type: 'err' })
      return
    }
    if (kind === 'video') {
      toast('Video downloads are limited', {
        message:
          'No video host is on the authorized list, so this file cannot be saved. Audio previews from the catalogue work.',
        type: 'err',
        ttl: 6000,
      })
      return
    }
    const base = decodeURIComponent(parsed.pathname.split('/').pop() || 'authorized-media')
      .replace(/\.[a-z0-9]{2,4}$/i, '')
      .slice(0, 80)
    setBusy(true)
    start(
      { title: base, artist: parsed.hostname, previewUrl: raw, artwork: '' },
      { kind: 'audio', fileName: base },
    )
    setUrl('')
    setBusy(false)
    setTab('active')
  }

  const openFile = async (record) => {
    try {
      if (record.handle) {
        await openSavedFile(record.handle)
        return
      }
      throw new Error(
        record.method === 'browser'
          ? 'Your browser saved this file through its download manager. Open it from the device Downloads folder.'
          : 'This file was saved without a retained handle. Look for it in your Downloads folder.',
      )
    } catch (err) {
      toast('Where to find it', { message: err.message, type: 'info', ttl: 6500 })
    }
  }

  return (
    <>
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">Authorized media only</span>
          <h1 style={{ marginTop: 4 }}>Downloads</h1>
        </div>
        <span className="tiny mute">{activeCount ? `${activeCount} active` : `${downloads.length} records`}</span>
      </div>

      <div className="notice notice-info" style={{ marginTop: 14 }}>
        <IconCheck size={16} style={{ flex: 'none', marginTop: 1 }} />
        <div>
          <strong>What can be downloaded.</strong> Catalogue preview clips (M4A, published by Apple for preview use) and
          files from hosts on the server’s authorized list. YouTube videos cannot be downloaded here — the embedded
          player only streams them.
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 14 }}>
        <span className="eyebrow">Save from a link</span>
        <p className="tiny muted" style={{ margin: '6px 0 10px' }}>
          Paste an https link to a file you own, have permission to save, or that the provider publishes for download.
        </p>
        <form onSubmit={submitUrl} className="stack gap-8">
          <div className="row gap-8">
            <input
              className="input-plain"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/track.m4a"
              inputMode="url"
              aria-label="Authorized media URL"
            />
          </div>
          <div className="row gap-8 wrap">
            <div className="tabs" style={{ flex: 'none' }}>
              <button type="button" className={`tab ${kind === 'audio' ? 'is-active' : ''}`} onClick={() => setKind('audio')}>
                Audio
              </button>
              <button type="button" className={`tab ${kind === 'video' ? 'is-active' : ''}`} onClick={() => setKind('video')}>
                Video
              </button>
            </div>
            <div className="grow" />
            <button type="submit" className="btn btn-sm btn-primary" disabled={!url.trim() || busy}>
              <IconPlus size={14} /> Add download
            </button>
          </div>
        </form>
        <p className="tiny mute" style={{ marginTop: 10 }}>
          Destination: {canPickDestination() ? 'you choose the folder (File System Access API)' : 'your browser’s download manager saves to the device Downloads folder'}.
        </p>
      </div>

      <div style={{ marginTop: 16 }}>
        <Segmented
          label="Download filters"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'done', label: 'Completed' },
            { value: 'failed', label: 'Failed' },
          ]}
        />
      </div>

      <div className="stack gap-10" style={{ marginTop: 14 }}>
        {filtered.length === 0 && (
          <EmptyState icon={<IconDownload size={22} />} title="Nothing here yet">
            Download a preview from any track, or paste an authorized link above. Progress, failures and retries all
            show up here.
          </EmptyState>
        )}

        {filtered.map((d) => {
          const active = ['queued', 'resolving', 'downloading', 'saving'].includes(d.status)
          return (
            <div key={d.id} className="dl-row">
              <div className="dl-top">
                <span className="dl-icon">
                  <IconDownload size={18} />
                </span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="track-row-title truncate">{d.fileName || d.title}</div>
                  <div className="track-row-sub truncate">
                    {d.artist} · {String(d.format || '').toUpperCase()}
                    {d.size ? ` · ${formatBytes(d.size)}` : ''}
                  </div>
                </div>
                <div className="row gap-6" style={{ flex: 'none' }}>
                  {active && (
                    <button type="button" className="icon-btn" aria-label="Cancel download" onClick={() => cancel(d.id)}>
                      <IconX size={17} />
                    </button>
                  )}
                  {(d.status === 'failed' || d.status === 'cancelled') && (
                    <button type="button" className="icon-btn" aria-label="Retry download" onClick={() => retry(d.id)}>
                      <IconRefresh size={17} />
                    </button>
                  )}
                  {d.status === 'completed' && (
                    <button type="button" className="icon-btn" aria-label="Open saved file" onClick={() => openFile(d)}>
                      <IconExternal size={17} />
                    </button>
                  )}
                  <button type="button" className="icon-btn" aria-label="Remove record" onClick={() => remove(d.id)}>
                    <IconTrash size={16} />
                  </button>
                </div>
              </div>

              <div className="dl-bar" aria-hidden="true">
                <i style={{ width: `${d.status === 'completed' ? 100 : d.percent || 0}%` }} />
              </div>

              <div className="dl-meta">
                <span className="row gap-6">
                  <span className={`status-dot ${d.status}`} />
                  {STATUS_TEXT[d.status] || d.status}
                  {active && d.size ? ` · ${formatBytes(d.received || 0)} / ${formatBytes(d.size)}` : ''}
                </span>
                <span>
                  {d.percent ? `${d.percent}% · ` : ''}
                  {timeAgo(d.at)}
                </span>
              </div>

              {d.error && (
                <div className={`notice ${d.status === 'failed' ? 'notice-error' : 'notice-info'}`} style={{ padding: '8px 10px', fontSize: 12 }}>
                  <IconAlert size={14} style={{ flex: 'none', marginTop: 1 }} />
                  <span>{d.error}</span>
                </div>
              )}

              {d.status === 'completed' && (
                <div className="tiny mute">
                  {d.method === 'picker'
                    ? 'Written to the folder you chose.'
                    : 'Handed to the browser’s download manager — check the device Downloads folder.'}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="card card-pad" style={{ marginTop: 22 }}>
        <span className="eyebrow">Storage &amp; permissions</span>
        <ul className="tiny muted" style={{ paddingLeft: 18, margin: '8px 0 0', lineHeight: 1.7 }}>
          <li>No storage permission is requested up front. Nothing broad is asked for.</li>
          <li>
            <b>Android / Chrome:</b> files go through the browser download manager into the device’s Downloads folder.
            The page cannot pick that folder for you.
          </li>
          <li>
            <b>Desktop Chrome / Edge:</b> a save dialog lets you choose the exact folder and filename.
          </li>
          <li>
            <b>iOS Safari:</b> the file lands in Files → Downloads and can be moved from there.
          </li>
          <li>Downloaded files are never stored inside the app database — only the record above.</li>
        </ul>
        <div className="row gap-8" style={{ marginTop: 12 }}>
          <Link to="/privacy" className="btn btn-sm btn-ghost">
            Privacy details
          </Link>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={async () => {
              try {
                const data = await db.exportAll()
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                const saved = await saveBlob(blob, `jimmy-state-library-${new Date().toISOString().slice(0, 10)}.json`)
                toast('Library exported', { title: saved.fileName, message: 'JSON copy written to your device.', type: 'ok' })
              } catch (err) {
                toast('Export failed', { message: err.message, type: 'err' })
              }
            }}
          >
            Export library JSON
          </button>
        </div>
      </div>
    </>
  )
}
