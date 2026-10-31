/**
 * ACRCloud External Metadata API — platform links, hi-res covers and previews.
 *
 *   GET https://eu-api-v2.acrcloud.com/api/external-metadata/tracks?isrc=…&platforms=…
 *
 * Auth is a Bearer token created by hand in the ACRCloud console
 * (console.acrcloud.com → account → developer → create token). The identify
 * access key/secret cannot be used here; that is a different credential.
 *
 * Everything is enrichment: if the token is absent or the call fails, recognition
 * still returns its verified match and the UI simply shows fewer links.
 */

const BASE =
  process.env.ACR_METADATA_BASE || 'https://eu-api-v2.acrcloud.com/api/external-metadata/tracks'

const PLATFORM_HOSTS = {
  applemusic: ['music.apple.com', 'itunes.apple.com'],
  spotify: ['open.spotify.com', 'spotify.com'],
  deezer: ['deezer.com', 'api.deezer.com'],
  youtube: ['youtube.com', 'music.youtube.com', 'youtu.be'],
  tidal: ['tidal.com', 'listen.tidal.com'],
  soundcloud: ['soundcloud.com'],
  amazonmusic: ['music.amazon.com', 'amazon.com'],
  gaana: ['gaana.com'],
  awa: ['awa.fm'],
  kkbox: ['kkbox.com'],
  napster: ['napster.com'],
  audius: ['audius.co'],
}

const PLATFORM_LABELS = {
  applemusic: 'Apple Music',
  spotify: 'Spotify',
  deezer: 'Deezer',
  youtube: 'YouTube Music',
  tidal: 'Tidal',
  soundcloud: 'SoundCloud',
  amazonmusic: 'Amazon Music',
  gaana: 'Gaana',
  awa: 'AWA',
  kkbox: 'KKBOX',
  napster: 'Napster',
  audius: 'Audius',
}

export function metadataConfigured() {
  return Boolean((process.env.ACR_METADATA_TOKEN || '').trim())
}

const cache = new Map()
const TTL_MS = 30 * 60 * 1000
const MAX_ENTRIES = 200

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

const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

function platformAccepts(platform, url) {
  const hosts = PLATFORM_HOSTS[platform] || []
  const host = hostOf(url)
  if (!host) return false
  return hosts.some((h) => host === h || host.endsWith(`.${h}`))
}

/** Keep only covers on Apple's image CDN; they are the ones we also allow for saving. */
function safeImage(url) {
  const host = hostOf(url)
  return host.endsWith('mzstatic.com') ? url : ''
}

/**
 * mzstatic serves any size from the same asset (`…/3000x3000bb.jpg`).
 * A 3000px cover for a 230px tile wastes ~1 MB on a phone, so ask for what the
 * layout actually uses.
 */
function sizedCover(url, px) {
  return url.replace(/\/(\d+)x(\d+)bb\.(jpg|jpeg|png)$/i, `/${px}x${px}bb.$3`)
}

function collectLinks(externalMetadata) {
  const links = []
  const previews = []
  for (const [platform, entries] of Object.entries(externalMetadata || {})) {
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      const url = entry?.link || ''
      // ACRCloud occasionally returns a link whose host does not match the platform
      // key (the "spotify" object in the reference payload points at Apple Music).
      // Show it only when the host really belongs to that platform.
      if (url && platformAccepts(platform, url)) {
        links.push({
          platform,
          label: PLATFORM_LABELS[platform] || platform,
          url,
          id: entry.id ? String(entry.id) : '',
        })
      }
      const preview = entry?.preview || ''
      if (preview && platformAccepts('applemusic', preview) && !previews.includes(preview)) {
        previews.push(preview)
      }
    }
  }
  // One link per platform is enough for the UI.
  const seen = new Set()
  return {
    links: links.filter((l) => (seen.has(l.platform) ? false : seen.add(l.platform))),
    previews,
  }
}

function collectWorks(works) {
  if (!Array.isArray(works)) return []
  return works
    .filter((w) => w && (w.name || w.iswc))
    .slice(0, 4)
    .map((w) => ({
      name: w.name || '',
      iswc: w.iswc || '',
      contributors: (w.contributors || [])
        .filter((c) => c?.name)
        .map((c) => ({ name: c.name.trim(), roles: c.roles || [] })),
    }))
}

export function normaliseMetadataTrack(entry) {
  if (!entry || !entry.name) return null
  const album = entry.album || {}
  const covers = album.covers || {}
  const { links, previews } = collectLinks(entry.external_metadata)

  const largest = safeImage(covers.large) || safeImage(album.cover) || safeImage(covers.medium) || ''
  const cover = largest ? sizedCover(largest, 600) : ''

  return {
    title: entry.name,
    artist: (entry.artists || []).map((a) => a?.name).filter(Boolean).join(', '),
    album: album.name || '',
    albumUpc: album.upc || '',
    label: album.label || '',
    cover,
    covers: {
      small: safeImage(covers.small) ? sizedCover(safeImage(covers.small), 200) : cover,
      medium: safeImage(covers.medium) ? sizedCover(safeImage(covers.medium), 300) : cover,
      large: largest,
    },
    durationMs: Number(entry.duration_ms || 0),
    releaseDate: entry.release_date || '',
    genres: entry.genres || [],
    isrc: entry.isrc || '',
    trackNumber: entry.track_number || null,
    discNumber: entry.disc_number || null,
    links,
    previews,
    works: collectWorks(entry.works),
    source: 'acrcloud-metadata',
  }
}

/**
 * @param {{isrc?:string, query?:string, artists?:string[], platforms?:string, includeWorks?:boolean}} opts
 * @returns {Promise<{ok:boolean, configured:boolean, code?:string, reason?:string, track?:object, tracks?:object[]}>}
 */
export async function lookupMetadata({ isrc = '', query = '', artists = [], platforms = '', includeWorks = true } = {}) {
  if (!metadataConfigured()) {
    return {
      ok: false,
      configured: false,
      code: 'METADATA_NOT_CONFIGURED',
      reason:
        'Platform links need ACR_METADATA_TOKEN (ACRCloud console → account → developer → create token).',
    }
  }

  const params = new URLSearchParams()
  if (isrc) params.set('isrc', isrc)
  else if (query) {
    const payload = { track: query }
    if (artists.length) payload.artists = artists
    params.set('query', JSON.stringify(payload))
    params.set('format', 'json')
  } else {
    return { ok: false, configured: true, code: 'MISSING_QUERY', reason: 'An ISRC or a query is required.' }
  }
  params.set('platforms', platforms || process.env.ACR_METADATA_PLATFORMS || 'applemusic,spotify,deezer,youtube')
  if (includeWorks) params.set('include_works', '1')

  const key = params.toString()
  const cached = cacheGet(key)
  if (cached) return cached

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 7000)
  let res, body
  try {
    res = await fetch(`${BASE}?${key}`, {
      headers: {
        Authorization: `Bearer ${process.env.ACR_METADATA_TOKEN.trim()}`,
        Accept: 'application/json',
        'User-Agent': 'JimmyState/1.0',
      },
      signal: controller.signal,
    })
    body = await res.json().catch(() => null)
  } catch (err) {
    clearTimeout(timer)
    return {
      ok: false,
      configured: true,
      code: err?.name === 'AbortError' ? 'METADATA_TIMEOUT' : 'METADATA_UNREACHABLE',
      reason: 'The metadata service did not answer in time.',
    }
  }
  clearTimeout(timer)

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      configured: true,
      code: 'METADATA_UNAUTHORIZED',
      reason: 'The ACR_METADATA_TOKEN was rejected (invalid, revoked or expired). Create a new one in the console.',
    }
  }
  if (!res.ok) {
    return { ok: false, configured: true, code: 'METADATA_HTTP_ERROR', reason: `Metadata service returned HTTP ${res.status}.` }
  }

  const tracks = (Array.isArray(body?.data) ? body.data : []).map(normaliseMetadataTrack).filter(Boolean)
  const value = { ok: true, configured: true, track: tracks[0] || null, tracks }
  cacheSet(key, value)
  return value
}

/** Merge metadata links into a result item without overwriting what recognition proved. */
export function applyMetadata(result, meta) {
  if (!result || !meta?.track) return result
  const t = meta.track
  return {
    ...result,
    artwork: t.cover || result.artwork,
    artworkSmall: t.covers.small || t.covers.medium || result.artworkSmall,
    album: result.album || t.album,
    previewUrl: result.previewUrl || t.previews[0] || '',
    storeUrl: result.storeUrl || t.links.find((l) => l.platform === 'applemusic')?.url || '',
    genre: result.genre || (t.genres || [])[0] || '',
    durationMs: result.durationMs || t.durationMs,
    isrc: result.isrc || t.isrc,
    links: t.links,
    credits: t.works,
    label: t.label || '',
    providers: [...new Set([...(result.providers || []), 'acrcloud-metadata'])],
  }
}

export const _internal = { platformAccepts, safeImage, collectLinks }
