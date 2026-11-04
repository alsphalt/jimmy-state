/* JIMMY STATE service worker — app shell + static assets only.
 *
 * Deliberately NOT cached: /api/* (recognition, search, downloads). Those must fail
 * loudly when offline instead of serving a stale "match". Audio previews and video
 * streams are also left to the network so nothing large is preloaded.
 */

/* Stamped at build time by stampServiceWorker() in vite.config.js with the package
 * version plus a per-build id, e.g. js-1.1.1-m8f2k1. The cache names are derived
 * from it, so every deploy gets fresh caches and activate() deletes the previous
 * ones. A hand-pinned version is what let an old index.html survive a deploy that
 * had already deleted the stylesheet it pointed at: the browser requested a
 * missing CSS file, the static host answered with the SPA shell, nosniff refused
 * it, and the app rendered completely unstyled. Keep this derived, never fixed.
 *
 * The literal placeholder is only ever seen by a dev server, which does not
 * register the worker (registration is PROD-only). */
const VERSION = 'js-__BUILD_ID__'
const SHELL_CACHE = `${VERSION}-shell`
const ASSET_CACHE = `${VERSION}-assets`

const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/favicon.svg',
  // The design face, so an offline launch still renders in Inter rather than the
  // device's default sans.
  '/fonts/inter-latin-var.woff2',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response && response.status === 200 && response.type === 'basic') {
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    const shell = await caches.match('/')
    if (shell) return shell
    return new Response(
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#04050a;color:#f2f4fb;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="letter-spacing:.14em">JIMMY STATE</h1><p style="color:#a4abc0">You are offline and this page is not cached yet.</p></div></body>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
    )
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response && response.status === 200) cache.put(request, response.clone())
      return response
    })
    .catch(() => null)
  return cached || network || new Response('', { status: 504 })
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Never intercept API traffic or cross-origin media/players.
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE))
    return
  }

  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js')
  ) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE))
  }
})
