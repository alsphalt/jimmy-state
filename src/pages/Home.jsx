import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Recognizer from '../components/Recognizer.jsx'
import { Artwork, EmptyState, Loading, Section } from '../components/ui.jsx'
import { TrackTile } from '../components/TrackBits.jsx'
import { IconChevron, IconDownload, IconHeart, IconLibrary, IconPlay, IconSearch, IconVideo } from '../components/Icons.jsx'
import { useLibrary } from '../context/LibraryContext.jsx'
import { api } from '../lib/api.js'
import { timeAgo } from '../lib/format.js'

export default function Home() {
  const navigate = useNavigate()
  const { identifications, watched } = useLibrary()
  const [term, setTerm] = useState('')
  const [charts, setCharts] = useState({ loading: true, items: [], error: null })
  const [health, setHealth] = useState(null)

  useEffect(() => {
    let alive = true
    api
      .charts(12)
      .then((data) => alive && setCharts({ loading: false, items: data.items || [], error: null }))
      .catch((err) => alive && setCharts({ loading: false, items: [], error: err.message }))
    api.health().then((h) => alive && setHealth(h)).catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const submit = (event) => {
    event.preventDefault()
    const q = term.trim()
    if (!q) return
    navigate(`/search?q=${encodeURIComponent(q)}&mode=music`)
  }

  const recentIds = identifications.slice(0, 6)

  return (
    <>
      <div className="home-hero">
        <div className="between" style={{ marginBottom: 10 }}>
          <div>
            <span className="eyebrow">Identify · Stream · Collect</span>
            <h1 style={{ marginTop: 4 }}>
              Your sound, <span className="grad-text">on record.</span>
            </h1>
          </div>
        </div>

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
              <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Clear search" onClick={() => setTerm('')}>
                ×
              </button>
            )}
          </label>
        </form>
      </div>

      <div style={{ marginTop: 16 }}>
        <Recognizer hero />
      </div>

      {health && !health.capabilities?.musicRecognition && (
        <div className="notice" style={{ marginTop: 14 }}>
          <span aria-hidden="true">⚠</span>
          <div>
            <strong>Recognition is not configured on this server.</strong> Add ACRCloud credentials to <code>.env</code>{' '}
            and restart. Everything else in the library still works.
          </div>
        </div>
      )}

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
                Tap the D to start
              </Link>
            }
          >
            Your matches land here with artwork, a verified badge and up to 30 related results.
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
          <div className="hscroll">
            {charts.items.map((t) => (
              <TrackTile key={t.id} track={t} showRank />
            ))}
          </div>
        )}
      </Section>

      <Section title="Recently played videos" to="/videos" actionLabel="Open Videos">
        {watched.length === 0 ? (
          <EmptyState icon={<IconVideo size={22} />} title="No videos watched yet">
            Video playback happens right here in the app — nothing is downloaded when you watch.
          </EmptyState>
        ) : (
          <div className="hscroll">
            {watched.slice(0, 6).map((w) => (
              <Link
                key={w.videoId}
                to={`/watch/${w.videoId}`}
                className="stack"
                style={{ width: 190, gap: 7 }}
              >
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

      <div className="card card-pad" style={{ marginTop: 26 }}>
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
    </>
  )
}
