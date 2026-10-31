import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import VideoCard from '../components/VideoCard.jsx'
import { EmptyState, ErrorBlock, Loading, Section, Segmented } from '../components/ui.jsx'
import { IconClock, IconExternal, IconPlay, IconSearch, IconVideo } from '../components/Icons.jsx'
import { api } from '../lib/api.js'
import { useLibrary } from '../context/LibraryContext.jsx'

export default function Videos() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { watched, watchLater, savedVideoIds } = useLibrary()
  const [source, setSource] = useState('catalog')
  const [term, setTerm] = useState(params.get('q') || '')
  const [results, setResults] = useState({ loading: false, items: [], error: null, configured: true, ran: false })
  const [manual, setManual] = useState('')

  const search = async (query, mode = source) => {
    const q = String(query || '').trim()
    if (!q) return
    setResults({ loading: true, items: [], error: null, configured: true, ran: true })
    try {
      const data = mode === 'catalog' ? await api.catalogVideos(q, 24) : await api.searchVideos(q, 24)
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

  const switchSource = (next) => {
    setSource(next)
    if (term.trim()) search(term, next)
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
        Stream inside the app. Watching never downloads a file.
      </p>

      <Segmented
        label="Video source"
        value={source}
        onChange={switchSource}
        options={[
          { value: 'catalog', label: 'Music videos' },
          { value: 'youtube', label: 'YouTube' },
        ]}
      />

      <form onSubmit={submit} role="search" style={{ marginTop: 12 }}>
        <label className="field">
          <IconSearch size={18} className="field-icon" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={source === 'catalog' ? 'Search music videos by title or artist' : 'Search YouTube by title or keyword'}
            aria-label="Search videos"
            enterKeyHint="search"
          />
          <button type="submit" className="btn btn-sm" disabled={!term.trim()}>
            Search
          </button>
        </label>
      </form>

      {source === 'catalog' && !results.ran && (
        <div className="notice notice-info" style={{ marginTop: 14 }}>
          <IconPlay size={16} style={{ flex: 'none', marginTop: 1 }} />
          <div>
            <strong>Catalogue music videos play without any API key.</strong> Apple publishes a preview clip and cover
            for each video, so this tab works with no YouTube credentials. Keyword search on YouTube itself still needs
            a key.
          </div>
        </div>
      )}

      {results.loading && (
        <div style={{ marginTop: 16 }}>
          <Loading label={source === 'catalog' ? 'Searching the video catalogue…' : 'Searching YouTube…'} rows={4} />
        </div>
      )}

      {!results.loading && results.error && (
        <div style={{ marginTop: 16 }}>
          {source === 'youtube' && !results.configured ? (
            <>
              <div className="card card-pad">
                <span className="eyebrow">Setup</span>
                <h3 style={{ margin: '6px 0 8px' }}>YouTube search needs an API key</h3>
                <p className="small muted" style={{ marginBottom: 10 }}>
                  {results.error}
                </p>
                <ol className="small muted" style={{ paddingLeft: 18, margin: '0 0 12px', lineHeight: 1.7 }}>
                  <li>Create a project in Google Cloud and enable <b>YouTube Data API v3</b>.</li>
                  <li>Create an API key (restrict it to this server’s IP or the YouTube Data API).</li>
                  <li>Add <code>YOUTUBE_API_KEY=…</code> to <code>.env</code> and restart the server.</li>
                </ol>
                <p className="tiny mute">
                  Meanwhile, paste a link below — playback and title resolution work without a key.
                </p>
              </div>
              <div className="card card-pad" style={{ marginTop: 12 }}>
                <span className="eyebrow">Play a known video</span>
                <p className="tiny muted" style={{ margin: '6px 0 10px' }}>
                  Paste a YouTube link or 11-character id.
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
            </>
          ) : (
            <ErrorBlock error={results.error} onRetry={() => search(term)} />
          )}
        </div>
      )}

      {!results.loading && !results.error && results.ran && results.items.length === 0 && (
        <div style={{ marginTop: 16 }}>
          <EmptyState icon={<IconVideo size={22} />} title="No videos matched">
            Try a different title, artist or keyword{source === 'catalog' ? ', or switch to YouTube' : ''}.
          </EmptyState>
        </div>
      )}

      {results.items.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="section-head">
            <h2 style={{ fontSize: 16 }}>Results</h2>
            <span className="tiny mute">
              {results.items.length} {source === 'catalog' ? 'music videos' : 'videos'}
            </span>
          </div>
          <div className="video-grid">
            {results.items.map((v) => (
              <VideoCard key={v.videoId} video={v} />
            ))}
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
          {savedVideoIds.size} saved video{savedVideoIds.size === 1 ? '' : 's'} in your{' '}
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
          Watching streams the clip from the platform that hosts it. YouTube videos are never saved by this app. Catalogue
          previews are the only video files that can be downloaded, because the provider publishes them for that use.
        </p>
        <a
          className="section-link"
          style={{ marginTop: 8, display: 'inline-flex' }}
          href="https://www.youtube.com/"
          target="_blank"
          rel="noreferrer noopener"
        >
          Open YouTube <IconExternal size={12} />
        </a>
      </div>
    </>
  )
}
