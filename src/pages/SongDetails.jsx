import { useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Artwork, EmptyState } from '../components/ui.jsx'
import { useTrackActions } from '../components/TrackBits.jsx'
import {
  IconArrowLeft,
  IconCheck,
  IconDownload,
  IconExternal,
  IconHeart,
  IconList,
  IconPause,
  IconPlay,
  IconPlus,
  IconShield,
} from '../components/Icons.jsx'
import { useLibrary } from '../context/LibraryContext.jsx'
import { formatDate, formatDuration, timeAgo } from '../lib/format.js'
import { trackKey } from '../lib/track.js'

export default function SongDetails() {
  const { key } = useParams()
  const location = useLocation()
  const { favourites, identifications, playlists, addToPlaylist, createPlaylist } = useLibrary()
  const [newName, setNewName] = useState('')
  const [added, setAdded] = useState('')

  const track = useMemo(() => {
    if (location.state?.track) return location.state.track
    const fav = favourites.find((f) => f.key === key)
    if (fav) return fav.track
    for (const id of identifications) {
      if (id.exact?.key === key) return id.exact
      const hit = [...id.similar, ...id.possible].find((t) => t.key === key)
      if (hit) return hit
    }
    const decoded = decodeURIComponent(key || '')
    const [title, artist] = decoded.split('::')
    if (!title) return null
    return { key: trackKey({ title, artist }), title, artist: artist || 'Unknown artist' }
  }, [key, location.state, favourites, identifications])

  const a = useTrackActions(track)
  const identified = identifications.find((i) => i.exact?.key === a.track?.key)

  if (!track) {
    return (
      <>
        <Link to="/library" className="btn btn-sm btn-ghost">
          <IconArrowLeft size={16} /> Library
        </Link>
        <div style={{ marginTop: 14 }}>
          <EmptyState title="Track not found">Open a track from your library, a search result or an identification.</EmptyState>
        </div>
      </>
    )
  }

  const onAdd = async (playlistId) => {
    const result = await addToPlaylist(playlistId, a.track)
    if (result) setAdded(playlistId)
  }

  const onCreate = async (event) => {
    event.preventDefault()
    if (!newName.trim()) return
    const p = await createPlaylist(newName)
    if (p) {
      await addToPlaylist(p.id, a.track)
      setAdded(p.id)
      setNewName('')
    }
  }

  return (
    <>
      <div className="between" style={{ marginBottom: 12 }}>
        <Link to="/" className="btn btn-sm btn-ghost">
          <IconArrowLeft size={16} /> Back
        </Link>
        <div className="row gap-6">
          <button
            type="button"
            className={`icon-btn ${a.saved ? 'is-on' : ''}`}
            aria-pressed={a.saved}
            aria-label={a.saved ? 'Remove from favourites' : 'Save to favourites'}
            onClick={a.favourite}
          >
            <IconHeart size={19} filled={a.saved} style={a.saved ? { color: '#ff5d8f' } : undefined} />
          </button>
          <a
            className="icon-btn"
            href={a.track.youtubeSearchUrl}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Search on YouTube"
          >
            <IconExternal size={19} />
          </a>
        </div>
      </div>

      <div className="detail-hero">
        <Artwork src={a.track.artwork} alt={`${a.track.title} by ${a.track.artist}`} />
        <div className="grow" style={{ minWidth: 0 }}>
          <span className="eyebrow">{a.track.genre || 'Track'}</span>
          <h1 style={{ fontSize: 'clamp(20px, 5vw, 26px)', margin: '5px 0 4px' }} className="balance">
            {a.track.title}
          </h1>
          <p className="small muted truncate">{a.track.artist}</p>
          <p className="tiny mute" style={{ marginTop: 3 }}>
            {[a.track.album, a.track.releaseDate?.slice(0, 4), a.track.durationMs ? formatDuration(a.track.durationMs / 1000) : '']
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>

      <div className="row gap-8 wrap" style={{ marginTop: 14 }}>
        <button type="button" className="btn btn-primary" onClick={a.play} disabled={!a.track.previewUrl}>
          {a.isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
          {a.track.previewUrl ? (a.isPlaying ? 'Pause preview' : 'Play preview') : 'No preview'}
        </button>
        <button type="button" className="btn" onClick={a.download} disabled={!a.track.previewUrl}>
          <IconDownload size={16} /> Download preview
        </button>
        <button type="button" className="btn btn-ghost" onClick={a.favourite} aria-pressed={a.saved}>
          <IconHeart size={16} filled={a.saved} /> {a.saved ? 'Saved' : 'Save'}
        </button>
        {a.track.storeUrl && (
          <a className="btn btn-ghost" href={a.track.storeUrl} target="_blank" rel="noreferrer noopener">
            Open in store <IconExternal size={14} />
          </a>
        )}
      </div>

      {!a.track.previewUrl && (
        <div className="notice notice-info" style={{ marginTop: 12 }}>
          <IconShield size={16} style={{ flex: 'none', marginTop: 1 }} />
          <div>
            The catalogue did not publish a preview clip for this track, so there is nothing playable or downloadable
            here. Open the store listing instead.
          </div>
        </div>
      )}

      <div className="grid-2" style={{ marginTop: 18 }}>
        <div className="card card-pad">
          <span className="eyebrow">Add to playlist</span>
          {playlists.length > 0 ? (
            <div className="list" style={{ marginTop: 8 }}>
              {playlists.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="list-row"
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => onAdd(p.id)}
                >
                  <span className="dl-icon" style={{ width: 32, height: 32, borderRadius: 9 }}>
                    <IconList size={15} />
                  </span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="track-row-title truncate" style={{ display: 'block' }}>
                      {p.name}
                    </span>
                    <span className="track-row-sub">{p.items.length} tracks</span>
                  </span>
                  {added === p.id ? <IconCheck size={16} style={{ color: 'var(--green)' }} /> : <IconPlus size={16} />}
                </button>
              ))}
            </div>
          ) : (
            <p className="tiny muted" style={{ marginTop: 6 }}>
              No playlists yet — create the first one below.
            </p>
          )}
          <form onSubmit={onCreate} className="row gap-8" style={{ marginTop: 10 }}>
            <input
              className="input-plain"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New playlist name"
              aria-label="New playlist name"
            />
            <button type="submit" className="btn btn-sm" disabled={!newName.trim()}>
              Create
            </button>
          </form>
        </div>

        <div className="card card-pad">
          <span className="eyebrow">Track data</span>
          <div className="kv">
            <span>Artist</span>
            <b className="truncate">{a.track.artist}</b>
          </div>
          <div className="kv">
            <span>Album</span>
            <b className="truncate">{a.track.album || '—'}</b>
          </div>
          <div className="kv">
            <span>Released</span>
            <b>{a.track.releaseDate ? formatDate(a.track.releaseDate) : '—'}</b>
          </div>
          <div className="kv">
            <span>Genre</span>
            <b>{a.track.genre || '—'}</b>
          </div>
          <div className="kv">
            <span>Preview</span>
            <b>{a.track.previewUrl ? '30-second clip' : 'Not published'}</b>
          </div>
          <div className="kv">
            <span>Sources</span>
            <b>{(a.track.providers?.length ? a.track.providers : [a.track.source || 'catalogue']).join(', ')}</b>
          </div>
        </div>
      </div>

      {identified && (
        <div className="card card-pad" style={{ marginTop: 14 }}>
          <div className="between">
            <div>
              <span className="eyebrow">Identification</span>
              <p className="small muted" style={{ marginTop: 4 }}>
                Matched {timeAgo(identified.at)} · {1 + identified.similar.length + identified.possible.length} results
              </p>
            </div>
            <Link to={`/results/${identified.id}`} className="btn btn-sm">
              Open results
            </Link>
          </div>
        </div>
      )}

      <p className="tiny mute" style={{ marginTop: 18 }}>
        Previews are provider-published 30-second clips. Playback and download both use that clip — full tracks are
        never extracted from streaming services.
      </p>
    </>
  )
}
