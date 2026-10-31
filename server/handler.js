/**
 * Shared serverless handler.
 *
 * Every file under /api re-exports this. Vercel functions do not support a catch-all
 * (`[...route].js`) the way Next.js does: a file named that way matches exactly one
 * path segment, so `/api/music/search` fell through to the platform's own 404 while
 * `/api/health` worked. One small file per route shape fixes it, and because every
 * file delegates to the same Express app, even a surprising precedence choice cannot
 * misroute a request — Express still sees the original URL.
 *
 * bodyParser is disabled because recognition POSTs a raw audio buffer; Vercel's default
 * parser would consume it before express.raw() runs.
 */
import app from './app.js'

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '8mb',
  },
}

export default function handler(req, res) {
  return app(req, res)
}
