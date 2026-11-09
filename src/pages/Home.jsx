import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Artwork, ErrorBlock, Loading } from '../components/ui.jsx'
import { NotificationBell } from '../components/Notifications.jsx'
import SmartSearch from '../components/SmartSearch.jsx'
import { PlaylistSheet, SongSheet } from '../components/SongSheets.jsx'
import {
  IconChevron,
  IconDownload,
  IconHeart,
  IconList,
  IconMore,
  IconMusic,
  IconPause,
  IconPlay,
  IconSearch,
} from '../components/Icons.jsx'
import { api } from '../lib/api.js'
import { providerStatus } from '../lib/providers.js'
import { useLibrary, useToast } from '../context/LibraryContext.jsx'
import { usePlayer } from '../context/PlayerContext.jsx'
import { useDownloads } from '../context/DownloadsContext.jsx'
import { formatDate, formatDuration, timeAgo } from '../lib/format.js'
import { trackKey } from '../lib/track.js'

/**
 * Home — a vertical discovery feed over the existing animated background.
 *
 * The background is not touched: `NeonBackground` is rendered once in App.jsx above
 * every route, and this page only lays glass surfaces on top of it.
 *
 * The feed is real catalogue data, newest release date first, paginated by a date
 * cursor on the server. Nothing is randomised client-side, so the order a user sees is
 * the order the catalogue published, and paging can neither duplicate nor reorder a
 * song. Rows are keyed by track id and de-duplicated again here as a belt-and-braces
 * guard against a repeated page.
 */

const PAGE = 20

const previewOf = (track) => Boolean(track?.previewUrl || track?.hlsUrl)

const releaseLabel = (iso) => {
  if (!iso) return ''
  const time = new Date(iso).getTime()
  if (!Number.isFinite(time)) return ''
  const diff = Date.now() - time
  if (diff < 0) return formatDate(iso)
  if (diff < 7 * 86400000) return timeAgo(iso)
  return formatDate(iso)
}

export default function Home() {
  const navigate = useNavigate()
  const library = useLibrary()
  const player = usePlayer()
  const downloads = useDownloads()
  const { toast } = useToast()

  const [term, setTerm] = useState('')
  const [feed, setFeed] = useState({ items: [], loading: true, error: null, hasMore: true, loaded: 0 })
  const [charts, setCharts] = useState({ loading: true, items: [], error: null })
  const [fullTracks, setFullTracks] = useState([])
  const [recommended, setRecommended] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [playlistFor, setPlaylistFor] = useState(null)

  const cursorRef = useRef('')
  const hasMoreRef = useRef(true)
  const loadingRef = useRef(false)
  const seenRef = useRef(new Set())

  // Full-length tracks come from the licensed provider, and only when it is
  // configured — otherwise the rail is absent rather than empty.
  useEffect(() => {
    let alive = true
    providerStatus()
      .then((providers) => {
        if (!alive || !providers?.epidemic?.configured) return null
        return api.epidemicFeatured(10).then((res) => {
          if (alive) setFullTracks(res.items || [])
        })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return
    loadingRef.current = true
    setFeed((state) => ({ ...state, loading: true, error: null }))
    try {
      const data = await api.feed(cursorRef.current, PAGE)
      const fresh = (data.items || []).filter((track) => track.trackId && !seenRef.current.has(track.trackId))
      fresh.forEach((track) => seenRef.current.add(track.trackId))
      if (data.nextCursor) cursorRef.current = data.nextCursor
      hasMoreRef.current = Boolean(data.hasMore)
      setFeed((state) => ({
        items: [...state.items, ...fresh],
        loading: false,
        error: null,
        hasMore: Boolean(data.hasMore),
        loaded: state.loaded + fresh.length,
      }))
    } catch (err) {
      setFeed((state) => ({ ...state, loading: false, error: err.message || 'The feed did not load.' }))
    } finally {
      loadingRef.current = false
    }
  }, [])

  useEffect(() => {
    loadMore()
  }, [loadMore])

  // Full-length tracks come from the licensed provider and only appear when it is
  // configured; nothing is shown, and no empty rail, when the key is absent.
  useEffect(() => {
    let alive = true
    api.providers()
      .then((data) => {
        if (!alive || !data?.providers?.epidemic?.configured) return null
        return api.epidemicFeatured(10).then((res) => {
          if (alive) setFullTracks(res.items || [])
        })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    api
      .charts(14, 'ke')
      .then((data) => alive && setCharts({ loading: false, items: data.items || [], error: null }))
      .catch((err) => alive && setCharts({ loading: false, items: [], error: err.message }))
    return () => {
      alive = false
    }
  }, [])

  /* Recommended: more from the artist the user actually played or saved last. */
  const seedArtist = useMemo(() => {
    const fromPlay = library.plays?.[0]?.track
    const fromFavourite = library.favourites?.[0]?.track
    const seed = fromPlay || fromFavourite
    if (!seed?.artistId) return null
    return seed
  }, [library.plays, library.favourites])

  useEffect(() => {
    if (!seedArtist?.artistId) {
      setRecommended(null)
      return undefined
    }
    let alive = true
    setRecommended({ loading: true, artist: seedArtist.artist, items: [], error: null })
    api
      .artistSongs(seedArtist.artistId, 12)
      .then(
        (data) =>
          alive &&
          setRecommended({
            loading: false,
            artist: seedArtist.artist,
            artistId: seedArtist.artistId,
            items: data.items || [],
            error: null,
          }),
      )
      .catch((err) => alive && setRecommended({ loading: false, artist: seedArtist.artist, items: [], error: err.message }))
    return () => {
      alive = false
    }
  }, [seedArtist?.artistId, seedArtist?.artist])

  /* New albums: grouped from what the feed already loaded — no extra requests. */
  const newAlbums = useMemo(() => {
    const byAlbum = new Map()
    for (const track of feed.items) {
      if (!track.album || !track.artwork) continue
      const key = `${track.album}::${track.artist}`
      if (byAlbum.has(key)) continue
      byAlbum.set(key, {
        key,
        title: track.album,
        artist: track.artist,
        artistId: track.artistId,
        artwork: track.artwork,
        releaseDate: track.releaseDate,
      })
    }
    return [...byAlbum.values()]
      .sort((a, b) => String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')))
      .slice(0, 10)
  }, [feed.items])

  /* Infinite scroll: fetch as the sentinel approaches the viewport. */
  const sentinelRef = useRef(null)
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !feed.hasMore) return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { rootMargin: '900px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [feed.hasMore, loadMore, feed.items.length])

  const submit = (raw) => {
    const q = String(raw ?? term).trim()
    if (!q) return
    navigate(`/search?q=${encodeURIComponent(q)}&mode=videos`)
  }

  const openArtist = (track) => {
    if (!track?.artistId) return
    navigate(`/artist/${track.artistId}?name=${encodeURIComponent(track.artist)}`)
  }

  /** Play a rail item by identity: the queue is the playable subset, indices filtered. */
  const playItem = (list, track) => {
    const playable = list.filter((entry) => previewOf(entry))
    const at = playable.findIndex((entry) => trackKey(entry) === trackKey(track))
    player.playQueue(playable, Math.max(at, 0))
  }

  const playAt = (index) => {
    const target = feed.items[index]
    if (!target) return
    if (player.current?.key === trackKey(target)) {
      player.toggle()
      return
    }
    player.playQueue(feed.items, index)
  }

  const subscribe = (track) => {
    if (!track?.artistId) {
      toast('Cannot subscribe', { message: 'The catalogue did not publish an artist id for this track.', type: 'err' })
      return
    }
    library.toggleSubscription({
      artistId: track.artistId,
      name: track.artist,
      artwork: track.artwork,
      latest: track,
    })
  }

  return (
    <div className="home-page">
      <header className="home-head">
        <div className="home-head-text">
          <span className="ap-eyebrow">Discover</span>
          <h1>Home</h1>
          <p>Real catalogue · newest releases first</p>
        </div>

        <div className="home-head-tools">
          <SmartSearch
            variant="home"
            value={term}
            onChange={setTerm}
            onSubmit={submit}
            placeholder="Search songs, artists, albums"
          />
          <NotificationBell />
        </div>
      </header>

      {library.subscriptions.length > 0 && (
        <Rail title="Artists you follow" count={library.subscriptions.length}>
          {library.subscriptions.map((sub) => (
            <Link key={sub.artistId} to={`/artist/${sub.artistId}?name=${encodeURIComponent(sub.name)}`} className="rail-tile">
              <span className="rail-avatar">
                {sub.artwork ? <img src={sub.artwork} alt="" loading="lazy" /> : <span>{sub.name.slice(0, 1)}</span>}
              </span>
              <span className="rail-title truncate">{sub.name}</span>
              <span className="rail-sub truncate">Subscribed</span>
            </Link>
          ))}
        </Rail>
      )}

      {fullTracks.length > 0 && (
        <Rail
          title="Full tracks · Epidemic Sound"
          count={fullTracks.length}
          action="Full-length"
          to="/search?mode=videos"
        >
          {fullTracks.map((track, index) => (
            <div className="rail-tile-wrap" key={track.id || track.trackId || index}>
              <button type="button" className="rail-tile" onClick={() => playItem(fullTracks, track)}>
                <span className="rail-art">
                  <Artwork src={track.artworkSmall || track.artwork} alt="" />
                  <span className="rail-rank rail-rank-full">FULL</span>
                </span>
                <span className="rail-title truncate">{track.title}</span>
                <span className="rail-sub truncate">{track.artist}</span>
              </button>
              <button
                type="button"
                className="rail-dl"
                aria-label={`Download ${track.title}`}
                title="Download the full track (MP3)"
                disabled={downloads.isDownloading?.(trackKey(track))}
                onClick={() => downloads.start(track)}
              >
                <IconDownload size={14} />
              </button>
            </div>
          ))}
        </Rail>
      )}

      {charts.items.length > 0 && (
        <Rail title="Trending now" to="/discover" action="See all" error={charts.error}>
          {charts.items.map((track, index) => (
            <button
              key={track.id || track.key || index}
              type="button"
              className="rail-tile"
              onClick={() => playItem(charts.items, track)}
            >
              <span className="rail-art">
                <Artwork src={track.artworkSmall || track.artwork} alt="" />
                <span className="rail-rank">{index + 1}</span>
              </span>
              <span className="rail-title truncate">{track.title}</span>
              <span className="rail-sub truncate">{track.artist}</span>
            </button>
          ))}
        </Rail>
      )}

      {library.plays?.length > 0 && (
        <Rail title="Recently played" count={library.plays.length}>
          {library.plays.slice(0, 10).map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="rail-tile"
              onClick={() => playItem(library.plays.map((item) => item.track), entry.track)}
            >
              <span className="rail-art">
                <Artwork src={entry.track.artworkSmall || entry.track.artwork} alt="" />
              </span>
              <span className="rail-title truncate">{entry.track.title}</span>
              <span className="rail-sub truncate">{entry.track.artist}</span>
            </button>
          ))}
        </Rail>
      )}

      {recommended?.items?.length > 0 && (
        <Rail title={`Because you played ${recommended.artist}`} to={recommended.artistId ? `/artist/${recommended.artistId}?name=${encodeURIComponent(recommended.artist)}` : undefined} action="Artist">
          {recommended.items.slice(0, 10).map((track, index) => (
            <button
              key={track.trackId || index}
              type="button"
              className="rail-tile"
              onClick={() => playItem(recommended.items, track)}
            >
              <span className="rail-art">
                <Artwork src={track.artworkSmall || track.artwork} alt="" />
              </span>
              <span className="rail-title truncate">{track.title}</span>
              <span className="rail-sub truncate">{track.album || track.artist}</span>
            </button>
          ))}
        </Rail>
      )}

      {newAlbums.length > 0 && (
        <Rail title="New albums" count={newAlbums.length}>
          {newAlbums.map((album) => (
            <button
              key={album.key}
              type="button"
              className="rail-tile"
              onClick={() => album.artistId && openArtist(album)}
            >
              <span className="rail-art">
                <Artwork src={album.artwork} alt="" />
              </span>
              <span className="rail-title truncate">{album.title}</span>
              <span className="rail-sub truncate">{album.artist}</span>
            </button>
          ))}
        </Rail>
      )}

      {library.playlists.length > 0 && (
        <Rail title="Your playlists" to="/playlists" action="Manage">
          {library.playlists.slice(0, 10).map((playlist) => (
            <Link key={playlist.id} to={`/playlists/${playlist.id}`} className="rail-tile">
              <span className="rail-art rail-playlist">
                <IconList size={22} />
              </span>
              <span className="rail-title truncate">{playlist.name}</span>
              <span className="rail-sub truncate">{playlist.items?.length || 0} songs</span>
            </Link>
          ))}
        </Rail>
      )}

      <section className="feed-section">
        <div className="feed-head">
          <div>
            <h2>Latest uploads</h2>
            <p>Ordered by the release date the catalogue publishes · {feed.items.length} loaded</p>
          </div>
        </div>

        {feed.items.length === 0 && feed.loading && <Loading label="Loading the feed…" rows={6} />}
        {feed.error && feed.items.length === 0 && <ErrorBlock error={feed.error} onRetry={loadMore} />}

        <div className="feed">
          {feed.items.map((track, index) => (
            <FeedCard
              key={track.trackId || `${trackKey(track)}-${index}`}
              track={track}
              index={index}
              player={player}
              library={library}
              downloads={downloads}
              onPlay={() => playAt(index)}
              onArtist={() => openArtist(track)}
              onDownload={() => downloads.start(track)}
              onLike={() => library.toggleFavourite(track)}
              onPlaylist={() => setPlaylistFor(track)}
              onMore={() => setSheet({ track, index })}
              onSubscribe={() => subscribe(track)}
            />
          ))}
        </div>

        <div ref={sentinelRef} className="feed-sentinel" aria-hidden="true" />

        {feed.loading && feed.items.length > 0 && (
          <div className="feed-more">
            <span className="ap-spinner" aria-hidden="true" /> Loading more songs…
          </div>
        )}
        {feed.error && feed.items.length > 0 && (
          <div className="feed-more">
            <span>{feed.error}</span>
            <button type="button" className="ap-btn ap-btn-ghost" onClick={loadMore}>
              Retry
            </button>
          </div>
        )}
        {!feed.hasMore && feed.items.length > 0 && (
          <p className="feed-end">End of the catalogue feed · {feed.items.length} songs loaded</p>
        )}
      </section>

      {sheet ? (
        <SongSheet
          track={sheet.track}
          index={sheet.index}
          onClose={() => setSheet(null)}
          player={player}
          toast={toast}
          onFilterAlbum={() => {
            setSheet(null)
            openArtist(sheet.track)
          }}
        />
      ) : null}

      {playlistFor ? (
        <PlaylistSheet track={playlistFor} onClose={() => setPlaylistFor(null)} library={library} />
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------- rail */

function Rail({ title, children, to, action, count, error }) {
  return (
    <section className="home-rail">
      <div className="home-rail-head">
        <h2>{title}</h2>
        {typeof count === 'number' ? <span className="home-rail-count">{count}</span> : null}
        <span className="grow" />
        {to ? (
          <Link to={to} className="ap-link">
            {action || 'See all'} <IconChevron size={13} />
          </Link>
        ) : null}
      </div>
      {error ? <p className="ap-note">{error}</p> : null}
      <div className="home-rail-track">{children}</div>
    </section>
  )
}

/* ---------------------------------------------------------------- feed card */

function FeedCard({
  track,
  index,
  player,
  library,
  downloads,
  onPlay,
  onArtist,
  onDownload,
  onLike,
  onPlaylist,
  onMore,
  onSubscribe,
}) {
  const key = trackKey(track)
  const active = player.current?.key === key
  const playing = active && player.playing
  const liked = library.isFavourite(track)
  const subscribed = library.isSubscribed?.(track.artistId)
  const busy = downloads.isDownloading(key)
  const canPlay = Boolean(track.previewUrl)
  const plays = library.playCountFor?.(track) || 0

  return (
    <article className={`feed-card${active ? ' is-active' : ''}`}>
      <button
        type="button"
        className="feed-thumb"
        onClick={onPlay}
        disabled={!canPlay}
        aria-label={playing ? `Pause ${track.title}` : `Play ${track.title}`}
      >
        <img src={track.artworkSmall || track.artwork} alt={track.title} loading="lazy" decoding="async" />
        <span className="feed-thumb-play" aria-hidden="true">
          {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
        </span>
        {track.durationMs ? <span className="feed-thumb-time">{formatDuration(track.durationMs / 1000)}</span> : null}
      </button>

      <div className="feed-body">
        <div className="feed-top">
          <button type="button" className="feed-avatar" onClick={onArtist} aria-label={`Open ${track.artist}`}>
            {track.artworkSmall ? <img src={track.artworkSmall} alt="" loading="lazy" /> : <span>{track.artist.slice(0, 1)}</span>}
          </button>

          <div className="feed-info">
            <h3 className="feed-title" title={track.title}>
              {track.title}
            </h3>
            <div className="feed-meta">
              <button type="button" className="feed-artist truncate" onClick={onArtist}>
                {track.artist}
              </button>
              {track.full ? <span className="feed-badge">FULL</span> : null}
              <span aria-hidden="true">·</span>
              <time dateTime={track.releaseDate} title={track.releaseDate || ''}>
                {releaseLabel(track.releaseDate)}
              </time>
              <span aria-hidden="true">·</span>
              <span title="Plays recorded on this device">{plays} plays</span>
            </div>
          </div>

          {track.artistId ? (
            <button
              type="button"
              className={`feed-sub${subscribed ? ' is-on' : ''}`}
              onClick={onSubscribe}
              aria-pressed={Boolean(subscribed)}
            >
              {subscribed ? 'Subscribed' : 'Subscribe'}
            </button>
          ) : null}
        </div>

        <div className="feed-actions">
          <button
            type="button"
            className="ap-icon ap-icon-play"
            onClick={onPlay}
            disabled={!canPlay}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <IconPause size={15} /> : <IconPlay size={15} />}
          </button>

          <button
            type="button"
            className="ap-icon"
            onClick={onDownload}
            disabled={!canPlay || busy}
            aria-label={`Download ${track.title}`}
            title={canPlay ? (busy ? 'Downloading…' : 'Download') : 'No authorized file for this track'}
          >
            {busy ? <span className="ap-spinner" aria-hidden="true" /> : <IconDownload size={16} />}
          </button>

          <button
            type="button"
            className={`ap-icon${liked ? ' is-liked' : ''}`}
            onClick={onLike}
            aria-pressed={liked}
            aria-label={liked ? `Unlike ${track.title}` : `Like ${track.title}`}
            title={liked ? 'Liked' : 'Like'}
          >
            <IconHeart size={16} />
          </button>

          <button type="button" className="ap-icon" onClick={onPlaylist} aria-label={`Add ${track.title} to a playlist`} title="Add to playlist">
            <IconMusic size={16} />
          </button>

          <button type="button" className="ap-icon" onClick={onMore} aria-label={`More options for ${track.title}`} title="More options">
            <IconMore size={16} />
          </button>

          <span className="grow" />
          {track.album ? <span className="feed-album truncate">{track.album}</span> : null}
          <span className="feed-index">#{index + 1}</span>
        </div>
      </div>
    </article>
  )
}
