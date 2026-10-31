/**
 * TikTok link resolution.
 *
 * What this can do honestly:
 *  - turn any public TikTok URL (including vm./vt. short links) into a video id and a
 *    canonical URL, following redirects server-side with a strict host check
 *  - read the public oEmbed metadata: caption, author, thumbnail
 *  - give the official embed URL, which plays the post in TikTok's own player
 *
 * What it deliberately does not do: invent a "direct .mp4" URL. TikTok serves media
 * from signed, hotlink-protected CDN URLs; the `api.tiktok.com/aweme/v1/play?...`
 * pattern that circulates in demos is not a public endpoint and returns nothing. A
 * download button built on it would be a dead button, so there isn't one.
 */

const ALLOWED_HOST = /(^|\.)tiktok\.com$/i
const MAX_REDIRECTS = 3
const TIMEOUT_MS = 8000

export function isTikTokHost(host) {
  return ALLOWED_HOST.test(String(host || ''))
}

/** Pull the numeric id out of a canonical URL, or null. */
export function extractVideoId(raw) {
  const value = String(raw || '').trim()
  if (!value) return null
  const direct = value.match(/\/(?:video|v|photo)\/(\d{6,})/)
  if (direct) return direct[1]
  try {
    const url = new URL(value)
    const last = url.pathname.split('/').filter(Boolean).pop() || ''
    const digits = last.match(/^(\d{6,})$/)
    if (digits) return digits[1]
  } catch {
    /* not a URL */
  }
  const loose = value.match(/(\d{15,})/)
  return loose ? loose[1] : null
}

export function canonicalUrl(videoId, author) {
  return author
    ? `https://www.tiktok.com/@${author}/video/${videoId}`
    : `https://www.tiktok.com/@i/video/${videoId}`
}

/** Follow a short link to its canonical form, without ever leaving tiktok.com. */
async function followShortLink(raw) {
  let current = raw
  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    const parsed = new URL(current)
    if (!isTikTokHost(parsed.hostname)) throw new Error('That link leaves tiktok.com.')
    if (extractVideoId(current)) return current

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JimmyState/1.0)' },
      })
      const location = res.headers.get('location')
      if (!location) break
      current = new URL(location, current).toString()
    } finally {
      clearTimeout(timer)
    }
  }
  return current
}

export async function resolveTikTok(rawInput) {
  const raw = String(rawInput || '').trim().slice(0, 500)
  if (!raw) return { ok: false, code: 'MISSING_URL', error: 'Paste a TikTok video link.' }

  let parsed
  try {
    parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
  } catch {
    return { ok: false, code: 'INVALID_URL', error: 'That is not a valid link.' }
  }
  if (!isTikTokHost(parsed.hostname)) {
    return { ok: false, code: 'NOT_TIKTOK', error: 'That link is not on tiktok.com.' }
  }

  let videoId = extractVideoId(raw)
  let canonical = raw

  if (!videoId) {
    try {
      canonical = await followShortLink(parsed.toString())
      videoId = extractVideoId(canonical)
    } catch (err) {
      return { ok: false, code: 'UNRESOLVED', error: err.message || 'Could not follow that short link.' }
    }
  }

  if (!videoId) {
    return {
      ok: false,
      code: 'NO_VIDEO_ID',
      error: 'No video id in that link. Open the post in TikTok, tap Share → Copy link, and paste the full URL.',
    }
  }

  const embedUrl = `https://www.tiktok.com/embed/v2/${videoId}`
  const shareUrl = canonical.includes('/video/') ? canonical : canonicalUrl(videoId)

  // oEmbed is public and keyless. If it fails we still return the id + embed, and say
  // the metadata is missing rather than inventing a caption.
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(shareUrl)}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JimmyState/1.0)' },
    })
    clearTimeout(timer)
    if (!res.ok) {
      return { ok: true, partial: true, videoId, embedUrl, shareUrl, metadataError: `oEmbed answered ${res.status}` }
    }
    const body = await res.json()
    return {
      ok: true,
      partial: false,
      videoId,
      embedUrl,
      shareUrl,
      title: String(body.title || '').slice(0, 300),
      author: String(body.author_name || '').slice(0, 120),
      authorUrl: String(body.author_url || ''),
      thumbnail: String(body.thumbnail_url || ''),
    }
  } catch (err) {
    return { ok: true, partial: true, videoId, embedUrl, shareUrl, metadataError: err?.message || 'metadata unavailable' }
  }
}

export const _internal = { followShortLink, isTikTokHost, extractVideoId }
