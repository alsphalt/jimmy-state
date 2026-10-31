import * as db from './db.js'

/**
 * Playback positions for long videos.
 *
 * A two-hour mix is unusable if every visit restarts it, so the last position is kept
 * per video id in the local database (meta store). Writes are throttled because the
 * IFrame API reports time continuously.
 */
const key = (id) => `pos:${id}`
let lastWrite = 0

export async function getPosition(videoId) {
  if (!videoId) return 0
  try {
    const row = await db.get('meta', key(videoId))
    const seconds = Number(row?.value?.seconds || 0)
    // Ignore the last few seconds, otherwise a finished video resumes at the end.
    return Number.isFinite(seconds) && seconds > 5 ? seconds : 0
  } catch {
    return 0
  }
}

export async function savePosition(videoId, seconds, { force = false } = {}) {
  if (!videoId || !Number.isFinite(seconds)) return
  const now = Date.now()
  if (!force && now - lastWrite < 10000) return
  lastWrite = now
  try {
    await db.put('meta', { key: key(videoId), value: { seconds: Math.floor(seconds), at: new Date().toISOString() } })
  } catch {
    /* positions are a convenience, never a failure */
  }
}

export async function clearPosition(videoId) {
  try {
    await db.del('meta', key(videoId))
  } catch {
    /* ignore */
  }
}
