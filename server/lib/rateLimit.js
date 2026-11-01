import { bumpRateWindow, databaseConfigured, hashKey } from './db.js'

/**
 * Small fixed-window rate limiter.
 * Bounded map (entries drop when the window expires) so it cannot grow without
 * limit on a long-running process.
 *
 * `distributed: true` also counts in Postgres, so a limit is enforced across every
 * serverless instance instead of per instance. It is opt-in: on a host with many
 * instances only the routes where abuse costs real money (recognition, downloads)
 * need the extra round-trip. Without a database the count is memory-only, exactly as
 * before, and a database error never blocks a request.
 */
export function rateLimit({
  windowMs = 60_000,
  max = 20,
  key = (req) => req.ip,
  name = 'default',
  distributed = false,
} = {}) {
  const hits = new Map()

  function sweep(now) {
    if (hits.size < 5000) return
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k)
  }

  return async function limiter(req, res, next) {
    const now = Date.now()
    const id = key(req)
    let entry = hits.get(id)
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs }
      hits.set(id, entry)
    }
    entry.count += 1

    let count = entry.count
    if (distributed && databaseConfigured()) {
      try {
        const bucket = `${name}:${Math.round(windowMs / 1000)}:${hashKey(id)}`
        const shared = await bumpRateWindow(bucket, windowMs)
        // Take the higher of the two: a local instance must never undercount the fleet.
        if (shared != null) count = Math.max(count, shared)
      } catch {
        /* memory count stands */
      }
    }

    const remaining = Math.max(0, max - count)
    res.setHeader('X-RateLimit-Limit', String(max))
    res.setHeader('X-RateLimit-Remaining', String(remaining))
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.reset / 1000)))

    if (count > max) {
      const retryAfter = Math.ceil((entry.reset - now) / 1000)
      res.setHeader('Retry-After', String(retryAfter))
      return res.status(429).json({
        ok: false,
        code: 'RATE_LIMITED',
        error: `Too many requests. Try again in ${retryAfter}s.`,
        retryAfter,
      })
    }
    sweep(now)
    next()
  }
}
