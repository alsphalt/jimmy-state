import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { normalizeTrack, trackKey } from '../lib/track.js'
import { useLibrary, useToast } from './LibraryContext.jsx'

/**
 * Preview player — one audio element for the whole app, plus a queue.
 *
 * Every playable item in JIMMY STATE is a provider-published preview clip (Apple's
 * 30-second previews). There is no stream ripping here, so the UI labels it as a
 * preview everywhere it appears.
 *
 * The queue lives in a provider above the routes, which is what keeps playback and the
 * order of what comes next intact while the user moves between pages, artists and tabs.
 * The audio element's `ended` handler is registered once, so it reads the live queue
 * through refs rather than through the closure it was created in.
 */

const PlayerContext = createContext(null)

const REPEAT = ['off', 'all', 'one']

export function PlayerProvider({ children }) {
  const audioRef = useRef(null)
  const [current, setCurrent] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [clipLoaded, setClipLoaded] = useState(false)
  const [error, setError] = useState(null)

  const [queue, setQueue] = useState([])
  const [index, setIndex] = useState(-1)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState('off')

  const queueRef = useRef([])
  const indexRef = useRef(-1)
  const shuffleRef = useRef(false)
  const repeatRef = useRef('off')
  const loadRef = useRef(null)

  const { toast } = useToast()
  const { recordPlay } = useLibrary()

  const setQueueState = useCallback((next, startIndex) => {
    queueRef.current = next
    indexRef.current = startIndex
    setQueue(next)
    setIndex(startIndex)
  }, [])

  /** Loads one queue entry into the element and starts it. */
  const load = useCallback(
    async (position) => {
      const audio = audioRef.current
      const entry = queueRef.current[position]
      if (!audio || !entry) return
      indexRef.current = position
      setIndex(position)
      audio.pause()
      // Mixed content would be blocked outright on the https deployment.
      audio.src = String(entry.previewUrl).replace(/^http:\/\//i, 'https://')
      audio.currentTime = 0
      audio.load()
      setCurrent(entry)
      // Real, device-local play history: the feed and Recently Played read this.
      recordPlay?.(entry)
      setProgress(0)
      // Zero until the element reports the clip's own length. Pre-filling with the
      // catalogue length is what made a 30-second preview look like a 3:24 track that
      // stopped early.
      setDuration(0)
      setError(null)
      setClipLoaded(false)
      try {
        await audio.play()
      } catch (err) {
        setError(err?.message || 'Playback was blocked. Tap play again.')
        // A blocked autoplay is not a broken clip: leave the track loaded and paused.
        setPlaying(false)
      }
    },
    [recordPlay],
  )
  loadRef.current = load

  useEffect(() => {
    const audio = new Audio()
    // 'metadata' fetches the clip header up front, so duration and the first frame are
    // ready when play() is called. No crossOrigin: the samples are never read by script,
    // and requesting CORS would fail on any host that omits the header.
    audio.preload = 'metadata'
    audioRef.current = audio

    const onTime = () => {
      setProgress(audio.currentTime || 0)
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration)
    }
    const onMeta = () => {
      onTime()
      setClipLoaded(true)
    }
    const finish = () => {
      if (repeatRef.current === 'one') {
        audio.currentTime = 0
        audio.play().catch(() => setPlaying(false))
        return
      }
      const list = queueRef.current
      const at = indexRef.current
      if (!list.length) {
        setPlaying(false)
        return
      }
      if (shuffleRef.current && list.length > 1) {
        let pick = at
        while (pick === at) pick = Math.floor(Math.random() * list.length)
        loadRef.current?.(pick)
        return
      }
      if (at + 1 < list.length) {
        loadRef.current?.(at + 1)
        return
      }
      if (repeatRef.current === 'all') {
        loadRef.current?.(0)
        return
      }
      setPlaying(false)
      setProgress(0)
    }
    const onError = () => {
      // The element's src can be '' during teardown; that is not a provider failure.
      if (!audio.getAttribute('src')) return
      setPlaying(false)
      setError('This clip could not be played. The provider may have withdrawn it.')
    }
    const onPlay = () => {
      setPlaying(true)
      setError(null)
    }
    const onPause = () => setPlaying(false)

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('ended', finish)
    audio.addEventListener('error', onError)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    return () => {
      audio.pause()
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('durationchange', onMeta)
      audio.removeEventListener('ended', finish)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      // '' resolves to the page URL and fires a bogus media error; drop the attribute.
      audio.removeAttribute('src')
      audio.load()
    }
  }, [])

  const playable = (track) => Boolean(track?.previewUrl)

  /** Play a whole list, starting at one entry — the artist page, playlists, charts. */
  const playQueue = useCallback(
    async (tracks, startIndex = 0) => {
      const list = (Array.isArray(tracks) ? tracks : []).map(normalizeTrack).filter(playable)
      if (!list.length) {
        toast('Nothing to play', { message: 'None of these tracks has a published preview clip.', type: 'err' })
        return
      }
      const start = Math.max(0, Math.min(Number(startIndex) || 0, list.length - 1))
      setQueueState(list, start)
      await load(start)
    },
    [load, setQueueState, toast],
  )

  /**
   * Play one track. If it is already in the queue the player jumps to it instead of
   * rebuilding the queue, so "next" keeps meaning what the user was listening to.
   */
  const play = useCallback(
    async (track) => {
      const audio = audioRef.current
      if (!audio) return
      const t = normalizeTrack(track)
      if (!playable(t)) {
        toast('No preview available', {
          title: t?.title,
          message: 'The catalogue did not publish a preview clip for this track. Open it on the store instead.',
          type: 'err',
        })
        return
      }
      const key = trackKey(t)
      const at = queueRef.current.findIndex((entry) => entry.key === key)
      if (at !== -1) {
        if (indexRef.current === at) {
          if (audio.paused) {
            if (audio.ended || (audio.duration && audio.currentTime >= audio.duration - 0.15)) {
              audio.currentTime = 0
              setProgress(0)
            }
            try {
              await audio.play()
            } catch {
              setError('Playback was blocked by the browser. Tap play again.')
            }
          } else {
            audio.pause()
          }
          return
        }
        await load(at)
        return
      }
      setQueueState([t], 0)
      await load(0)
    },
    [load, setQueueState, toast],
  )

  const toggle = useCallback(async () => {
    const audio = audioRef.current
    if (!audio || !current) return
    if (audio.paused) {
      if (audio.ended || (audio.duration && audio.currentTime >= audio.duration - 0.15)) {
        audio.currentTime = 0
        setProgress(0)
      }
      try {
        await audio.play()
      } catch {
        setError('Playback was blocked by the browser. Tap play again.')
      }
    } else {
      audio.pause()
    }
  }, [current])

  const next = useCallback(() => {
    const list = queueRef.current
    if (!list.length) return
    if (shuffleRef.current && list.length > 1) {
      let pick = indexRef.current
      while (pick === indexRef.current) pick = Math.floor(Math.random() * list.length)
      load(pick)
      return
    }
    const at = indexRef.current
    if (at + 1 < list.length) load(at + 1)
    else if (repeatRef.current === 'all') load(0)
    else {
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.currentTime = 0
      }
      setProgress(0)
    }
  }, [load])

  const prev = useCallback(() => {
    const audio = audioRef.current
    const list = queueRef.current
    if (!list.length) return
    // Standard behaviour: restart the current track unless it has just started.
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      setProgress(0)
      return
    }
    const at = indexRef.current
    if (at > 0) load(at - 1)
    else if (repeatRef.current === 'all') load(list.length - 1)
    else if (audio) {
      audio.currentTime = 0
      setProgress(0)
    }
  }, [load])

  const seek = useCallback((ratio) => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(audio.duration) || !audio.duration) return
    audio.currentTime = Math.max(0, Math.min(audio.duration, Number(ratio) * audio.duration))
  }, [])

  const seekTo = useCallback((seconds) => {
    const audio = audioRef.current
    if (!audio) return
    const limit = Number.isFinite(audio.duration) && audio.duration ? audio.duration : Number(seconds)
    audio.currentTime = Math.max(0, Math.min(limit, Number(seconds) || 0))
    setProgress(audio.currentTime)
  }, [])

  // The ref is the source of truth for the audio handlers; state only drives the UI.
  // Updating it inside a functional setState would fire twice under StrictMode.
  const toggleShuffle = useCallback(() => {
    const value = !shuffleRef.current
    shuffleRef.current = value
    setShuffle(value)
  }, [])

  const cycleRepeat = useCallback(() => {
    const value = REPEAT[(REPEAT.indexOf(repeatRef.current) + 1) % REPEAT.length]
    repeatRef.current = value
    setRepeat(value)
  }, [])

  /** Put a track immediately after the one playing. */
  const playNext = useCallback((track) => {
    const t = normalizeTrack(track)
    if (!playable(t)) {
      toast('No preview to queue', { title: t?.title, type: 'err' })
      return
    }
    const list = [...queueRef.current]
    const existing = list.findIndex((entry) => entry.key === trackKey(t))
    if (existing !== -1) list.splice(existing, 1)
    const insertAt = Math.max(indexRef.current + 1, 0)
    list.splice(insertAt, 0, t)
    const keep = Math.min(indexRef.current < 0 ? 0 : indexRef.current, list.length - 1)
    setQueueState(list, keep)
    toast('Playing next', { title: t.title, type: 'info', ttl: 1800 })
  }, [setQueueState, toast])

  /** Append to the end of the queue. */
  const enqueue = useCallback((track) => {
    const t = normalizeTrack(track)
    if (!playable(t)) {
      toast('No preview to queue', { title: t?.title, type: 'err' })
      return
    }
    const list = [...queueRef.current]
    if (list.some((entry) => entry.key === trackKey(t))) {
      toast('Already in the queue', { title: t.title, type: 'info', ttl: 1800 })
      return
    }
    list.push(t)
    const keep = indexRef.current < 0 ? 0 : indexRef.current
    setQueueState(list, keep)
    toast('Added to the queue', { title: t.title, type: 'ok', ttl: 1800 })
  }, [setQueueState, toast])

  const close = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    queueRef.current = []
    indexRef.current = -1
    setQueue([])
    setIndex(-1)
    setCurrent(null)
    setPlaying(false)
    setProgress(0)
    setError(null)
  }, [])

  // What the element actually loaded vs what the catalogue says the song runs for.
  // A provider preview is ~30 s; the difference is what used to be hidden.
  const trackLength = Number(current?.durationMs || 0) / 1000
  const isPreview = Boolean(current?.previewUrl) && clipLoaded && duration > 0 && trackLength > duration + 5

  const value = {
    current,
    playing,
    progress,
    duration,
    trackLength,
    isPreview,
    clipLoaded,
    error,
    queue,
    index,
    shuffle,
    repeat,
    play,
    playQueue,
    toggle,
    seek,
    seekTo,
    next,
    prev,
    toggleShuffle,
    cycleRepeat,
    playNext,
    enqueue,
    close,
    isPlaying: (key) => current?.key === key && playing,
  }
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider')
  return ctx
}
