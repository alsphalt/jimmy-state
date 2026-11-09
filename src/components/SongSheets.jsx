import { useEffect, useRef, useState } from 'react'
import { Artwork } from './ui.jsx'
import {
  IconCheck,
  IconExternal,
  IconList,
  IconMusic,
  IconNext,
  IconQueue,
  IconX,
} from './Icons.jsx'
import { trackKey } from '../lib/track.js'

/** Bottom sheets shared by the feed and the artist page. */

const previewOf = (track) => String(track?.previewUrl || '')

/* ------------------------------------------------------------- song sheet */

export function SongSheet({ track, index, onClose, player, onFilterAlbum, toast }) {
  const closeRef = useRef(null)
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = async () => {
    const value = track.storeUrl || `${track.title} — ${track.artist}`
    try {
      await navigator.clipboard.writeText(value)
      toast('Copied', { title: track.title, type: 'ok', ttl: 1800 })
    } catch {
      toast('Could not copy', { message: 'Clipboard access was refused.', type: 'err' })
    }
  }

  return (
    <div className="ap-sheet-wrap" role="dialog" aria-modal="true" aria-label={`Options for ${track.title}`}>
      <button type="button" className="ap-sheet-backdrop" onClick={onClose} aria-label="Close" />
      <div className="ap-sheet">
        <div className="ap-sheet-head">
          <Artwork src={track.artwork} alt="" className="ap-sheet-art" />
          <div style={{ minWidth: 0 }}>
            <strong className="truncate">{track.title}</strong>
            <span className="truncate">{track.artist}</span>
          </div>
          <button ref={closeRef} type="button" className="ap-icon" onClick={onClose} aria-label="Close">
            <IconX size={16} />
          </button>
        </div>

        <div className="ap-sheet-list">
          <button
            type="button"
            onClick={() => {
              player.playNext(track)
              onClose()
            }}
            disabled={!previewOf(track)}
          >
            <IconNext size={16} /> Play next
          </button>
          <button
            type="button"
            onClick={() => {
              player.enqueue(track)
              onClose()
            }}
            disabled={!previewOf(track)}
          >
            <IconQueue size={16} /> Add to queue
          </button>
          <button
            type="button"
            onClick={() => {
              // Continue with whatever the queue actually holds from this track onward.
              const at = player.queue.findIndex((entry) => entry.key === trackKey(track))
              player.playQueue(at >= 0 ? player.queue.slice(at) : [track], 0)
              onClose()
            }}
            disabled={!previewOf(track)}
          >
            <IconList size={16} /> Play from here
          </button>
          <button
            type="button"
            onClick={() => {
              if (track.album) onFilterAlbum(track.album)
              else onClose()
            }}
            disabled={!track.album}
          >
            <IconMusic size={16} /> Show album
          </button>
          <button type="button" onClick={copy}>
            <IconCheck size={16} /> Copy link
          </button>
          {track.storeUrl ? (
            <a href={track.storeUrl} target="_blank" rel="noreferrer noopener" onClick={onClose}>
              <IconExternal size={16} /> Open in Apple Music
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------- playlist sheet */

export function PlaylistSheet({ track, onClose, library }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const closeRef = useRef(null)

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const add = async (playlistId) => {
    setBusy(true)
    // addToPlaylist persists and toasts on its own — no second message here.
    await library.addToPlaylist(playlistId, track)
    setBusy(false)
    onClose()
  }

  const create = async (event) => {
    event.preventDefault()
    const value = name.trim()
    if (!value) return
    setBusy(true)
    const playlist = await library.createPlaylist(value)
    if (playlist?.id) await library.addToPlaylist(playlist.id, track)
    setBusy(false)
    onClose()
  }

  return (
    <div className="ap-sheet-wrap" role="dialog" aria-modal="true" aria-label="Add to playlist">
      <button type="button" className="ap-sheet-backdrop" onClick={onClose} aria-label="Close" />
      <div className="ap-sheet">
        <div className="ap-sheet-head">
          <Artwork src={track.artwork} alt="" className="ap-sheet-art" />
          <div style={{ minWidth: 0 }}>
            <strong className="truncate">Add to playlist</strong>
            <span className="truncate">{track.title}</span>
          </div>
          <button ref={closeRef} type="button" className="ap-icon" onClick={onClose} aria-label="Close">
            <IconX size={16} />
          </button>
        </div>

        <div className="ap-sheet-list">
          {library.playlists.length === 0 && <p className="ap-note" style={{ padding: '6px 4px' }}>No playlists yet — create one below.</p>}
          {library.playlists.map((playlist) => (
            <button key={playlist.id} type="button" disabled={busy} onClick={() => add(playlist.id)}>
              <IconList size={16} />
              <span className="truncate">{playlist.name}</span>
              <span className="ap-sheet-count">{playlist.items?.length || 0}</span>
            </button>
          ))}
        </div>

        <form className="ap-sheet-form" onSubmit={create}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New playlist name"
            aria-label="New playlist name"
            maxLength={60}
          />
          <button type="submit" className="ap-btn ap-btn-primary" disabled={!name.trim() || busy}>
            Create
          </button>
        </form>
      </div>
    </div>
  )
}
