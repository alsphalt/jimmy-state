/**
 * iTunes Search API client (no key required).
 *
 * Used for: artwork, 30-second authorized previews, similar-song discovery and
 * the public "most played" charts. Preview clips are the only audio this build
 * will ever hand to the download manager — they are published by Apple for
 * preview playback, and nothing else is scraped or decrypted.
 */

const BASE = 'https://itunes.apple.com'
const CHARTS = 'https://rss.applemarketingtools.com/api/v2'
const UA = { 'User-Agent': 'JimmyState/1.0 (+https://jimmystate.app)' }

const cache = new Map()
const TTL_MS = 5 * 60 * 1000
const MAX_ENTRIES = 240

function cacheGet(key) {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key)
    return null
  }
  cache.delete(key)
  cache.set(key, hit)
  return hit.value
}

function cacheSet(key, value) {
  cache.set(key, { at: Date.now(), value })
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value)
}

async function getJson(url, timeoutMs = 9000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: UA, signal: controller.signal })
    if (!res.ok) throw new Error(`iTunes responded ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function bigArtwork(url, size = 600) {
  if (!url) return ''
  return String(url).replace(/\/\d+x\d+bb\.(jpg|png)$/i, `/${size}x${size}bb.$1`)
}

export function normaliseItunes(item) {
  if (!item || !item.trackId) return null
  const art = bigArtwork(item.artworkUrl100 || item.artworkUrl60 || '')
  return {
    id: `itunes:${item.trackId}`,
    trackId: item.trackId,
    title: item.trackName || 'Unknown title',
    artist: item.artistName || 'Unknown artist',
    artistId: item.artistId || null,
    album: item.collectionName || '',
    artwork: art,
    artworkSmall: bigArtwork(item.artworkUrl100 || '', 200),
    previewUrl: item.previewUrl || '',
    storeUrl: item.trackViewUrl || '',
    durationMs: Number(item.trackTimeMillis || 0),
    genre: item.primaryGenreName || '',
    releaseDate: item.releaseDate || '',
    explicit: item.trackExplicitness === 'explicit',
    source: 'itunes',
  }
}

export async function searchMusic(term, { limit = 20, country = 'US', entity = 'song' } = {}) {
  const q = String(term || '').trim()
  if (!q) return []
  const key = `s:${q.toLowerCase()}:${limit}:${country}:${entity}`
  const cached = cacheGet(key)
  if (cached) return cached
  const url = `${BASE}/search?term=${encodeURIComponent(q)}&media=music&entity=${entity}&limit=${Math.min(
    Math.max(limit, 1),
    50,
  )}&country=${encodeURIComponent(country)}`
  const data = await getJson(url)
  const list = (data?.results || []).map(normaliseItunes).filter(Boolean)
  cacheSet(key, list)
  return list
}

export async function lookupTrack(trackId, country = 'US') {
  const id = String(trackId || '').replace(/\D/g, '')
  if (!id) return null
  const key = `l:${id}:${country}`
  const cached = cacheGet(key)
  if (cached !== null) return cached
  const data = await getJson(`${BASE}/lookup?id=${id}&country=${encodeURIComponent(country)}`)
  const track = (data?.results || []).map(normaliseItunes).filter(Boolean)[0] || null
  cacheSet(key, track)
  return track
}

/** Artist search -> used by the Artists tab and "more from this artist". */
export async function searchArtists(term, { limit = 12, country = 'US' } = {}) {
  const q = String(term || '').trim()
  if (!q) return []
  const key = `a:${q.toLowerCase()}:${limit}:${country}`
  const cached = cacheGet(key)
  if (cached) return cached
  const data = await getJson(
    `${BASE}/search?term=${encodeURIComponent(q)}&media=music&entity=musicArtist&limit=${limit}&country=${country}`,
  )
  const list = (data?.results || []).map((a) => ({
    id: `artist:${a.artistId}`,
    artistId: a.artistId,
    name: a.artistName,
    genre: a.primaryGenreName || '',
    link: a.artistLinkUrl || '',
    source: 'itunes',
  }))
  cacheSet(key, list)
  return list
}

/** Albums for an artist id -> used by the Albums tab. */
export async function artistAlbums(artistId, { limit = 12, country = 'US' } = {}) {
  const id = String(artistId || '').replace(/\D/g, '')
  if (!id) return []
  const key = `al:${id}:${limit}:${country}`
  const cached = cacheGet(key)
  if (cached) return cached
  const data = await getJson(
    `${BASE}/lookup?id=${id}&entity=album&limit=${limit}&country=${encodeURIComponent(country)}`,
  )
  const list = (data?.results || [])
    .filter((r) => r.wrapperType === 'collection' && r.collectionId)
    .map((r) => ({
      id: `album:${r.collectionId}`,
      collectionId: r.collectionId,
      title: r.collectionName,
      artist: r.artistName,
      artwork: bigArtwork(r.artworkUrl100 || ''),
      trackCount: r.trackCount || 0,
      releaseDate: r.releaseDate || '',
      source: 'itunes',
    }))
  cacheSet(key, list)
  return list
}

/**
 * An artist's tracks, from the same catalogue.
 *
 * The artist page needs songs that can actually be played and saved, so this asks for
 * `entity=song` rather than reusing the keyword search (which is YouTube-backed now and
 * carries no audio file or duration). Each item keeps the published `previewUrl` and
 * `trackTimeMillis`, which is what the card duration and the player use.
 */
export async function artistSongs(artistId, { limit = 50, country = 'US' } = {}) {
  const id = String(artistId || '').replace(/\D/g, '')
  if (!id) return []
  const capped = Math.min(Math.max(Number(limit) || 50, 1), 100)
  const key = `as:${id}:${capped}:${country}`
  const cached = cacheGet(key)
  if (cached) return cached
  const data = await getJson(
    `${BASE}/lookup?id=${id}&entity=song&limit=${capped}&country=${encodeURIComponent(country)}`,
  )
  // The same recording comes back once per release it appears on, sometimes with a
  // different track id, so the list is de-duplicated by title+album+duration: a card
  // per recording, not per pressing.
  const seen = new Set()
  const list = []
  for (const row of data?.results || []) {
    if (row.wrapperType !== 'track' || row.kind !== 'song' || !row.trackId) continue
    const track = normaliseItunes(row)
    if (!track) continue
    const signature = `${track.title.toLowerCase()}::${track.album.toLowerCase()}::${track.durationMs}`
    if (seen.has(signature)) continue
    seen.add(signature)
    list.push(track)
  }
  cacheSet(key, list)
  return list
}

/**
 * Real chart data, no key and no fabrication.
 * Primary: Apple's public marketing feed. Fallback: the legacy iTunes top-songs RSS,
 * which serves the same chart and is reachable from networks the marketing feed
 * redirects slowly on. Both are Apple's own published data.
 */
export async function topSongs({ limit = 20, country = 'us' } = {}) {
  const key = `top:${country}:${limit}`
  const cached = cacheGet(key)
  if (cached) return cached

  const fromMarketing = async () => {
    const data = await getJson(
      `${CHARTS}/${encodeURIComponent(country)}/music/most-played/${limit}/songs.json`,
      7000,
    )
    return (data?.feed?.results || []).map((r, i) => ({
      id: `chart:${r.id || i}`,
      rank: i + 1,
      title: r.name,
      artist: r.artistName,
      album: r.collectionName || '',
      artwork: bigArtwork(r.artworkUrl100 || ''),
      artworkSmall: bigArtwork(r.artworkUrl100 || '', 200),
      storeUrl: r.url || '',
      genre: r.genres?.[0]?.name || '',
      releaseDate: r.releaseDate || '',
      source: 'apple-charts',
    }))
  }

  const fromLegacyRss = async () => {
    const data = await getJson(`${BASE}/${encodeURIComponent(country)}/rss/topsongs/limit=${limit}/json`, 8000)
    const entries = data?.feed?.entry || []
    return entries.map((e, i) => {
      const images = e['im:image'] || []
      const biggest = images[images.length - 1]?.label || images[0]?.label || ''
      return {
        id: `chart:${e.id?.attributes?.['im:id'] || i}`,
        rank: i + 1,
        title: e['im:name']?.label || 'Unknown title',
        artist: e['im:artist']?.label || 'Unknown artist',
        album: e['im:collection']?.['im:name']?.label || '',
        artwork: bigArtwork(biggest),
        artworkSmall: bigArtwork(biggest, 200),
        storeUrl: e.link?.[0]?.attributes?.href || e.id?.label || '',
        genre: e.category?.attributes?.label || '',
        releaseDate: e['im:releaseDate']?.label || '',
        source: 'apple-charts',
      }
    })
  }

  let list = []
  try {
    list = await fromMarketing()
  } catch {
    list = []
  }
  if (!list.length) {
    list = await fromLegacyRss()
  }
  if (list.length) {
    list = await withPreviews(list, country)
    cacheSet(key, list)
  }
  return list
}

/**
 * The chart feeds list songs but publish no audio. previewUrl comes from the lookup
 * endpoint, so one batched call fills in every clip. Best effort: a chart that cannot
 * be enriched is still a valid chart.
 */
async function withPreviews(items, country = 'us') {
  const ids = items.map((it) => String(it.id || '').replace(/^chart:/, '')).filter((n) => /^\d+$/.test(n))
  if (!ids.length) return items
  let results = []
  try {
    const data = await getJson(
      `${BASE}/lookup?id=${ids.slice(0, 50).join(',')}&country=${encodeURIComponent(country)}`,
      8000,
    )
    results = data?.results || []
  } catch {
    return items
  }
  const byId = new Map()
  results.forEach((r) => {
    if (r?.previewUrl) byId.set(String(r.trackId), r)
  })
  if (!byId.size) return items
  return items.map((it) => {
    const hit = byId.get(String(it.id || '').replace(/^chart:/, ''))
    if (!hit) return it
    return {
      ...it,
      previewUrl: hit.previewUrl,
      trackId: hit.trackId ?? it.trackId ?? null,
      artwork: it.artwork || bigArtwork(hit.artworkUrl100 || ''),
      artworkSmall: it.artworkSmall || bigArtwork(hit.artworkUrl100 || '', 200),
    }
  })
}

/**
 * Music videos (entity=musicVideo). Keyless and official, and each result carries a
 * provider-published .m4v preview — real playback without a YouTube key, and the only
 * video files this app is allowed to save.
 */
export function normaliseMusicVideo(item) {
  if (!item || !item.trackId) return null
  return {
    videoId: `mv-${item.trackId}`,
    trackId: item.trackId,
    title: item.trackName || 'Untitled video',
    channel: item.artistName || '',
    thumbnail: bigArtwork(item.artworkUrl100 || '', 600),
    thumbnailSmall: bigArtwork(item.artworkUrl100 || '', 300),
    durationSeconds: Math.round(Number(item.trackTimeMillis || 0) / 1000),
    previewUrl: item.previewUrl || '',
    storeUrl: item.trackViewUrl || '',
    genre: item.primaryGenreName || '',
    releaseDate: item.releaseDate || '',
    kind: 'music-video',
    source: 'itunes',
    embeddable: true,
    watchUrl: item.trackViewUrl || '',
  }
}

export async function searchMusicVideos(term, { limit = 20, country = 'US' } = {}) {
  const q = String(term || '').trim()
  if (!q) return []
  const key = `mv:${q.toLowerCase()}:${limit}:${country}`
  const cached = cacheGet(key)
  if (cached) return cached
  const url = `${BASE}/search?term=${encodeURIComponent(q)}&media=music&entity=musicVideo&limit=${Math.min(
    Math.max(limit, 1),
    50,
  )}&country=${encodeURIComponent(country)}`
  const data = await getJson(url)
  const list = (data?.results || []).map(normaliseMusicVideo).filter(Boolean)
  cacheSet(key, list)
  return list
}

export async function lookupMusicVideo(trackId, country = 'US') {
  const id = String(trackId || '').replace(/\D/g, '')
  if (!id) return null
  const key = `mvl:${id}:${country}`
  const cached = cacheGet(key)
  if (cached !== null) return cached
  const data = await getJson(`${BASE}/lookup?id=${id}&country=${encodeURIComponent(country)}`)
  const video = (data?.results || []).map(normaliseMusicVideo).filter(Boolean)[0] || null
  cacheSet(key, video)
  return video
}

export const _internal = { bigArtwork, cacheSize: () => cache.size }
