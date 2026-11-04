import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui.jsx'
import { IconChevron, IconList, IconPlus } from '../components/Icons.jsx'
import { useLibrary } from '../context/LibraryContext.jsx'
import { timeAgo, plural } from '../lib/format.js'

export default function Playlists() {
  const { t } = useTranslation()
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
      <h1>{t('playlists.title')}</h1>
      <p className="small muted" style={{ marginTop: 4 }}>
        {t('playlists.subtitle')}
      </p>

      <form onSubmit={submit} className="row gap-8" style={{ marginTop: 14 }}>
        <input
          className="input-plain"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('playlists.namePlaceholder')}
          aria-label={t('playlists.namePlaceholder')}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim()}>
          <IconPlus size={15} /> {t('common.create')}
        </button>
      </form>

      <div className="list" style={{ marginTop: 16 }}>
        {playlists.length === 0 ? (
          <EmptyState icon={<IconList size={22} />} title={t('playlists.empty')}>
            {t('playlists.emptyBody')}
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
                  {t('common.trackCount', { count: p.items.length })} · {t('playlists.created', { when: timeAgo(p.at) })}
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
