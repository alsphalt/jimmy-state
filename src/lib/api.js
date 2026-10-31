/** Thin fetch wrapper. Every failure becomes an Error with {code,status}. */

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(path, options)
  } catch (err) {
    if (!navigator.onLine) {
      throw Object.assign(new Error('You are offline. Recognition, search and streaming need a connection.'), {
        code: 'OFFLINE',
      })
    }
    throw Object.assign(new Error('Network request failed. Check your connection and try again.'), {
      code: 'NETWORK',
      cause: err,
    })
  }

  const isJson = (res.headers.get('content-type') || '').includes('application/json')
  const data = isJson ? await res.json().catch(() => ({})) : {}
  if (!res.ok || data.ok === false) {
    throw Object.assign(new Error(data.error || `Request failed (HTTP ${res.status})`), {
      code: data.code || 'HTTP_ERROR',
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

  searchMusic: (q, limit = 20) =>
    request(`/api/music/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  track: (id) => request(`/api/music/track/${encodeURIComponent(id)}`),
  artists: (q) => request(`/api/music/artists?q=${encodeURIComponent(q)}`),
  albums: (artistId) => request(`/api/music/albums/${encodeURIComponent(artistId)}`),
  charts: (limit = 20) => request(`/api/music/charts?limit=${limit}`),

  searchVideos: (q, limit = 20) =>
    request(`/api/videos/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  video: (id) => request(`/api/videos/${encodeURIComponent(id)}`),
  related: (id) => request(`/api/videos/${encodeURIComponent(id)}/related`),

  resolveDownload: (url, fileName) =>
    request('/api/downloads/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, fileName }),
    }),
}
