/**
 * Small fixed-window rate limiter.
 * Bounded map (entries drop when the window expires) so it cannot grow without
 * limit on a long-running process.
 */
export function rateLimit({ windowMs = 60_000, max = 20, key = (req) => req.ip } = {}) {
  const hits = new Map()

  function sweep(now) {
    if (hits.size < 5000) return
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k)
  }

  return function limiter(req, res, next) {
    const now = Date.now()
    const id = key(req)
    let entry = hits.get(id)
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs }
      hits.set(id, entry)
    }
    entry.count += 1
    const remaining = Math.max(0, max - entry.count)
    res.setHeader('X-RateLimit-Limit', String(max))
    res.setHeader('X-RateLimit-Remaining', String(remaining))
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.reset / 1000)))

    if (entry.count > max) {
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
