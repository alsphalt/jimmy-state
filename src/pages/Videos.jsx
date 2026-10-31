import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import VideoCard from '../components/VideoCard.jsx'
import { EmptyState, ErrorBlock, Loading, Section } from '../components/ui.jsx'
import { IconClock, IconPlay, IconSearch, IconVideo } from '../components/Icons.jsx'
import { api } from '../lib/api.js'
import { useLibrary } from '../context/LibraryContext.jsx'

export default function Videos() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { watched, watchLater, savedVideoIds } = useLibrary()
  const [term, setTerm] = useState(params.get('q') || '')
  const [results, setResults] = useState({ loading: false, items: [], error: null, configured: true, ran: false })
  const [manual, setManual] = useState('')

  const search = async (query) => {
    const q = String(query || '').trim()
    if (!q) return
    setResults({ loading: true, items: [], error: null, configured: true, ran: true })
    try {
      const data = await api.searchVideos(q, 24)
      setResults({ loading: false, items: data.items || [], error: null, configured: true, ran: true })
    } catch (err) {
      setResults({
        loading: false,
        items: [],
        error: err.message,
        configured: err.code !== 'YOUTUBE_NOT_CONFIGURED',
        ran: true,
      })
    }
  }

  useEffect(() => {
    const q = params.get('q')
    if (q) {
      setTerm(q)
      search(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = (event) => {
    event.preventDefault()
    search(term)
  }

  const playManual = (event) => {
    event.preventDefault()
    const raw = manual.trim()
    const id =
      /^[A-Za-z0-9_-]{11}$/.test(raw)
        ? raw
        : raw.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/)?.[1] || ''
    if (!id) {
      setResults((r) => ({ ...r, error: 'That does not look like a YouTube link or video id.', ran: true, loading: false }))
      return
    }
    navigate(`/watch/${id}`)
  }

  return (
    <>
      <h1>Videos</h1>
      <p className="small muted" style={{ marginTop: 4, marginBottom: 14 }}>
        Stream inside the app with the official YouTube player. Watching never downloads a file.
      </p>

      <form onSubmit={submit} role="search">
        <label className="field">
          <IconSearch size={18} className="field-icon" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search videos by title or keyword"
            aria-label="Search videos"
            enterKeyHint="search"
          />
          <button type="submit" className="btn btn-sm" disabled={!term.trim()}>
            Search
          </button>
        </label>
      </form>

      {results.loading && <div style={{ marginTop: 16 }}><Loading label="Searching YouTube…" rows={4} /></div>}

      {!results.loading && results.error && (
        <div style={{ marginTop: 16 }}>
          <div className="card card-pad">
            <span className="eyebrow">Setup</span>
            <h3 style={{ margin: '6px 0 8px' }}>Video search needs an API key</h3>
            <p className="small muted" style={{ marginBottom: 10 }}>
              {results.error}
            </p>
            <ol className="small muted" style={{ paddingLeft: 18, margin: '0 0 12px', lineHeight: 1.7 }}>
              <li>Create a project in Google Cloud and enable <b>YouTube Data API v3</b>.</li>
              <li>Create an API key (restrict it to this server’s IP or the YouTube Data API).</li>
              <li>Add <code>YOUTUBE_API_KEY=…</code> to <code>.env</code> and restart the server.</li>
            </ol>
            <p className="tiny mute">
              A key allows search only. It does not authorize downloading YouTube videos, and this app never offers
              that.
            </p>
          </div>

          <div className="card card-pad" style={{ marginTop: 12 }}>
            <span className="eyebrow">Play a known video</span>
            <p className="tiny muted" style={{ margin: '6px 0 10px' }}>
              Playback itself does not need a key — paste a YouTube link or 11-character id.
            </p>
            <form onSubmit={playManual} className="row gap-8">
              <input
                className="input-plain"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="https://youtube.com/watch?v=…"
                aria-label="YouTube link or video id"
              />
              <button type="submit" className="btn btn-sm btn-primary" disabled={!manual.trim()}>
                Play
              </button>
            </form>
          </div>
        </div>
      )}

      {!results.loading && !results.error && results.ran && results.items.length === 0 && (
        <div style={{ marginTop: 16 }}>
          <EmptyState icon={<IconVideo size={22} />} title="No videos matched">
            Try a different title, artist or keyword.
          </EmptyState>
        </div>
      )}

      {results.items.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="section-head">
            <h2 style={{ fontSize: 16 }}>Results</h2>
            <span className="tiny mute">{results.items.length} videos</span>
          </div>
          <div className="video-grid">
            {results.items.map((v) => (
              <VideoCard key={v.videoId} video={v} />
            ))}
          </div>
        </div>
      )}

      {!results.ran && (
        <div style={{ marginTop: 18 }}>
          <div className="notice notice-info">
            <IconPlay size={17} style={{ flex: 'none', marginTop: 1 }} />
            <div>
              Search runs against the YouTube Data API from this app’s server. Results show thumbnails, channels and
              durations when the API returns them.
            </div>
          </div>
        </div>
      )}

      {watched.length > 0 && (
        <Section title="Recently watched" to="/watch-later" actionLabel="Watch Later">
          <div className="hscroll">
            {watched.slice(0, 8).map((w) => (
              <div key={w.videoId} style={{ width: 210 }}>
                <VideoCard video={w.video} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {watchLater.length > 0 && (
        <Section title="Watch Later" to="/watch-later">
          <div className="hscroll">
            {watchLater.slice(0, 8).map((w) => (
              <div key={w.videoId} style={{ width: 210 }}>
                <VideoCard video={w.video} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {savedVideoIds.size > 0 && (
        <p className="tiny mute" style={{ marginTop: 18 }}>
          You have {savedVideoIds.size} saved video{savedVideoIds.size === 1 ? '' : 's'} in your{' '}
          <Link to="/library?tab=videos" className="section-link">
            library
          </Link>
          .
        </p>
      )}

      <div className="card card-pad" style={{ marginTop: 22 }}>
        <div className="row gap-8" style={{ marginBottom: 6 }}>
          <IconClock size={16} />
          <strong style={{ fontSize: 13 }}>Streaming ≠ downloading</strong>
        </div>
        <p className="tiny muted">
          Watching streams the video from YouTube with the official embedded player. It is never saved to your device by
          this app, and no YouTube download button is ever shown.
        </p>
      </div>
    </>
  )
}
