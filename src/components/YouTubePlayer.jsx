import { useEffect, useRef, useState } from 'react'
import { getPosition, savePosition } from '../lib/positions.js'

/**
 * Official YouTube IFrame Player API — full-length playback.
 *
 * Notes for long content (mixes, live sets):
 *  - one player instance per id; the iframe is never re-created on re-render, so a
 *    two-hour mix is not restarted by an unrelated state change
 *  - the position is resumed from the local database, and saved while playing
 *  - `playsinline` keeps iOS from forcing fullscreen, `fs` keeps the native fullscreen
 *    control, and `origin`/`enablejsapi` are required for the API to drive it
 *  - if the API script cannot load, a plain embed keeps playback working
 */
let apiPromise = null

function loadApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise

  apiPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('yt-iframe-api')
    const done = () => (window.YT?.Player ? resolve(window.YT) : reject(new Error('player unavailable')))
    window.onYouTubeIframeAPIReady = done

    if (!existing) {
      const tag = document.createElement('script')
      tag.id = 'yt-iframe-api'
      tag.src = 'https://www.youtube.com/iframe_api'
      tag.async = true
      tag.onerror = () => reject(new Error('YouTube player script failed to load'))
      document.head.appendChild(tag)
    }
    setTimeout(() => {
      if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('YouTube player timed out'))
    }, 8000)
  })
  return apiPromise
}

export function parseVideoId(input) {
  const raw = String(input || '').trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw
  return (
    raw.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/)?.[1] || ''
  )
}

export default function YouTubePlayer({ videoId, onPlaying, onEnded, startAt = 0 }) {
  const hostRef = useRef(null)
  const playerRef = useRef(null)
  const pollRef = useRef(null)
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    let destroyed = false
    setFallback(false)
    if (!videoId) return undefined

    loadApi()
      .then(async (YT) => {
        if (destroyed || !hostRef.current) return
        const resumeAt = startAt || (await getPosition(videoId))
        if (destroyed) return

        playerRef.current = new YT.Player(hostRef.current, {
          videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            fs: 1,
            enablejsapi: 1,
            origin: window.location.origin,
            start: resumeAt > 5 ? Math.floor(resumeAt) : 0,
          },
          events: {
            onReady: (event) => {
              if (resumeAt > 5) event.target.seekTo(resumeAt, true)
            },
            onStateChange: (event) => {
              if (event.data === 1) {
                onPlaying?.()
                clearInterval(pollRef.current)
                pollRef.current = setInterval(() => {
                  try {
                    const t = playerRef.current?.getCurrentTime?.()
                    if (Number.isFinite(t) && t > 0) savePosition(videoId, t)
                  } catch {
                    /* player went away */
                  }
                }, 5000)
              }
              if (event.data === 0) {
                clearInterval(pollRef.current)
                savePosition(videoId, 0, { force: true })
                onEnded?.()
              }
              if (event.data === 2 || event.data === 5) clearInterval(pollRef.current)
            },
          },
        })
      })
      .catch(() => {
        if (!destroyed) setFallback(true)
      })

    return () => {
      destroyed = true
      clearInterval(pollRef.current)
      try {
        const t = playerRef.current?.getCurrentTime?.()
        if (Number.isFinite(t) && t > 0) savePosition(videoId, t, { force: true })
      } catch {
        /* ignore */
      }
      try {
        playerRef.current?.destroy?.()
      } catch {
        /* ignore */
      }
      playerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  return (
    <div className="player-frame">
      <div ref={hostRef} style={fallback ? { display: 'none' } : { width: '100%', height: '100%' }} />
      {fallback && (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&start=${Math.max(
            0,
            Math.floor(startAt || 0),
          )}`}
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
    </div>
  )
}
