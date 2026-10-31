import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import dotenv from 'dotenv'

import { identify, acrConfigured, acrCredentialState } from './lib/acrcloud.js'
import { buildRecognitionResults } from './lib/matches.js'
import {
  searchMusic,
  lookupTrack,
  searchArtists,
  artistAlbums,
  topSongs,
  searchMusicVideos,
  lookupMusicVideo,
} from './lib/itunes.js'
import { lookupMetadata, metadataConfigured } from './lib/acrMetadata.js'
import { searchVideos, relatedVideos, getVideo, youtubeConfigured, oembed } from './lib/youtube.js'
import { assertDownloadable, sanitiseFileName, isMediaType, extensionFor, allowedHosts } from './lib/netguard.js'
import { rateLimit } from './lib/rateLimit.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT || 3001)

/**
 * .env loading.
 *
 * dotenv with no path reads `process.cwd()/.env`, so `node server/index.js` started
 * from anywhere other than the project root found nothing and the app reported
 * "recognition not configured" while .env sat right there in the repo.
 *
 * Order: project root first, then the working directory (for unusual layouts).
 * Real environment variables still win — a host's dashboard config is authoritative —
 * but a variable that exists as an empty string is filled from the file, because an
 * empty placeholder from a platform default is not a real override.
 */
const envCandidates = [...new Set([path.join(ROOT, '.env'), path.join(process.cwd(), '.env')])]
const envLoaded = []
const envParsed = {}
for (const file of envCandidates) {
  if (!fs.existsSync(file)) continue
  const result = dotenv.config({ path: file })
  if (!result.error) {
    envLoaded.push(file)
    Object.assign(envParsed, result.parsed || {})
  }
}
let envFilledFromFile = 0
for (const [key, value] of Object.entries(envParsed)) {
  if (typeof process.env[key] === 'string' && process.env[key].trim() === '' && String(value).trim() !== '') {
    process.env[key] = value
    envFilledFromFile += 1
  }
}

/** Show repo-relative paths for files inside the project, absolute ones outside it. */
const displayPath = (file) => {
  const rel = path.relative(ROOT, file)
  return !rel || rel.startsWith('..') ? file : rel
}

const envDiagnostics = () => ({
  loadedFiles: envLoaded.map(displayPath),
  checked: envCandidates.map((f) => ({ path: displayPath(f), exists: fs.existsSync(f) })),
  filledFromFile: envFilledFromFile,
  recognition: acrCredentialState(),
  youtube: { YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY?.trim() ? 'present' : 'missing' },
})

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)

/* ------------------------------------------------------------------ security */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()')
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "connect-src 'self' https:",
      "script-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "worker-src 'self' blob:",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  )
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
  }
  next()
})

/**
 * Cross-origin support, opt-in.
 *
 * Needed only when the frontend is deployed apart from the API (VITE_API_BASE).
 * No wildcard: an origin must be named in CORS_ORIGINS.
 */
const corsOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean)

app.use('/api', (req, res, next) => {
  const origin = req.headers.origin
  if (origin && corsOrigins.includes(origin.replace(/\/+$/, ''))) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Max-Age', '600')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin && corsOrigins.includes(origin.replace(/\/+$/, '')) ? 204 : 403)
  next()
})

app.use(express.json({ limit: '64kb' }))

const noStore = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
}

/* -------------------------------------------------------------------- health */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    version: '1.0.0',
    time: new Date().toISOString(),
    capabilities: {
      musicRecognition: acrConfigured(),
      musicCatalogue: true,
      youtubeSearch: youtubeConfigured(),
      metadataLinks: metadataConfigured(),
      catalogVideos: true,
      downloads: true,
    },
    env: envDiagnostics(),
    downloadHosts: allowedHosts(),
    notes: {
      recognition: acrConfigured()
        ? 'ACRCloud identification is live.'
        : `Recognition disabled: no ACRCloud credentials. Checked ${envLoaded.length ? envLoaded.map(displayPath).join(', ') : 'no .env file (looked for .env in the project root)'}. Set ACR_ACCESS_KEY / ACR_ACCESS_SECRET there, or as environment variables on your host.`,
      youtube: youtubeConfigured()
        ? 'YouTube search is live.'
        : 'YouTube search disabled: set YOUTUBE_API_KEY. Playback still needs a video id, so the Videos tab stays in setup mode.',
      metadataLinks: metadataConfigured()
        ? 'Platform links and hi-res covers are live (ACRCloud metadata).'
        : 'Platform links disabled: set ACR_METADATA_TOKEN (console → account → developer).',
      downloads:
        'Only files published for download by an allowlisted provider (Apple preview clips by default) can be saved. YouTube downloads are not offered.',
    },
  })
})

/* ---------------------------------------------------------------- recognition */
const recognizeLimit = rateLimit({ windowMs: 60_000, max: 12 })

app.post(
  '/api/recognize',
  noStore,
  recognizeLimit,
  express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '8mb' }),
  async (req, res) => {
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
    if (!buffer.length) {
      return res.status(400).json({
        ok: false,
        code: 'EMPTY_AUDIO',
        error: 'No audio sample was received. Record at least 5 seconds and try again.',
      })
    }

    const result = await identify(buffer)
    if (!result.ok || !result.matched) {
      const notConfigured = result.code === 'RECOGNITION_NOT_CONFIGURED'
      const unauthorized = result.code === 'RECOGNITION_UNAUTHORIZED'
      const quota = result.code === 'RECOGNITION_QUOTA'
      return res
        .status(result.ok ? 200 : notConfigured ? 503 : unauthorized ? 502 : quota ? 429 : 502)
        .json({
        ok: false,
        matched: false,
        code: result.code || 'NO_MATCH',
        error: notConfigured
          ? `No ACRCloud credentials reached the server. Checked ${
              envLoaded.length
                ? envLoaded.map(displayPath).join(', ')
                : `${displayPath(path.join(ROOT, '.env'))} (not found)`
            } and the process environment: ${Object.entries(result.credentials || {})
              .filter(([k]) => k.startsWith('ACR_'))
              .map(([k, v]) => `${k} ${v}`)
              .join(', ')}. Add both values to .env at the project root, or set them in your host's environment settings, then restart.`
          : result.reason || 'No match found.',
        env: notConfigured ? envDiagnostics() : undefined,
        diagnostics: result.diagnostics,
        results: { exact: null, similar: [], possible: [], total: 0 },
      })
    }

    let results
    try {
      results = await buildRecognitionResults(result.matches, { country: process.env.CATALOG_COUNTRY || 'US' })
    } catch (err) {
      // Recognition succeeded; enrichment failed. Return the verified match alone
      // rather than pretending there are recommendations.
      results = { exact: null, similar: [], possible: [], total: 0 }
    }

    if (!results.exact) {
      const first = result.matches[0]
      const artists = (first?.artists || []).map((a) => a?.name).filter(Boolean)
      results.exact = {
        key: `${first?.title || ''}::${artists[0] || ''}`.toLowerCase(),
        kind: 'exact',
        title: first?.title || 'Unknown title',
        artist: artists.join(', ') || 'Unknown artist',
        album: first?.album?.name || '',
        artwork: '',
        artworkSmall: '',
        previewUrl: '',
        storeUrl: '',
        durationMs: 0,
        genre: first?.genres?.[0]?.name || '',
        releaseDate: first?.release_date || '',
        acrScore: first?.score ?? null,
        confidence: first?.score ? Math.min(1, first.score / 100) : null,
        providers: ['acrcloud'],
        youtubeSearchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(
          `${first?.title || ''} ${artists[0] || ''}`,
        )}`,
      }
      results.total = 1
    } else {
      results.total = Math.max(results.total, 1 + results.similar.length + results.possible.length)
    }

    res.json({
      ok: true,
      matched: true,
      code: 'MATCH',
      recognition: {
        provider: 'ACRCloud',
        sampleSeconds: Math.round(buffer.length / 32000), // 16 kHz mono 16-bit
      },
      results,
    })
  },
)

/* --------------------------------------------------------------- music catalogue */
const softLimit = rateLimit({ windowMs: 60_000, max: 90 })

app.get('/api/music/search', softLimit, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').slice(0, 120)
    if (!q.trim()) return res.status(400).json({ ok: false, code: 'MISSING_QUERY', error: 'Enter something to search for.' })
    // Default 30 per the API contract; the catalogue provider is asked for no more
    // than 50 (it ignores larger values anyway).
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 50)
    const country = String(req.query.country || process.env.CATALOG_COUNTRY || 'US').slice(0, 2).toUpperCase()
    const items = await searchMusic(q, { limit, country })
    res.json({ ok: true, query: q, count: items.length, items })
  } catch (err) {
    next(err)
  }
})

app.get('/api/music/track/:id', softLimit, async (req, res, next) => {
  try {
    const track = await lookupTrack(req.params.id, String(req.query.country || 'US').slice(0, 2))
    if (!track) return res.status(404).json({ ok: false, code: 'TRACK_NOT_FOUND', error: 'That track is not in the catalogue.' })
    res.json({ ok: true, track })
  } catch (err) {
    next(err)
  }
})

app.get('/api/music/artists', softLimit, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').slice(0, 120)
    if (!q.trim()) return res.status(400).json({ ok: false, code: 'MISSING_QUERY', error: 'Enter an artist name.' })
    const items = await searchArtists(q, { limit: Math.min(Number(req.query.limit) || 12, 25) })
    res.json({ ok: true, query: q, items })
  } catch (err) {
    next(err)
  }
})

app.get('/api/music/albums/:artistId', softLimit, async (req, res, next) => {
  try {
    const items = await artistAlbums(req.params.artistId, { limit: Math.min(Number(req.query.limit) || 12, 25) })
    res.json({ ok: true, items })
  } catch (err) {
    next(err)
  }
})

app.get('/api/music/charts', softLimit, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50)
    const country = String(req.query.country || 'us').slice(0, 2).toLowerCase()
    const items = await topSongs({ limit, country })
    res.json({ ok: true, source: 'Apple Music most-played feed', items })
  } catch (err) {
    next(err)
  }
})

/**
 * Wrong method on a real route is a 405 with an explanation, never a 404 that sends
 * the frontend hunting for a missing endpoint.
 */
app.get('/api/recognize', (req, res) => {
  res.setHeader('Allow', 'POST')
  res.status(405).json({
    ok: false,
    code: 'METHOD_NOT_ALLOWED',
    error: 'POST an audio/wav body to /api/recognize. GET is not supported.',
  })
})

/* ------------------------------------------------------------- platform links */
app.get('/api/metadata/track', softLimit, async (req, res, next) => {
  try {
    const isrc = String(req.query.isrc || '').trim().slice(0, 20)
    const q = String(req.query.q || '').trim().slice(0, 120)
    const artists = String(req.query.artist || '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
      .slice(0, 3)
    if (!isrc && !q) {
      return res.status(400).json({ ok: false, code: 'MISSING_QUERY', error: 'Provide an isrc or a q parameter.' })
    }
    const result = await lookupMetadata({ isrc, query: q, artists })
    if (!result.ok) {
      return res.status(result.code === 'METADATA_NOT_CONFIGURED' ? 503 : 502).json({
        ok: false,
        code: result.code,
        error: result.reason,
        configured: result.configured,
      })
    }
    res.json({ ok: true, configured: true, count: result.tracks.length, track: result.track })
  } catch (err) {
    next(err)
  }
})

/* ------------------------------------------------------------------------ video */
/**
 * Catalogue music videos — keyless. Apple publishes a real .m4v preview per video,
 * which is what makes the Videos tab usable before a YouTube key exists.
 */
app.get('/api/videos/catalog', softLimit, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').slice(0, 120)
    if (!q.trim()) return res.status(400).json({ ok: false, code: 'MISSING_QUERY', error: 'Enter a video title or artist.' })
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 40)
    const country = String(req.query.country || process.env.CATALOG_COUNTRY || 'US').slice(0, 2).toUpperCase()
    const items = await searchMusicVideos(q, { limit, country })
    res.json({ ok: true, source: 'itunes', query: q, count: items.length, items })
  } catch (err) {
    next(err)
  }
})

app.get('/api/videos/catalog/:id', softLimit, async (req, res, next) => {
  try {
    const video = await lookupMusicVideo(req.params.id)
    if (!video) return res.status(404).json({ ok: false, code: 'VIDEO_NOT_FOUND', error: 'That music video is not in the catalogue.' })
    res.json({ ok: true, video })
  } catch (err) {
    next(err)
  }
})

app.get('/api/videos/search', softLimit, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').slice(0, 120)
    if (!q.trim()) return res.status(400).json({ ok: false, code: 'MISSING_QUERY', error: 'Enter a video title or keyword.' })
    if (!youtubeConfigured()) {
      return res.status(503).json({
        ok: false,
        configured: false,
        code: 'YOUTUBE_NOT_CONFIGURED',
        error:
          'Video search needs YOUTUBE_API_KEY. Add it to .env (Google Cloud → YouTube Data API v3 → API key) and restart. No placeholder results are shown.',
      })
    }
    const { items, nextPageToken } = await searchVideos(q, { maxResults: Math.min(Number(req.query.limit) || 20, 25) })
    res.json({ ok: true, configured: true, query: q, count: items.length, items, nextPageToken })
  } catch (err) {
    next(err)
  }
})

app.get('/api/videos/:id(\\w[\\w-]{10})/related', softLimit, async (req, res, next) => {
  try {
    if (!youtubeConfigured()) return res.json({ ok: true, items: [], configured: false })
    const video = await getVideo(req.params.id)
    const items = await relatedVideos(video)
    res.json({ ok: true, items })
  } catch (err) {
    next(err)
  }
})

app.get('/api/videos/:id(\\w[\\w-]{10})', softLimit, async (req, res, next) => {
  try {
    if (!youtubeConfigured()) {
      // No key: YouTube's public oEmbed endpoint still gives title/channel/thumbnail.
      const partial = await oembed(req.params.id)
      if (partial) return res.json({ ok: true, video: partial, configured: false, partial: true })
      return res.status(503).json({
        ok: false,
        code: 'YOUTUBE_NOT_CONFIGURED',
        error:
          'Video metadata needs YOUTUBE_API_KEY. Playback of a valid video id still works through the embedded player.',
      })
    }
    const video = await getVideo(req.params.id)
    res.json({ ok: true, video })
  } catch (err) {
    next(err)
  }
})

/* -------------------------------------------------------------------- downloads */
const downloadLimit = rateLimit({ windowMs: 60_000, max: 30 })
const MAX_DOWNLOAD_BYTES = Number(process.env.MAX_DOWNLOAD_BYTES || 60 * 1024 * 1024)

app.post('/api/downloads/resolve', downloadLimit, async (req, res, next) => {
  try {
    const target = req.body?.url
    const guard = await assertDownloadable(target)
    if (!guard.ok) {
      return res.status(403).json({ ok: false, code: guard.code, error: guard.reason })
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12000)
    let upstream
    try {
      upstream = await fetch(guard.url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0', 'User-Agent': 'JimmyState/1.0' },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    const contentType = upstream.headers.get('content-type') || ''
    const rangeHeader = upstream.headers.get('content-range') || ''
    const totalFromRange = /\/(\d+)$/.exec(rangeHeader)?.[1]
    const size = Number(totalFromRange || upstream.headers.get('content-length') || 0)
    if (upstream.body) await upstream.body.cancel().catch(() => {})

    if (!isMediaType(contentType)) {
      return res.status(415).json({
        ok: false,
        code: 'NOT_MEDIA',
        error: `That source returned "${contentType || 'unknown'}", not an audio or video file. Nothing was saved.`,
      })
    }
    if (size > MAX_DOWNLOAD_BYTES) {
      return res.status(413).json({
        ok: false,
        code: 'TOO_LARGE',
        error: `The file is ${(size / 1048576).toFixed(1)} MB, above the ${(MAX_DOWNLOAD_BYTES / 1048576).toFixed(0)} MB limit.`,
      })
    }

    const requestedName = typeof req.body?.fileName === 'string' ? req.body.fileName : ''
    res.json({
      ok: true,
      url: guard.url.toString(),
      fileName: sanitiseFileName(requestedName || 'jimmy-state-track', contentType),
      format: extensionFor(contentType),
      contentType: contentType.split(';')[0],
      size,
      streamUrl: `/api/downloads/file?url=${encodeURIComponent(guard.url.toString())}&name=${encodeURIComponent(
        requestedName || 'jimmy-state-track',
      )}`,
      note: 'Saving is proxied from the authorized provider. Source terms still apply.',
    })
  } catch (err) {
    next(err)
  }
})

app.get('/api/downloads/file', downloadLimit, async (req, res, next) => {
  try {
    const guard = await assertDownloadable(req.query.url)
    if (!guard.ok) return res.status(403).json({ ok: false, code: guard.code, error: guard.reason })

    /**
     * A total timeout stops a source that accepts the connection and then never
     * finishes. Separate from the size cap below, which stops a source that keeps
     * sending: Content-Length can be absent or wrong, so the body itself is counted.
     */
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), Number(process.env.DOWNLOAD_TIMEOUT_MS || 120000))
    const upstream = await fetch(guard.url, {
      headers: { 'User-Agent': 'JimmyState/1.0' },
      signal: abort.signal,
    }).catch((err) => {
      clearTimeout(timer)
      throw err
    })
    if (!upstream.ok || !upstream.body) {
      clearTimeout(timer)
      return res.status(502).json({ ok: false, code: 'UPSTREAM_ERROR', error: `The source refused the file (HTTP ${upstream.status}).` })
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    if (!isMediaType(contentType)) {
      return res.status(415).json({ ok: false, code: 'NOT_MEDIA', error: 'The source did not return a media file.' })
    }

    const length = Number(upstream.headers.get('content-length') || 0)
    if (length > MAX_DOWNLOAD_BYTES) {
      clearTimeout(timer)
      await upstream.body.cancel().catch(() => {})
      return res.status(413).json({
        ok: false,
        code: 'TOO_LARGE',
        error: `That file is ${(length / 1048576).toFixed(1)} MB, above the ${(MAX_DOWNLOAD_BYTES / 1048576).toFixed(0)} MB limit.`,
      })
    }

    const fileName = sanitiseFileName(typeof req.query.name === 'string' ? req.query.name : 'jimmy-state-download', contentType)
    res.setHeader('Content-Type', contentType)
    if (length) res.setHeader('Content-Length', String(length))
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.setHeader('Cache-Control', 'no-store')

    const stream = Readable.fromWeb(upstream.body)
    let sent = 0
    let closed = false

    const finish = () => {
      clearTimeout(timer)
      if (!closed) {
        closed = true
        try {
          stream.destroy()
        } catch {
          /* already gone */
        }
      }
    }

    /**
     * Count bytes as they pass. A declared Content-Length is a claim, not a guarantee:
     * an upstream that streams indefinitely is cut off the moment it crosses the limit,
     * and the client sees a truncated file rather than an unannounced 2 GB transfer.
     */
    stream.on('data', (chunk) => {
      sent += chunk.length
      if (sent > MAX_DOWNLOAD_BYTES) {
        console.warn('[jimmy-state] download exceeded the byte cap, aborted', { sent, cap: MAX_DOWNLOAD_BYTES })
        finish()
        res.destroy()
      }
    })
    stream.on('error', (err) => {
      console.warn('[jimmy-state] download stream error', err?.message)
      finish()
      res.destroy()
    })
    res.on('close', finish)
    res.on('finish', finish)
    stream.pipe(res)
  } catch (err) {
    next(err)
  }
})

/* ----------------------------------------------------------------- static + SPA */
if (fs.existsSync(DIST)) {
  app.use(
    express.static(DIST, {
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        } else if (filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest')) {
          res.setHeader('Cache-Control', 'no-cache')
        }
      },
    }),
  )
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    // Anything that looks like a file (has an extension) must not fall back to the
    // SPA shell — otherwise /.env or /config.json would answer 200 with HTML.
    const last = req.path.split('/').pop() || ''
    if (last.includes('.')) return next()
    res.sendFile(path.join(DIST, 'index.html'))
  })
} else {
  app.get('/', (req, res) => {
    res
      .status(200)
      .type('text/plain')
      .send('JIMMY STATE API is running. Run "npm run dev" for the app, or "npm run build" then restart for production.')
  })
}

app.use((req, res) => {
  res.status(404).json({ ok: false, code: 'NOT_FOUND', error: `No route for ${req.method} ${req.path}` })
})

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'YOUTUBE_NOT_CONFIGURED' ? 503 : 500)
  if (status >= 500) console.error('[jimmy-state]', err.message)
  if (res.headersSent) return res.end()
  res.status(status).json({
    ok: false,
    code: err.code || 'SERVER_ERROR',
    error:
      status >= 500 && process.env.NODE_ENV === 'production'
        ? 'Something went wrong on the server. Please try again.'
        : err.message || 'Unexpected server error.',
  })
})


/** Startup summary for a host that actually listens (server/index.js). */
export function startupSummary() {
  return [
    `  env         : ${envLoaded.length ? envLoaded.map(displayPath).join(', ') : 'none found (host env vars only)'}`,
    `  recognition : ${acrConfigured() ? 'configured' : 'NOT configured — set ACR_ACCESS_KEY / ACR_ACCESS_SECRET'}`,
    `  youtube     : ${youtubeConfigured() ? 'configured' : 'NOT configured — set YOUTUBE_API_KEY'}`,
    `  metadata    : ${metadataConfigured() ? 'configured' : 'NOT configured — set ACR_METADATA_TOKEN'}`,
  ]
}

export default app
export { PORT }
