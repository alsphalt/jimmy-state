import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Artwork, EmptyState, ErrorBlock, Loading, Section } from '../components/ui.jsx'
import { TrackRow } from '../components/TrackBits.jsx'
import { IconChevron, IconMusic } from '../components/Icons.jsx'
import { api } from '../lib/api.js'

/**
 * Artist page: /artist/:id?name=…
 *
 * Before this existed, tapping an artist threw the name into a video search, so an
 * artist row never opened the artist — it opened whatever YouTube matched. This page
 * keeps the two real sources separate and honest:
 *
 *   albums  → /api/music/albums?artistId=  (Apple catalogue, the artist the row named)
 *   songs   → /api/music/search?q=         (full-length YouTube results for the name)
 *
 * The songs block is labelled as search results, not as "this artist's discography",
 * because a keyword search cannot promise that. If the catalogue has no albums the
 * page says so instead of showing an empty grid.
 */
export default function Artist() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const name = params.get('name') || 'Artist'
  const artistId = String(id || '').replace(/\D/g, '')

  const [albums, setAlbums] = useState({ loading: true, items: [], error: null })
  const [songs, setSongs] = useState({ loading: true, items: [], error: null })

  const loadAlbums = useCallback(async () => {
    setAlbums({ loading: true, items: [], error: null })
    if (!artistId) {
      setAlbums({ loading: false, items: [], error: null })
      return
    }
    try {
      const data = await api.albums(artistId)
      setAlbums({ loading: false, items: data.items || [], error: null })
    } catch (err) {
      setAlbums({ loading: false, items: [], error: err.message })
    }
  }, [artistId])

  const loadSongs = useCallback(async () => {
    setSongs({ loading: true, items: [], error: null })
    try {
      const data = await api.searchMusic(name, 20)
      setSongs({ loading: false, items: data.items || [], error: null })
    } catch (err) {
      setSongs({ loading: false, items: [], error: err.message })
    }
  }, [name])

  useEffect(() => {
    loadAlbums()
    loadSongs()
  }, [loadAlbums, loadSongs])

  return (
    <>
      <div className="row gap-12" style={{ alignItems: 'center', marginBottom: 6 }}>
        <span
          aria-hidden="true"
          style={{
            width: 64,
            height: 64,
            flex: 'none',
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: 'var(--grad-soft)',
            border: '1px solid var(--line)',
            fontSize: 24,
            fontWeight: 800,
          }}
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div style={{ minWidth: 0 }}>
          <h1 className="truncate" style={{ marginBottom: 2 }}>
            {name}
          </h1>
          <span className="tiny mute">Artist · Apple catalogue + YouTube results</span>
        </div>
      </div>

      <Section title="Albums">
        {albums.loading && <Loading label="Loading albums…" rows={2} />}
        {!albums.loading && albums.error && (
          <ErrorBlock error={albums.error} onRetry={loadAlbums} />
        )}
        {!albums.loading && !albums.error && albums.items.length === 0 && (
          <EmptyState icon={<IconMusic size={22} />} title="No albums in the catalogue">
            This artist has no album entries in Apple’s catalogue yet — the songs below still come from search.
          </EmptyState>
        )}
        {albums.items.length > 0 && (
          <div className="video-grid">
            {albums.items.map((al) => (
              <Link
                key={al.id}
                to={`/search?q=${encodeURIComponent(`${al.artist || name} ${al.title}`)}&mode=videos`}
                className="video-card"
              >
                <Artwork src={al.artwork} alt={al.title} style={{ aspectRatio: '1/1', height: 'auto', borderRadius: 14 }} />
                <div>
                  <div className="video-title truncate">{al.title}</div>
                  <div className="video-sub truncate">
                    {al.artist || name}
                    {al.trackCount ? ` · ${al.trackCount} track${al.trackCount === 1 ? '' : 's'}` : ''}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title="Songs" action={<Link to={`/search?q=${encodeURIComponent(name)}&mode=videos`} className="section-link">Search videos <IconChevron size={13} /></Link>}>
        {songs.loading && <Loading label="Loading songs…" rows={4} />}
        {!songs.loading && songs.error && <ErrorBlock error={songs.error} onRetry={loadSongs} />}
        {!songs.loading && !songs.error && songs.items.length === 0 && (
          <EmptyState title="Nothing found for this name" />
        )}
        {songs.items.length > 0 && (
          <>
            <p className="tiny mute" style={{ marginBottom: 8 }}>
              Full-length results for “{name}” — played from YouTube.
            </p>
            <div className="list">
              {songs.items.map((t) => (
                <TrackRow key={t.key || t.id} track={t} subtitle={`${t.artist}${t.album ? ` · ${t.album}` : ''}`} />
              ))}
            </div>
          </>
        )}
      </Section>
    </>
  )
}
