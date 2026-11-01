import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Artwork, EmptyState, Section } from '../components/ui.jsx'
import { TrackTile, useTrackActions } from '../components/TrackBits.jsx'
import {
  IconChevron,
  IconDownload,
  IconHeart,
  IconLibrary,
  IconMic,
  IconPlay,
  IconSearch,
  IconVideo,
} from '../components/Icons.jsx'
import { useLibrary } from '../context/LibraryContext.jsx'
import { api } from '../lib/api.js'
import { formatBytes, timeAgo } from '../lib/format.js'

const STATUS_LABEL = {
  completed: 'Saved',
  downloading: 'Downloading',
  failed: 'Failed',
  cancelled: 'Cancelled',
  queued: 'Queued',
  resolving: 'Checking',
  saving: 'Writing',
}

function TrendingFirst({ track }) {
  const a = useTrackActions(track)
  if (!track) return null
  return (
    <button type="button" className="trending-first" onClick={a.play} aria-label={`Play ${track.title}`}>
      <Artwork src={track.artworkSmall || track.artwork} alt="" style={{ width: 74, height: 74, borderRadius: 16 }} />
      <div className="grow" style={{ textAlign: 'left', minWidth: 0 }}>
        <span className="trending-label">Trending now · #1</span>
        <strong className="truncate" style={{ display: 'block', fontSize: 15, marginTop: 2 }}>
          {track.title}
        </strong>
        <span className="tiny mute truncate" style={{ display: 'block' }}>
          {track.artist}
        </span>
      </div>
      <span className="trending-play">{a.isPlaying ? <IconPause size={18} /> : <IconPlay size={18} />}</span>
    </button>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const { identifications, watched, downloads, counts } = useLibrary()
  const [term, setTerm] = useState('')
  const [charts, setCharts] = useState({ loading: true, items: [], error: null })

  useEffect(() => {
    let alive = true
    api
      .charts(12)
      .then((data) => alive && setCharts({ loading: false, items: data.items || [], error: null }))
      .catch((err) => alive && setCharts({ loading: false, items: [], error: err.message }))
    return () => {
      alive = false
    }
  }, [])

  const submit = (event) => {
    event.preventDefault()
    const q = term.trim()
    if (!q) return
    navigate(`/search?q=${encodeURIComponent(q)}&mode=videos`)
  }

  const recentIds = identifications.slice(0, 6)
  const recentDownloads = downloads.filter((d) => d.status === 'completed').slice(0, 3)

  return (
    <>
      <div className="home-hero">
        <span className="eyebrow">Identify · Stream · Collect</span>
        <h1 style={{ marginTop: 4, marginBottom: 10 }}>
          Your sound, <span className="grad-text">on record.</span>
        </h1>

        <form onSubmit={submit} role="search">
          <label className="field">
            <IconSearch size={18} className="field-icon" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Songs, artists, videos, keywords"
              aria-label="Search music, artists, videos and keywords"
              enterKeyHint="search"
            />
            {term && (
              <button
                type="button"
                className="icon-btn"
                style={{ width: 28, height: 28 }}
                aria-label="Clear search"
                onClick={() => setTerm('')}
              >
                ×
              </button>
            )}
          </label>
        </form>

        <div className="row gap-8" style={{ marginTop: 12 }}>
          <Link to="/identify" className="btn btn-primary btn-sm">
            <IconMic size={15} /> Identify a song
          </Link>
          <Link to="/discover" className="btn btn-sm btn-ghost">
            Discover <IconChevron size={13} />
          </Link>
        </div>
      </div>

      <div className="quick-grid" style={{ marginTop: 18 }}>
        <Link to="/downloads" className="quick-card">
          <IconDownload size={19} />
          Downloads
        </Link>
        <Link to="/library" className="quick-card">
          <IconLibrary size={19} />
          My Library
        </Link>
        <Link to="/watch-later" className="quick-card">
          <IconHeart size={19} />
          Watch Later
        </Link>
        <Link to="/playlists" className="quick-card">
          <IconPlay size={19} />
          Playlists
        </Link>
      </div>

      <div className="grid-2" style={{ marginTop: 14, gap: 10 }}>
        <Link to="/library?tab=identified" className="card card-pad" style={{ padding: '12px 14px' }}>
          <div className="between">
            <div>
              <span className="eyebrow">Identified</span>
              <h3 style={{ fontSize: 22, marginTop: 2 }}>{counts.identifications}</h3>
            </div>
            <IconMic size={18} style={{ color: 'var(--blue-soft)' }} />
          </div>
        </Link>
        <Link to="/library?tab=favourites" className="card card-pad" style={{ padding: '12px 14px' }}>
          <div className="between">
            <div>
              <span className="eyebrow">Favourites</span>
              <h3 style={{ fontSize: 22, marginTop: 2 }}>{counts.favourites}</h3>
            </div>
            <IconHeart size={18} style={{ color: '#ff5d8f' }} />
          </div>
        </Link>
      </div>

      <Section
        title="Recently identified"
        to={recentIds.length ? '/library?tab=identified' : undefined}
        actionLabel="All Shazams"
      >
        {recentIds.length === 0 ? (
          <EmptyState
            icon={<span style={{ fontSize: 22 }}>🎧</span>}
            title="Nothing identified yet"
            action={
              <Link to="/identify" className="btn btn-sm btn-ghost" style={{ marginTop: 4 }}>
                Open Identify
              </Link>
            }
          >
            Matches land here with artwork, a verified badge and up to 30 related results.
          </EmptyState>
        ) : (
          <div className="hscroll">
            {recentIds.map((item) => (
              <div key={item.id} className="stack" style={{ gap: 6 }}>
                <TrackTile track={item.exact} />
                <span className="tiny mute">{timeAgo(item.at)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Trending now" to="/discover">
        {charts.loading ? (
          <div className="hscroll">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="track-tile">
                <div className="skeleton" style={{ width: 132, height: 132, borderRadius: 16 }} />
                <div className="skeleton" style={{ height: 10, width: 96 }} />
                <div className="skeleton" style={{ height: 9, width: 64 }} />
              </div>
            ))}
          </div>
        ) : charts.error ? (
          <div className="notice notice-info">
            <span aria-hidden="true">ⓘ</span>
            <div>
              Trending needs a connection to the Apple Music chart feed. {charts.error}
              <br />
              <Link to="/discover" className="section-link" style={{ marginTop: 6 }}>
                Retry in Discover <IconChevron size={13} />
              </Link>
            </div>
          </div>
        ) : charts.items.length === 0 ? (
          <EmptyState title="No chart data available" />
        ) : (
          <>
            {/* The chart's number one, given the space it deserves. */}
            <TrendingFirst track={charts.items[0]} />
            <div className="hscroll">
              {charts.items.slice(1).map((t) => (
                <TrackTile key={t.id} track={t} showRank />
              ))}
            </div>
          </>
        )}
      </Section>

      <Section title="Recently played videos" to="/videos" actionLabel="Open Videos">
        {watched.length === 0 ? (
          <EmptyState icon={<IconVideo size={22} />} title="No videos watched yet">
            Playback happens inside the app — nothing is downloaded when you watch.
          </EmptyState>
        ) : (
          <div className="hscroll">
            {watched.slice(0, 6).map((w) => (
              <Link key={w.videoId} to={`/watch/${w.videoId}`} className="stack" style={{ width: 190, gap: 7 }}>
                <Artwork
                  src={w.video?.thumbnail}
                  alt={w.video?.title}
                  style={{ width: 190, aspectRatio: '16/9', height: 'auto', borderRadius: 12 }}
                />
                <span className="tiny truncate" style={{ fontWeight: 600 }}>
                  {w.video?.title}
                </span>
                <span className="tiny mute truncate">{w.video?.channel}</span>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent downloads" to="/downloads" actionLabel="Download manager">
        {recentDownloads.length === 0 ? (
          <div className="card card-pad">
            <div className="between">
              <div>
                <span className="eyebrow">Downloads</span>
                <p className="small muted" style={{ marginTop: 4, maxWidth: '42ch' }}>
                  Save provider-published preview clips to your device. YouTube playback never downloads a file.
                </p>
              </div>
              <Link to="/downloads" className="btn btn-sm">
                Open <IconChevron size={14} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="list">
            {recentDownloads.map((d) => (
              <Link key={d.id} to="/downloads" className="list-row">
                <span className="dl-icon">
                  <IconDownload size={17} />
                </span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="track-row-title truncate" style={{ display: 'block' }}>
                    {d.fileName || d.title}
                  </span>
                  <span className="track-row-sub">
                    {STATUS_LABEL[d.status] || d.status}
                    {d.size ? ` · ${formatBytes(d.size)}` : ''} · {timeAgo(d.at)}
                  </span>
                </span>
                <IconChevron size={16} />
              </Link>
            ))}
          </div>
        )}
      </Section>
    </>
  )
}
