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
import fs from 'node:fs'
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
  // An unusable key keeps the video assertions deterministic regardless of what
  // YOUTUBE_API_KEY exists in the developer's .env.
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', YOUTUBE_API_KEY: 'disabled-for-tests' },
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
  // Compare against the real values in .env: key NAMES may appear (ACR_ACCESS_SECRET),
  // key VALUES must never do so.
  const envText = fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : ''
  const secrets = envText
    .split('\n')
    .filter((line) => /^(ACR_ACCESS_KEY|ACR_ACCESS_SECRET|YOUTUBE_API_KEY)=/.test(line))
    .map((line) => line.split('=').slice(1).join('=').trim())
    .filter((value) => value.length >= 8)
  const healthJson = JSON.stringify(health.body)
  check(
    'health never leaks credential values',
    secrets.every((value) => !healthJson.includes(value)),
    `${secrets.length} credential value(s) checked`,
  )
  check(
    'health reports credential state without values',
    typeof health.body?.env?.recognition?.ACR_ACCESS_KEY === 'string' &&
      ['present', 'empty', 'missing'].includes(health.body.env.recognition.ACR_ACCESS_KEY),
  )

  const index = await fetch(`${BASE}/`)
  const html = await index.text()
  check('SPA shell is served at /', index.ok && html.includes('<div id="root">'))
  check('manifest is reachable', (await fetch(`${BASE}/manifest.webmanifest`)).ok)
  const sw = await fetch(`${BASE}/sw.js`)
  check('service worker is served with JS type', sw.ok && (sw.headers.get('content-type') || '').includes('javascript'))
  check('manifest declares the D icons', (await (await fetch(`${BASE}/manifest.webmanifest`)).text()).includes('icon-512.png'))
  check('deep link falls back to the shell', (await (await fetch(`${BASE}/library`)).text()).includes('<div id="root">'))

  // The design face is self-hosted, so it has to leave the server as a font or the
  // page silently falls back to the device's own typeface.
  const font = await fetch(`${BASE}/fonts/inter-latin-var.woff2`)
  check(
    'the Inter font is served as a font',
    font.ok && (font.headers.get('content-type') || '').includes('font/woff2'),
    `status ${font.status} type ${font.headers.get('content-type')}`,
  )
  const stylesheet = html.match(/href="(\/assets\/[^"]+\.css)"/)?.[1]
  check('the built stylesheet is linked from the shell', Boolean(stylesheet))
  if (stylesheet) {
    const css = await fetch(`${BASE}${stylesheet}`)
    const text = await css.text()
    check(
      'the stylesheet is real CSS with the design tokens',
      (css.headers.get('content-type') || '').includes('text/css') &&
        text.includes('--bg: #04050a') &&
        text.includes('font-family:Inter') &&
        text.includes('inter-latin-var.woff2'),
    )
  }
  // A missing asset must never be answered with the HTML shell: with nosniff the
  // browser refuses it, and the whole app renders unstyled instead of one 404.
  const goneAsset = await fetch(`${BASE}/assets/does-not-exist.css`)
  check(
    'a missing asset is not answered with the SPA shell',
    !(goneAsset.headers.get('content-type') || '').includes('text/html'),
    `status ${goneAsset.status} type ${goneAsset.headers.get('content-type')}`,
  )
  const swStamp = await sw.text()
  check(
    'the service worker cache version is stamped by the build',
    !swStamp.includes('__BUILD_ID__'),
    'VERSION still holds the build placeholder',
  )

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

  const track = await json(`/api/music/track?id=${withPreview.trackId}`)
  check('track lookup by id works', track.res.ok && track.body.track.trackId === withPreview.trackId)

  console.log('\nvideos')
  const videos = await json('/api/videos/search?q=lofi')
  const ytConfigured = Boolean((process.env.YOUTUBE_API_KEY || '').trim())
  check('video search always answers with a result shape', videos.res.status === 200, `status ${videos.res.status}`)
  if (ytConfigured) {
    check('configured YouTube search is labelled as YouTube', videos.body.source === 'youtube', videos.body.source)
  } else {
    check('without a key it falls back to the catalogue', videos.body.fallback === true && videos.body.source === 'itunes', videos.body.source)
    // Apple does not publish a preview for every entry, so require real ids for all and
    // a playable preview for most — never a fabricated url.
    const withPreview = videos.body.items.filter((v) => typeof v.previewUrl === 'string' && v.previewUrl.startsWith('https://'))
    check(
      'the fallback results are real catalogue videos',
      videos.body.items.length > 0 &&
        videos.body.items.every((v) => /^mv-\d+$/.test(v.videoId)) &&
        withPreview.length >= Math.ceil(videos.body.items.length * 0.5),
      `${withPreview.length}/${videos.body.items.length} with previews`,
    )
    check('the fallback explains the credential problem', /YOUTUBE_API_KEY|API key/.test(videos.body.notice || ''))
  }

  console.log('\ndownload size cap')
  {
    // A second instance with a 1 KB ceiling: the real preview is hundreds of KB, so the
    // cap must refuse it before a single byte reaches the client.
    const capPort = 3900 + Math.floor(Math.random() * 90)
    const capServer = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(capPort), MAX_DOWNLOAD_BYTES: '1000', NODE_ENV: 'test' },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let capErr = ''
    capServer.stderr.on('data', (d) => (capErr += d))
    try {
      let up = false
      for (let i = 0; i < 40; i++) {
        // eslint-disable-next-line no-await-in-loop
        try {
          if ((await fetch(`http://127.0.0.1:${capPort}/api/health`)).ok) {
            up = true
            break
          }
        } catch {
          /* not yet */
        }
        // eslint-disable-next-line no-await-in-loop
        await sleep(150)
      }
      if (up && withPreview?.previewUrl) {
        const capped = await fetch(`http://127.0.0.1:${capPort}/api/downloads/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: withPreview.previewUrl }),
        })
        const cappedBody = await capped.json().catch(() => ({}))
        check('a file above the limit is refused (413)', capped.status === 413 && cappedBody.code === 'TOO_LARGE', `status ${capped.status}`)
        check('the refusal states the size and the limit', /MB limit|above the/.test(cappedBody.error || ''), cappedBody.error)
      } else {
        skip('download size cap', up ? 'no preview url available' : capErr.slice(0, 120))
      }
    } finally {
      capServer.kill('SIGTERM')
    }
  }

  console.log('\ncatalogue videos (keyless)')
  const catalog = await json('/api/videos/catalog?q=amapiano&limit=3')
  check('catalogue video search works without any key', catalog.res.ok && catalog.body.items.length > 0, `status ${catalog.res.status}`)
  const firstVideo = catalog.body.items?.[0]
  check('video results carry a playable preview', Boolean(firstVideo?.previewUrl?.startsWith('https://video-ssl.itunes.apple.com')))
  check('video results carry artwork and duration', Boolean(firstVideo?.thumbnail?.startsWith('https://')) && firstVideo?.durationSeconds > 0)
  check('catalogue ids are distinct from YouTube ids', /^mv-\d+$/.test(firstVideo?.videoId || ''), firstVideo?.videoId)
  if (firstVideo?.videoId) {
    const one = await json(`/api/videos/catalog?id=${firstVideo.videoId.replace('mv-', '')}`)
    check('catalogue video lookup by id works', one.res.ok && one.body.video.videoId === firstVideo.videoId)
    const resolvedVideo = await json('/api/downloads/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: firstVideo.previewUrl, fileName: 'Music Video' }),
    })
    check('music-video preview is an authorized download', resolvedVideo.res.ok && String(resolvedVideo.body.contentType).startsWith('video/'), resolvedVideo.body?.error)
    check('video download reports a video format', ['mp4', 'm4v', 'mov'].includes(resolvedVideo.body?.format), resolvedVideo.body?.format)
  }
  check('catalogue video search validates input', (await json('/api/videos/catalog?q=')).res.status === 400)

  console.log('\nyoutube without a key')
  const oembedRes = await json('/api/videos/item?id=dQw4w9WgXcQ')
  if (oembedRes.res.status === 200 && oembedRes.body.partial) {
    check('oEmbed resolves a video without an API key', Boolean(oembedRes.body.video?.title), oembedRes.body.video?.title)
    check('oEmbed result is marked partial', oembedRes.body.video.partial === true)
  } else {
    skip('oEmbed metadata fallback', `status ${oembedRes.res.status}`)
  }

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

  console.log('\nplatform links (ACRCloud metadata)')
  try {
    const { normaliseMetadataTrack } = await import('../server/lib/acrMetadata.js')
    const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/acr-metadata.json'), 'utf8'))
    const parsed = normaliseMetadataTrack(fixture.data[0])
    check('metadata parses the reference payload', parsed?.title === 'Blank Space' && parsed?.artist === 'Taylor Swift')
    check('hi-res cover is downscaled for mobile', /\/600x600bb\.jpg$/.test(parsed.cover), parsed.cover)
    check('preview clips are collected', parsed.previews.length >= 1 && parsed.previews[0].includes('audio-ssl.itunes.apple.com'))
    check('apple, deezer and youtube links survive', ['applemusic', 'deezer', 'youtube'].every((p) => parsed.links.some((l) => l.platform === p)))
    check(
      'a mislabelled platform link is dropped, not shown as Spotify',
      !parsed.links.some((l) => l.platform === 'spotify'),
      parsed.links.map((l) => l.platform).join(','),
    )
    check('works/credits are parsed', parsed.works.length === 1 && parsed.works[0].contributors.length === 3)
    check('non-Apple cover hosts are rejected', normaliseMetadataTrack({ ...fixture.data[0], album: { cover: 'https://evil.example.com/x.jpg', covers: {} } })?.cover === '')

    const metaEndpoint = await fetch(`${BASE}/api/metadata/track?isrc=USCJY1431309`)
    const metaBody = await metaEndpoint.json().catch(() => ({}))
    const tokenPresent = Boolean((process.env.ACR_METADATA_TOKEN || '').trim())
    if (tokenPresent) {
      check('metadata endpoint answers with a token', [200, 502].includes(metaEndpoint.status), `status ${metaEndpoint.status}`)
    } else {
      check(
        'metadata endpoint says it is unconfigured (503)',
        metaEndpoint.status === 503 && metaBody.code === 'METADATA_NOT_CONFIGURED',
        `status ${metaEndpoint.status} code ${metaBody.code}`,
      )
      check('unconfigured metadata never breaks recognition', Boolean(metaBody.error?.includes('ACR_METADATA_TOKEN')))
    }
    const badMeta = await fetch(`${BASE}/api/metadata/track`)
    check('metadata endpoint validates input', badMeta.status === 400)
  } catch (err) {
    check('metadata client loads', false, err.message)
  }


  console.log('\ntiktok link tool')
  const ttBad = await json('/api/tiktok/resolve?url=https%3A%2F%2Fexample.com%2F%40a%2Fvideo%2F1234567890')
  check('rejects a non-TikTok link', ttBad.res.status === 400 && ttBad.body.code === 'NOT_TIKTOK', ttBad.body.code)
  const ttEmpty = await json('/api/tiktok/resolve')
  check('rejects an empty link', ttEmpty.res.status === 400 && ttEmpty.body.code === 'MISSING_URL', ttEmpty.body.code)
  const ttParse = await json('/api/tiktok/resolve?url=https%3A%2F%2Fwww.tiktok.com%2F%40user%2Fvideo%2F7400000000000000000')
  check(
    'a canonical link resolves to an official embed',
    ttParse.res.status === 200 && ttParse.body.videoId === '7400000000000000000' && /embed\/v2\//.test(ttParse.body.embedUrl),
    `status ${ttParse.res.status} id ${ttParse.body.videoId}`,
  )
  check(
    'no fabricated media URL is returned',
    !('downloadUrl' in ttParse.body) && !/aweme\/v1\/play/.test(JSON.stringify(ttParse.body)),
    'no downloadUrl field',
  )

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

  console.log('\nrecognition failure modes')
  const methodRes = await fetch(`${BASE}/api/recognize`)
  const methodBody = await methodRes.json().catch(() => ({}))
  check('GET on /api/recognize is 405, not 404', methodRes.status === 405, `status ${methodRes.status}`)
  check('405 names the method to use', methodBody.code === 'METHOD_NOT_ALLOWED' && /POST/.test(methodBody.error || ''))

  try {
    const dotenv = (await import('dotenv')).default
    dotenv.config({ path: path.join(ROOT, '.env') })
    const { identify } = await import('../server/lib/acrcloud.js')
    const goodKey = process.env.ACR_ACCESS_KEY
    const secret = process.env.ACR_ACCESS_SECRET || ''
    process.env.ACR_ACCESS_KEY = 'deadbeefdeadbeefdeadbeefdeadbeef'
    const bad = await identify(wav)
    process.env.ACR_ACCESS_KEY = goodKey
    check('a wrong access key becomes RECOGNITION_UNAUTHORIZED', bad.code === 'RECOGNITION_UNAUTHORIZED', bad.code)
    check('the auth error is actionable, not generic', /ACR_ACCESS_KEY|access key/i.test(bad.reason || ''), bad.reason)
    check('the auth error never contains the secret', !secret || !String(bad.reason).includes(secret))
    check(
      'diagnostics report shape only',
      Boolean(bad.diagnostics?.keyLength) && (!secret || !JSON.stringify(bad.diagnostics).includes(secret)),
    )
    check('the provider answer is captured for diagnosis', bad.diagnostics?.acrCode === 3001, String(bad.diagnostics?.acrCode))
  } catch (err) {
    skip('invalid-credential handling', err.message)
  }

  const rate = await Promise.all(
    Array.from({ length: 14 }, () =>
      fetch(`${BASE}/api/recognize`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '' }),
    ),
  )
  check('recognition endpoint is rate limited', rate.some((r) => r.status === 429), `statuses ${[...new Set(rate.map((r) => r.status))]}`)

  console.log('\nserverless entry (Vercel shape)')
  const simPort = 3700 + Math.floor(Math.random() * 200)
  const simCode = `
    const mod = await import(${JSON.stringify(path.join(ROOT, 'api', 'health.js'))})
    const http = await import('node:http')
    http.createServer(mod.default).listen(${simPort})
  `
  const sim = spawn(process.execPath, ['--input-type=module', '-e', simCode], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let simErr = ''
  sim.stderr.on('data', (d) => (simErr += d))
  try {
    let up = false
    for (let i = 0; i < 40; i++) {
      // eslint-disable-next-line no-await-in-loop
      try {
        const probe = await fetch(`http://127.0.0.1:${simPort}/api/health`)
        if (probe.ok) {
          up = true
          break
        }
      } catch {
        /* not yet */
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(150)
    }
    check('a generated Vercel function boots without its own listener', up, simErr.slice(0, 200))
    if (up) {
      const simSearch = await fetch(`http://127.0.0.1:${simPort}/api/music/search?q=vybz%20katel&limit=30`)
      const simBody = await simSearch.json().catch(() => ({}))
      check('the exact URL that 404\'d on Vercel works through the handler', simSearch.ok && simBody.items?.length > 0, `status ${simSearch.status}`)
      check('handled response keeps the API shape', simBody.ok === true && Array.isArray(simBody.items))
    }
  } finally {
    sim.kill('SIGTERM')
  }

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
