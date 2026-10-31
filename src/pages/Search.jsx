import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Artwork, EmptyState, ErrorBlock, Loading, Segmented } from '../components/ui.jsx'
import { TrackRow } from '../components/TrackBits.jsx'
import VideoCard from '../components/VideoCard.jsx'
import { IconChevron, IconDownload, IconPlay, IconSearch, IconTrash, IconX } from '../components/Icons.jsx'
import { parseVideoId } from '../components/YouTubePlayer.jsx'
import { api } from '../lib/api.js'
import { useLibrary } from '../context/LibraryContext.jsx'
import { timeAgo } from '../lib/format.js'

const MODES = [
  { value: 'music', label: 'Music' },
  { value: 'videos', label: 'Videos' },
  { value: 'artists', label: 'Artists' },
  { value: 'albums', label: 'Albums' },
  { value: 'library', label: 'Library' },
  { value: 'downloads', label: 'Downloads' },
]

export default function Search() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [link, setLink] = useState('')
  const mode = MODES.some((m) => m.value === params.get('mode')) ? params.get('mode') : 'music'
  const initialQ = params.get('q') || ''
  const [term, setTerm] = useState(initialQ)
  const [state, setState] = useState({
    loading: false,
    error: null,
    items: [],
    ran: false,
    configured: true,
    fallback: false,
    notice: '',
  })
  const { addSearch, searches, clearSearches, downloads, favourites, videos, identifications } = useLibrary()

  const run = async (query, nextMode = mode) => {
    const q = String(query || '').trim()
    if (!q) return
    setState({ loading: true, error: null, items: [], ran: true, configured: true, fallback: false, notice: '' })
    try {
      let items = []
      let meta = { configured: true, fallback: false, notice: '' }
      if (nextMode === 'music') items = (await api.searchMusic(q, 30)).items || []
      else if (nextMode === 'videos') {
        const data = await api.searchVideos(q, 24)
        items = data.items || []
        meta = { configured: data.configured !== false, fallback: Boolean(data.fallback), notice: data.notice || '' }
      }
      else if (nextMode === 'artists') items = (await api.artists(q)).items || []
      else if (nextMode === 'albums') {
        const tracks = (await api.searchMusic(q, 40)).items || []
        const seen = new Map()
        for (const t of tracks) {
          if (!t.album) continue
          const key = `${t.album}::${t.artist}`
          if (!seen.has(key)) seen.set(key, { id: key, title: t.album, artist: t.artist, artwork: t.artwork, releaseDate: t.releaseDate, trackCount: 0 })
          seen.get(key).trackCount += 1
        }
        items = [...seen.values()]
      }
      setState({ loading: false, error: null, items, ran: true, ...meta })
      addSearch(q, nextMode)
    } catch (err) {
      setState({
        loading: false,
        error: err.message,
        items: [],
        ran: true,
        configured: err.code !== 'YOUTUBE_NOT_CONFIGURED',
        fallback: false,
        notice: '',
      })
    }
  }

  // Run once per distinct query+mode pair (the URL is the source of truth).
  const lastRun = useRef('')
  useEffect(() => {
    if (!initialQ) return
    const signature = `${mode}:${initialQ}`
    if (lastRun.current === signature) return
    lastRun.current = signature
    setTerm(initialQ)
    run(initialQ, mode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ, mode])

  const submit = (event) => {
    event.preventDefault()
    const q = term.trim()
    if (!q) return
    const next = new URLSearchParams(params)
    next.set('q', q)
    next.set('mode', mode)
    setParams(next, { replace: true })
    run(q)
  }

  const clear = () => {
    setTerm('')
    const next = new URLSearchParams(params)
    next.delete('q')
    setParams(next, { replace: true })
    setState({ loading: false, error: null, items: [], ran: false, configured: true })
  }

  const localResults = useMemo(() => {
    const q = term.trim().toLowerCase() || initialQ.toLowerCase()
    if (!q) return []
    if (mode === 'library') {
      const tracks = favourites.filter((f) => [f.track.title, f.track.artist].join(' ').toLowerCase().includes(q)).map((f) => f.track)
      const vids = videos.filter((v) => [v.video.title, v.video.channel].join(' ').toLowerCase().includes(q)).map((v) => v.video)
      return [...tracks.map((t) => ({ type: 'track', data: t })), ...vids.map((v) => ({ type: 'video', data: v }))]
    }
    return downloads
      .filter((d) => [d.title, d.artist, d.fileName].join(' ').toLowerCase().includes(q))
      .map((d) => ({ type: 'download', data: d }))
  }, [mode, term, initialQ, favourites, videos, downloads])

  return (
    <>
      <h1>Search</h1>
      <form onSubmit={submit} role="search" style={{ marginTop: 10 }}>
        <label className="field">
          <IconSearch size={18} className="field-icon" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Songs, artists, albums, videos…"
            aria-label="Search"
            autoFocus={!initialQ}
            enterKeyHint="search"
          />
          {term && (
            <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Clear search" onClick={clear}>
              <IconX size={14} />
            </button>
          )}
          <button type="submit" className="btn btn-sm btn-primary" disabled={!term.trim()}>
            Go
          </button>
        </label>
      </form>

      <div style={{ marginTop: 12 }}>
        <Segmented label="Search mode" value={mode} onChange={(m) => setParams({ q: term || initialQ, mode: m })} options={MODES} />
      </div>

      {!initialQ && searches.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <div className="between" style={{ marginBottom: 8 }}>
            <span className="eyebrow">Recent searches</span>
            <button type="button" className="section-link" onClick={clearSearches}>
              <IconTrash size={13} /> Clear
            </button>
          </div>
          <div className="row wrap gap-8">
            {searches.slice(0, 10).map((s) => (
              <Link key={s.id} to={`/search?q=${encodeURIComponent(s.term)}&mode=${s.mode}`} className="chip">
                {s.term}
              </Link>
            ))}
          </div>
        </section>
      )}

      {(mode === 'library' || mode === 'downloads') && (
        <section style={{ marginTop: 16 }}>
          {localResults.length === 0 ? (
            <EmptyState icon={<IconSearch size={22} />} title={term || initialQ ? 'Nothing saved matches' : `Search your ${mode}`}>
              {mode === 'library'
                ? 'Favourites and saved videos are searched on this device, offline.'
                : 'Download records are searched on this device.'}
            </EmptyState>
          ) : (
            <div className="list">
              {localResults.map((r) =>
                r.type === 'track' ? (
                  <TrackRow key={r.data.key} track={r.data} />
                ) : r.type === 'video' ? (
                  <Link key={r.data.videoId} to={`/watch/${r.data.videoId}`} className="list-row">
                    <Artwork src={r.data.thumbnail} alt={r.data.title} style={{ width: 64, aspectRatio: '16/9', height: 'auto', borderRadius: 8 }} />
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="track-row-title truncate" style={{ display: 'block' }}>
                        {r.data.title}
                      </span>
                      <span className="track-row-sub truncate">{r.data.channel}</span>
                    </span>
                    <IconChevron size={16} />
                  </Link>
                ) : (
                  <div key={r.data.id} className="list-row">
                    <span className="dl-icon">
                      <IconDownload size={17} />
                    </span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="track-row-title truncate" style={{ display: 'block' }}>
                        {r.data.fileName || r.data.title}
                      </span>
                      <span className="track-row-sub">
                        {r.data.status} · {timeAgo(r.data.at)}
                      </span>
                    </span>
                    <Link to="/downloads" className="icon-btn" aria-label="Open downloads">
                      <IconChevron size={16} />
                    </Link>
                  </div>
                ),
              )}
            </div>
          )}
        </section>
      )}

      {state.loading && (
        <div style={{ marginTop: 18 }}>
          <Loading label={`Searching ${mode}…`} rows={4} />
        </div>
      )}

      {!state.loading && state.error && (
        <div style={{ marginTop: 18 }}>
          <ErrorBlock error={state.error} onRetry={() => run(term || initialQ)} />
          {!state.configured && (
            <p className="tiny mute" style={{ marginTop: 8 }}>
              Add <code>YOUTUBE_API_KEY</code> to the server <code>.env</code> to enable video search.
            </p>
          )}
        </div>
      )}

      {!state.loading && !state.error && state.ran && state.items.length === 0 && (
        <div style={{ marginTop: 18 }}>
          <EmptyState title="No results">Nothing matched that query in this mode. Try another spelling or switch modes.</EmptyState>
        </div>
      )}

      {state.items.length > 0 && mode === 'videos' && (
        <>
          {state.fallback && (
            <div className="card card-pad" style={{ marginTop: 18 }}>
              <div className="row gap-8" style={{ marginBottom: 6 }}>
                <IconSearch size={16} />
                <strong style={{ fontSize: 13 }}>Showing catalogue music videos</strong>
              </div>
              <p className="tiny muted">{state.notice}</p>
              <p className="tiny muted" style={{ marginTop: 8 }}>
                A YouTube link plays in full — mixes included — without any key:
              </p>
              <form
                className="row gap-8"
                style={{ marginTop: 8 }}
                onSubmit={(event) => {
                  event.preventDefault()
                  const id = parseVideoId(link)
                  if (!id) return
                  navigate(`/watch/${id}`)
                }}
              >
                <input
                  className="input-plain"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://youtube.com/watch?v=… or a 2-hour mix link"
                  aria-label="Paste a YouTube link"
                  inputMode="url"
                />
                <button type="submit" className="btn btn-sm btn-primary" disabled={!parseVideoId(link)}>
                  <IconPlay size={13} /> Play
                </button>
              </form>
            </div>
          )}
          <div className="video-grid" style={{ marginTop: 14 }}>
            {state.items.map((v) => (
              <VideoCard key={v.videoId} video={v} />
            ))}
          </div>
        </>
      )}

      {state.items.length > 0 && mode === 'music' && (
        <div className="list" style={{ marginTop: 18 }}>
          {state.items.map((t) => (
            <TrackRow key={t.id} track={t} subtitle={`${t.artist}${t.album ? ` · ${t.album}` : ''}`} />
          ))}
        </div>
      )}

      {state.items.length > 0 && mode === 'artists' && (
        <div className="list" style={{ marginTop: 18 }}>
          {state.items.map((a) => (
            <Link key={a.id} to={`/search?q=${encodeURIComponent(a.name)}&mode=music`} className="list-row">
              <span className="dl-icon" style={{ borderRadius: '50%' }}>
                {a.name.slice(0, 1)}
              </span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="track-row-title truncate" style={{ display: 'block' }}>
                  {a.name}
                </span>
                <span className="track-row-sub">{a.genre || 'Artist'}</span>
              </span>
              <IconChevron size={16} />
            </Link>
          ))}
        </div>
      )}

      {state.items.length > 0 && mode === 'albums' && (
        <div className="video-grid" style={{ marginTop: 18 }}>
          {state.items.map((al) => (
            <Link key={al.id} to={`/search?q=${encodeURIComponent(`${al.artist} ${al.title}`)}&mode=music`} className="video-card">
              <Artwork src={al.artwork} alt={al.title} style={{ aspectRatio: '1/1', height: 'auto', borderRadius: 14 }} />
              <div>
                <div className="video-title truncate">{al.title}</div>
                <div className="video-sub truncate">
                  {al.artist}
                  {al.trackCount ? ` · ${al.trackCount} track${al.trackCount === 1 ? '' : 's'} in results` : ''}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!state.ran && mode !== 'library' && mode !== 'downloads' && (
        <div style={{ marginTop: 20 }}>
          <EmptyState icon={<IconSearch size={22} />} title="Search the catalogue">
            {identifications.length > 0
              ? 'Try an artist from your identified songs, or search a mood.'
              : 'Type a song, artist, album or video keyword and press search.'}
          </EmptyState>
        </div>
      )}
    </>
  )
}
