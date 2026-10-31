import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import YouTubePlayer from '../components/YouTubePlayer.jsx'
import VideoCard from '../components/VideoCard.jsx'
import { EmptyState, Loading } from '../components/ui.jsx'
import {
  IconArrowLeft,
  IconClock,
  IconAlert,
  IconDownload,
  IconExternal,
  IconHeart,
  IconShield,
} from '../components/Icons.jsx'
import { api } from '../lib/api.js'
import { useLibrary } from '../context/LibraryContext.jsx'
import { useDownloads } from '../context/DownloadsContext.jsx'
import { formatDate, formatDuration } from '../lib/format.js'
import { normalizeVideo } from '../lib/track.js'

const isCatalogId = (id) => /^mv-\d+$/.test(id)

export default function Watch() {
  const { id } = useParams()
  const catalog = isCatalogId(id)
  const { recordWatched, toggleSavedVideo, toggleWatchLater, savedVideoIds, laterIds, watched, watchLater, videos } =
    useLibrary()
  const { start: startDownload, isDownloading } = useDownloads()
  const [video, setVideo] = useState(null)
  const [state, setState] = useState({ loading: true, error: null, partial: false })
  const [related, setRelated] = useState({ loading: true, items: [], error: null })

  const cached = [...watched, ...watchLater, ...videos].find((v) => v.videoId === id)?.video

  useEffect(() => {
    let alive = true
    setState({ loading: true, error: null, partial: false })
    if (cached) setVideo(cached)

    const request = catalog ? api.catalogVideo(id.replace('mv-', '')) : api.video(id)
    request
      .then((data) => {
        if (!alive) return
        setVideo(data.video)
        setState({ loading: false, error: null, partial: Boolean(data.partial) })
      })
      .catch((err) => {
        if (!alive) return
        setState({
          loading: false,
          error: err.code === 'YOUTUBE_NOT_CONFIGURED' ? 'unconfigured' : err.message,
          partial: false,
        })
      })

    setRelated({ loading: !catalog, items: [], error: null })
    if (!catalog) {
      api
        .related(id)
        .then((data) => alive && setRelated({ loading: false, items: data.items || [], error: null }))
        .catch(() => alive && setRelated({ loading: false, items: [], error: null }))
    }

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const onPlaying = () => {
    if (video) recordWatched(video)
  }

  const download = () => {
    if (!video?.previewUrl) return
    startDownload(
      {
        key: `video:${id}`,
        title: video.title,
        artist: video.channel,
        artwork: video.thumbnail,
        previewUrl: video.previewUrl,
      },
      { kind: 'video', fileName: `${video.title}.mp4` },
    )
  }

  const saved = savedVideoIds.has(id)
  const later = laterIds.has(id)
  const downloadable = Boolean(catalog && video?.previewUrl)

  return (
    <>
      <div className="between" style={{ marginBottom: 12 }}>
        <Link to="/videos" className="btn btn-sm btn-ghost">
          <IconArrowLeft size={16} /> Videos
        </Link>
        <div className="row gap-6">
          <button
            type="button"
            className={`icon-btn ${later ? 'is-on' : ''}`}
            aria-label={later ? 'Remove from Watch Later' : 'Add to Watch Later'}
            aria-pressed={later}
            onClick={() => video && toggleWatchLater(video)}
          >
            <IconClock size={19} />
          </button>
          <button
            type="button"
            className={`icon-btn ${saved ? 'is-on' : ''}`}
            aria-label={saved ? 'Remove saved video' : 'Save video'}
            aria-pressed={saved}
            onClick={() => video && toggleSavedVideo(video)}
          >
            <IconHeart size={19} filled={saved} style={saved ? { color: '#ff5d8f' } : undefined} />
          </button>
          <a
            className="icon-btn"
            href={catalog ? video?.storeUrl || 'https://music.apple.com/' : `https://www.youtube.com/watch?v=${id}`}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Open on the source platform"
          >
            <IconExternal size={19} />
          </a>
        </div>
      </div>

      {catalog ? (
        video?.previewUrl ? (
          <div className="player-frame">
            <video
              src={video.previewUrl}
              poster={video.thumbnail}
              controls
              playsInline
              preload="metadata"
              onPlay={onPlaying}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#000' }}
            />
          </div>
        ) : (
          <div className="player-frame center">
            {state.loading ? <span className="spinner spinner-lg" /> : <span className="tiny mute">No preview published</span>}
          </div>
        )
      ) : (
        <>
          <YouTubePlayer videoId={id} onPlaying={onPlaying} />
          <div className="row gap-6 wrap" style={{ marginTop: 8 }}>
            <span className="badge badge-live">Full video</span>
            <span className="tiny mute">streams from YouTube · resumes where you stopped</span>
          </div>
        </>
      )}

      <div style={{ marginTop: 14 }}>
        {state.loading && !video && <Loading label="Loading video details…" rows={1} />}
        {video ? (
          <>
            <h1 style={{ fontSize: 20, lineHeight: 1.3 }} className="balance">
              {video.title}
            </h1>
            <div className="row gap-8 wrap tiny mute" style={{ marginTop: 6 }}>
              <span>{video.channel}</span>
              {video.views ? <span>· {new Intl.NumberFormat().format(video.views)} views</span> : null}
              {video.durationSeconds ? <span>· {formatDuration(video.durationSeconds)}</span> : null}
              {video.publishedAt ? <span>· {formatDate(video.publishedAt)}</span> : null}
              {catalog && video.kind === 'music-video' ? <span>· Apple Music video</span> : null}
            </div>
            {video.description && (
              <p
                className="small muted"
                style={{ marginTop: 10, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'hidden' }}
              >
                {video.description.slice(0, 400)}
              </p>
            )}
          </>
        ) : (
          !state.loading &&
          state.error && (
            <div className="card card-pad">
              <span className="eyebrow">Metadata</span>
              <p className="small muted" style={{ marginTop: 6 }}>
                {state.error === 'unconfigured'
                  ? 'Video details need YOUTUBE_API_KEY. Playback still works for a valid video id.'
                  : state.error}
              </p>
            </div>
          )
        )}
      </div>

      {downloadable ? (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <div className="row gap-8" style={{ marginBottom: 8 }}>
            <IconDownload size={16} style={{ color: 'var(--cyan)' }} />
            <strong style={{ fontSize: 13 }}>Download this preview</strong>
          </div>
          <p className="tiny muted">
            The provider publishes this clip for preview use, so it can be saved — a short M4V, not the full video.
          </p>
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: 10 }}
            onClick={download}
            disabled={isDownloading(`video:${id}`)}
          >
            <IconDownload size={14} /> {isDownloading(`video:${id}`) ? 'Downloading…' : 'Save M4V to device'}
          </button>
        </div>
      ) : (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <div className="row gap-8" style={{ marginBottom: 8 }}>
            <IconAlert size={16} style={{ color: 'var(--amber)' }} />
            <strong style={{ fontSize: 13 }}>Download not available for YouTube videos</strong>
          </div>
          <p className="tiny muted">
            A YouTube API key authorizes search and embedded playback — not downloading or audio extraction. JIMMY STATE
            does not bypass platform restrictions, so no download button is shown here.
          </p>
          <div className="row gap-8 wrap" style={{ marginTop: 10 }}>
            <Link to="/downloads" className="btn btn-sm">
              Authorized downloads
            </Link>
            <a
              className="btn btn-sm btn-ghost"
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                `${video?.title || ''} ${video?.channel || ''}`,
              )}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              Find official releases <IconExternal size={14} />
            </a>
          </div>
        </div>
      )}

      {related.items.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 style={{ fontSize: 16 }}>Related videos</h2>
          </div>
          <div className="video-grid">
            {related.items.map((v) => (
              <VideoCard key={v.videoId} video={v} />
            ))}
          </div>
        </section>
      )}

      {related.loading && (
        <div style={{ marginTop: 20 }}>
          <Loading label="Loading related videos…" rows={2} />
        </div>
      )}

      {!catalog && !related.loading && related.items.length === 0 && (
        <div style={{ marginTop: 20 }}>
          <EmptyState icon={<IconShield size={20} />} title="No related videos">
            Related results need the YouTube Data API. Nothing is shown when reliable data is unavailable.
          </EmptyState>
        </div>
      )}

      <p className="tiny mute" style={{ marginTop: 20 }}>
        {catalog
          ? 'Preview clip published by Apple for this music video. Playback and download both use that clip.'
          : 'Playback uses the official YouTube IFrame Player API. Streaming does not save the video to this device.'}
      </p>
      {!catalog && normalizeVideo(video)?.watchUrl && (
        <p className="tiny mute" style={{ marginTop: 6 }}>
          Source:{' '}
          <a href={normalizeVideo(video).watchUrl} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--cyan)' }}>
            youtube.com
          </a>
        </p>
      )}
    </>
  )
}
