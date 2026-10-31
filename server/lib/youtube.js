/**
 * YouTube Data API v3 client (server-side only).
 *
 * Search + metadata only. Playback happens in the browser through the official
 * IFrame Player API. There is deliberately no download path here: a Data API key
 * does not grant any right to download or extract audio from YouTube videos.
 */

const API = 'https://www.googleapis.com/youtube/v3'

export function youtubeConfigured() {
  return Boolean(process.env.YOUTUBE_API_KEY)
}

function notConfigured() {
  const err = new Error(
    'YouTube search is not configured. Add YOUTUBE_API_KEY to .env (Google Cloud console → enable "YouTube Data API v3" → create an API key) and restart the server.',
  )
  err.code = 'YOUTUBE_NOT_CONFIGURED'
  err.status = 503
  return err
}

export function parseIsoDuration(value) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(value || ''))
  if (!m) return 0
  const [, d, h, mi, s] = m
  return (
    (Number(d || 0) * 86400) + (Number(h || 0) * 3600) + (Number(mi || 0) * 60) + Number(s || 0)
  )
}

async function apiGet(path, params, timeoutMs = 9000) {
  if (!youtubeConfigured()) throw notConfigured()
  const url = new URL(`${API}/${path}`)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  })
  url.searchParams.set('key', process.env.YOUTUBE_API_KEY)

  /**
   * A key created with "HTTP referrers (web sites)" restrictions is refused for
   * server-side calls, which carry no Referer at all:
   *   403 forbidden — "Requests from referer <empty> are blocked."
   * Sending the site the key is restricted to is accurate, but it must be explicit:
   * set YOUTUBE_REFERER, or (better) switch the key's application restriction to
   * None / IP addresses, since this key is used from a server.
   */
  const headers = { 'User-Agent': 'JimmyState/1.0' }
  const referer = String(process.env.YOUTUBE_REFERER || '').trim().replace(/\/$/, '')
  if (referer) headers.Referer = referer

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      const reason = body?.error?.errors?.[0]?.reason || body?.error?.message || `HTTP ${res.status}`
      const err = new Error(`YouTube API error: ${reason}`)
      // Distinguish "your key is wrong" from "your quota is gone": they need different
      // fixes, and lumping them into one 502 wastes the operator's time.
      if (reason === 'forbidden' && /referer/i.test(err.message)) {
        err.code = 'YOUTUBE_REFERER_BLOCKED'
        err.status = 502
        err.detail =
          'This API key is restricted to HTTP referrers, so server-side calls are refused. Either set YOUTUBE_REFERER to the allowed site, or change the key restriction to None/IP.'
      } else if (reason === 'keyInvalid' || reason === 'badRequest' || res.status === 400) {
        err.code = 'YOUTUBE_KEY_INVALID'
        err.status = 502
        err.detail = 'Google rejected this API key. Check YouTube Data API v3 is enabled for it and that the key is not restricted to another API.'
      } else if (reason === 'quotaExceeded' || reason === 'rateLimitExceeded' || res.status === 403) {
        err.code = 'YOUTUBE_QUOTA'
        err.status = 429
        err.detail = 'Daily quota exhausted (10,000 units; one search costs 100). It resets at midnight Pacific.'
      } else {
        err.code = 'YOUTUBE_API_ERROR'
        err.status = 502
        err.detail = reason
      }
      throw err
    }
    return body
  } finally {
    clearTimeout(timer)
  }
}

function mapSnippet(item) {
  const id = typeof item.id === 'string' ? item.id : item.id?.videoId
  if (!id) return null
  const sn = item.snippet || {}
  const thumbs = sn.thumbnails || {}
  return {
    videoId: id,
    title: sn.title || 'Untitled video',
    channel: sn.channelTitle || 'Unknown channel',
    channelId: sn.channelId || '',
    description: sn.description || '',
    publishedAt: sn.publishedAt || '',
    thumbnail:
      thumbs.maxres?.url || thumbs.standard?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || '',
    durationSeconds: 0,
    views: null,
    embeddable: true,
    watchUrl: `https://www.youtube.com/watch?v=${id}`,
    source: 'youtube',
  }
}

/** Attach duration / embeddable flags in one batched videos.list call. */
async function hydrate(videos) {
  const ids = videos.map((v) => v.videoId).filter(Boolean)
  if (!ids.length) return videos
  const data = await apiGet('videos', { part: 'contentDetails,statistics,status', id: ids.join(','), maxResults: 50 })
  const byId = new Map((data.items || []).map((v) => [v.id, v]))
  return videos.map((v) => {
    const extra = byId.get(v.videoId)
    if (!extra) return v
    return {
      ...v,
      durationSeconds: parseIsoDuration(extra.contentDetails?.duration),
      views: extra.statistics?.viewCount ? Number(extra.statistics.viewCount) : null,
      embeddable: extra.status?.embeddable !== false,
      live: extra.contentDetails?.duration === 'P0D',
    }
  })
}

export async function searchVideos(query, { maxResults = 20, pageToken = '' } = {}) {
  const q = String(query || '').trim()
  if (!q) return { items: [], nextPageToken: '' }
  const data = await apiGet('search', {
    part: 'snippet',
    type: 'video',
    q,
    maxResults: Math.min(Math.max(Number(maxResults) || 20, 1), 25),
    pageToken,
    videoEmbeddable: 'true',
    safeSearch: 'moderate',
  })
  const videos = (data.items || []).map(mapSnippet).filter(Boolean)
  return { items: await hydrate(videos), nextPageToken: data.nextPageToken || '' }
}

/** Related videos: keyword search around the seed video (relatedToVideoId is retired). */
export async function relatedVideos(video, { maxResults = 8 } = {}) {
  const q = [video?.title, video?.channel].filter(Boolean).join(' ')
  if (!q) return []
  const { items } = await searchVideos(q, { maxResults: maxResults + 1 })
  return items.filter((v) => v.videoId !== video?.videoId).slice(0, maxResults)
}

export async function getVideo(videoId) {
  const id = String(videoId || '').trim()
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
    const err = new Error('Invalid video id')
    err.status = 400
    err.code = 'INVALID_VIDEO_ID'
    throw err
  }
  const data = await apiGet('videos', { part: 'snippet,contentDetails,statistics,status', id })
  const item = (data.items || [])[0]
  if (!item) {
    const err = new Error('Video not found or not publicly available')
    err.status = 404
    err.code = 'VIDEO_NOT_FOUND'
    throw err
  }
  const base = mapSnippet(item)
  const [hydrated] = await hydrate([base])
  return hydrated
}

/**
 * oEmbed — YouTube's own public endpoint. No key, no scraping: given a video id it
 * returns the title, channel and thumbnail. Used when YOUTUBE_API_KEY is absent so a
 * pasted link still resolves to real metadata instead of "not configured".
 */
export async function oembed(videoId) {
  const id = String(videoId || '').trim()
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
      { signal: controller.signal, headers: { 'User-Agent': 'JimmyState/1.0' } },
    )
    if (!res.ok) return null
    const data = await res.json()
    return {
      videoId: id,
      title: data.title || 'Untitled video',
      channel: data.author_name || '',
      channelId: '',
      description: '',
      publishedAt: '',
      thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      durationSeconds: 0,
      views: null,
      embeddable: true,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
      source: 'youtube-oembed',
      partial: true,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export const _internal = { mapSnippet, oembed }
