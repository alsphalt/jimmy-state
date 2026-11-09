/**
 * The home feed: a long, chronological list of real catalogue songs.
 *
 * There is no "recently uploaded" endpoint in the catalogue — iTunes search returns a
 * set per term with no sort control. So the feed is assembled honestly:
 *
 *   1. a fixed list of real search terms is walked in order, one page at a time;
 *   2. every returned song is added to a pool keyed by track id (never duplicated);
 *   3. the pool is sorted by the release date the catalogue publishes, newest first;
 *   4. pagination is a composite `releaseDate|trackId` cursor, so a page can neither
 *      repeat nor skip an item — including songs released on the same day, which the
 *      catalogue dates at noon UTC and which a date-only cursor would have dropped.
 *
 * The result is monotonic: page 2 is always older than page 1. Songs that are fetched
 * later and happen to be newer than the cursor are not injected mid-scroll — they show
 * up on the next load, which is also how a real feed behaves.
 *
 * Everything here is catalogue data. No dates, counts or tracks are invented.
 */

import { searchMusic } from './itunes.js'

/** Real searches, each returning distinct catalogue songs. Order is deliberate. */
const TERMS = [
  'new music 2026',
  'Kenya new music',
  'Tanzania new music',
  'East African hits',
  'afrobeats',
  'amapiano',
  'pop hits',
  'hip hop',
  'r&b',
  'gospel',
  'dancehall',
  'reggae',
  'latin',
  'k-pop',
  'country',
  'rock',
  'indie',
  'electronic',
  'house',
  'drill',
  'afro fusion',
  'soul',
  'jazz',
  'acoustic',
  'lo-fi',
  'live session',
  'remix',
  'classical',
  'metal',
  'alternative',
  'funk',
  'trap',
  'singer songwriter',
  'piano',
  'workout',
  'chill',
  'party',
  'wedding',
  'highlife',
  'bongo flava',
  'gengetone',
  'naija',
  'south african house',
]

const PER_TERM = 50
/** How many new terms one request may fetch before giving up on filling a page. */
const MAX_FETCHES_PER_REQUEST = 4

/** Module-level pool. Serverless instances each warm their own; the cursor keeps paging correct. */
const pool = new Map()
let termIndex = 0
let loading = null

const dateOf = (track) => String(track?.releaseDate || '')

function addTracks(tracks) {
  for (const track of tracks || []) {
    if (!track?.trackId || !track.previewUrl || !track.releaseDate) continue
    if (pool.has(track.trackId)) continue
    pool.set(track.trackId, track)
  }
}

/** Fetch the next unseen term. Serialised so two requests never fetch the same term twice. */
async function fetchNextTerm() {
  if (termIndex >= TERMS.length) return false
  const term = TERMS[termIndex]
  termIndex += 1
  try {
    const tracks = await searchMusic(term, { limit: PER_TERM })
    addTracks(tracks)
  } catch {
    // One failing term must not stall the feed; the next term is tried instead.
  }
  return true
}

async function ensureLoaded() {
  if (loading) return loading
  loading = (async () => {
    // A first request pays for a small warm-up so the first page is not one term wide.
    for (let i = 0; i < 3 && termIndex < TERMS.length; i += 1) await fetchNextTerm()
  })()
  try {
    await loading
  } finally {
    loading = null
  }
}

const order = (a, b) => {
  const byDate = dateOf(b).localeCompare(dateOf(a))
  if (byDate !== 0) return byDate
  return String(a.trackId).localeCompare(String(b.trackId))
}

/**
 * One page of the feed.
 * @param {{ before?: string, limit?: number }} options
 */
export async function feedPage({ before = '', limit = 20 } = {}) {
  const size = Math.min(Math.max(Number(limit) || 20, 1), 40)
  const [cursorDate, cursorId] = String(before || '').split('|')

  await ensureLoaded()

  const after = (track) => {
    if (!cursorDate) return true
    const date = dateOf(track)
    if (date !== cursorDate) return date < cursorDate
    // Same day: continue strictly after the last id in the feed's own sort order.
    return String(track.trackId) > String(cursorId || '')
  }

  const eligible = () => [...pool.values()].filter(after).sort(order)

  let items = eligible().slice(0, size)
  let fetches = 0
  // Keep pulling real terms until this page is full, or the term list runs out.
  while (items.length < size && fetches < MAX_FETCHES_PER_REQUEST && termIndex < TERMS.length) {
    const progressed = await fetchNextTerm()
    fetches += 1
    if (!progressed) break
    items = eligible().slice(0, size)
  }

  const last = items[items.length - 1]
  const remaining = eligible().length
  const hasMore = remaining > size || termIndex < TERMS.length
  return {
    items,
    nextCursor: last ? `${dateOf(last)}|${last.trackId}` : String(before || ''),
    hasMore,
    poolSize: pool.size,
  }
}

export const _internal = { TERMS, pool, addTracks, order }
