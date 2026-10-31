import { useEffect, useRef, useState } from 'react'

/**
 * Official YouTube IFrame Player API.
 * If the API script cannot load (blocked network, strict privacy extension), we fall
 * back to the plain embed URL so playback still works.
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

export default function YouTubePlayer({ videoId, onPlaying, onEnded }) {
  const hostRef = useRef(null)
  const playerRef = useRef(null)
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    let destroyed = false
    setFallback(false)
    if (!videoId) return undefined

    loadApi()
      .then((YT) => {
        if (destroyed || !hostRef.current) return
        playerRef.current = new YT.Player(hostRef.current, {
          videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            origin: window.location.origin,
          },
          events: {
            onStateChange: (event) => {
              if (event.data === 1) onPlaying?.()
              if (event.data === 0) onEnded?.()
            },
          },
        })
      })
      .catch(() => {
        if (!destroyed) setFallback(true)
      })

    return () => {
      destroyed = true
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
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
    </div>
  )
}
