import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import VideoCard from '../components/VideoCard.jsx'
import { EmptyState } from '../components/ui.jsx'
import { IconClock, IconVideo } from '../components/Icons.jsx'
import { useLibrary } from '../context/LibraryContext.jsx'
import { plural } from '../lib/format.js'

export default function WatchLater() {
  const { t } = useTranslation()
  const { watchLater } = useLibrary()

  return (
    <>
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">{t('watchLater.queue')}</span>
          <h1 style={{ marginTop: 4 }}>{t('watchLater.title')}</h1>
        </div>
        <span className="tiny mute">{t('common.videoCount', { count: watchLater.length })}</span>
      </div>

      {watchLater.length === 0 ? (
        <div style={{ marginTop: 16 }}>
          <EmptyState icon={<IconClock size={22} />} title={t('watchLater.emptyTitle')}>
            {t('watchLater.emptyBody')}
            <div style={{ marginTop: 12 }}>
              <Link to="/videos" className="btn btn-sm btn-primary">
                <IconVideo size={14} /> {t('watchLater.browse')}
              </Link>
            </div>
          </EmptyState>
        </div>
      ) : (
        <div className="video-grid" style={{ marginTop: 16 }}>
          {watchLater.map((v) => (
            <VideoCard key={v.videoId} video={v.video} />
          ))}
        </div>
      )}
    </>
  )
}
