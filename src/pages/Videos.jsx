import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import VideoCard from '../components/VideoCard.jsx'
import { EmptyState, ErrorBlock, Loading, Section, Segmented } from '../components/ui.jsx'
import { IconClock, IconExternal, IconPlay, IconSearch, IconVideo } from '../components/Icons.jsx'
import { api } from '../lib/api.js'
import { useLibrary } from '../context/LibraryContext.jsx'

export default function Videos() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { watched, watchLater, savedVideoIds } = useLibrary()
  const [source, setSource] = useState('catalog')
  const [term, setTerm] = useState(params.get('q') || '')
  const [results, setResults] = useState({ loading: false, items: [], error: null, configured: true, ran: false })
  const [manual, setManual] = useState('')

  const search = async (query, mode = source) => {
    const q = String(query || '').trim()
    if (!q) return
    setResults({ loading: true, items: [], error: null, configured: true, ran: true })
    try {
      const data = mode === 'catalog' ? await api.catalogVideos(q, 24) : await api.searchVideos(q, 24)
      setResults({ loading: false, items: data.items || [], error: null, configured: true, ran: true })
    } catch (err) {
      setResults({
        loading: false,
        items: [],
        error: err.message,
        configured: err.code !== 'YOUTUBE_NOT_CONFIGURED',
        ran: true,
      })
    }
  }

  useEffect(() => {
    const q = params.get('q')
    if (q) {
      setTerm(q)
      search(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = (event) => {
    event.preventDefault()
    search(term)
  }

  const switchSource = (next) => {
    setSource(next)
    if (term.trim()) search(term, next)
  }

  const playManual = (event) => {
    event.preventDefault()
    const raw = manual.trim()
    const id =
      /^[A-Za-z0-9_-]{11}$/.test(raw)
        ? raw
        : raw.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/)?.[1] || ''
    if (!id) {
      setResults((r) => ({ ...r, error: 'That does not look like a YouTube link or video id.', ran: true, loading: false }))
      return
    }
    navigate(`/watch/${id}`)
  }

  return (
    <>
      <h1>{t('videos.title')}</h1>
      <p className="small muted" style={{ marginTop: 4, marginBottom: 14 }}>
        Stream inside the app. Watching never downloads a file.
      </p>

      <Segmented
        label="Video source"
        value={source}
        onChange={switchSource}
        options={[
          { value: 'catalog', label: 'Music videos' },
          { value: 'youtube', label: 'YouTube' },
        ]}
      />

      <form onSubmit={submit} role="search" style={{ marginTop: 12 }}>
        <label className="field">
          <IconSearch size={18} className="field-icon" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t(source === 'catalog' ? 'videos.searchCatalogPlaceholder' : 'videos.searchYoutubePlaceholder')}
            aria-label={t('videos.searchLabel')}
            enterKeyHint="search"
          />
          <button type="submit" className="btn btn-sm" disabled={!term.trim()}>
            {t('common.search')}
          </button>
        </label>
      </form>

      {source === 'catalog' && !results.ran && (
        <div className="notice notice-info" style={{ marginTop: 14 }}>
          <IconPlay size={16} style={{ flex: 'none', marginTop: 1 }} />
          <div>
            <strong>{t('videos.catalogNoticeTitle')}</strong> {t('videos.catalogNoticeBody')}
          </div>
        </div>
      )}

      {results.loading && (
        <div style={{ marginTop: 16 }}>
          <Loading label={t(source === 'catalog' ? 'videos.searchingCatalog' : 'videos.searchingYoutube')} rows={4} />
        </div>
      )}

      {!results.loading && results.error && (
        <div style={{ marginTop: 16 }}>
          {source === 'youtube' && !results.configured ? (
            <>
              <div className="card card-pad">
                <span className="eyebrow">{t('common.setup')}</span>
                <h3 style={{ margin: '6px 0 8px' }}>{t('videos.youtubeKeyTitle')}</h3>
                <p className="small muted" style={{ marginBottom: 10 }}>
                  {results.error}
                </p>
                <ol className="small muted" style={{ paddingLeft: 18, margin: '0 0 12px', lineHeight: 1.7 }}>
                  <li>{t('videos.youtubeKeyStep1')}</li>
                  <li>{t('videos.youtubeKeyStep2')}</li>
                  <li>{t('videos.youtubeKeyStep3')}</li>
                </ol>
                <p className="tiny mute">
                  {t('videos.youtubeKeyMeanwhile')}
                </p>
              </div>
              <div className="card card-pad" style={{ marginTop: 12 }}>
                <span className="eyebrow">{t('videos.knownVideo')}</span>
                <p className="tiny muted" style={{ margin: '6px 0 10px' }}>
                  {t('videos.pasteHint')}
                </p>
                <form onSubmit={playManual} className="row gap-8">
                  <input
                    className="input-plain"
                    value={manual}
                    onChange={(e) => setManual(e.target.value)}
                    placeholder="https://youtube.com/watch?v=…"
                    aria-label="YouTube link or video id"
                  />
                  <button type="submit" className="btn btn-sm btn-primary" disabled={!manual.trim()}>
                    Play
                  </button>
                </form>
              </div>
            </>
          ) : (
            <ErrorBlock error={results.error} onRetry={() => search(term)} />
          )}
        </div>
      )}

      {!results.loading && !results.error && results.ran && results.items.length === 0 && (
        <div style={{ marginTop: 16 }}>
          <EmptyState icon={<IconVideo size={22} />} title={t('videos.noMatch')}>
            Try a different title, artist or keyword{source === 'catalog' ? ', or switch to YouTube' : ''}.
          </EmptyState>
        </div>
      )}

      {results.items.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="section-head">
            <h2 style={{ fontSize: 16 }}>{t('common.results')}</h2>
            <span className="tiny mute">
              {results.items.length} {source === 'catalog' ? 'music videos' : 'videos'}
            </span>
          </div>
          <div className="video-grid">
            {results.items.map((v) => (
              <VideoCard key={v.videoId} video={v} />
            ))}
          </div>
        </div>
      )}

      {watched.length > 0 && (
        <Section title={t('videos.recentlyWatched')} to="/watch-later" actionLabel={t('nav.watchLater')}>
          <div className="hscroll">
            {watched.slice(0, 8).map((w) => (
              <div key={w.videoId} style={{ width: 210 }}>
                <VideoCard video={w.video} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {watchLater.length > 0 && (
        <Section title={t('nav.watchLater')} to="/watch-later">
          <div className="hscroll">
            {watchLater.slice(0, 8).map((w) => (
              <div key={w.videoId} style={{ width: 210 }}>
                <VideoCard video={w.video} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {savedVideoIds.size > 0 && (
        <p className="tiny mute" style={{ marginTop: 18 }}>
          {savedVideoIds.size} saved video{savedVideoIds.size === 1 ? '' : 's'} in your{' '}
          <Link to="/library?tab=videos" className="section-link">
            library
          </Link>
          .
        </p>
      )}

      <div className="card card-pad" style={{ marginTop: 22 }}>
        <div className="row gap-8" style={{ marginBottom: 6 }}>
          <IconClock size={16} />
          <strong style={{ fontSize: 13 }}>{t('videos.streamTitle')}</strong>
        </div>
        <p className="tiny muted">
          {t('videos.streamBody')}
        </p>
        <a
          className="section-link"
          style={{ marginTop: 8, display: 'inline-flex' }}
          href="https://www.youtube.com/"
          target="_blank"
          rel="noreferrer noopener"
        >
          Open YouTube <IconExternal size={12} />
        </a>
      </div>
    </>
  )
}
