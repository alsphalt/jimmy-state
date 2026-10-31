/**
 * Vercel routing coverage.
 *
 * The production bug: `/api/health` worked, `/api/music/search` returned Vercel's own
 * 404 page, because a standalone function named `[...route].js` matches a single path
 * segment — it is not a Next.js catch-all. This suite makes that class of bug
 * impossible to ship again:
 *
 *   1. every Express /api route must have a matching file under api/
 *   2. no catch-all file may exist (it silently shadows nothing and breaks nested paths)
 *   3. the handler must answer real nested URLs with JSON, never an HTML 404
 *
 *   node tests/vercel-routing.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { collectRoutes, toFunctionPath } from '../scripts/make-api-routes.mjs'
import handler from '../server/handler.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const API_DIR = path.join(ROOT, 'api')

let passed = 0
let failed = 0
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/* ---------------------------------------------------- 1. route table coverage */
const routes = collectRoutes(fs.readFileSync(path.join(ROOT, 'server/app.js'), 'utf8'))
const files = fs
  .readdirSync(API_DIR, { recursive: true })
  .filter((f) => String(f).endsWith('.js'))
  .map((f) => String(f).split(path.sep).join('/'))

/** Turn an api file path into a matcher: music/track/[id].js -> /api/music/track/<any> */
function fileToMatcher(file) {
  const segments = `/api/${file.replace(/\.js$/, '')}`.split('/')
  const pattern = segments
    .map((s) => (s.startsWith('[') && s.endsWith(']') ? '([^/]+)' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/')
  return new RegExp(`^${pattern}$`)
}

console.log('\nroute coverage')
for (const route of routes) {
  const target = toFunctionPath(route)
  const wanted = `/api${target}`
  const found = files.some((f) => fileToMatcher(f).test(wanted.replace(/\(.*?\)/g, '')))
  check(`api file exists for ${route}`, found, `expected ${wanted}`)
}

check(
  'no catch-all function file is published',
  !files.some((f) => /\[\.\.\./.test(f)),
  'a [...] file matches one segment only and breaks nested routes on Vercel',
)

/* ------------------------------------------------------- 2. live handler shape */
const server = http.createServer(handler)
await new Promise((resolve) => server.listen(0, resolve))
const base = `http://127.0.0.1:${server.address().port}`

async function call(pathname) {
  const res = await fetch(`${base}${pathname}`)
  const type = res.headers.get('content-type') || ''
  const body = type.includes('json') ? await res.json().catch(() => ({})) : await res.text()
  return { status: res.status, type, body }
}

try {
  console.log('\nnested routes reach the app (the production failure)')
  const health = await call('/api/health')
  check('/api/health returns JSON', health.status === 200 && health.body?.ok === true)

  const search = await call('/api/music/search?q=vybz%20katel&limit=30')
  check('/api/music/search returns JSON, not an HTML 404', search.type.includes('json'), search.type)
  check('search returns real results for "vybz katel"', search.status === 200 && search.body.items?.length > 0, `status ${search.status}`)
  check('results carry artwork and duration', Boolean(search.body.items?.[0]?.artwork) && search.body.items?.[0]?.durationMs >= 0)

  const empty = await call('/api/music/search?q=')
  check('an empty query is a clear 400', empty.status === 400 && empty.body.code === 'MISSING_QUERY')

  const charts = await call('/api/music/charts?limit=2')
  check('/api/music/charts works nested', charts.status === 200 && Array.isArray(charts.body.items))

  const catalog = await call('/api/videos/catalog?q=test')
  check('/api/videos/catalog works nested', catalog.status === 200)

  const metadata = await call('/api/metadata/track?isrc=USCJY1431309')
  check('/api/metadata/track answers (503 when unconfigured, never 404)', [200, 503, 502].includes(metadata.status), `status ${metadata.status}`)

  const recognizeGet = await call('/api/recognize')
  check('GET /api/recognize is a 405, not a 404', recognizeGet.status === 405)

  const unknown = await call('/api/music/does-not-exist')
  check('an unknown nested path is still the app 404 (JSON)', unknown.status === 404 && unknown.type.includes('json'))

  check('no response is an HTML error page', ![search, empty, charts, catalog].some((r) => String(r.type).includes('html')))
} finally {
  server.close()
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exitCode = failed ? 1 : 0
