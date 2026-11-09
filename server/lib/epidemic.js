/**
 * Epidemic Sound — the full-length, licensed provider.
 *
 * Unlike the catalogue previews (30 s clips), these are complete tracks: playback goes
 * through the provider's HLS stream, downloads through its MP3 endpoint. Nothing is
 * ripped; the signed URLs are the provider's own delivery mechanism.
 *
 * API: https://developers.epidemicsound.com/docs  · base https://api.epidemicsound.com/v0
 * Auth: `Authorization: Bearer <API key>`
 *
 * Caching is capped at 30 minutes by the provider's policy for catalogue metadata.
 * Audio URLs are signed and short-lived, so they are never cached.
 */

const BASE = 'https://api.epidemicsound.com/v0'
const META_TTL_MS = 30 * 60 * 1000
const cache = new Map()

export const epidemicConfigured = () => Boolean(process.env.EPIDEMIC_API_KEY)

function cached(key) {
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.value
  cache.delete(key)
  return null
}

function remember(key, value) {
  cache.set(key, { value, expires: Date.now() + META_TTL_MS })
  if (cache.size > 400) cache.delete(cache.keys().next().value)
  return value
}

async function call(path, params = {}) {
  if (!epidemicConfigured()) {
    const err = new Error('Epidemic Sound is not configured.')
    err.code = 'NOT_CONFIGURED'
    err.status = 503
    throw err
  }
  const url = new URL(BASE + path)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value)
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.EPIDEMIC_API_KEY}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const err = new Error(
      res.status === 401
        ? 'Epidemic Sound rejected the API key.'
        : `Epidemic Sound responded ${res.status}.`,
    )
    err.status = res.status
    err.code = res.status === 401 ? 'UNAUTHORIZED' : 'UPSTREAM'
    err.detail = body.slice(0, 200)
    throw err
  }
  return res.json()
}

const artistName = (track) =>
  [...(track.mainArtists || []), ...(track.featuredArtists || [])].filter(Boolean).join(', ') ||
  'Epidemic Sound'

/** Provider track → the app's canonical track shape. */
export function normaliseEpidemic(track) {
  if (!track?.id) return null
  const images = track.images || {}
  return {
    id: `es:${track.id}`,
    trackId: `es-${track.id}`,
    esId: track.id,
    title: track.title || 'Untitled',
    artist: artistName(track),
    artistId: null,
    album: track.genres?.[0]?.name || 'Epidemic Sound',
    artwork: images.M || images.L || images.default || '',
    artworkSmall: images.S || images.XS || images.default || '',
    durationMs: Math.round(Number(track.length || 0) * 1000),
    releaseDate: track.added || '',
    genre: track.genres?.[0]?.name || '',
    bpm: track.bpm || null,
    // No plain file: playback is HLS, download is a separate metered endpoint.
    previewUrl: '',
    hlsUrl: `/api/music/epidemic?action=stream&id=${track.id}`,
    downloadUrl: `/api/music/epidemic?action=file&id=${track.id}`,
    full: true,
    previewOnly: false,
    source: 'epidemic',
    license: 'Epidemic Sound',
  }
}

export async function search(term, limit = 12) {
  const size = Math.min(Math.max(Number(limit) || 12, 1), 40)
  const key = `search:${term}:${size}`
  const hit = cached(key)
  if (hit) return hit
  const data = await call('/tracks/search', {
    term: String(term || '').slice(0, 500),
    limit: size,
    sort: term ? 'Relevance' : 'Popularity',
    order: 'desc',
  })
  const items = (data.tracks || []).map(normaliseEpidemic).filter(Boolean)
  return remember(key, items)
}

export async function featured(limit = 12) {
  return search('', limit)
}

export async function track(id) {
  const key = `track:${id}`
  const hit = cached(key)
  if (hit) return hit
  const data = await call(`/tracks/${encodeURIComponent(id)}`)
  return remember(key, normaliseEpidemic(data))
}

/** Signed HLS manifest — deliberately uncached, the URL expires. */
export async function streamUrl(id) {
  const data = await call(`/tracks/${encodeURIComponent(id)}/stream`)
  if (!data?.url) {
    const err = new Error('The provider returned no stream for this track.')
    err.status = 502
    throw err
  }
  return data.url
}

/** Signed MP3 — each call is one metered download on the provider's plan. */
export async function downloadUrl(id, quality = 'high') {
  const data = await call(`/tracks/${encodeURIComponent(id)}/download`, {
    quality: quality === 'normal' ? 'normal' : 'high',
  })
  if (!data?.url) {
    const err = new Error('The provider returned no download for this track.')
    err.status = 502
    throw err
  }
  return { url: data.url, expires: data.expires || '' }
}
