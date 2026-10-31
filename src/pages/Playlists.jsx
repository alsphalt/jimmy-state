import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui.jsx'
import { IconChevron, IconList, IconPlus } from '../components/Icons.jsx'
import { useLibrary } from '../context/LibraryContext.jsx'
import { timeAgo, plural } from '../lib/format.js'

export default function Playlists() {
  const { playlists, createPlaylist } = useLibrary()
  const [name, setName] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    if (!name.trim()) return
    await createPlaylist(name)
    setName('')
  }

  return (
    <>
      <h1>Playlists</h1>
      <p className="small muted" style={{ marginTop: 4 }}>
        Playlists are local to this device. Add tracks from any song detail page.
      </p>

      <form onSubmit={submit} className="row gap-8" style={{ marginTop: 14 }}>
        <input
          className="input-plain"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New playlist name"
          aria-label="New playlist name"
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim()}>
          <IconPlus size={15} /> Create
        </button>
      </form>

      <div className="list" style={{ marginTop: 16 }}>
        {playlists.length === 0 ? (
          <EmptyState icon={<IconList size={22} />} title="No playlists yet">
            Name one above, then add tracks while browsing your library.
          </EmptyState>
        ) : (
          playlists.map((p) => (
            <Link key={p.id} to={`/playlists/${p.id}`} className="list-row">
              <span className="dl-icon" style={{ background: 'var(--grad-soft)' }}>
                <IconList size={18} />
              </span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="track-row-title truncate" style={{ display: 'block' }}>
                  {p.name}
                </span>
                <span className="track-row-sub">
                  {plural(p.items.length, 'track')} · created {timeAgo(p.at)}
                </span>
              </span>
              <IconChevron size={16} />
            </Link>
          ))
        )}
      </div>
    </>
  )
}
