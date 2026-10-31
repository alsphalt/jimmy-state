/**
 * Vercel serverless entry.
 *
 * The repo's `/api` directory is Vercel's functions directory, so every `/api/...`
 * request is routed here and handed straight to the Express app. `bodyParser` is
 * disabled on purpose: recognition posts a raw audio buffer, and Vercel's default
 * parser would consume it before express.raw() ever sees it.
 */
import app from '../server/app.js'

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '8mb',
  },
}

export default function handler(req, res) {
  return app(req, res)
}
