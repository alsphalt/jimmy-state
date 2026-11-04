import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { readLink } from '../lib/links.js'
import VideoCard from '../components/VideoCard.jsx'
import { TrackRow } from '../components/TrackBits.jsx'
import { Artwork, EmptyState, ErrorBlock, Loading } from '../components/ui.jsx'
import {
  IconCamera,
  IconCheck,
  IconDownload,
  IconExternal,
  IconFolder,
  IconHome,
  IconMic,
  IconMusic,
  IconPause,
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
  { id: 'home', label: 'tube.home', Icon: IconHome },
  { id: 'music', label: 'tube.music', Icon: IconMusic },
  { id: 'videos', label: 'tube.videos', Icon: IconVideo },
  { id: 'local', label: 'tube.local', Icon: IconDownload },
  { id: 'settings', label: 'tube.settings', Icon: IconSettings },
]

const QUICK = ['Amapiano mix', 'Afrobeats 2026', 'Gospel worship', 'Hip hop classics', 'Live session', 'Long mix']

const VIDEO_EXT = /\.(mp4|m4v|webm|mov|mkv|avi|3gp)$/i
// Android reports no MIME type for plenty of media, so fall back to the extension.
const kindOf = (file) => {
  if (file.type) return file.type.startsWith('video/') ? 'video' : 'audio'
  return VIDEO_EXT.test(file.name) ? 'video' : 'audio'
}

export default function JimmyTube() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const tab = TABS.some((entry) => entry.id === params.get('tab')) ? params.get('tab') : 'home'
  const initialQ = params.get('q') || ''

  const { chartsFeed, chartsError, reloadCharts } = useCharts()
  const { searches, addSearch, clearSearches, watched, watchLater } = useLibrary()
  const downloads = useDownloads()
  const prefs = useTubePrefs()

  const [term, setTerm] = useState(initialQ)
  const [results, setResults] = useState({ loading: false, items: [], error: null, ran: false, mode: '', notice: '' })
  const [sheet, setSheet] = useState(null)
  const [notice, setNotice] = useState('')

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
    const link = readLink(q)
    if (link?.kind === 'youtube') {
      setNotice('')
      navigate(`/watch/${link.id}`)
      return
    }
    if (link?.kind === 'tiktok') {
      setNotice('')
      navigate(`/tools/tiktok?url=${encodeURIComponent(link.url)}`)
      return
    }
    if (link?.kind === 'invalid') {
      setNotice(link.note)
      return
    }
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
                <span className="eyebrow">{t('tube.recent')}</span>
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
          {notice ? (
            <p className="tiny" style={{ color: 'var(--red)', marginBottom: 8 }}>
              {notice}
            </p>
          ) : null}
          {results.notice && <p className="tiny mute" style={{ marginBottom: 8 }}>{results.notice}</p>}
          {results.mode === 'videos' ? (
            <div className="video-grid">
              {results.items.map((v) => (
                <VideoCard key={v.videoId} video={v} onDownload={setSheet} />
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
              <h2>{t('tube.suggestedMusic')}</h2>
              <Link to="/tools/tube?tab=music" className="tiny mute">
                More
              </Link>
            </div>
            {chartsError && <ErrorBlock error={chartsError} onRetry={reloadCharts} />}
            {!chartsFeed.length && !chartsError && <Loading rows={2} label="Loading charts…" />}
            {chartsFeed.length > 0 && (
              <div className="rail">
                {chartsFeed.slice(0, 12).map((item) => (
                  <Link key={item.key} to={`/song/${encodeURIComponent(item.key)}`} state={{ track: item }} className="rail-card">
                    <Artwork src={item.artwork} alt={item.title} style={{ borderRadius: 14 }} />
                    <span className="rail-title clamp-2">{item.title}</span>
                    <span className="rail-sub truncate">{item.artist}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="tube-block">
            <div className="section-head">
              <h2>{t('tube.suggestedVideos')}</h2>
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
            <h2>{t('home.topSongs')}</h2>
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
            <h2>{t('tube.musicVideos')}</h2>
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
  const { t } = useTranslation()
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
          <span>{t(label)}</span>
        </button>
      ))}
    </nav>
  )
}

function FootNote() {
  const { t } = useTranslation()
  return (
    <p className="tiny mute" style={{ marginTop: 22, textAlign: 'center' }}>
      {t('tube.footnote')}
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
  const { t } = useTranslation()
  const [sub, setSub] = useState('audio')
  const [files, setFiles] = useState([])
  const [current, setCurrent] = useState(null)
  const [playingId, setPlayingId] = useState('')
  const [error, setError] = useState(null)
  const [eqHint, setEqHint] = useState('')
  const [capture, setCapture] = useState(null)
  const [recording, setRecording] = useState(false)
  const audioRef = useRef(null)
  const videoRef = useRef(null)
  const inputRef = useRef(null)
  const eqRef = useRef(null)
  const urlsRef = useRef([])
  const previewRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const discardRef = useRef(false)

  const accept = sub === 'audio' ? 'audio/*' : 'video/*'

  const addBlob = (file, kind, options = {}) => {
    const url = URL.createObjectURL(file)
    urlsRef.current.push(url)
    const entry = {
      id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      size: file.size,
      kind,
      url,
      blob: file,
    }
    setFiles((prev) => [entry, ...prev])
    if (options.play) play(entry)
    else setSub(kind)
    return entry
  }

  const addFiles = (event) => {
    const picked = Array.from(event.target.files || [])
    event.target.value = ''
    if (!picked.length) return
    setError(null)
    const next = picked.map((file) => {
      const url = URL.createObjectURL(file)
      urlsRef.current.push(url)
      return { id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`, name: file.name, size: file.size, kind: kindOf(file), url, blob: file }
    })
    setFiles((prev) => [...next, ...prev])
    play(next[0], next)
  }

  /**
   * Starts a file from inside the click that asked for it.
   *
   * Setting src and calling play() synchronously matters: a suspended AudioContext
   * (Chrome, iOS) only resumes during a gesture, and a media element routed through a
   * suspended context plays silently. The equalizer is therefore attached here — never in
   * an effect — and only when it is switched on, so ordinary playback never depends on it.
   */
  const play = (file, list = files) => {
    if (!file) return
    const element = file.kind === 'video' ? videoRef.current : audioRef.current
    if (!element) return
    setError(null)
    setEqHint('')
    setCurrent(file)
    setSub(file.kind)
    void list
    const other = file.kind === 'video' ? audioRef.current : videoRef.current
    if (other && !other.paused) other.pause()
    if (element.getAttribute('src') !== file.url) element.src = file.url

    if (file.kind === 'audio' && prefs.eqEnabled) {
      const graph = attachEqualizer(element)
      if (graph) {
        eqRef.current = graph
        graph.apply({ bass: prefs.eqBass, mid: prefs.eqMid, treble: prefs.eqTreble })
      } else {
        setEqHint('Equalizer unavailable in this browser — playing dry.')
      }
    }
    element.play().catch(() => setEqHint('Tap play again to start audio.'))
  }

  const toggle = (file) => {
    const element = file.kind === 'video' ? videoRef.current : audioRef.current
    if (current?.id === file.id && element && !element.paused) {
      element.pause()
      setPlayingId('')
      return
    }
    play(file)
  }

  // Equalizer changes apply live to whatever local file is playing.
  useEffect(() => {
    if (!eqRef.current) return
    eqRef.current.apply({ bass: prefs.eqBass, mid: prefs.eqMid, treble: prefs.eqTreble })
  }, [prefs.eqBass, prefs.eqMid, prefs.eqTreble, prefs.eqEnabled])

  useEffect(() => () => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    recorderRef.current = null
  }, [])

  const getStream = async (mode) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not expose the camera or microphone.')
      return null
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        mode === 'audio' ? { audio: true } : { video: { facingMode: 'environment' }, audio: true },
      )
      setError(null)
      return stream
    } catch (err) {
      const name = err?.name || ''
      setError(
        name === 'NotAllowedError'
          ? 'Permission refused. Allow camera or microphone access in the browser, then try again.'
          : name === 'NotFoundError'
            ? 'No camera or microphone was found on this device.'
            : `Could not start capture (${name || 'unknown error'}).`,
      )
      return null
    }
  }

  const beginRecording = (stream) => {
    const wantsVideo = stream.getVideoTracks().length > 0
    const preferred = wantsVideo ? ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    const mimeType = preferred.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || ''
    let recorder
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    } catch {
      setError('This browser cannot record media.')
      return
    }
    chunksRef.current = []
    discardRef.current = false
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      setRecording(false)
      if (discardRef.current) {
        chunksRef.current = []
        return
      }
      const type = recorder.mimeType || (wantsVideo ? 'video/webm' : 'audio/webm')
      const blob = new Blob(chunksRef.current, { type })
      chunksRef.current = []
      if (!blob.size) return
      const ext = type.includes('mp4') ? 'mp4' : 'webm'
      addBlob(new File([blob], `${wantsVideo ? 'camera' : 'recording'}-${Date.now()}.${ext}`, { type }), wantsVideo ? 'video' : 'audio')
    }
    recorderRef.current = recorder
    recorder.start()
    setRecording(true)
  }

  const openCamera = async () => {
    const stream = await getStream('video')
    if (!stream) return
    setCapture({ mode: 'video', stream })
  }

  const startVoice = async () => {
    const stream = await getStream('audio')
    if (!stream) return
    setCapture({ mode: 'audio', stream })
    beginRecording(stream)
  }

  // The preview element only exists after capture starts.
  useEffect(() => {
    const element = previewRef.current
    if (!element || !capture?.stream) return
    element.srcObject = capture.stream
    element.play?.().catch(() => {})
  }, [capture])

  const closeCapture = (discard = false) => {
    const stream = capture?.stream
    const recorder = recorderRef.current
    if (recorder && recorder.state === 'recording') {
      discardRef.current = discard
      recorder.stop()
    }
    stream?.getTracks().forEach((track) => track.stop())
    recorderRef.current = null
    setCapture(null)
    setRecording(false)
  }

  /** Lists a folder in one go, so nothing has to be picked file by file. */
  const scanFolder = async () => {
    if (!window.showDirectoryPicker) {
      setError('This browser cannot list a folder. Use “Choose files” instead — folder scanning needs Chrome or Edge on a desktop.')
      return
    }
    try {
      const dir = await window.showDirectoryPicker({ mode: 'read' })
      const found = []
      const walk = async (handle, depth) => {
        if (depth > 3 || found.length >= 300) return
        for await (const entry of handle.values()) {
          if (found.length >= 300) break
          if (entry.kind === 'directory') {
            await walk(entry, depth + 1)
            continue
          }
          const kind = /\.(mp4|mkv|mov|webm|m4v|avi)$/i.test(entry.name) ? 'video' : /\.(mp3|m4a|wav|ogg|flac|aac|opus)$/i.test(entry.name) ? 'audio' : null
          if (!kind) continue
          const file = await entry.getFile()
          found.push({ file, kind })
        }
      }
      await walk(dir, 0)
      if (!found.length) {
        setError('No audio or video files in that folder.')
        return
      }
      const next = found.map(({ file, kind }) => {
        const url = URL.createObjectURL(file)
        urlsRef.current.push(url)
        return { id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`, name: file.name, size: file.size, kind, url, blob: file }
      })
      setFiles((prev) => [...next, ...prev])
      setSub(next[0].kind)
      setError(null)
    } catch (err) {
      if (err?.name !== 'AbortError') setError('Could not read that folder.')
    }
  }

  const shareFile = async (file) => {
    if (!file.blob) {
      setError('Only files picked or recorded here can be shared.')
      return
    }
    const payload = file.blob instanceof File ? file.blob : new File([file.blob], file.name, { type: file.blob.type })
    try {
      if (navigator.canShare?.({ files: [payload] })) {
        await navigator.share({ files: [payload], title: file.name })
      } else if (navigator.share) {
        await navigator.share({ title: file.name, text: file.name })
      } else {
        setError('Sharing is not available in this browser.')
      }
    } catch (err) {
      if (err?.name !== 'AbortError') setError('Sharing was cancelled or blocked.')
    }
  }

  const shown = files.filter((file) => file.kind === sub)
  const hasFiles = files.length > 0

  return (
    <div className="tube-block">
      <div className="section-head">
        <h2>{t('tube.onThisPhone')}</h2>
        <span className="tiny mute">{files.length ? formatBytes(files.reduce((sum, file) => sum + (file.size || 0), 0)) : ''}</span>
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

      <div className="tube-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => inputRef.current?.click()}>
          <IconDownload size={15} /> Choose {sub} files
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={scanFolder}>
          <IconFolder size={15} /> Scan folder
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={openCamera} disabled={recording}>
          <IconCamera size={15} /> Camera
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={startVoice} disabled={recording}>
          <IconMic size={15} /> Record voice
        </button>
      </div>

      <p className="tiny mute" style={{ marginTop: 8 }}>
        The browser asks for camera and microphone access the first time and remembers it. Nothing is uploaded — recordings stay in this tab.
      </p>
      <p className="tiny mute" style={{ marginTop: 4 }}>
        A browser cannot list your whole phone library by itself. “Scan folder” reads a folder you choose in one pass; “Choose files” picks individual ones.
      </p>

      {capture ? (
        <div className="tube-capture">
          {capture.mode === 'video' ? (
            <video ref={previewRef} className="tube-capture-preview" autoPlay muted playsInline />
          ) : (
            <p className="small" style={{ margin: 0 }}>
              <IconMic size={16} /> {recording ? 'Recording…' : 'Microphone ready'}
            </p>
          )}
          <div className="row gap-8" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            {capture.mode === 'video' && !recording ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => beginRecording(capture.stream)}>
                <IconPlay size={15} /> Start recording
              </button>
            ) : null}
            {recording ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => closeCapture(false)}>
                <IconPause size={15} /> Stop &amp; save
              </button>
            ) : null}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => closeCapture(true)}>
              <IconX size={15} /> {recording ? 'Cancel' : 'Close'}
            </button>
          </div>
        </div>
      ) : null}

      {error && <p className="tiny" style={{ color: 'var(--red)', marginTop: 8 }}>{error}</p>}
      {eqHint && <p className="tiny mute" style={{ marginTop: 8 }}>{eqHint}</p>}

      {!supportsEqualizer() && (
        <p className="tiny mute" style={{ marginTop: 8 }}>
          {t('tube.noWebAudio')}
        </p>
      )}

      {shown.length === 0 ? (
        <div style={{ marginTop: 14 }}>
          <EmptyState icon={sub === 'audio' ? <IconMusic size={22} /> : <IconVideo size={22} />} title={t('tube.noFilesTitle', { kind: sub })}>
            {t('tube.noFilesBody')}
          </EmptyState>
        </div>
      ) : (
        <div className="list" style={{ marginTop: 12 }}>
          {shown.map((file) => {
            const active = current?.id === file.id
            const isPlaying = active && playingId === file.id
            return (
              <div key={file.id} className={`tube-media-row ${active ? 'is-active' : ''}`}>
                <button
                  type="button"
                  className="tube-row-main"
                  onClick={() => toggle(file)}
                  aria-label={isPlaying ? `Pause ${file.name}` : `Play ${file.name}`}
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
                  {isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
                </button>
                <button type="button" className="icon-btn" onClick={() => shareFile(file)} aria-label={`Share ${file.name}`}>
                  <IconExternal size={16} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* One persistent element per kind: swapping src on a live element keeps the
          gesture-based play() working and stops the equalizer graph being rebuilt. */}
      <audio
        ref={audioRef}
        controls
        hidden={!hasFiles || current?.kind !== 'audio'}
        style={{ width: '100%', marginTop: 12 }}
        onPlay={() => setPlayingId(current?.id || '')}
        onPause={() => setPlayingId('')}
      />
      <video
        ref={videoRef}
        controls
        playsInline
        hidden={!hasFiles || current?.kind !== 'video'}
        style={{ width: '100%', marginTop: 12, borderRadius: 14 }}
        onPlay={() => setPlayingId(current?.id || '')}
        onPause={() => setPlayingId('')}
      />
    </div>
  )
}


function SettingsPanel({ prefs }) {
  const { t } = useTranslation()
  const applyPreset = (preset) => {
    writeTubePrefs({ eqPreset: preset.id, bass: preset.bass, mid: preset.mid, treble: preset.treble, eqEnabled: true })
  }

  return (
    <>
      <section className="tube-block">
        <div className="section-head">
          <h2>{t('tube.playback')}</h2>
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
          <h2>{t('tube.equalizer')}</h2>
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
          <h2>{t('settings.about')}</h2>
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
