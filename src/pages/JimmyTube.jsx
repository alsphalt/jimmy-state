import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import VideoCard from '../components/VideoCard.jsx'
import { TrackRow } from '../components/TrackBits.jsx'
import { Artwork, EmptyState, ErrorBlock, Loading } from '../components/ui.jsx'
import {
  IconCheck,
  IconDownload,
  IconHome,
  IconMusic,
  IconPlay,
  IconSearch,
  IconSettings,
  IconTube,
  IconVideo,
  IconX,
} from '../components/Icons.jsx'
import { api } from '../lib/api.js'
import { useLibrary } from '../context/LibraryContext.jsx'
import { useDownloads } from '../context/DownloadsContext.jsx'
import { attachEqualizer, supportsEqualizer } from '../lib/eq.js'
import { EQ_PRESETS, readTubePrefs, writeTubePrefs } from '../lib/tubePrefs.js'
import { formatBytes } from '../lib/format.js'

const TABS = [
  { id: 'home', label: 'Home', Icon: IconHome },
  { id: 'music', label: 'Music', Icon: IconMusic },
  { id: 'videos', label: 'Videos', Icon: IconVideo },
  { id: 'local', label: 'Local', Icon: IconDownload },
  { id: 'settings', label: 'Settings', Icon: IconSettings },
]

const QUICK = ['Amapiano mix', 'Afrobeats 2026', 'Gospel worship', 'Hip hop classics', 'Live session', 'Long mix']

const kindOf = (file) => (file.type.startsWith('video/') ? 'video' : 'audio')

export default function JimmyTube() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'home'
  const initialQ = params.get('q') || ''

  const { chartsFeed, chartsError, reloadCharts } = useCharts()
  const { searches, addSearch, clearSearches, watched, watchLater } = useLibrary()
  const downloads = useDownloads()
  const prefs = useTubePrefs()

  const [term, setTerm] = useState(initialQ)
  const [results, setResults] = useState({ loading: false, items: [], error: null, ran: false, mode: '', notice: '' })
  const [sheet, setSheet] = useState(null)

  const goTab = (next) => {
    const p = new URLSearchParams(params)
    p.set('tab', next)
    setParams(p, { replace: true })
  }

  const run = async (query, mode = 'music') => {
    const q = String(query || '').trim()
    if (!q) return
    setResults({ loading: true, items: [], error: null, ran: true, mode, notice: '' })
    try {
      const data = mode === 'videos' ? await api.searchVideos(q, 24) : await api.searchMusic(q, 30)
      setResults({
        loading: false,
        items: data.items || [],
        error: null,
        ran: true,
        mode,
        notice: data.source === 'youtube' && mode === 'music' ? 'Full-length tracks · played from YouTube' : data.note || '',
      })
      addSearch(q, mode)
    } catch (err) {
      setResults({ loading: false, items: [], error: err.message, ran: true, mode, notice: '' })
    }
  }

  const submit = (event) => {
    event.preventDefault()
    const q = term.trim()
    if (!q) return
    const p = new URLSearchParams(params)
    p.set('q', q)
    p.delete('tab')
    setParams(p, { replace: true })
    run(q, tab === 'videos' ? 'videos' : 'music')
  }

  const pick = (q) => {
    setTerm(q)
    const p = new URLSearchParams(params)
    p.set('q', q)
    p.delete('tab')
    setParams(p, { replace: true })
    run(q, tab === 'videos' ? 'videos' : 'music')
  }

  const lastRun = useRef('')
  useEffect(() => {
    if (!initialQ || lastRun.current === initialQ) return
    lastRun.current = initialQ
    setTerm(initialQ)
    run(initialQ, tab === 'videos' ? 'videos' : 'music')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ])

  const recent = useMemo(() => searches.slice(0, 8), [searches])

  return (
    <div className="tube-app">
      <header className="tube-head">
        <div className="tube-brand">
          <span className="tube-logo" aria-hidden="true">
            <IconTube size={19} />
          </span>
          <span className="tube-word">
            JIMMY <b>TUBE</b>
          </span>
        </div>
        <div className="row gap-6" style={{ flex: 'none' }}>
          <button type="button" className="icon-btn" aria-label="Search" onClick={() => goTab('home')}>
            <IconSearch size={18} />
          </button>
          <button
            type="button"
            className={`icon-btn ${tab === 'settings' ? 'is-on' : ''}`}
            aria-label="Settings"
            onClick={() => goTab('settings')}
          >
            <IconSettings size={18} />
          </button>
        </div>
      </header>

      {tab !== 'settings' && tab !== 'local' && (
        <>
          <form onSubmit={submit} role="search" className="tube-search">
            <label className="field">
              <IconSearch size={18} className="field-icon" />
              <input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Songs, artists, videos, or paste a link"
                aria-label="Search Jimmy Tube"
                enterKeyHint="search"
                spellCheck="false"
              />
              {term && (
                <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Clear" onClick={() => setTerm('')}>
                  <IconX size={14} />
                </button>
              )}
            </label>
          </form>

          {recent.length > 0 && (
            <div className="tube-recent">
              <div className="row" style={{ alignItems: 'center' }}>
                <span className="eyebrow">Recent</span>
                <span className="grow" />
                <button type="button" className="tube-link" onClick={() => clearSearches()}>
                  Clear
                </button>
              </div>
              <div className="tube-chips">
                {recent.map((entry) => (
                  <button key={entry.id} type="button" className="chip" onClick={() => pick(entry.term)}>
                    {entry.term}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="tube-chips" style={{ marginTop: 10 }}>
            {QUICK.map((q) => (
              <button key={q} type="button" className="chip" onClick={() => pick(q)}>
                {q}
              </button>
            ))}
          </div>
        </>
      )}

      {results.loading && (
        <div style={{ marginTop: 16 }}>
          <Loading label="Searching…" rows={4} />
        </div>
      )}

      {!results.loading && results.error && (
        <div style={{ marginTop: 16 }}>
          <ErrorBlock error={results.error} onRetry={() => run(term || initialQ, results.mode || 'music')} />
        </div>
      )}

      {!results.loading && !results.error && results.ran && results.items.length === 0 && tab !== 'local' && (
        <div style={{ marginTop: 16 }}>
          <EmptyState icon={<IconVideo size={22} />} title="Nothing matched">
            Try another word, or one of the suggestions above.
          </EmptyState>
        </div>
      )}

      {results.items.length > 0 && !results.loading && tab !== 'local' && tab !== 'settings' && (
        <div style={{ marginTop: 16 }}>
          {results.notice && <p className="tiny mute" style={{ marginBottom: 8 }}>{results.notice}</p>}
          {results.mode === 'videos' ? (
            <div className="video-grid">
              {results.items.map((v) => (
                <VideoCard key={v.videoId} video={v} />
              ))}
            </div>
          ) : (
            <div className="list">
              {results.items.map((t) => (
                <TrackRow key={t.key || t.id} track={t} onDownload={setSheet} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'home' && !results.ran && (
        <>
          <section className="tube-block">
            <div className="section-head">
              <h2>Suggested music</h2>
              <Link to="/tools/tube?tab=music" className="tiny mute">
                More
              </Link>
            </div>
            {chartsError && <ErrorBlock error={chartsError} onRetry={reloadCharts} />}
            {!chartsFeed.length && !chartsError && <Loading rows={2} label="Loading charts…" />}
            {chartsFeed.length > 0 && (
              <div className="rail">
                {chartsFeed.slice(0, 12).map((t) => (
                  <Link key={t.key} to={`/song/${encodeURIComponent(t.key)}`} state={{ track: t }} className="rail-card">
                    <Artwork src={t.artwork} alt={t.title} style={{ borderRadius: 14 }} />
                    <span className="rail-title clamp-2">{t.title}</span>
                    <span className="rail-sub truncate">{t.artist}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="tube-block">
            <div className="section-head">
              <h2>Suggested videos</h2>
              <Link to="/tools/tube?tab=videos" className="tiny mute">
                More
              </Link>
            </div>
            <SuggestedVideos videos={[...watched.map((w) => w.video), ...watchLater.map((w) => w.video)]} />
          </section>
        </>
      )}

      {tab === 'music' && !results.ran && (
        <section className="tube-block">
          <div className="section-head">
            <h2>Top songs</h2>
          </div>
          {chartsFeed.length ? (
            <div className="list">
              {chartsFeed.slice(0, 15).map((t) => (
                <TrackRow key={t.key} track={t} onDownload={setSheet} rank={t.rank} />
              ))}
            </div>
          ) : (
            !chartsError && <Loading rows={4} label="Loading songs…" />
          )}
        </section>
      )}

      {tab === 'videos' && !results.ran && (
        <section className="tube-block">
          <div className="section-head">
            <h2>Music videos</h2>
          </div>
          <SuggestedVideos videos={[...watched.map((w) => w.video), ...watchLater.map((w) => w.video)]} always />
        </section>
      )}

      {tab === 'local' && <LocalPanel prefs={prefs} />}
      {tab === 'settings' && <SettingsPanel prefs={prefs} />}

      <FootNote />
      <TubeNav tab={tab} onTab={goTab} />
      {sheet && <FormatSheet item={sheet} downloads={downloads} onClose={() => setSheet(null)} />}
    </div>
  )
}

/* ------------------------------------------------------------------ pieces */

function TubeNav({ tab, onTab }) {
  return (
    <nav className="tube-nav" aria-label="Jimmy Tube">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`tube-nav-item ${tab === id ? 'is-active' : ''}`}
          aria-current={tab === id ? 'page' : undefined}
          onClick={() => onTab(id)}
        >
          <Icon size={18} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}

function FootNote() {
  return (
    <p className="tiny mute" style={{ marginTop: 22, textAlign: 'center' }}>
      Playback runs through the official players. Downloads are limited to files a provider publishes.
    </p>
  )
}

function SuggestedVideos({ videos, always = false }) {
  const [items, setItems] = useState(videos)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.searchVideos('official music video', 10)
      setItems(data.items || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!always && items.length) return
    if (items.length && !always) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error && !items.length) return <ErrorBlock error={error} onRetry={load} />
  if (!items.length) return loading ? <Loading rows={2} label="Loading videos…" /> : null

  return (
    <div className="rail rail-wide">
      {items.slice(0, 10).map((v) => (
        <div key={v.videoId} className="rail-card rail-card-video">
          <VideoCard video={v} compact />
        </div>
      ))}
    </div>
  )
}

function LocalPanel({ prefs }) {
  const [sub, setSub] = useState('audio')
  const [files, setFiles] = useState([])
  const [current, setCurrent] = useState(null)
  const [error, setError] = useState(null)
  const audioRef = useRef(null)
  const videoRef = useRef(null)
  const inputRef = useRef(null)
  const eqRef = useRef(null)

  const accept = sub === 'audio' ? 'audio/*' : 'video/*'

  const addFiles = (event) => {
    const picked = Array.from(event.target.files || [])
    if (!picked.length) return
    const next = picked.map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      size: file.size,
      kind: kindOf(file),
      url: URL.createObjectURL(file),
      type: file.type,
    }))
    setFiles((prev) => [...next, ...prev])
    setCurrent(next[0])
    event.target.value = ''
  }

  useEffect(() => {
    if (!current) return
    const element = current.kind === 'video' ? videoRef.current : audioRef.current
    if (!element) return
    const graph = attachEqualizer(element)
    eqRef.current = graph
    if (graph) {
      graph.resume()
      graph.apply({ enabled: prefs.eqEnabled, bass: prefs.bass, mid: prefs.mid, treble: prefs.treble })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  useEffect(() => {
    if (eqRef.current) {
      eqRef.current.apply({ enabled: prefs.eqEnabled, bass: prefs.bass, mid: prefs.mid, treble: prefs.treble })
    }
  }, [prefs.eqEnabled, prefs.bass, prefs.mid, prefs.treble])

  const shown = files.filter((file) => file.kind === sub)

  return (
    <div className="tube-block">
      <div className="section-head">
        <h2>On this phone</h2>
        <span className="tiny mute">{files.length ? `${files.length} file${files.length === 1 ? '' : 's'}` : ''}</span>
      </div>

      <div className="tube-subtabs" role="tablist" aria-label="Local media type">
        {['audio', 'video'].map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={sub === value}
            className={`tube-subtab ${sub === value ? 'is-active' : ''}`}
            onClick={() => setSub(value)}
          >
            {value === 'audio' ? 'Audio' : 'Video'}
          </button>
        ))}
      </div>

      <input ref={inputRef} type="file" accept={accept} multiple hidden onChange={addFiles} />
      <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => inputRef.current?.click()}>
        <IconDownload size={15} /> Choose {sub} files
      </button>
      <p className="tiny mute" style={{ marginTop: 8 }}>
        Files are read from this device and never uploaded. They stay available until this page is closed.
      </p>

      {error && <p className="tiny" style={{ color: 'var(--red)', marginTop: 8 }}>{error}</p>}

      {!supportsEqualizer() && (
        <p className="tiny mute" style={{ marginTop: 8 }}>
          This browser has no Web Audio support, so the equalizer is unavailable here.
        </p>
      )}

      {shown.length === 0 ? (
        <div style={{ marginTop: 14 }}>
          <EmptyState icon={sub === 'audio' ? <IconMusic size={22} /> : <IconVideo size={22} />} title={`No ${sub} files yet`}>
            Pick files from this device to play them here.
          </EmptyState>
        </div>
      ) : (
        <div className="list" style={{ marginTop: 12 }}>
          {shown.map((file) => (
            <button
              key={file.id}
              type="button"
              className={`tube-media-row ${current?.id === file.id ? 'is-active' : ''}`}
              onClick={() => setCurrent(file)}
            >
              <span className="dl-icon" aria-hidden="true">
                {file.kind === 'audio' ? <IconMusic size={16} /> : <IconVideo size={16} />}
              </span>
              <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
                <span className="track-row-title truncate" style={{ display: 'block' }}>
                  {file.name}
                </span>
                <span className="track-row-sub">{formatBytes(file.size)}</span>
              </span>
              <IconPlay size={16} />
            </button>
          ))}
        </div>
      )}

      {current && current.kind === 'audio' && (
        <div className="tube-now">
          <div className="row" style={{ alignItems: 'center', gap: 8 }}>
            <strong className="truncate" style={{ fontSize: 13 }}>
              {current.name}
            </strong>
          </div>
          <audio
            ref={audioRef}
            src={current.url}
            controls
            autoPlay
            style={{ width: '100%', marginTop: 8 }}
            onError={() => setError('This browser cannot play that file.')}
          />
        </div>
      )}

      {current && current.kind === 'video' && (
        <div className="tube-now">
          <video
            ref={videoRef}
            src={current.url}
            controls
            autoPlay
            playsInline
            style={{ width: '100%', borderRadius: 12, marginTop: 8 }}
            onError={() => setError('This browser cannot play that file.')}
          />
          <strong className="truncate" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
            {current.name}
          </strong>
        </div>
      )}
    </div>
  )
}

function SettingsPanel({ prefs }) {
  const applyPreset = (preset) => {
    writeTubePrefs({ eqPreset: preset.id, bass: preset.bass, mid: preset.mid, treble: preset.treble, eqEnabled: true })
  }

  return (
    <>
      <section className="tube-block">
        <div className="section-head">
          <h2>Playback</h2>
        </div>
        <div className="card" style={{ padding: '4px 12px' }}>
          <Toggle
            label="Autoplay next"
            hint="Continue with the next result when a track finishes."
            checked={prefs.autoplayNext}
            onChange={(value) => writeTubePrefs({ autoplayNext: value })}
          />
          <Toggle
            label="Remember position"
            hint="Resume long videos where you stopped."
            checked={prefs.rememberPosition}
            onChange={(value) => writeTubePrefs({ rememberPosition: value })}
          />
        </div>
      </section>

      <section className="tube-block">
        <div className="section-head">
          <h2>Equalizer</h2>
          <span className="tiny mute">{prefs.eqEnabled ? 'On' : 'Off'}</span>
        </div>
        <div className="card" style={{ padding: '12px 14px' }}>
          <Toggle
            label="Enable equalizer"
            hint="Applies to local files and provider preview clips."
            checked={prefs.eqEnabled}
            onChange={(value) => writeTubePrefs({ eqEnabled: value })}
          />
          <div className="tube-chips" style={{ marginTop: 10 }}>
            {EQ_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`chip ${prefs.eqPreset === preset.id && prefs.eqEnabled ? 'is-on' : ''}`}
                onClick={() => applyPreset(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {[
            ['Bass', 'bass'],
            ['Mid', 'mid'],
            ['Treble', 'treble'],
          ].map(([label, key]) => (
            <label key={key} className="tube-band">
              <span>{label}</span>
              <input
                type="range"
                min="-12"
                max="12"
                step="1"
                value={prefs[key]}
                onChange={(event) =>
                  writeTubePrefs({ [key]: Number(event.target.value), eqPreset: 'custom', eqEnabled: true })
                }
                aria-label={`${label} gain`}
              />
              <b>{prefs[key] > 0 ? `+${prefs[key]}` : prefs[key]}</b>
            </label>
          ))}

          <p className="tiny mute" style={{ marginTop: 10 }}>
            YouTube playback happens inside YouTube&rsquo;s own player, so these bands cannot process it.
          </p>
        </div>
      </section>

      <section className="tube-block">
        <div className="section-head">
          <h2>About</h2>
        </div>
        <div className="card card-pad">
          <p className="tiny muted">
            Jimmy Tube is part of JIMMY STATE. Search runs on the YouTube Data API, playback uses the official embedded
            player, and downloaded files come from providers that publish them.
          </p>
        </div>
      </section>
    </>
  )
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <div className="tube-toggle">
      <div className="grow">
        <span className="tube-toggle-label">{label}</span>
        {hint && <span className="tiny mute" style={{ display: 'block' }}>{hint}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`tube-switch ${checked ? 'is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  )
}

function FormatSheet({ item, downloads, onClose }) {
  const video = item.video || item
  const hasFile = Boolean(video?.previewUrl)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="tube-sheet-overlay" role="dialog" aria-modal="true" aria-label="Choose a format" onClick={onClose}>
      <div className="tube-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="row" style={{ alignItems: 'center' }}>
          <strong className="grow truncate">{video?.title || 'Download'}</strong>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>
        <p className="tiny mute" style={{ marginTop: 2 }}>
          {video?.artist || video?.channel || ''}
        </p>

        <button
          type="button"
          className="tube-format"
          disabled={!hasFile || done}
          onClick={() => {
            downloads.start(video, { kind: 'video' })
            setDone(true)
          }}
        >
          <span className="dl-icon" aria-hidden="true"><IconVideo size={16} /></span>
          <span className="grow" style={{ textAlign: 'left' }}>
            <b>MP4 · video</b>
            <span className="tiny mute" style={{ display: 'block' }}>
              {hasFile ? 'Provider-published file, downloads now' : 'No downloadable file for this item'}
            </span>
          </span>
          {done ? <IconCheck size={16} /> : <IconDownload size={16} />}
        </button>

        <div className="tube-format is-disabled" aria-disabled="true">
          <span className="dl-icon" aria-hidden="true"><IconMusic size={16} /></span>
          <span className="grow" style={{ textAlign: 'left' }}>
            <b>MP3 · audio</b>
            <span className="tiny mute" style={{ display: 'block' }}>
              Providers publish no standalone audio file for this item, so there is nothing to convert.
            </span>
          </span>
        </div>

        <Link to="/downloads" className="btn btn-sm btn-ghost" style={{ marginTop: 12 }} onClick={onClose}>
          Open download manager
        </Link>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ hooks */

function useCharts() {
  const [chartsFeed, setChartsFeed] = useState([])
  const [chartsError, setChartsError] = useState(null)

  const reloadCharts = useCallback(async () => {
    try {
      const data = await api.charts(20)
      setChartsFeed(data.items || [])
      setChartsError(null)
    } catch (err) {
      setChartsError(err.message)
    }
  }, [])

  useEffect(() => {
    reloadCharts()
  }, [reloadCharts])

  return { chartsFeed, chartsError, reloadCharts }
}

function useTubePrefs() {
  const [prefs, setPrefs] = useState(() => readTubePrefs())

  useEffect(() => {
    const on = (event) => setPrefs(event.detail)
    window.addEventListener('jimmy-state:tube-prefs', on)
    return () => window.removeEventListener('jimmy-state:tube-prefs', on)
  }, [])

  return prefs
}
