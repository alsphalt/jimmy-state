import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import 'dotenv/config'

import { identify, acrConfigured } from './lib/acrcloud.js'
import { buildRecognitionResults } from './lib/matches.js'
import { searchMusic, lookupTrack, searchArtists, artistAlbums, topSongs } from './lib/itunes.js'
import { searchVideos, relatedVideos, getVideo, youtubeConfigured } from './lib/youtube.js'
import { assertDownloadable, sanitiseFileName, isMediaType, extensionFor, allowedHosts } from './lib/netguard.js'
import { rateLimit } from './lib/rateLimit.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT || 3001)

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
      downloads: true,
    },
    downloadHosts: allowedHosts(),
    notes: {
      recognition: acrConfigured()
        ? 'ACRCloud identification is live.'
        : 'Recognition disabled: set ACR_ACCESS_KEY / ACR_ACCESS_SECRET.',
      youtube: youtubeConfigured()
        ? 'YouTube search is live.'
        : 'YouTube search disabled: set YOUTUBE_API_KEY. Playback still needs a video id, so the Videos tab stays in setup mode.',
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
      return res.status(result.ok ? 200 : 502).json({
        ok: false,
        matched: false,
        code: result.code || 'NO_MATCH',
        error: result.reason || 'No match found.',
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
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50)
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

/* ------------------------------------------------------------------------ video */
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
      return res.status(503).json({
        ok: false,
        code: 'YOUTUBE_NOT_CONFIGURED',
        error: 'Video metadata needs YOUTUBE_API_KEY. Playback of a known video id still works through the embedded player.',
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

    const upstream = await fetch(guard.url, { headers: { 'User-Agent': 'JimmyState/1.0' } })
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ ok: false, code: 'UPSTREAM_ERROR', error: `The source refused the file (HTTP ${upstream.status}).` })
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    if (!isMediaType(contentType)) {
      return res.status(415).json({ ok: false, code: 'NOT_MEDIA', error: 'The source did not return a media file.' })
    }

    const length = Number(upstream.headers.get('content-length') || 0)
    if (length > MAX_DOWNLOAD_BYTES) {
      await upstream.body.cancel().catch(() => {})
      return res.status(413).json({ ok: false, code: 'TOO_LARGE', error: 'That file exceeds the download size limit.' })
    }

    const fileName = sanitiseFileName(typeof req.query.name === 'string' ? req.query.name : 'jimmy-state-download', contentType)
    res.setHeader('Content-Type', contentType)
    if (length) res.setHeader('Content-Length', String(length))
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.setHeader('Cache-Control', 'no-store')

    const stream = Readable.fromWeb(upstream.body)
    stream.on('error', () => res.destroy())
    res.on('close', () => stream.destroy())
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

const listener = app.listen(PORT, () => {
  console.log(`JIMMY STATE api on http://localhost:${PORT}`)
  console.log(`  recognition : ${acrConfigured() ? 'configured' : 'NOT configured'}`)
  console.log(`  youtube     : ${youtubeConfigured() ? 'configured' : 'NOT configured'}`)
})

listener.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[jimmy-state] port ${PORT} is already in use — another copy of the API is probably running.\n` +
        `Stop it (ps -eo pid,args | grep "[s]erver/index.js") or start this one with PORT=3002.`,
    )
    process.exit(1)
  }
  throw err
})

export default app
