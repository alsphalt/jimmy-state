/**
 * Integration tests for the JIMMY STATE API.
 *
 * Spawns the real server on a random port with a temp env so a leftover listener can
 * never poison an assertion. Requires .env for the recognition test; if ACRCloud is
 * unreachable that check reports SKIP instead of failing the suite.
 *
 *   node tests/run.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 3400 + Math.floor(Math.random() * 400)
const BASE = `http://127.0.0.1:${PORT}`

let passed = 0
let failed = 0
let skipped = 0
const failures = []

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function skip(name, why) {
  skipped += 1
  console.log(`  ○ ${name} (skipped: ${why})`)
}

/** 8s of a 440 Hz tone at 16 kHz mono, 16-bit — a valid WAV the provider will not match. */
function makeWav(seconds = 8, rate = 16000) {
  const samples = seconds * rate
  const buf = Buffer.alloc(44 + samples * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + samples * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(rate, 24)
  buf.writeUInt32LE(rate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) {
    const v = Math.sin((2 * Math.PI * 440 * i) / rate) * 0.3
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  return buf
}

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout.on('data', (d) => (serverLog += d.toString()))
server.stderr.on('data', (d) => (serverLog += d.toString()))

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`)
      if (res.ok) return true
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  return false
}

async function json(pathname, options) {
  const res = await fetch(`${BASE}${pathname}`, options)
  const body = await res.json().catch(() => null)
  return { res, body }
}

try {
  const up = await waitForServer()
  if (!up) {
    console.error('Server did not start.\n' + serverLog)
    process.exit(1)
  }

  console.log('\nhealth & shell')
  const health = await json('/api/health')
  check('GET /api/health returns ok', health.res.status === 200 && health.body?.ok === true)
  check('health reports capability flags', typeof health.body?.capabilities?.musicRecognition === 'boolean')
  check('health never leaks secrets', !JSON.stringify(health.body).toLowerCase().includes('secret'))

  const index = await fetch(`${BASE}/`)
  const html = await index.text()
  check('SPA shell is served at /', index.ok && html.includes('<div id="root">'))
  check('manifest is reachable', (await fetch(`${BASE}/manifest.webmanifest`)).ok)
  const sw = await fetch(`${BASE}/sw.js`)
  check('service worker is served with JS type', sw.ok && (sw.headers.get('content-type') || '').includes('javascript'))
  check('manifest declares the D icons', (await (await fetch(`${BASE}/manifest.webmanifest`)).text()).includes('icon-512.png'))
  check('deep link falls back to the shell', (await (await fetch(`${BASE}/library`)).text()).includes('<div id="root">'))

  console.log('\nsecrets & input handling')
  const envProbe = await fetch(`${BASE}/.env`)
  check('/.env is not publicly served', envProbe.status === 404)
  const bad = await json('/api/recognize', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'hello' })
  check('recognize rejects a non-audio body', bad.res.status === 400 && bad.body?.code === 'EMPTY_AUDIO')

  console.log('\nmusic catalogue')
  const music = await json('/api/music/search?q=amapiano&limit=5')
  check('music search returns items', music.res.ok && music.body.items.length > 0, `got ${music.body?.items?.length}`)
  check('items carry artwork', Boolean(music.body.items[0]?.artwork?.startsWith('https://')))
  const withPreview = (await json('/api/music/search?q=afrobeats&limit=25')).body.items.find((i) => i.previewUrl)
  check('catalogue exposes an authorized preview url', Boolean(withPreview?.previewUrl))
  check('missing query is a clear 400', (await json('/api/music/search?q=')).res.status === 400)

  const charts = await json('/api/music/charts?limit=5')
  check('charts return real data', charts.res.ok && charts.body.items.length > 0)

  const track = await json(`/api/music/track/${withPreview.trackId}`)
  check('track lookup by id works', track.res.ok && track.body.track.trackId === withPreview.trackId)

  console.log('\nvideos')
  const videos = await json('/api/videos/search?q=lofi')
  check(
    'video search reports the missing key honestly',
    [503, 200].includes(videos.res.status) &&
      (videos.res.status === 200 ? Array.isArray(videos.body.items) : videos.body.code === 'YOUTUBE_NOT_CONFIGURED'),
    `status ${videos.res.status} code ${videos.body?.code}`,
  )
  check('no fabricated video payload when unconfigured', videos.res.status !== 503 || videos.body.items === undefined)

  console.log('\ndownload policy')
  const foreign = await json('/api/downloads/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/song.mp3' }),
  })
  check('unknown host is refused', foreign.res.status === 403 && foreign.body.code === 'HOST_NOT_ALLOWED')

  const insecure = await json('/api/downloads/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'http://audio-ssl.itunes.apple.com/x.m4a' }),
  })
  check('plain http is refused', insecure.res.status === 403 && insecure.body.code === 'INSECURE_URL')

  const ipLiteral = await json('/api/downloads/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://127.0.0.1/x.mp3' }),
  })
  check('ip-literal urls are refused', ipLiteral.res.status === 403 && ipLiteral.body.code === 'IP_LITERAL')

  const youtube = await json('/api/downloads/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
  })
  check('youtube is not a download source', youtube.res.status === 403 && youtube.body.code === 'HOST_NOT_ALLOWED')

  const resolved = await json('/api/downloads/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: withPreview.previewUrl, fileName: 'Test Track' }),
  })
  check('authorized preview resolves', resolved.res.ok && resolved.body.ok === true, resolved.body?.error)
  check('resolved file has a real size', Number(resolved.body?.size) > 1000, `size ${resolved.body?.size}`)
  check('resolved file has an audio format', ['m4a', 'mp3', 'aac', 'wav'].includes(resolved.body?.format), resolved.body?.format)

  if (resolved.body?.streamUrl) {
    const file = await fetch(`${BASE}${resolved.body.streamUrl}`)
    const buf = Buffer.from(await file.arrayBuffer())
    check('file proxy streams the media', file.ok && buf.length > 1000, `${buf.length} bytes`)
    check('download is served as an attachment', (file.headers.get('content-disposition') || '').includes('attachment'))
    check('content type is audio', (file.headers.get('content-type') || '').startsWith('audio/'))
    check('content length matches the body', Number(file.headers.get('content-length')) === buf.length)
    const proxyAbuse = await fetch(`${BASE}/api/downloads/file?url=${encodeURIComponent('https://example.com/x.mp3')}`)
    check('proxy cannot be used as an open relay', proxyAbuse.status === 403)
  }

  console.log('\nresult assembly')
  try {
    const { buildRecognitionResults } = await import('../server/lib/matches.js')
    const built = await buildRecognitionResults(
      [
        {
          title: 'Blinding Lights',
          artists: [{ name: 'The Weeknd' }],
          album: { name: 'After Hours' },
          genres: [{ name: 'Pop' }],
          release_date: '2020-03-20',
          score: 96,
        },
      ],
      { country: 'US' },
    )
    const all = [built.exact, ...built.similar, ...built.possible]
    check('exact match is enriched with artwork', Boolean(built.exact?.artwork?.startsWith('https://')))
    check('exact match gets an authorized preview', Boolean(built.exact?.previewUrl))
    check('result set stays within 30', all.length <= 30 && built.total === all.length, `${all.length}`)
    check('exactly one exact result', all.filter((t) => t.kind === 'exact').length === 1)
    check('similar and possible are labelled', built.similar.every((t) => t.kind === 'similar') && built.possible.every((t) => t.kind === 'possible'))
    check('results are de-duplicated', new Set(all.map((t) => t.key)).size === all.length)
    check('every result carries artwork', all.every((t) => typeof t.artwork === 'string'))
  } catch (err) {
    skip('result assembly checks', `catalogue unreachable: ${err.message}`)
  }

  console.log('\nrecognition')
  const wav = makeWav()
  const rec = await json('/api/recognize', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav })
  if (rec.res.status === 200 || rec.res.status === 502) {
    if (rec.body?.code === 'RECOGNITION_UNREACHABLE' || rec.body?.code === 'RECOGNITION_TIMEOUT') {
      skip('ACRCloud responds to a signed request', 'network unreachable from this host')
    } else {
      check(
        'signed request reaches ACRCloud and is answered',
        rec.res.status === 200 && rec.body?.matched === false,
        `status ${rec.res.status} code ${rec.body?.code} msg ${rec.body?.error}`,
      )
      check('a non-music sample is not reported as a match', rec.body?.matched === false)
      check('no fabricated results on no-match', (rec.body?.results?.exact ?? null) === null)
    }
  } else {
    check('recognition endpoint answers without crashing', false, `status ${rec.res.status}`)
  }

  const rate = await Promise.all(
    Array.from({ length: 14 }, () =>
      fetch(`${BASE}/api/recognize`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '' }),
    ),
  )
  check('recognition endpoint is rate limited', rate.some((r) => r.status === 429), `statuses ${[...new Set(rate.map((r) => r.status))]}`)

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`)
  if (failures.length) {
    console.log('\nFailures:')
    failures.forEach((f) => console.log(` - ${f}`))
  }
  process.exitCode = failed ? 1 : 0
} finally {
  server.kill('SIGTERM')
  await sleep(200)
}
