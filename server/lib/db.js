/**
 * PostgreSQL access (Neon).
 *
 * Rules this file exists to enforce:
 *  - the connection string is read from the environment only, never from code or a
 *    build-time constant, so nothing reaches the browser bundle or the repository;
 *  - every statement is parameterised ($1, $2 …) — no string interpolation of input;
 *  - a missing or unreachable database never takes the site down: callers get a typed
 *    result and the app falls back to its previous behaviour;
 *  - connection strings are scrubbed from anything logged or returned.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Pool } = pg
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCHEMA_FILE = path.join(HERE, 'schema.sql')

// Any 64-bit integer works as long as it is stable across instances.
const SCHEMA_LOCK = 7140_4119

let pool = null
let schemaPromise = null
let lastError = null

export function databaseUrl() {
  return String(process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim()
}

export function databaseConfigured() {
  return databaseUrl().length > 0
}

/**
 * Removes credentials from a message before it is logged or returned. Postgres errors
 * can echo the connection string back, which would put the password in Vercel's logs.
 */
export function redact(value) {
  let text = typeof value === 'string' ? value : value?.message || ''
  text = text.replace(/(postgres(?:ql)?:\/\/)[^\s:/@]+(:[^\s@/]*)?@/gi, '$1***@')
  const url = databaseUrl()
  if (url && text.includes(url)) text = text.split(url).join('***')
  return text
}

function sslConfig(url) {
  // Neon requires TLS. Certificates are verified by default; PG_SSL_NO_VERIFY=1 is the
  // documented escape hatch for a runtime that does not ship the issuer's CA.
  if (/[?&]sslmode=disable\b/i.test(url)) return false
  if (process.env.PG_SSL_NO_VERIFY === '1') return { rejectUnauthorized: false }
  return { rejectUnauthorized: true }
}

export function getPool() {
  if (!databaseConfigured()) return null
  if (pool) return pool
  const url = databaseUrl()
  pool = new Pool({
    connectionString: url,
    ssl: sslConfig(url),
    // Serverless: many short-lived instances, so keep each pool small. Neon's pooled
    // endpoint (-pooler) is the right string to use in DATABASE_URL.
    max: Number(process.env.PG_POOL_MAX || 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    application_name: 'jimmy-state',
  })
  // An idle client can be dropped by the server; without this the process would crash.
  pool.on('error', (err) => {
    lastError = redact(err)
    console.warn('[db] idle client error:', lastError)
  })
  return pool
}

/**
 * Runs a parameterised query. Never throws: returns { ok, rows } or { ok:false, code }.
 * `code` is for the server; clients get their own message.
 */
export async function query(text, params = []) {
  const active = getPool()
  if (!active) return { ok: false, code: 'DB_NOT_CONFIGURED', rows: [], rowCount: 0 }
  try {
    const result = await active.query(text, params)
    lastError = null
    return { ok: true, rows: result.rows, rowCount: result.rowCount ?? 0 }
  } catch (err) {
    lastError = redact(err)
    console.warn('[db] query failed:', lastError)
    return { ok: false, code: 'DB_ERROR', error: lastError, rows: [], rowCount: 0 }
  }
}

/** Memoised, idempotent schema application. Safe on every cold start. */
export function ensureSchema() {
  if (!databaseConfigured()) return Promise.resolve(false)
  if (!schemaPromise) {
    schemaPromise = runSchema()
      .then((ok) => {
        if (!ok) schemaPromise = null // retry on the next request
        return ok
      })
      .catch((err) => {
        lastError = redact(err)
        console.warn('[db] schema failed:', lastError)
        schemaPromise = null
        return false
      })
  }
  return schemaPromise
}

async function runSchema() {
  const active = getPool()
  if (!active) return false
  const sql = fs.readFileSync(SCHEMA_FILE, 'utf8')
  const client = await active.connect()
  try {
    // One migration at a time, even if several instances boot together.
    await client.query('select pg_advisory_lock($1)', [SCHEMA_LOCK])
    try {
      await client.query(sql)
      return true
    } finally {
      await client.query('select pg_advisory_unlock($1)', [SCHEMA_LOCK])
    }
  } finally {
    client.release()
  }
}

/** Bounded wait, so a slow database cannot hold a response open. */
export function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, code: 'DB_TIMEOUT', rows: [] }), ms)),
  ])
}

export const SQL = {
  recordTrack: `insert into track_counts (day, track_key, title, artist, artwork_url, hits, last_seen)
     values (current_date, $1, $2, $3, $4, 1, now())
     on conflict (day, track_key) do update
       set hits = track_counts.hits + 1,
           last_seen = now(),
           artwork_url = coalesce(excluded.artwork_url, track_counts.artwork_url),
           title = excluded.title,
           artist = excluded.artist`,
  topTracks: `select track_key,
            max(title)       as title,
            max(artist)      as artist,
            max(artwork_url) as artwork,
            sum(hits)::int   as hits
       from track_counts
      where day >= current_date - ($1::int - 1)
      group by track_key
      order by hits desc, title asc
      limit $2`,
  bumpWindow: `insert into rate_windows (bucket, window_start, hits)
     values ($1, $2, 1)
     on conflict (bucket, window_start) do update
       set hits = rate_windows.hits + 1
     returning hits`,
}

const normalise = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)

/**
 * Counts one identification into today's bucket. Aggregate only: no row per user, no
 * audio, no address. A failure here must never affect the recognition response.
 */
export async function recordTrack({ title, artist = '', artwork = '' } = {}) {
  if (!databaseConfigured() || !title) return false
  if (!(await ensureSchema())) return false
  const key = `${normalise(title)}::${normalise(artist)}`
  const result = await query(SQL.recordTrack, [
    key,
    String(title).slice(0, 200),
    String(artist || '').slice(0, 200),
    artwork ? String(artwork).slice(0, 600) : null,
  ])
  return result.ok
}

/** Most identified tracks over the last `days` days. */
export async function topTracks({ days = 7, limit = 20 } = {}) {
  if (!databaseConfigured()) return { ok: false, code: 'DB_NOT_CONFIGURED', items: [] }
  if (!(await ensureSchema())) return { ok: false, code: 'DB_UNAVAILABLE', items: [] }
  const span = Math.min(Math.max(Number(days) || 7, 1), 90)
  const rows = Math.min(Math.max(Number(limit) || 20, 1), 50)
  const result = await query(SQL.topTracks, [span, rows])
  if (!result.ok) return { ok: false, code: result.code, items: [] }
  return {
    ok: true,
    days: span,
    items: result.rows.map((row) => ({
      key: row.track_key,
      title: row.title,
      artist: row.artist,
      artwork: row.artwork || '',
      hits: Number(row.hits),
    })),
  }
}

/**
 * Increments a fixed-window counter across all instances. Returns the shared count, or
 * null when the database is unavailable so the caller can fall back to memory.
 */
export async function bumpRateWindow(bucket, windowMs, { max = 1 } = {}) {
  if (!databaseConfigured() || !bucket) return null
  if (!(await ensureSchema())) return null
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs)
  const result = await query(SQL.bumpWindow, [bucket, windowStart])
  if (!result.ok || !result.rows.length) return null
  // Occasional sweep keeps the table from growing forever; it costs one cheap delete.
  if (Math.random() < 0.005) {
    query(`delete from rate_windows where window_start < now() - interval '1 hour'`).catch(() => {})
  }
  return Number(result.rows[0].hits)
}

export function hashKey(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 32)
}

/** Diagnostics for /api/health. No host, no user, no password — only states. */
export async function databaseStatus() {
  if (!databaseConfigured()) {
    return {
      configured: false,
      reachable: false,
      note: 'Set DATABASE_URL (Neon pooled connection string) in the host environment to enable server-side tracking.',
    }
  }
  const started = Date.now()
  const ping = await withTimeout(query('select 1 as ok'), 2500)
  if (!ping.ok) {
    return {
      configured: true,
      reachable: false,
      latencyMs: Date.now() - started,
      note:
        ping.code === 'DB_TIMEOUT'
          ? 'The database did not answer within 2.5s.'
          : 'The database refused the connection. Check the connection string, TLS and that the schema is applied.',
      error: ping.code === 'DB_TIMEOUT' ? 'timeout' : lastError,
    }
  }
  // Apply the schema before counting it, so a fresh database reports honestly instead of
  // "0 tables" until some other request happens to create them.
  await ensureSchema()
  const tables = await withTimeout(
    query(
      `select count(*)::int as n
         from information_schema.tables
        where table_schema = 'public' and table_name in ('track_counts', 'rate_windows')`,
    ),
    2500,
  )
  return {
    configured: true,
    reachable: true,
    latencyMs: Date.now() - started,
    tables: tables.ok ? tables.rows[0].n : null,
    note: 'Server-side aggregate tracking is live.',
  }
}

/** Closes the pool. Used by tests and by the migration script. */
export async function closePool() {
  if (!pool) return
  const active = pool
  pool = null
  schemaPromise = null
  await active.end().catch(() => {})
}
