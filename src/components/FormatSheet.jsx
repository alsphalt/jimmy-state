import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconCheck, IconDownload, IconMusic, IconVideo, IconX } from './Icons.jsx'

/**
 * Format picker for a download.
 *
 * It is one real option, not a fake menu. A provider publishes exactly one file per item,
 * so there is no bitrate or resolution to choose — inventing "1080p / 720p / 480p" rows
 * would be a selector that quietly downloads the same bytes every time.
 *
 * MP3 is shown disabled with the reason instead of being hidden, so a missing option reads
 * as a limit rather than a bug.
 */
export default function FormatSheet({ item, downloads, onClose }) {
  const video = item?.video || item
  const hasFile = Boolean(video?.previewUrl)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="tube-sheet-overlay" role="dialog" aria-modal="true" aria-label="Choose a format" onClick={onClose}>
      <div className="tube-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="row" style={{ alignItems: 'center' }}>
          <strong className="grow truncate">{video?.title || 'Download'}</strong>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>
        <p className="tiny mute" style={{ marginTop: 2 }}>
          {video?.artist || video?.channel || ''}
        </p>

        <button
          type="button"
          className="tube-format"
          disabled={!hasFile || done}
          onClick={() => {
            downloads.start(video, { kind: 'video' })
            setDone(true)
          }}
        >
          <span className="dl-icon" aria-hidden="true"><IconVideo size={16} /></span>
          <span className="grow" style={{ textAlign: 'left' }}>
            <b>MP4 · video</b>
            <span className="tiny mute" style={{ display: 'block' }}>
              {hasFile
                ? 'The one file the provider publishes — no other quality exists to pick.'
                : 'No downloadable file for this item'}
            </span>
          </span>
          {done ? <IconCheck size={16} /> : <IconDownload size={16} />}
        </button>

        <div className="tube-format is-disabled" aria-disabled="true">
          <span className="dl-icon" aria-hidden="true"><IconMusic size={16} /></span>
          <span className="grow" style={{ textAlign: 'left' }}>
            <b>MP3 · audio</b>
            <span className="tiny mute" style={{ display: 'block' }}>
              Providers publish no standalone audio file for this item, so there is nothing to convert.
            </span>
          </span>
        </div>

        <Link to="/downloads" className="btn btn-sm btn-ghost" style={{ marginTop: 12 }} onClick={onClose}>
          Open download manager
        </Link>
      </div>
    </div>
  )
}
