import { Link } from 'react-router-dom'
import { IconClock, IconHeart, IconPlay } from './Icons.jsx'
import { useLibrary } from '../context/LibraryContext.jsx'
import { formatDuration } from '../lib/format.js'
import { normalizeVideo } from '../lib/track.js'

export default function VideoCard({ video, compact = false }) {
  const v = normalizeVideo(video)
  const { toggleSavedVideo, toggleWatchLater, savedVideoIds, laterIds } = useLibrary()
  if (!v?.videoId) return null

  return (
    <div className={`video-card ${compact ? 'is-compact' : ''}`}>
      <Link to={`/watch/${v.videoId}`} className="video-thumb" aria-label={`Play ${v.title}`}>
        {v.thumbnail ? <img src={v.thumbnail} alt="" loading="lazy" decoding="async" /> : <div className="skeleton" style={{ height: '100%' }} />}
        <span className="video-dur">{v.durationSeconds ? formatDuration(v.durationSeconds) : '—'}</span>
        <span className="video-play" aria-hidden="true">
          <IconPlay size={18} />
        </span>
      </Link>
      <div className="row gap-8" style={{ alignItems: 'flex-start' }}>
        <Link to={`/watch/${v.videoId}`} className="grow" style={{ minWidth: 0 }}>
          <div className="video-title clamp-2">{v.title}</div>
          <div className="video-sub truncate">
            {v.channel}
            {v.views ? ` · ${Intl.NumberFormat(undefined, { notation: 'compact' }).format(v.views)} views` : ''}
          </div>
        </Link>
        <div className="row gap-6" style={{ flex: 'none' }}>
          <button
            type="button"
            className={`icon-btn ${laterIds.has(v.videoId) ? 'is-on' : ''}`}
            style={{ width: 32, height: 32 }}
            aria-label={laterIds.has(v.videoId) ? 'Remove from Watch Later' : 'Add to Watch Later'}
            aria-pressed={laterIds.has(v.videoId)}
            onClick={() => toggleWatchLater(v)}
          >
            <IconClock size={16} />
          </button>
          <button
            type="button"
            className={`icon-btn ${savedVideoIds.has(v.videoId) ? 'is-on' : ''}`}
            style={{ width: 32, height: 32 }}
            aria-label={savedVideoIds.has(v.videoId) ? 'Remove saved video' : 'Save video'}
            aria-pressed={savedVideoIds.has(v.videoId)}
            onClick={() => toggleSavedVideo(v)}
          >
            <IconHeart size={16} filled={savedVideoIds.has(v.videoId)} style={savedVideoIds.has(v.videoId) ? { color: '#ff5d8f' } : undefined} />
          </button>
        </div>
      </div>
    </div>
  )
}
