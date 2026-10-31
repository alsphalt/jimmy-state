/**
 * Client download transport tests.
 *
 * fetchWithProgress is the piece that decides whether a user sees a real progress bar,
 * a clear cancel, or a bar frozen forever. It runs in the browser, but it only needs
 * fetch/Blob/AbortController — all available in Node — so it can be tested against a
 * local server instead of a phone.
 *
 *   node tests/download-client.mjs
 */
import http from 'node:http'
import { fetchWithProgress } from '../src/lib/download.js'

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

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/file')) {
    const total = 64 * 1024
    res.writeHead(200, { 'Content-Type': 'audio/mp4', 'Content-Length': String(total) })
    let sent = 0
    const timer = setInterval(() => {
      if (sent >= total) {
        clearInterval(timer)
        res.end()
        return
      }
      res.write(Buffer.alloc(8192, 1))
      sent += 8192
    }, 20)
    return
  }
  if (req.url.startsWith('/stall')) {
    res.writeHead(200, { 'Content-Type': 'audio/mp4', 'Content-Length': '65536' })
    res.write(Buffer.alloc(4096, 1))
    // then nothing — models a source that accepts the connection and dies quietly
    return
  }
  if (req.url.startsWith('/big')) {
    res.writeHead(200, { 'Content-Type': 'audio/mp4' }) // no Content-Length at all
    let sent = 0
    const timer = setInterval(() => {
      res.write(Buffer.alloc(64 * 1024, 1))
      sent += 64 * 1024
      if (sent > 2 * 1024 * 1024) {
        clearInterval(timer)
        res.end()
      }
    }, 5)
    return
  }
  if (req.url.startsWith('/missing')) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'The source refused the file.' }))
    return
  }
  res.writeHead(404).end()
})

await new Promise((resolve) => server.listen(0, resolve))
const base = `http://127.0.0.1:${server.address().port}`

try {
  console.log('\ndownload transport')

  const seen = []
  const blob = await fetchWithProgress(`${base}/file`, {
    onProgress: (p) => seen.push(p.percent),
  })
  check('completes and returns the whole body', blob.size === 64 * 1024, `${blob.size} bytes`)
  check('reports progress while streaming', seen.length > 2 && seen.at(-1) === 100, `${seen.length} updates, last ${seen.at(-1)}`)
  check('progress is monotonic', seen.every((v, i, a) => i === 0 || v >= a[i - 1]))

  const missing = await fetchWithProgress(`${base}/missing`).catch((e) => e)
  check('an upstream error surfaces its own message', missing.code === 'DOWNLOAD_HTTP' && /refused/.test(missing.message), missing.message)

  const controller = new AbortController()
  controller.abort()
  const aborted = await fetchWithProgress(`${base}/big`, { signal: controller.signal }).catch((e) => e)
  check('cancel aborts before transferring', aborted?.name === 'AbortError' || aborted?.code !== 'DOWNLOAD_STALLED', aborted?.message)

  const t0 = Date.now()
  const stalled = await fetchWithProgress(`${base}/stall`, { idleTimeoutMs: 400 }).catch((e) => e)
  const elapsed = Date.now() - t0
  check('a stalled source fails instead of hanging', stalled.code === 'DOWNLOAD_STALLED', stalled.code)
  check('the stall is detected close to the threshold', elapsed < 3000, `${elapsed}ms`)
  check('the stall message tells the user what to do', /no data arrived/i.test(stalled.message) && /retry/i.test(stalled.message))
} finally {
  server.close()
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exitCode = failed ? 1 : 0
