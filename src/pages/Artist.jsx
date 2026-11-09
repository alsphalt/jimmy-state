import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Artwork, EmptyState, ErrorBlock, Loading } from '../components/ui.jsx'
import {
  IconArrowLeft,
  IconChevron,
  IconDownload,
  IconExternal,
  IconHeart,
  IconMore,
  IconMusic,
  IconNext,
  IconPause,
  IconPlay,
  IconPlus,
  IconShare,
  IconShuffle,
  IconX,
} from '../components/Icons.jsx'
import { api } from '../lib/api.js'
import { usePlayer } from '../context/PlayerContext.jsx'
import { useLibrary, useToast } from '../context/LibraryContext.jsx'
import { PlaylistSheet, SongSheet } from '../components/SongSheets.jsx'
import { useDownloads } from '../context/DownloadsContext.jsx'
import { formatDuration, plural } from '../lib/format.js'
import { trackKey } from '../lib/track.js'

/**
 * Artist page — glassmorphism / midnight-purple.
 *
 * Every control here is wired to something real:
 *   play      → PlayerContext queue (this artist's songs)
 *   download  → DownloadsContext → /api/downloads/resolve + /file, provider file only
 *   like      → LibraryContext favourites (IndexedDB)
 *   playlist  → LibraryContext playlists (IndexedDB)
 *   more      → queue / album filter / store link / clipboard
 *   share     → navigator.share or clipboard
 *
 * Nothing about listeners, followers or events is shown, because the catalogue this app
 * reads does not publish them — the header states the counts that are real and where
 * they came from instead.
 */

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'songs', label: 'Songs' },
  { id: 'albums', label: 'Albums' },
  { id: 'about', label: 'About' },
]

const previewOf = (track) => String(track?.previewUrl || '')

export default function Artist() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const name = params.get('name') || 'Artist'
  const artistId = String(id || '').replace(/\D/g, '')

  const [tab, setTab] = useState('overview')
  const [albumFilter, setAlbumFilter] = useState('')
  const [songs, setSongs] = useState({ loading: true, items: [], error: null })
  const [albums, setAlbums] = useState({ loading: true, items: [], error: null })
  const [sheet, setSheet] = useState(null)
  const [playlistFor, setPlaylistFor] = useState(null)

  const load = useCallback(async () => {
    setSongs({ loading: true, items: [], error: null })
    setAlbums({ loading: true, items: [], error: null })
    const [songsResult, albumsResult] = await Promise.allSettled([
      artistId ? api.artistSongs(artistId, 50) : Promise.resolve({ items: [] }),
      artistId ? api.albums(artistId) : Promise.resolve({ items: [] }),
    ])
    if (songsResult.status === 'fulfilled') {
      setSongs({ loading: false, items: songsResult.value.items || [], error: null })
    } else {
      setSongs({ loading: false, items: [], error: songsResult.reason?.message || 'Could not load songs.' })
    }
    if (albumsResult.status === 'fulfilled') {
      setAlbums({ loading: false, items: albumsResult.value.items || [], error: null })
    } else {
      setAlbums({ loading: false, items: [], error: albumsResult.reason?.message || 'Could not load albums.' })
    }
  }, [artistId])

  useEffect(() => {
    load()
  }, [load])

  const list = useMemo(() => {
    if (!albumFilter) return songs.items
    return songs.items.filter((track) => track.album === albumFilter)
  }, [songs.items, albumFilter])

  const releases = useMemo(
    () =>
      [...albums.items].sort((a, b) => String(b.releaseDate || '').localeCompare(String(a.releaseDate || ''))),
    [albums.items],
  )

  const heroArt = releases[0]?.artwork || songs.items[0]?.artwork || ''
  const genres = useMemo(() => {
    const set = new Set(songs.items.map((track) => track.genre).filter(Boolean))
    return [...set].slice(0, 3)
  }, [songs.items])
  const totalMs = songs.items.reduce((sum, track) => sum + Number(track.durationMs || 0), 0)
  const storeUrl = songs.items.find((track) => track.storeUrl)?.storeUrl || ''

  const player = usePlayer()
  const library = useLibrary()
  const downloads = useDownloads()
  const { toast } = useToast()

  // A route with no usable artist id is a dead end, not a blank hero. This is what a
  // link built from a video channel (no artistId) used to produce.
  if (!artistId && !songs.loading) {
    return (
      <div className="artist-page">
        <button type="button" className="back-btn artist-back" onClick={() => navigate(-1)}>
          <IconArrowLeft size={16} /> Back
        </button>
        <section className="ap-section" style={{ marginTop: 12 }}>
          <span className="ap-eyebrow">Artist</span>
          <h1 className="ap-name" style={{ marginTop: 6 }}>{name}</h1>
          <p className="ap-note" style={{ marginTop: 6 }}>
            The catalogue has no artist id for this name, so there is no discography to open. Search it instead — the
            results are real catalogue songs.
          </p>
          <div className="ap-actions" style={{ marginTop: 14 }}>
            <Link className="ap-btn ap-btn-primary" to={`/search?q=${encodeURIComponent(name)}&mode=artists`}>
              Search artists
            </Link>
            <Link className="ap-btn" to="/discover">
              Discover
            </Link>
          </div>
        </section>
      </div>
    )
  }

  const playFrom = (index) => {
    const target = list[index]
    if (!target) return
    if (player.current?.key === trackKey(target)) {
      player.toggle()
      return
    }
    player.playQueue(list, index)
  }

  const playAll = (shuffled = false) => {
    const order = shuffled ? [...list].sort(() => Math.random() - 0.5) : list
    if (!order.length) return
    player.playQueue(order, 0)
  }

  const share = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    try {
      if (navigator.share) {
        await navigator.share({ title: name, url, text: `${name} on JIMMY STATE` })
        return
      }
      await navigator.clipboard.writeText(url)
      toast('Link copied', { title: name, type: 'ok', ttl: 2000 })
    } catch (err) {
      if (err?.name === 'AbortError') return
      toast('Could not share', { message: 'Copy the address bar instead.', type: 'err' })
    }
  }

  const download = (track) => {
    if (!previewOf(track)) return
    downloads.start(track)
  }

  return (
    <div className="artist-page">
      <button type="button" className="back-btn artist-back" onClick={() => navigate(-1)}>
        <IconArrowLeft size={16} /> Back
      </button>

      {/* ------------------------------------------------------------- hero */}
      <section className="ap-hero">
        {heroArt ? (
          <div
            className="ap-hero-wash"
            aria-hidden="true"
            style={{ backgroundImage: `url("${heroArt}")` }}
          />
        ) : null}
        <div className="ap-hero-veil" aria-hidden="true" />

        <div className="ap-hero-body">
          <div className="ap-avatar">
            {heroArt ? <img src={heroArt} alt={`${name} artwork`} /> : <span>{name.slice(0, 1)}</span>}
            <i className="ap-avatar-ring" aria-hidden="true" />
          </div>

          <div className="ap-hero-text">
            <span className="ap-eyebrow">Artist</span>
            <h1 className="ap-name">{name}</h1>
            <p className="ap-meta">
              {genres.length ? `${genres.join(' · ')} · ` : ''}
              {plural(songs.items.length, 'song')} · {plural(releases.length, 'album')}
            </p>
            <p className="ap-source">
              Catalogue: Apple Music · playback and downloads are the 30-second previews the provider publishes
            </p>

            <div className="ap-actions">
              <button type="button" className="ap-btn ap-btn-primary" onClick={() => playAll(false)} disabled={!list.length}>
                <IconPlay size={16} /> Play
              </button>
              <button type="button" className="ap-btn" onClick={() => playAll(true)} disabled={!list.length}>
                <IconShuffle size={16} /> Shuffle
              </button>
              <button type="button" className="ap-btn" onClick={share}>
                <IconShare size={16} /> Share
              </button>
              {storeUrl ? (
                <a className="ap-btn" href={storeUrl} target="_blank" rel="noreferrer noopener">
                  <IconExternal size={16} /> Apple Music
                </a>
              ) : null}
            </div>
          </div>

          <aside className="ap-stats" aria-label="Artist catalogue">
            <div>
              <span className="ap-stat-value">{songs.items.length}</span>
              <span className="ap-stat-label">Songs</span>
            </div>
            <div>
              <span className="ap-stat-value">{releases.length}</span>
              <span className="ap-stat-label">Albums</span>
            </div>
            <div>
              <span className="ap-stat-value">{totalMs ? formatDuration(totalMs / 1000) : '—'}</span>
              <span className="ap-stat-label">Catalogue time</span>
            </div>
          </aside>
        </div>
      </section>

      {/* ------------------------------------------------------------- tabs */}
      <nav className="ap-tabs" aria-label="Artist sections">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`ap-tab${tab === entry.id ? ' is-active' : ''}`}
            aria-current={tab === entry.id ? 'page' : undefined}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
            {entry.id === 'songs' ? <span className="ap-tab-count">{songs.items.length}</span> : null}
          </button>
        ))}
      </nav>

      <div className="ap-layout">
        <div className="ap-main">
          {songs.loading && <Loading label="Loading this artist…" rows={5} />}
          {!songs.loading && songs.error && <ErrorBlock error={songs.error} onRetry={load} />}

          {!songs.loading && !songs.error && tab === 'overview' && (
            <>
              <section className="ap-section">
                <div className="ap-section-head">
                  <h2>Latest releases</h2>
                  <button type="button" className="ap-link" onClick={() => setTab('albums')} disabled={!releases.length}>
                    See all
                  </button>
                </div>
                {albums.loading && <Loading label="Loading releases…" rows={2} />}
                {!albums.loading && releases.length === 0 && (
                  <p className="ap-note">No album entries in the catalogue for this artist.</p>
                )}
                {releases.length > 0 && (
                  <div className="ap-rail">
                    {releases.slice(0, 8).map((album) => (
                      <button
                        key={album.id}
                        type="button"
                        className="ap-release"
                        onClick={() => {
                          setAlbumFilter(album.title)
                          setTab('songs')
                        }}
                      >
                        <span className="ap-release-art">
                          <Artwork src={album.artwork} alt={album.title} />
                          <i className="ap-release-play" aria-hidden="true">
                            <IconPlay size={14} />
                          </i>
                        </span>
                        <span className="ap-release-title truncate">{album.title}</span>
                        <span className="ap-release-sub truncate">
                          {album.trackCount ? plural(album.trackCount, 'track') : 'Album'}
                          {album.releaseDate ? ` · ${String(album.releaseDate).slice(0, 4)}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="ap-section">
                <div className="ap-section-head">
                  <h2>Popular songs</h2>
                  <button type="button" className="ap-link" onClick={() => setTab('songs')} disabled={!songs.items.length}>
                    See all
                  </button>
                </div>
                <SongList
                  tracks={songs.items.slice(0, 6)}
                  startIndex={0}
                  onPlay={playFrom}
                  onDownload={download}
                  onLike={(track) => library.toggleFavourite(track)}
                  onPlaylist={(track) => setPlaylistFor(track)}
                  onMore={(track, index) => setSheet({ track, index })}
                  player={player}
                  library={library}
                  downloads={downloads}
                />
              </section>
            </>
          )}

          {!songs.loading && !songs.error && tab === 'songs' && (
            <section className="ap-section">
              <div className="ap-section-head">
                <h2>
                  Songs
                  {albumFilter ? (
                    <button type="button" className="ap-filter" onClick={() => setAlbumFilter('')}>
                      {albumFilter} <IconX size={12} />
                    </button>
                  ) : null}
                </h2>
                <span className="ap-note">{list.length} of {songs.items.length}</span>
              </div>
              {list.length === 0 ? (
                <EmptyState icon={<IconMusic size={22} />} title="No songs for this album" />
              ) : (
                <SongList
                  tracks={list}
                  startIndex={0}
                  onPlay={(index) => playFrom(index)}
                  onDownload={download}
                  onLike={(track) => library.toggleFavourite(track)}
                  onPlaylist={(track) => setPlaylistFor(track)}
                  onMore={(track, index) => setSheet({ track, index })}
                  player={player}
                  library={library}
                  downloads={downloads}
                />
              )}
            </section>
          )}

          {!songs.loading && !songs.error && tab === 'albums' && (
            <section className="ap-section">
              <div className="ap-section-head">
                <h2>Albums</h2>
                <span className="ap-note">{releases.length}</span>
              </div>
              {albums.error && <ErrorBlock error={albums.error} onRetry={load} />}
              {!albums.error && releases.length === 0 && (
                <EmptyState icon={<IconMusic size={22} />} title="No albums in the catalogue" />
              )}
              <div className="ap-album-grid">
                {releases.map((album) => (
                  <button
                    key={album.id}
                    type="button"
                    className="ap-album"
                    onClick={() => {
                      setAlbumFilter(album.title)
                      setTab('songs')
                    }}
                  >
                    <Artwork src={album.artwork} alt={album.title} />
                    <span className="ap-album-title truncate">{album.title}</span>
                    <span className="ap-album-sub truncate">
                      {album.trackCount ? plural(album.trackCount, 'track') : 'Album'}
                      {album.releaseDate ? ` · ${String(album.releaseDate).slice(0, 4)}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {!songs.loading && !songs.error && tab === 'about' && (
            <section className="ap-section">
              <h2>About</h2>
              <div className="ap-about-grid">
                <div className="ap-fact">
                  <span>Songs in catalogue</span>
                  <b>{songs.items.length}</b>
                </div>
                <div className="ap-fact">
                  <span>Albums</span>
                  <b>{releases.length}</b>
                </div>
                <div className="ap-fact">
                  <span>Total catalogue time</span>
                  <b>{totalMs ? formatDuration(totalMs / 1000) : '—'}</b>
                </div>
                <div className="ap-fact">
                  <span>Genres</span>
                  <b>{genres.length ? genres.join(', ') : '—'}</b>
                </div>
              </div>
              <p className="ap-note" style={{ marginTop: 14 }}>
                JIMMY STATE reads Apple’s public catalogue and plays the preview clips the provider publishes. No
                listener counts, biographies or events are invented: if the catalogue does not publish it, this page
                does not show it.
              </p>
              {storeUrl ? (
                <a className="ap-btn" href={storeUrl} target="_blank" rel="noreferrer noopener" style={{ marginTop: 12 }}>
                  <IconExternal size={16} /> Open in Apple Music
                </a>
              ) : null}
            </section>
          )}
        </div>

        <aside className="ap-aside">
          <div className="ap-panel">
            <span className="ap-eyebrow">About the artist</span>
            <p>
              {name}
              {genres.length ? ` — ${genres.join(', ')}` : ''}. {plural(songs.items.length, 'song')} and{' '}
              {plural(releases.length, 'album')} are available from the catalogue on this page.
            </p>
            <button type="button" className="ap-btn ap-btn-ghost" onClick={() => setTab('about')}>
              More info <IconChevron size={14} />
            </button>
          </div>

          <div className="ap-panel">
            <span className="ap-eyebrow">This device</span>
            <p>
              Likes and playlists are stored on this device. Downloads save the provider’s original file — the same
              quality the catalogue published, never re-encoded.
            </p>
            <Link className="ap-btn ap-btn-ghost" to="/library">
              Open library
            </Link>
          </div>
        </aside>
      </div>

      {sheet ? (
        <SongSheet
          track={sheet.track}
          index={sheet.index}
          onClose={() => setSheet(null)}
          player={player}
          onFilterAlbum={(album) => {
            setSheet(null)
            setAlbumFilter(album)
            setTab('songs')
          }}
          toast={toast}
        />
      ) : null}

      {playlistFor ? (
        <PlaylistSheet track={playlistFor} onClose={() => setPlaylistFor(null)} library={library} />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ songs */

function SongList({ tracks, startIndex, onPlay, onDownload, onLike, onPlaylist, onMore, player, library, downloads }) {
  return (
    <div className="ap-songs">
      {tracks.map((track, index) => {
        const key = trackKey(track)
        const active = player.current?.key === key
        const playing = active && player.playing
        const liked = library.isFavourite(track)
        const busy = downloads.isDownloading(key)
        const canPlay = Boolean(previewOf(track))
        return (
          <article key={`${key}-${index}`} className={`ap-card${active ? ' is-active' : ''}`}>
            <div className="ap-card-art">
              <Artwork src={track.artworkSmall || track.artwork} alt={track.title} />
              {active && playing ? (
                <span className="ap-card-eq" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              ) : null}
            </div>

            <div className="ap-card-text">
              <span className="ap-card-title truncate">{track.title}</span>
              <span className="ap-card-sub truncate">{track.artist}</span>
              <span className="ap-card-album truncate">{track.album || 'Single'}</span>
            </div>

            <span className="ap-card-time">{track.durationMs ? formatDuration(track.durationMs / 1000) : '—'}</span>

            <div className="ap-card-actions">
              <button
                type="button"
                className="ap-icon ap-icon-play"
                onClick={() => onPlay(startIndex + index)}
                disabled={!canPlay}
                aria-label={playing ? `Pause ${track.title}` : `Play ${track.title}`}
                title={canPlay ? (playing ? 'Pause' : 'Play') : 'No preview published for this track'}
              >
                {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
              </button>

              <button
                type="button"
                className="ap-icon"
                onClick={() => onDownload(track)}
                disabled={!canPlay || busy}
                aria-label={`Download ${track.title}`}
                title={canPlay ? (busy ? 'Downloading…' : 'Download') : 'No authorized file for this track'}
              >
                {busy ? <span className="ap-spinner" aria-hidden="true" /> : <IconDownload size={16} />}
              </button>

              <button
                type="button"
                className={`ap-icon${liked ? ' is-liked' : ''}`}
                onClick={() => onLike(track)}
                aria-pressed={liked}
                aria-label={liked ? `Remove ${track.title} from favourites` : `Like ${track.title}`}
                title={liked ? 'Liked' : 'Like'}
              >
                <IconHeart size={16} />
              </button>

              <button
                type="button"
                className="ap-icon"
                onClick={() => onPlaylist(track)}
                aria-label={`Add ${track.title} to a playlist`}
                title="Add to playlist"
              >
                <IconPlus size={16} />
              </button>

              <button
                type="button"
                className="ap-icon"
                onClick={() => onMore(track, startIndex + index)}
                aria-label={`More options for ${track.title}`}
                title="More options"
              >
                <IconMore size={16} />
              </button>
            </div>
          </article>
        )
      })}
    </div>
  )
}

