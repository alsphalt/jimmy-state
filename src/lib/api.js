/**
 * Thin fetch wrapper. Every failure becomes an Error with {code, status}.
 *
 * Two things here exist because they caused real, misleading failures:
 *
 * 1. A frontend deployed without its API answers /api/* with the static host's
 *    HTML 404 page. Reporting that as "Request failed (HTTP 404)" hides the actual
 *    problem, so a non-JSON or missing route is classified as ENDPOINT_NOT_FOUND.
 *
 * 2. The API does not have to live on the same origin. Set VITE_API_BASE at build
 *    time (e.g. https://api.example.com) when the frontend is hosted separately.
 *
 * 3. Inside the APK the page is served by Capacitor from https://localhost, so a
 *    relative /api path points at the WebView itself and every call 404s. Native
 *    builds therefore fall back to the deployed server unless the build sets
 *    VITE_API_BASE. One project, one backend: only the origin string differs.
 */

const NATIVE_ORIGIN = 'https://jimmy-state.vercel.app'

const IS_NATIVE =
  typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true

/** Escape hatch for device testing without a rebuild. */
function runtimeBase() {
  try {
    return window.localStorage.getItem('jimmy-state:api-base') || ''
  } catch {
    return ''
  }
}

const RAW_BASE =
  import.meta.env?.VITE_API_BASE || runtimeBase() || (IS_NATIVE ? NATIVE_ORIGIN : '')
export const API_BASE = String(RAW_BASE).replace(/\/+$/, '')

const withBase = (path) => (path.startsWith('/api') ? `${API_BASE}${path}` : path)

function notFoundError(path, res) {
  const contentType = res.headers.get('content-type') || ''
  const servedHtml = contentType.includes('text/html')
  const where = API_BASE || window.location.origin
  const err = new Error(
    `The API endpoint ${path} is not available at ${where} (HTTP ${res.status}${
      servedHtml ? ', HTML page returned' : ''
    }). ${
      API_BASE
        ? 'Check that VITE_API_BASE points at a running JIMMY STATE server.'
        : 'The site is being served without its API — start the server with "npm run dev" (API + app), or set VITE_API_BASE to the API origin.'
    }`,
  )
  err.code = 'ENDPOINT_NOT_FOUND'
  err.status = res.status
  return err
}

async function request(path, options = {}) {
  const url = withBase(path)
  let res
  try {
    res = await fetch(url, options)
  } catch (err) {
    if (!navigator.onLine) {
      throw Object.assign(new Error('You are offline. Recognition, search and streaming need a connection.'), {
        code: 'OFFLINE',
      })
    }
    throw Object.assign(
      new Error(
        `Could not reach the API at ${API_BASE || window.location.origin}. Check the connection and that the server is running.`,
      ),
      { code: 'NETWORK', cause: err },
    )
  }

  const contentType = res.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  const data = isJson ? await res.json().catch(() => ({})) : {}

  // A 404/405 for an /api path is almost never "the song was not found" — it is the
  // route or the deployment. Say so instead of echoing a generic status line.
  if (!isJson && (res.status === 404 || res.status === 405)) {
    throw notFoundError(path, res)
  }

  if (!res.ok || data.ok === false) {
    const message =
      data.error ||
      (res.status === 401
        ? 'The server rejected its own provider credentials (HTTP 401). Check the ACRCloud settings on the server.'
        : res.status === 429
          ? 'Too many requests right now. Wait a few seconds and try again.'
          : res.status === 404
            ? `The recognition endpoint was not found (HTTP 404) at ${API_BASE || window.location.origin}.`
            : `Request failed (HTTP ${res.status}).`)
    throw Object.assign(new Error(message), {
      code: data.code || (res.status === 404 ? 'ENDPOINT_NOT_FOUND' : 'HTTP_ERROR'),
      status: res.status,
      payload: data,
    })
  }
  return data
}

export const api = {
  health: () => request('/api/health'),

  recognize: (buffer) =>
    request('/api/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: buffer,
    }),

  searchMusic: (q, limit = 20) => request(`/api/music/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  track: (id) => request(`/api/music/track?id=${encodeURIComponent(id)}`),
  artists: (q) => request(`/api/music/artists?q=${encodeURIComponent(q)}`),
  artistSongs: (artistId, limit = 50) =>
    request(`/api/music/artist?artistId=${encodeURIComponent(artistId)}&limit=${limit}`),
  albums: (artistId) => request(`/api/music/albums?artistId=${encodeURIComponent(artistId)}`),
  charts: (limit = 20, country = 'us') =>
    request(`/api/music/charts?limit=${limit}&country=${encodeURIComponent(country)}`),
  feed: (before = '', limit = 20) =>
    request(`/api/feed?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`),

  catalogVideos: (q, limit = 24) => request(`/api/videos/catalog?q=${encodeURIComponent(q)}&limit=${limit}`),
  catalogVideo: (id) => request(`/api/videos/catalog?id=${encodeURIComponent(id)}`),

  searchVideos: (q, limit = 20) => request(`/api/videos/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  video: (id) => request(`/api/videos/item?id=${encodeURIComponent(id)}`),
  related: (id) => request(`/api/videos/related?id=${encodeURIComponent(id)}`),

  tiktok: (url) => request(`/api/tiktok/resolve?url=${encodeURIComponent(url)}`),

  resolveYoutube: (q) => request(`/api/youtube/resolve?q=${encodeURIComponent(q)}`),

  metadata: ({ isrc = '', q = '', artist = '' } = {}) => {
    const params = new URLSearchParams()
    if (isrc) params.set('isrc', isrc)
    if (q) params.set('q', q)
    if (artist) params.set('artist', artist)
    return request(`/api/metadata/track?${params.toString()}`)
  },

  resolveDownload: (url, fileName) =>
    request('/api/downloads/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, fileName }),
    }),
}
