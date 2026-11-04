import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../components/ui.jsx'
import { TrackRow } from '../components/TrackBits.jsx'
import { IconArrowLeft, IconList, IconPlay, IconTrash } from '../components/Icons.jsx'
import { useLibrary } from '../context/LibraryContext.jsx'
import { usePlayer } from '../context/PlayerContext.jsx'
import { plural } from '../lib/format.js'

export default function PlaylistDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { playlists, removeFromPlaylist, deletePlaylist } = useLibrary()
  const { play } = usePlayer()
  const playlist = playlists.find((p) => p.id === id)

  if (!playlist) {
    return (
      <>
        <Link to="/playlists" className="btn btn-sm btn-ghost">
          <IconArrowLeft size={16} /> Playlists
        </Link>
        <div style={{ marginTop: 14 }}>
          <EmptyState title={t('playlists.notFound')}>{t('playlists.notFoundBody')}</EmptyState>
        </div>
      </>
    )
  }

  const playAll = () => {
    const first = playlist.items.find((t) => t.previewUrl)
    if (first) play(first)
  }

  return (
    <>
      <div className="between" style={{ marginBottom: 12 }}>
        <Link to="/playlists" className="btn btn-sm btn-ghost">
          <IconArrowLeft size={16} /> Playlists
        </Link>
        <button
          type="button"
          className="icon-btn"
          aria-label="Delete playlist"
          onClick={async () => {
            await deletePlaylist(playlist.id)
            navigate('/playlists')
          }}
        >
          <IconTrash size={18} />
        </button>
      </div>

      <div className="detail-hero" style={{ alignItems: 'center' }}>
        <span
          style={{
            width: 92,
            height: 92,
            borderRadius: 20,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--grad-soft)',
            border: '1px solid var(--line)',
            flex: 'none',
          }}
        >
          <IconList size={34} />
        </span>
        <div className="grow" style={{ minWidth: 0 }}>
          <span className="eyebrow">{t('playlists.playlist')}</span>
          <h1 style={{ fontSize: 24, margin: '5px 0 4px' }} className="balance">
            {playlist.name}
          </h1>
          <p className="tiny mute">{t('common.trackCount', { count: playlist.items.length })}</p>
        </div>
      </div>

      <div className="row gap-8" style={{ marginTop: 14 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={playAll} disabled={!playlist.items.some((t) => t.previewUrl)}>
          <IconPlay size={15} /> Play first preview
        </button>
      </div>

      <div className="list" style={{ marginTop: 16 }}>
        {playlist.items.length === 0 ? (
          <EmptyState icon={<IconList size={22} />} title="This playlist is empty">
            Open any track and use “Add to playlist”.
          </EmptyState>
        ) : (
          playlist.items.map((t, i) => (
            <TrackRow
              key={t.key}
              track={t}
              rank={i + 1}
              onRemove={() => removeFromPlaylist(playlist.id, t.key)}
            />
          ))
        )}
      </div>
    </>
  )
}
