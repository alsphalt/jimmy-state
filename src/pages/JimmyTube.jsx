import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import VideoCard from '../components/VideoCard.jsx'
import { EmptyState, ErrorBlock, Loading, Section } from '../components/ui.jsx'
import { IconSearch, IconTube, IconVideo } from '../components/Icons.jsx'
import { api } from '../lib/api.js'
import { useLibrary } from '../context/LibraryContext.jsx'

/**
 * Jimmy Tube — search and watch video.
 *
 * Same job the reference app did (type something, get results, press play), built on
 * what this project actually has: the YouTube Data API behind /api/videos/search and the
 * official embedded player at /watch/:id, which plays the full upload and resumes long
 * mixes. No download buttons: extraction from a platform is not something this app does.
 */
const QUICK = ['Amapiano mix', 'Afrobeats 2026', 'Gospel worship', 'Hip hop classics', 'Live session', 'Long mix']

export default function JimmyTube() {
  const [params, setParams] = useSearchParams()
  const { watched, watchLater } = useLibrary()
  const initialQ = params.get('q') || ''

  const [term, setTerm] = useState(initialQ)
  const [state, setState] = useState({ loading: false, items: [], error: null, ran: false, notice: '', source: '' })

  const run = async (query) => {
    const q = String(query || '').trim()
    if (!q) return
    setState({ loading: true, items: [], error: null, ran: true, notice: '', source: '' })
    try {
      const data = await api.searchVideos(q, 24)
      setState({ loading: false, items: data.items || [], error: null, ran: true, notice: '', source: 'youtube' })
    } catch (err) {
      // A missing key is a configuration state, not a failure: fall back to the catalogue
      // and say which list is on screen instead of showing an empty page.
      if (err.code === 'YOUTUBE_NOT_CONFIGURED') {
        try {
          const data = await api.catalogVideos(q, 24)
          setState({
            loading: false,
            items: data.items || [],
            error: null,
            ran: true,
            source: 'catalog',
            notice: 'YouTube search is not configured, so these are catalogue music videos.',
          })
          return
        } catch (fallbackError) {
          setState({ loading: false, items: [], error: fallbackError.message, ran: true, notice: '', source: '' })
          return
        }
      }
      setState({ loading: false, items: [], error: err.message, ran: true, notice: '', source: '' })
    }
  }

  const lastRun = useRef('')
  useEffect(() => {
    if (!initialQ || lastRun.current === initialQ) return
    lastRun.current = initialQ
    setTerm(initialQ)
    run(initialQ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ])

  const go = (query) => {
    const q = String(query || '').trim()
    if (!q) return
    lastRun.current = q
    setTerm(q)
    setParams({ q }, { replace: true })
    run(q)
  }

  const submit = (event) => {
    event.preventDefault()
    go(term)
  }

  return (
    <>
      <div className="row gap-10" style={{ alignItems: 'center' }}>
        <span
          className="dl-icon"
          style={{ width: 38, height: 38, borderRadius: 12, color: 'var(--red)' }}
          aria-hidden="true"
        >
          <IconTube size={19} />
        </span>
        <div>
          <h1 style={{ margin: 0 }}>Jimmy Tube</h1>
          <p className="tiny mute">Search any video. Watch it here, in full.</p>
        </div>
      </div>

      <form onSubmit={submit} role="search" style={{ marginTop: 12 }}>
        <label className="field">
          <IconSearch size={18} className="field-icon" />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Songs, artists, mixes, live sessions…"
            aria-label="Search Jimmy Tube"
            enterKeyHint="search"
            spellCheck="false"
          />
        </label>
        <div className="row gap-8 wrap" style={{ marginTop: 10 }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!term.trim() || state.loading}>
            <IconSearch size={15} /> {state.loading ? 'Searching…' : 'Search'}
          </button>
          {QUICK.map((q) => (
            <button key={q} type="button" className="chip" onClick={() => go(q)} disabled={state.loading}>
              {q}
            </button>
          ))}
        </div>
      </form>

      {state.notice && (
        <div className="card card-pad" style={{ marginTop: 14 }}>
          <p className="tiny muted">{state.notice}</p>
        </div>
      )}

      {state.loading && (
        <div style={{ marginTop: 16 }}>
          <Loading label="Looking for videos…" rows={4} />
        </div>
      )}

      {!state.loading && state.error && (
        <div style={{ marginTop: 16 }}>
          <ErrorBlock error={state.error} onRetry={() => run(term || initialQ)} />
        </div>
      )}

      {!state.loading && !state.error && state.ran && state.items.length === 0 && (
        <div style={{ marginTop: 16 }}>
          <EmptyState icon={<IconVideo size={22} />} title="Nothing matched">
            Try a different word, or one of the searches above.
          </EmptyState>
        </div>
      )}

      {state.items.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="section-head">
            <h2 style={{ fontSize: 16 }}>Results</h2>
            <span className="tiny mute">
              {state.items.length} {state.source === 'catalog' ? 'music videos' : 'videos'}
            </span>
          </div>
          <div className="video-grid">
            {state.items.map((video) => (
              <VideoCard key={video.videoId} video={video} />
            ))}
          </div>
        </div>
      )}

      {!state.ran && watched.length > 0 && (
        <Section title="Keep watching" to="/watch-later" actionLabel="Watch Later">
          <div className="hscroll">
            {watched.slice(0, 8).map((entry) => (
              <div key={entry.videoId} style={{ width: 210 }}>
                <VideoCard video={entry.video} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {!state.ran && watchLater.length > 0 && (
        <Section title="Watch Later" to="/watch-later">
          <div className="hscroll">
            {watchLater.slice(0, 8).map((entry) => (
              <div key={entry.videoId} style={{ width: 210 }}>
                <VideoCard video={entry.video} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {!state.ran && watched.length === 0 && watchLater.length === 0 && (
        <div style={{ marginTop: 18 }}>
          <EmptyState icon={<IconTube size={22} />} title="Start with a search">
            Playback opens in this app at full length — no redirect to another site.
          </EmptyState>
        </div>
      )}

      <p className="tiny mute" style={{ marginTop: 20, textAlign: 'center' }}>
        Videos play through the official embedded player. Downloads are not offered here.
      </p>
    </>
  )
}
