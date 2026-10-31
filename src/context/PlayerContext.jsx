import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { normalizeTrack } from '../lib/track.js'
import { useToast } from './LibraryContext.jsx'

/**
 * Preview player.
 *
 * Every playable item in JIMMY STATE is a provider-published preview clip (Apple's
 * 30-second previews). There is no stream ripping here, so the UI labels it as a
 * preview everywhere it appears.
 */
const PlayerContext = createContext(null)

export function PlayerProvider({ children }) {
  const audioRef = useRef(null)
  const [current, setCurrent] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState(null)
  const { toast } = useToast()

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
    const onEnd = () => {
      setPlaying(false)
      setProgress(0)
    }
    const onError = () => {
      setPlaying(false)
      setError('Preview could not be played. The provider may have withdrawn this clip.')
    }
    const onPlay = () => {
      setPlaying(true)
      setError(null)
    }
    const onPause = () => setPlaying(false)

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onTime)
    audio.addEventListener('ended', onEnd)
    audio.addEventListener('error', onError)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    return () => {
      audio.pause()
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onTime)
      audio.removeEventListener('ended', onEnd)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      // '' resolves to the page URL and fires a bogus media error; drop the attribute.
      audio.removeAttribute('src')
      audio.load()
    }
  }, [])

  const play = useCallback(
    async (track) => {
      const audio = audioRef.current
      if (!audio) return
      const t = normalizeTrack(track)
      if (!t?.previewUrl) {
        toast('No preview available', {
          title: t?.title,
          message: 'The catalogue did not publish a preview clip for this track. Open it on the store instead.',
          type: 'err',
        })
        return
      }
      if (current?.key === t.key) {
        if (audio.paused) {
          // A finished clip stays at its end; play() would refuse to restart it.
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
      audio.pause()
      // Mixed content would be blocked outright on the https deployment.
      audio.src = String(t.previewUrl).replace(/^http:\/\//i, 'https://')
      audio.currentTime = 0
      audio.load()
      setCurrent(t)
      setProgress(0)
      setDuration(0)
      setError(null)
      try {
        await audio.play()
      } catch (err) {
        setError(err?.message || 'Playback was blocked. Tap play again.')
      }
    },
    [current, toast],
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

  const seek = useCallback((ratio) => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(audio.duration) || !audio.duration) return
    audio.currentTime = Math.max(0, Math.min(audio.duration, ratio * audio.duration))
  }, [])

  const close = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    setCurrent(null)
    setPlaying(false)
    setProgress(0)
    setError(null)
  }, [])

  const value = { current, playing, progress, duration, error, play, toggle, seek, close, isPlaying: (key) => current?.key === key && playing }
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider')
  return ctx
}
