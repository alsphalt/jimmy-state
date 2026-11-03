import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconCheck, IconChevron, IconDownload, IconShield, IconTrash, IconX } from '../components/Icons.jsx'
import { useLibrary, useToast } from '../context/LibraryContext.jsx'
import { useInstallPrompt } from '../lib/install.js'
import { storageBackend } from '../lib/db.js'
import { saveBlob } from '../lib/download.js'
import { formatBytes } from '../lib/format.js'

function StatusRow({ ok, label, detail }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <b style={{ color: ok ? 'var(--green)' : 'var(--amber)' }}>
        {ok ? 'Ready' : 'Not configured'}
        <span className="tiny mute" style={{ display: 'block', fontWeight: 400 }}>
          {detail}
        </span>
      </b>
    </div>
  )
}

export default function Services() {
  const { counts, eraseAll, db } = useLibrary()
  const { toast } = useToast()
  const install = useInstallPrompt()
  const [health, setHealth] = useState(null)
  const [usage, setUsage] = useState(null)
  const [confirmErase, setConfirmErase] = useState(false)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null))
    navigator.storage?.estimate?.().then((e) => setUsage(e)).catch(() => {})
  }, [])

  const exportLibrary = async () => {
    try {
      const data = await db.exportAll()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const saved = await saveBlob(blob, `jimmy-state-library-${new Date().toISOString().slice(0, 10)}.json`)
      toast('Library exported', { title: saved.fileName, type: 'ok' })
    } catch (err) {
      toast('Export failed', { message: err.message, type: 'err' })
    }
  }

  const erase = async () => {
    await eraseAll()
    setConfirmErase(false)
  }

  return (
    <>
      <h1>Settings</h1>
      <p className="tiny mute" style={{ marginTop: -6 }}>
        Services, storage and device. Appearance lives in Settings from the menu.
      </p>

      <div className="card card-pad" style={{ marginTop: 14 }}>
        <span className="eyebrow">Services</span>
        {!health && <p className="tiny muted" style={{ marginTop: 8 }}>Checking the server…</p>}
        {health && (
          <>
            <StatusRow
              ok={health.capabilities.musicRecognition}
              label="Music recognition (ACRCloud)"
              detail={health.capabilities.musicRecognition ? 'Identification live' : 'Add ACR_ACCESS_KEY / ACR_ACCESS_SECRET'}
            />
            <StatusRow
              ok={health.capabilities.youtubeSearch}
              label="YouTube search"
              detail={health.capabilities.youtubeSearch ? 'Data API v3 live' : 'Add YOUTUBE_API_KEY'}
            />
            <StatusRow ok label="Music catalogue" detail="iTunes Search API + Apple charts" />
            <div className="kv">
              <span>Download hosts</span>
              <b className="truncate" style={{ maxWidth: '60%' }}>
                {health.downloadHosts?.join(', ')}
              </b>
            </div>
          </>
        )}
      </div>

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <span className="eyebrow">App installation</span>
        <p className="small muted" style={{ marginTop: 6 }}>
          {install.installed
            ? 'JIMMY STATE is installed on this device.'
            : install.canInstall
              ? 'Your browser supports installing this app.'
              : 'This browser has not offered an install prompt. In Chrome use ⋮ → “Add to Home screen”. On iPhone use Share → “Add to Home Screen”.'}
        </p>
        {install.canInstall && !install.installed && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ marginTop: 10 }}
            disabled={install.busy}
            onClick={install.install}
          >
            {install.busy ? 'Opening…' : 'Install JIMMY STATE'}
          </button>
        )}
        {install.withinDismissWindow && !install.installed && (
          <p className="tiny mute" style={{ marginTop: 8 }}>
            Banner dismissed — it can appear again in about {install.hoursLeft}h.
          </p>
        )}
      </div>

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <span className="eyebrow">Storage</span>
        <div className="kv">
          <span>Database</span>
          <b>{storageBackend()}</b>
        </div>
        <div className="kv">
          <span>Saved items</span>
          <b>
            {counts.identifications} ids · {counts.favourites} favourites · {counts.videos} videos
          </b>
        </div>
        <div className="kv">
          <span>Playlists / downloads</span>
          <b>
            {counts.playlists} / {counts.downloads}
          </b>
        </div>
        {usage && (
          <div className="kv">
            <span>Browser storage used</span>
            <b>
              {formatBytes(usage.usage)} of {formatBytes(usage.quota)}
            </b>
          </div>
        )}
        <div className="row gap-8 wrap" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-sm" onClick={exportLibrary}>
            <IconDownload size={14} /> Export library
          </button>
          {!confirmErase ? (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => setConfirmErase(true)}>
              <IconTrash size={14} /> Erase local library
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-sm btn-danger" onClick={erase}>
                <IconCheck size={14} /> Yes, erase everything
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmErase(false)}>
                <IconX size={14} /> Cancel
              </button>
            </>
          )}
        </div>
        <p className="tiny mute" style={{ marginTop: 10 }}>
          Erasing clears identifications, favourites, saved videos, playlists, download records and search history on
          this device. Files already saved to your phone or computer are untouched. There is no cloud sync — clearing
          browser data removes this library permanently.
        </p>
      </div>

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <span className="eyebrow">Microphone</span>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          Access is requested only when you tap the D. If you blocked it, re-enable the microphone for this site in your
          browser’s site settings, then reload. Capture stops automatically after 10 seconds, when the match starts, or
          when you cancel.
        </p>
      </div>

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <span className="eyebrow">Catalogue region</span>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          Storefront and chart region is set on the server with <code>CATALOG_COUNTRY</code> (currently{' '}
          <b>{health?.capabilities ? 'server-configured' : '…'}</b>). It is not a per-device setting, so changing it here
          would be cosmetic.
        </p>
      </div>

      <div className="list" style={{ marginTop: 14 }}>
        <Link to="/privacy" className="list-row">
          <span className="dl-icon">
            <IconShield size={17} />
          </span>
          <span className="grow">
            <span className="track-row-title" style={{ display: 'block' }}>
              Privacy &amp; data
            </span>
            <span className="track-row-sub">What is stored, what is sent, and where</span>
          </span>
          <IconChevron size={16} />
        </Link>
        <Link to="/downloads" className="list-row">
          <span className="dl-icon">
            <IconDownload size={17} />
          </span>
          <span className="grow">
            <span className="track-row-title" style={{ display: 'block' }}>
              Download manager
            </span>
            <span className="track-row-sub">Authorized files, progress and errors</span>
          </span>
          <IconChevron size={16} />
        </Link>
      </div>

      <p className="tiny mute" style={{ marginTop: 18, textAlign: 'center' }}>
        JIMMY STATE · v1.0.0 · built for the web, installed like an app.
      </p>
    </>
  )
}
