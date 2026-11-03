/**
 * Database layer tests.
 *
 * Three things are checked:
 *  1. without DATABASE_URL the app degrades cleanly instead of throwing;
 *  2. credentials are scrubbed from anything that could be logged or returned;
 *  3. the exact SQL strings production runs are valid Postgres — executed against an
 *     in-memory engine, with upsert, aggregation and window counters asserted.
 *
 * (3) proves the statements parse and behave; it is not a substitute for hitting the
 * real Neon endpoint, which /api/health reports after deploy.
 *
 *   node tests/db.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.env.DATABASE_URL = ''

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    pass += 1
    console.log(`  ✓ ${name}`)
  } else {
    fail += 1
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const db = await import('../server/lib/db.js')

console.log('unconfigured behaviour')
check('databaseConfigured() is false without DATABASE_URL', db.databaseConfigured() === false)
check('databaseUrl() is empty', db.databaseUrl() === '')
check('getPool() returns null instead of throwing', db.getPool() === null)

const q = await db.query('select 1')
check('query() reports DB_NOT_CONFIGURED', q.ok === false && q.code === 'DB_NOT_CONFIGURED', q.code)
check('query() returns an empty row set', Array.isArray(q.rows) && q.rows.length === 0)

const rec = await db.recordTrack({ title: 'Faded', artist: 'Alan Walker' })
check('recordTrack() is a no-op, not an error', rec === false)

const top = await db.topTracks({ days: 7, limit: 5 })
check('topTracks() reports DB_NOT_CONFIGURED', top.ok === false && top.code === 'DB_NOT_CONFIGURED')

const status = await db.databaseStatus()
check('databaseStatus() reports not configured', status.configured === false && status.reachable === false)

console.log('credential redaction')
const secret = 'postgresql://jimmy:hunter2@ep-cool-1234-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require'
const redacted = db.redact(new Error(`connect ECONNREFUSED ${secret}`))
check('password is removed from a message', !redacted.includes('hunter2'), redacted)
check('user is removed from a message', !redacted.includes('jimmy:'), redacted)
// The host is kept on purpose: it identifies the failing server without being a secret.
check('host survives redaction, secrets do not', redacted.includes('ep-cool-1234') && redacted.includes('***@'), redacted)

process.env.DATABASE_URL = secret
check('databaseConfigured() is true when set', db.databaseConfigured() === true)
check('redact() also strips the live connection string', !db.redact(`boom ${secret}`).includes('hunter2'))
process.env.DATABASE_URL = ''

console.log('connection string normalisation')
// Each of these is a value a host can actually end up storing after a copy-paste.
const N = db.normalizeDatabaseUrl
check('wrapping quotes are removed',
  N('"postgresql://u:pw@h/db?sslmode=require"') === 'postgresql://u:pw@h/db?sslmode=require',
  N('"postgresql://u:pw@h/db?sslmode=require"'))
check('a trailing newline is removed',
  N('postgresql://u:pw@h/db\n') === 'postgresql://u:pw@h/db')
// A raw # would truncate the password at the URL parser and surface as a wrong password.
check('an unencoded # in the password is encoded, not truncated',
  N('postgresql://u:pa#ss@h/db') === 'postgresql://u:pa%23ss@h/db',
  N('postgresql://u:pa#ss@h/db'))
check('an unencoded @ in the password is encoded',
  N('postgresql://u:pa@ss@h/db') === 'postgresql://u:pa%40ss@h/db')
check('an already-encoded password is left exactly as it is',
  N('postgresql://u:pa%23ss@h/db') === 'postgresql://u:pa%23ss@h/db')
check('a plain string is unchanged',
  N('postgresql://u:pw@h/db') === 'postgresql://u:pw@h/db')
check('an empty value stays empty', N('') === '' && N(undefined) === '')

console.log('schema and SQL (real postgres engine)')
// PGlite is PostgreSQL compiled to WASM: same constraints, same ON CONFLICT semantics.
// An emulator would not do here — the whole point is uniqueness and upsert behaviour.
let PGlite
try {
  ;({ PGlite } = await import('@electric-sql/pglite'))
} catch {
  console.log('  - @electric-sql/pglite not installed, skipping SQL execution')
}

if (PGlite) {
  const pg = await PGlite.create()
  const schema = fs.readFileSync(path.join(ROOT, 'server/lib/schema.sql'), 'utf8')

  let schemaOk = true
  try {
    await pg.exec(schema)
  } catch (err) {
    schemaOk = false
    check('schema.sql applies', false, err.message.split('\n')[0])
  }
  check('schema.sql applies', schemaOk)

  // The app re-applies it on every cold start: this must be a no-op.
  let secondRun = true
  try {
    await pg.exec(schema)
  } catch (err) {
    secondRun = false
  }
  check('schema.sql is idempotent on a live database', secondRun)

  const record = (title, artist, artwork = null) =>
    pg.query(db.SQL.recordTrack, [`${title}::${artist}`.toLowerCase(), title, artist, artwork])

  await record('Faded', 'Alan Walker', 'https://cdn/art.jpg')
  await record('Faded', 'Alan Walker') // second spin, no artwork this time
  await record('Thriller', 'Michael Jackson', 'https://cdn/thriller.jpg')

  const dup = await pg.query('select count(*)::int as n from track_counts')
  check('one row per track per day', dup.rows[0].n === 2, `${dup.rows[0].n} rows`)

  const faded = await pg.query(`select hits, artwork_url from track_counts where track_key = 'faded::alan walker'`)
  check('repeat identification increments instead of duplicating', Number(faded.rows[0]?.hits) === 2, JSON.stringify(faded.rows[0]))
  check('artwork survives a later hit that has none', faded.rows[0]?.artwork_url === 'https://cdn/art.jpg', faded.rows[0]?.artwork_url)

  const trending = await pg.query(db.SQL.topTracks, [7, 10])
  check('trending is ordered by hits', trending.rows[0].title === 'Faded', trending.rows[0]?.title)
  check('trending returns a numeric count', Number(trending.rows[0].hits) === 2, trending.rows[0]?.hits)
  check('trending respects the limit', (await pg.query(db.SQL.topTracks, [7, 1])).rows.length === 1)

  const w1 = await pg.query(db.SQL.bumpWindow, ['recognize:60:abc', new Date(0)])
  const w2 = await pg.query(db.SQL.bumpWindow, ['recognize:60:abc', new Date(0)])
  const w3 = await pg.query(db.SQL.bumpWindow, ['recognize:60:xyz', new Date(0)])
  check('shared counter increments within a window', Number(w1.rows[0].hits) === 1 && Number(w2.rows[0].hits) === 2)
  check('separate buckets do not share a count', Number(w3.rows[0].hits) === 1)

  // A later window must not inherit the previous count.
  const nextWindow = await pg.query(db.SQL.bumpWindow, ['recognize:60:abc', new Date(60_000)])
  check('a new window starts at one', Number(nextWindow.rows[0].hits) === 1, nextWindow.rows[0].hits)

  // Input containing SQL must be stored as data, never executed.
  await record("'; drop table track_counts; --", 'Bobby')
  const survivors = await pg.query('select count(*)::int as n from track_counts')
  check('SQL metacharacters are stored as text', Number(survivors.rows[0].n) === 3, `${survivors.rows[0].n} rows`)

  // The window query the health check uses must work against the real engine.
  const tables = await pg.query(
    `select count(*)::int as n from information_schema.tables
      where table_schema = 'public' and table_name in ('track_counts', 'rate_windows')`,
  )
  check('health check finds both tables', Number(tables.rows[0].n) === 2, `${tables.rows[0].n}`)

  await pg.close()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
