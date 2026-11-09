import { api } from './api.js'

/**
 * Maps a catalogue track to the official YouTube upload, so a song plays for its whole
 * length instead of the 30-second licensed clip.
 *
 * Resolution costs one YouTube search (100 quota units), so results are cached per device
 * for 30 days: a track resolves once, and every later play is free and instant.
 */
const PREFIX = 'jimmy-state:full:'
const TTL = 30 * 24 * 60 * 60 * 1000

const inflight = new Map()

const keyFor = (track) => `${PREFIX}${String(track?.key || `${track?.artist || ''}|${track?.title || ''}`).toLowerCase()}`

export function cachedFullTrack(track) {
  try {
    const raw = localStorage.getItem(keyFor(track))
    if (!raw) return null
    const entry = JSON.parse(raw)
    if (!entry?.videoId || Date.now() - (entry.at || 0) > TTL) return null
    return entry.videoId
  } catch {
    return null
  }
}

function remember(track, videoId) {
  try {
    localStorage.setItem(keyFor(track), JSON.stringify({ videoId, at: Date.now() }))
  } catch {
    /* private windows: resolution just costs a call next time */
  }
}

/**
 * Returns a YouTube id, or null when nothing usable was found. Never throws — playback
 * has to keep working when the search fails.
 */
export async function resolveFullTrack(track) {
  if (!track) return null
  if (track.videoId) return track.videoId

  const cached = cachedFullTrack(track)
  if (cached) return cached

  const query = `${track.artist || ''} ${track.title || ''}`.trim()
  if (!query) return null
  if (inflight.has(query)) return inflight.get(query)

  const job = (async () => {
    try {
      const found = await api.resolveYoutube(query)
      if (found?.videoId) {
        remember(track, found.videoId)
        return found.videoId
      }
      return null
    } catch {
      return null
    } finally {
      inflight.delete(query)
    }
  })()

  inflight.set(query, job)
  return job
}
