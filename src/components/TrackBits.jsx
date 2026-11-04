import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { Artwork, PlatformLinks } from './ui.jsx'
import { IconDownload, IconHeart, IconPause, IconPlay, IconChevron, IconTrash } from './Icons.jsx'
import { useLibrary, useToast } from '../context/LibraryContext.jsx'
import { usePlayer } from '../context/PlayerContext.jsx'
import { useDownloads } from '../context/DownloadsContext.jsx'
import { normalizeTrack, trackKey } from '../lib/track.js'
import { formatDuration } from '../lib/format.js'

export function useTrackActions(track) {
  const { toggleFavourite, isFavourite } = useLibrary()
  const { play, current, playing } = usePlayer()
  const { start, isDownloading } = useDownloads()
  const { toast } = useToast()
  const navigate = useNavigate()
  const t = normalizeTrack(track)

  return {
    track: t,
    saved: isFavourite(t),
    isPlaying: current?.key === t.key && playing,
    downloading: isDownloading(t.key),
    /**
     * A YouTube result is the whole song, so playing it opens the video player instead
     * of the 30-second preview player. Everything else uses the preview.
     */
    play: () => {
      if (t.videoId) {
        navigate(`/watch/${t.videoId}`)
        return
      }
      play(t)
    },
    favourite: () => toggleFavourite(t),
    download: () => {
      if (!t.previewUrl) {
        toast('No authorized file', {
          title: t.title,
          message: 'This track has no provider-published download. Only preview clips can be saved.',
          type: 'err',
        })
        return
      }
      start(t, { kind: 'audio' })
    },
  }
}

export function TrackTile({ track, showRank = false }) {
  const a = useTrackActions(track)
  const navigate = useNavigate()
  return (
    <div className="track-tile">
      <div style={{ position: 'relative' }}>
        <Link to={`/song/${encodeURIComponent(a.track.key)}`} state={{ track: a.track }} aria-label={`Open ${a.track.title}`}>
          <Artwork src={a.track.artwork} alt={`${a.track.title} by ${a.track.artist}`} />
        </Link>
        <button
          type="button"
          className="tile-play"
          aria-label={a.isPlaying ? `Pause ${a.track.title}` : `Play preview of ${a.track.title}`}
          onClick={a.play}
        >
          {a.isPlaying ? <IconPause size={15} /> : <IconPlay size={15} />}
        </button>
        <button
          type="button"
          className={`tile-fav ${a.saved ? 'is-on' : ''}`}
          aria-label={a.saved ? 'Remove from favourites' : 'Save to favourites'}
          aria-pressed={a.saved}
          onClick={a.favourite}
        >
          <IconHeart size={15} filled={a.saved} />
        </button>
        {showRank && <span className="rank" style={{ position: 'absolute', left: 8, bottom: 8, color: '#fff' }}>{track.rank}</span>}
      </div>
      <Link to={`/song/${encodeURIComponent(a.track.key)}`} state={{ track: a.track }} className="stack">
        <span className="track-tile-title truncate">{a.track.title}</span>
        <span className="track-tile-artist truncate">{a.track.artist}</span>
      </Link>
    </div>
  )
}

export function TrackRow({ track, subtitle, trailing, showDownload = true, onRemove, rank, onDownload }) {
  const a = useTrackActions(track)
  const navigate = useNavigate()
  return (
    <div className="list-row">
      {typeof rank === 'number' && <span className="rank">{rank}</span>}
      <button type="button" onClick={a.play} aria-label={`Play preview of ${a.track.title}`} style={{ position: 'relative' }}>
        <Artwork src={a.track.artworkSmall || a.track.artwork} alt={`${a.track.title} by ${a.track.artist}`} style={{ width: 52, height: 52, borderRadius: 11 }} />
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(6,8,14,.45)',
            borderRadius: 11,
            opacity: 0.85,
            color: '#fff',
          }}
        >
          {a.isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
        </span>
      </button>
      <button
        type="button"
        className="track-row-meta"
        style={{ background: 'none', textAlign: 'left' }}
        onClick={a.play}
      >
        <div className="track-row-title truncate">{a.track.title}</div>
        <div className="track-row-sub truncate">
          {subtitle || a.track.artist}
          {a.track.durationMs ? ` · ${formatDuration(a.track.durationMs / 1000)}` : ''}
        </div>
      </button>
      <div className="track-row-actions">
        <button
          type="button"
          className="icon-btn ghost"
          aria-label={`Open details for ${a.track.title}`}
          onClick={() => navigate(`/song/${encodeURIComponent(a.track.key)}`, { state: { track: a.track } })}
        >
          <IconChevron size={16} />
        </button>
        {trailing}
        {showDownload && a.track.previewUrl && (
          <button
            type="button"
            className="icon-btn"
            aria-label={`Download preview of ${a.track.title}`}
            title="Choose a download format"
            onClick={onDownload ? () => onDownload(a.track) : a.download}
          >
            <IconDownload size={17} />
          </button>
        )}
        <button
          type="button"
          className={`icon-btn ${a.saved ? 'is-on' : ''}`}
          aria-pressed={a.saved}
          aria-label={a.saved ? 'Remove from favourites' : 'Save to favourites'}
          onClick={a.favourite}
        >
          <IconHeart size={17} filled={a.saved} style={a.saved ? { color: '#ff5d8f' } : undefined} />
        </button>
        {onRemove ? (
          <button type="button" className="icon-btn" aria-label="Remove from list" onClick={onRemove}>
            <IconTrash size={16} />
          </button>
        ) : (
          <Link
            to={`/song/${encodeURIComponent(a.track.key)}`}
            state={{ track: a.track }}
            className="icon-btn"
            aria-label="Open details"
          >
            <IconChevron size={17} />
          </Link>
        )}
      </div>
    </div>
  )
}

export function MatchSections({ results }) {
  const { t } = useTranslation()
  if (!results?.exact) return null
  const { exact, similar = [], possible = [] } = results
  return (
    <>
      <div className="hero-match card card-glow">
        <span className="badge badge-exact">{t('results.exact')}</span>
        <Artwork src={exact.artwork} alt={`${exact.title} by ${exact.artist}`} style={{ borderRadius: 24 }} />
        <div className="stack" style={{ gap: 3 }}>
          <h1 className="balance">{exact.title}</h1>
          <p className="artist">{exact.artist}</p>
          {(exact.album || exact.releaseDate) && (
            <p className="tiny mute">
              {exact.album}
              {exact.album && exact.releaseDate ? ' · ' : ''}
              {exact.releaseDate?.slice(0, 4)}
            </p>
          )}
        </div>
        {typeof exact.confidence === 'number' && (
          <div className="confidence">
            <span>{t('results.confidence')}</span>
            <i>
              <b style={{ width: `${Math.round(exact.confidence * 100)}%` }} />
            </i>
            <span>{Math.round(exact.confidence * 100)}%</span>
          </div>
        )}
        <HeroActions track={exact} />
        {exact.links?.length > 0 && <PlatformLinks links={exact.links} />}
      </div>

      {similar.length > 0 && (
        <section>
          <div className="group-head">
            <span className="badge badge-similar">{t('results.similar')}</span>
            <span className="group-count">{similar.length}</span>
            <span className="group-rule" />
          </div>
          <div className="list">
            {similar.map((item) => (
              <TrackRow key={item.key} track={item} subtitle={`${item.artist}${item.album ? ` · ${item.album}` : ''}`} />
            ))}
          </div>
        </section>
      )}

      {possible.length > 0 && (
        <section>
          <div className="group-head">
            <span className="badge badge-possible">{t('results.possible')}</span>
            <span className="group-count">{possible.length}</span>
            <span className="group-rule" />
          </div>
          <p className="tiny mute" style={{ marginBottom: 10 }}>
            Same title or close metadata, different recordings. These are recommendations, not verified identifications.
          </p>
          <div className="list">
            {possible.map((item) => (
              <TrackRow key={item.key} track={item} subtitle={`${item.artist}${item.album ? ` · ${item.album}` : ''}`} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

export function HeroActions({ track }) {
  const a = useTrackActions(track)
  return (
    <div className="hero-actions">
      <button type="button" className="btn btn-primary" onClick={a.play} disabled={!a.track.previewUrl}>
        {a.isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
        {a.track.previewUrl ? (a.isPlaying ? 'Pause preview' : 'Play preview') : 'No preview'}
      </button>
      <button type="button" className="btn" onClick={a.download} disabled={!a.track.previewUrl}>
        <IconDownload size={16} /> Download
      </button>
      <button type="button" className="btn btn-ghost" onClick={a.favourite} aria-pressed={a.saved}>
        <IconHeart size={16} filled={a.saved} style={a.saved ? { color: '#ff5d8f' } : undefined} /> {a.saved ? 'Saved' : 'Save'}
      </button>
      <Link to={`/song/${encodeURIComponent(trackKey(a.track))}`} state={{ track: a.track }} className="btn btn-ghost">
        Details
      </Link>
    </div>
  )
}
