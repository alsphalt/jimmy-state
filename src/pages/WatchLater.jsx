import { Link } from 'react-router-dom'
import VideoCard from '../components/VideoCard.jsx'
import { EmptyState } from '../components/ui.jsx'
import { IconClock, IconVideo } from '../components/Icons.jsx'
import { useLibrary } from '../context/LibraryContext.jsx'
import { plural } from '../lib/format.js'

export default function WatchLater() {
  const { watchLater } = useLibrary()

  return (
    <>
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">Queue</span>
          <h1 style={{ marginTop: 4 }}>Watch Later</h1>
        </div>
        <span className="tiny mute">{plural(watchLater.length, 'video')}</span>
      </div>

      {watchLater.length === 0 ? (
        <div style={{ marginTop: 16 }}>
          <EmptyState icon={<IconClock size={22} />} title="Nothing queued">
            Use the clock icon on any video to keep it for later. Nothing is downloaded — videos stay streamable.
            <div style={{ marginTop: 12 }}>
              <Link to="/videos" className="btn btn-sm btn-primary">
                <IconVideo size={14} /> Browse videos
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
