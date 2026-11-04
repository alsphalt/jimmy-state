import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { Artwork, EmptyState, Segmented } from '../components/ui.jsx'
import { TrackRow } from '../components/TrackBits.jsx'
import VideoCard from '../components/VideoCard.jsx'
import {
  IconChevron,
  IconDownload,
  IconHeart,
  IconList,
  IconMic,
  IconPlus,
  IconSearch,
  IconTrash,
  IconVideo,
  IconX,
} from '../components/Icons.jsx'
import { useLibrary } from '../context/LibraryContext.jsx'
import { timeAgo, plural } from '../lib/format.js'

const TABS = [
  { value: 'identified', label: 'Identified' },
  { value: 'favourites', label: 'Favourites' },
  { value: 'videos', label: 'Videos' },
  { value: 'later', label: 'Watch Later' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'playlists', label: 'Playlists' },
  { value: 'searches', label: 'Searches' },
]

export default function Library() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'identified'
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState('recent')

  const lib = useLibrary()
  const {
    identifications,
    favourites,
    videos,
    watchLater,
    downloads,
    playlists,
    searches,
    removeIdentification,
    toggleFavourite,
    toggleSavedVideo,
    toggleWatchLater,
    removeSearch,
    clearSearches,
    counts,
  } = lib

  const setTab = (value) => {
    const next = new URLSearchParams(params)
    next.set('tab', value)
    setParams(next, { replace: true })
  }

  const q = filter.trim().toLowerCase()
  const match = (...fields) => !q || fields.some((f) => String(f || '').toLowerCase().includes(q))

  const sortedFavourites = useMemo(() => {
    const list = favourites.filter((f) => match(f.track.title, f.track.artist, f.track.album)).map((f) => ({ ...f.track, at: f.at }))
    return sort === 'az' ? list.sort((a, b) => a.title.localeCompare(b.title)) : list.sort((a, b) => new Date(b.at) - new Date(a.at))
  }, [favourites, q, sort])

  const sortedIds = identifications.filter((i) => match(i.exact.title, i.exact.artist))

  const total = identifications.length + favourites.length + videos.length + watchLater.length + downloads.length

  return (
    <>
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">{t('library.onThisDevice')}</span>
          <h1 style={{ marginTop: 4 }}>{t('library.title')}</h1>
        </div>
        <span className="tiny mute">{t('common.itemCount', { count: total })}</span>
      </div>

      <div className="row gap-8" style={{ marginTop: 14 }}>
        <label className="field" style={{ height: 42 }}>
          <IconSearch size={17} className="field-icon" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter this library"
            aria-label="Filter library"
          />
          {filter && (
            <button type="button" className="icon-btn" style={{ width: 26, height: 26 }} aria-label="Clear filter" onClick={() => setFilter('')}>
              <IconX size={14} />
            </button>
          )}
        </label>
        <select
          className="input-plain"
          style={{ width: 118, height: 42 }}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sort library"
        >
          <option value="recent">{t('library.recent')}</option>
          <option value="az">A–Z</option>
        </select>
      </div>

      <div style={{ marginTop: 12 }}>
        <Segmented
          label="Library sections"
          value={tab}
          onChange={setTab}
          options={TABS.map((t) => {
            const countKey = { identified: 'identifications', later: 'watchLater' }[t.value] || t.value
            const n = counts[countKey]
            return { ...t, label: n ? `${t.label} ${n}` : t.label }
          })}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        {tab === 'identified' &&
          (sortedIds.length === 0 ? (
            <EmptyState icon={<IconMic size={22} />} title={q ? 'No matching identifications' : 'No identifications yet'}>
              {q ? 'Try a different filter.' : 'Tap the D on Home, Identify or in the nav bar to capture your first song.'}
            </EmptyState>
          ) : (
            <div className="list">
              {sortedIds.map((item) => (
                <div key={item.id} className="list-row">
                  <Link to={`/results/${item.id}`} style={{ flex: 'none' }}>
                    <Artwork src={item.exact.artworkSmall} alt={item.exact.title} style={{ width: 54, height: 54, borderRadius: 11 }} />
                  </Link>
                  <Link to={`/results/${item.id}`} className="grow" style={{ minWidth: 0 }}>
                    <div className="track-row-title truncate">{item.exact.title}</div>
                    <div className="track-row-sub truncate">
                      {item.exact.artist} · {timeAgo(item.at)}
                    </div>
                  </Link>
                  <span className="badge badge-exact hide-mobile">{t('library.matched')}</span>
                  <span className="tiny mute" style={{ flex: 'none' }}>
                    {1 + item.similar.length + item.possible.length}
                  </span>
                  <button type="button" className="icon-btn" aria-label="Delete identification" onClick={() => removeIdentification(item.id)}>
                    <IconTrash size={16} />
                  </button>
                </div>
              ))}
            </div>
          ))}

        {tab === 'favourites' &&
          (sortedFavourites.length === 0 ? (
            <EmptyState icon={<IconHeart size={22} />} title={q ? 'No favourites match' : 'No favourites yet'}>
              Tap the heart on any track to keep it here.
            </EmptyState>
          ) : (
            <div className="list">
              {sortedFavourites.map((t) => (
                <TrackRow key={t.key} track={t} onRemove={() => toggleFavourite(t)} />
              ))}
            </div>
          ))}

        {tab === 'videos' &&
          (videos.length === 0 ? (
            <EmptyState icon={<IconVideo size={22} />} title={t('library.noVideos')}>
              Save a video from the Videos section or from the player page.
            </EmptyState>
          ) : (
            <div className="video-grid">
              {videos
                .filter((v) => match(v.video.title, v.video.channel))
                .map((v) => (
                  <VideoCard key={v.videoId} video={v.video} />
                ))}
            </div>
          ))}

        {tab === 'later' &&
          (watchLater.length === 0 ? (
            <EmptyState icon={<IconVideo size={22} />} title={t('library.watchLaterEmpty')}>
              Add videos with the clock icon.
            </EmptyState>
          ) : (
            <div className="video-grid">
              {watchLater
                .filter((v) => match(v.video.title, v.video.channel))
                .map((v) => (
                  <VideoCard key={v.videoId} video={v.video} />
                ))}
            </div>
          ))}

        {tab === 'downloads' && (
          <>
            {downloads.length === 0 ? (
              <EmptyState icon={<IconDownload size={22} />} title={t('library.noDownloads')}>
                Authorized preview clips you save appear here with their status.
                <div style={{ marginTop: 10 }}>
                  <Link to="/downloads" className="btn btn-sm btn-ghost">
                    Open Downloads
                  </Link>
                </div>
              </EmptyState>
            ) : (
              <>
                <div className="list">
                  {downloads.slice(0, 8).map((d) => (
                    <div key={d.id} className="list-row">
                      <span className={`status-dot ${d.status}`} aria-hidden="true" />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="track-row-title truncate">{d.fileName || d.title}</div>
                        <div className="track-row-sub truncate">
                          {d.status} · {d.format?.toUpperCase()} · {timeAgo(d.at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <Link to="/downloads" className="btn btn-sm btn-ghost btn-block" style={{ marginTop: 10 }}>
                  Manage downloads <IconChevron size={14} />
                </Link>
              </>
            )}
            <div className="notice notice-info" style={{ marginTop: 14 }}>
              <IconDownload size={16} style={{ flex: 'none', marginTop: 1 }} />
              <div>
                Library records are separate from device files. Removing a record here does not delete a file that was
                already saved to your phone or computer.
              </div>
            </div>
          </>
        )}

        {tab === 'playlists' && (
          <>
            {playlists.length === 0 ? (
              <EmptyState icon={<IconList size={22} />} title={t('library.noPlaylists')}>
                <Link to="/playlists" className="btn btn-sm btn-primary" style={{ marginTop: 8 }}>
                  <IconPlus size={14} /> Create a playlist
                </Link>
              </EmptyState>
            ) : (
              <div className="list">
                {playlists.map((p) => (
                  <Link key={p.id} to={`/playlists/${p.id}`} className="list-row">
                    <span className="dl-icon" style={{ background: 'var(--grad-soft)' }}>
                      <IconList size={18} />
                    </span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="track-row-title truncate" style={{ display: 'block' }}>
                        {p.name}
                      </span>
                      <span className="track-row-sub">{t('common.trackCount', { count: p.items.length })}</span>
                    </span>
                    <IconChevron size={16} />
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'searches' && (
          <>
            {searches.length === 0 ? (
              <EmptyState icon={<IconSearch size={22} />} title={t('library.noHistory')}>
                Searches you run are stored locally so you can jump back in.
              </EmptyState>
            ) : (
              <>
                <div className="row wrap gap-8">
                  {searches.map((s) => (
                    <span key={s.id} className="chip">
                      <Link to={`/search?q=${encodeURIComponent(s.term)}&mode=${s.mode}`}>{s.term}</Link>
                      <button type="button" aria-label={`Remove ${s.term}`} onClick={() => removeSearch(s.id)} style={{ display: 'flex' }}>
                        <IconX size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <button type="button" className="btn btn-sm btn-danger" style={{ marginTop: 14 }} onClick={clearSearches}>
                  <IconTrash size={14} /> Clear search history
                </button>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
