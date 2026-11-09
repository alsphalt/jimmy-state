import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Artwork } from './ui.jsx'
import { IconMusic, IconPlay, IconSearch, IconX } from './Icons.jsx'
import { usePlayer } from '../context/PlayerContext.jsx'
import { useToast } from '../context/LibraryContext.jsx'
import { api } from '../lib/api.js'
import { formatDuration } from '../lib/format.js'

const EMPTY = { q: '', artists: [], albums: [], songs: [], loading: false }

/**
 * Search box that answers while you type.
 *
 * Queries the catalogue once the term is two characters long (250 ms after the last
 * keystroke) and offers the three things a song search can mean: an artist, an album,
 * or a song. Choosing one does the real thing — open the artist, open that album's
 * tracks, or play the preview — instead of making you submit and pick again.
 */
export default function SmartSearch({
  value,
  onChange,
  onSubmit,
  placeholder = 'Songs, artists, albums…',
  autoFocus = false,
  variant = 'page',
  enterKeyHint = 'search',
  ariaLabel = 'Search',
}) {
  const navigate = useNavigate()
  const player = usePlayer()
  const { toast } = useToast()
  const [groups, setGroups] = useState(EMPTY)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const rootRef = useRef(null)
  const requested = useRef('')

  const q = value.trim()

  useEffect(() => {
    if (q.length < 2) {
      setGroups(EMPTY)
      requested.current = ''
      return
    }
    if (q === requested.current) return
    const timer = setTimeout(async () => {
      requested.current = q
      setGroups((g) => ({ ...g, loading: true }))
      try {
        const data = await api.suggest(q)
        // Ignore a response that arrived after the term moved on.
        if (requested.current !== q) return
        setGroups({
          q,
          artists: data.artists || [],
          albums: data.albums || [],
          songs: data.songs || [],
          loading: false,
        })
        setOpen(true)
        setActive(-1)
      } catch {
        if (requested.current === q) setGroups(EMPTY)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [q])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  const rows = useMemo(
    () => [
      ...groups.artists.map((a) => ({ kind: 'artist', data: a, key: `a:${a.artistId || a.name}` })),
      ...groups.albums.map((a) => ({ kind: 'album', data: a, key: `b:${a.collectionId || a.title}` })),
      ...groups.songs.map((s) => ({ kind: 'song', data: s, key: `s:${s.trackId || s.title}` })),
    ],
    [groups],
  )

  const hasResults = rows.length > 0
  const showPanel = open && q.length >= 2 && (groups.loading || hasResults)

  const close = () => {
    setOpen(false)
    setActive(-1)
  }

  const pick = (row) => {
    close()
    if (!row) return
    if (row.kind === 'artist') {
      const id = row.data.artistId
      if (!id) return
      navigate(`/artist/${id}?name=${encodeURIComponent(row.data.name)}`)
      return
    }
    if (row.kind === 'album') {
      const { artistId, artist, title } = row.data
      if (artistId) {
        navigate(`/artist/${artistId}?name=${encodeURIComponent(artist)}&album=${encodeURIComponent(title)}`)
      } else if (onSubmit) {
        onChange(`${artist} ${title}`)
        onSubmit(`${artist} ${title}`)
      }
      return
    }
    const song = row.data
    if (!song.previewUrl) {
      toast('No preview for this track', { title: song.title, type: 'warn' })
      return
    }
    player.playQueue([song], 0)
    toast('Playing preview', { title: `${song.title} — ${song.artist}`, type: 'ok', ttl: 1800 })
  }

  const submit = (event) => {
    event?.preventDefault()
    if (active >= 0 && rows[active]) {
      pick(rows[active])
      return
    }
    if (!q) return
    close()
    onSubmit?.(q)
  }

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      close()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!hasResults) return
      event.preventDefault()
      setOpen(true)
      setActive((index) => {
        const next = event.key === 'ArrowDown' ? index + 1 : index - 1
        if (next < 0) return rows.length - 1
        if (next >= rows.length) return 0
        return next
      })
    }
  }

  const input = (
    <input
      value={value}
      onChange={(event) => {
        onChange(event.target.value)
        setOpen(true)
      }}
      onFocus={() => {
        if (hasResults) setOpen(true)
      }}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-expanded={showPanel}
      aria-autocomplete="list"
      autoFocus={autoFocus}
      enterKeyHint={enterKeyHint}
    />
  )

  const clearButton = value ? (
    <button
      type="button"
      className={variant === 'home' ? 'home-search-clear' : 'icon-btn ss-clear'}
      aria-label="Clear search"
      onClick={() => {
        onChange('')
        setGroups(EMPTY)
        requested.current = ''
        close()
      }}
    >
      {variant === 'home' ? '×' : <IconX size={14} />}
    </button>
  ) : null

  const panel = showPanel ? (
    <div className="ss-panel" role="listbox" aria-label="Search suggestions">
      {groups.loading && !hasResults && <div className="ss-hint">Listening to the catalogue…</div>}

      {groups.artists.length > 0 && (
        <div className="ss-group">
          <span className="ss-label">Artists</span>
          {groups.artists.map((artist) => {
            const index = rows.findIndex((r) => r.key === `a:${artist.artistId || artist.name}`)
            return (
              <button
                key={`artist-${artist.artistId || artist.name}`}
                type="button"
                role="option"
                aria-selected={active === index}
                className={`ss-row ${active === index ? 'is-active' : ''}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick({ kind: 'artist', data: artist })}
              >
                <span className="ss-avatar">
                  <IconMusic size={16} />
                </span>
                <span className="ss-text">
                  <span className="ss-title truncate">{artist.name}</span>
                  <span className="ss-sub truncate">{artist.genre || 'Artist'}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {groups.albums.length > 0 && (
        <div className="ss-group">
          <span className="ss-label">Albums</span>
          {groups.albums.map((album) => {
            const index = rows.findIndex((r) => r.key === `b:${album.collectionId || album.title}`)
            return (
              <button
                key={`album-${album.collectionId || album.title}`}
                type="button"
                role="option"
                aria-selected={active === index}
                className={`ss-row ${active === index ? 'is-active' : ''}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick({ kind: 'album', data: album })}
              >
                <Artwork src={album.artwork} alt="" className="ss-art" />
                <span className="ss-text">
                  <span className="ss-title truncate">{album.title}</span>
                  <span className="ss-sub truncate">
                    {album.artist}
                    {album.releaseDate ? ` · ${album.releaseDate.slice(0, 4)}` : ''}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {groups.songs.length > 0 && (
        <div className="ss-group">
          <span className="ss-label">Songs</span>
          {groups.songs.map((song) => {
            const index = rows.findIndex((r) => r.key === `s:${song.trackId || song.title}`)
            return (
              <button
                key={`song-${song.trackId || song.title}`}
                type="button"
                role="option"
                aria-selected={active === index}
                className={`ss-row ${active === index ? 'is-active' : ''}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick({ kind: 'song', data: song })}
              >
                <Artwork src={song.artworkSmall || song.artwork} alt="" className="ss-art" />
                <span className="ss-text">
                  <span className="ss-title truncate">{song.title}</span>
                  <span className="ss-sub truncate">
                    {song.artist}
                    {song.durationMs ? ` · ${formatDuration(song.durationMs / 1000)}` : ''}
                  </span>
                </span>
                <span className="ss-play" aria-hidden="true">
                  <IconPlay size={13} />
                </span>
              </button>
            )
          })}
        </div>
      )}

      <button type="button" className="ss-all" onClick={submit}>
        <IconSearch size={14} /> See all results for “{q}”
      </button>
    </div>
  ) : null

  if (variant === 'home') {
    return (
      <form ref={rootRef} className="home-search smartsearch" onSubmit={submit} role="search" autoComplete="off">
        <IconSearch size={17} />
        {input}
        {clearButton}
        {panel}
      </form>
    )
  }

  return (
    <form ref={rootRef} className="smartsearch" onSubmit={submit} role="search" autoComplete="off">
      <label className="field">
        <IconSearch size={18} className="field-icon" />
        {input}
        {clearButton}
        <button type="submit" className="btn btn-sm btn-primary" disabled={!q}>
          Go
        </button>
      </label>
      {panel}
    </form>
  )
}
