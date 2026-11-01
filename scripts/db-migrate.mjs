/**
 * Applies the schema to the database in DATABASE_URL.
 *
 *   npm run db:migrate
 *
 * The app also calls ensureSchema() on its first query, so running this is optional —
 * it exists so a migration can be applied and verified deliberately (and in CI) rather
 * than implicitly on a cold start.
 *
 * The connection string is never printed: only which host *category* it is and whether
 * it is reachable.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true })

const { databaseConfigured, ensureSchema, query, closePool } = await import('../server/lib/db.js')

if (!databaseConfigured()) {
  console.error(
    'DATABASE_URL is not set.\n' +
      '  Local: add DATABASE_URL="postgres://…" to .env (or export it).\n' +
      '  Vercel: Settings → Environment Variables → DATABASE_URL, then redeploy.\n' +
      'Use the pooled connection string (the host contains "-pooler") on serverless.',
  )
  process.exit(1)
}

const started = Date.now()
const ok = await ensureSchema()
if (!ok) {
  console.error('Schema could not be applied. Check the connection string, TLS and that the role may create tables.')
  await closePool()
  process.exit(1)
}

const tables = await query(
  `select table_name, column_name
     from information_schema.columns
    where table_schema = 'public' and table_name in ('track_counts', 'rate_windows')
    order by table_name, ordinal_position`,
)

const grouped = new Map()
for (const row of tables.ok ? tables.rows : []) {
  if (!grouped.has(row.table_name)) grouped.set(row.table_name, [])
  grouped.get(row.table_name).push(row.column_name)
}

const counts = await query(
  `select (select count(*)::int from track_counts) as tracks,
          (select count(*)::int from rate_windows) as windows`,
)

console.log(`Schema applied in ${Date.now() - started} ms`)
for (const [table, columns] of grouped) {
  console.log(`  ${table}(${columns.join(', ')})`)
}
if (counts.ok) {
  console.log(`Rows: track_counts=${counts.rows[0].tracks}, rate_windows=${counts.rows[0].windows}`)
}

await closePool()
