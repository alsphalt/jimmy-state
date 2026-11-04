import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

/**
 * Stamp dist/sw.js with a per-build id.
 *
 * The service worker's cache names derive from its VERSION constant, so a build id
 * that changes on every deploy is what makes activate() evict the previous shell and
 * its assets. Without it a returning browser can hold an index.html whose hashed
 * stylesheet no longer exists, which renders the entire app unstyled.
 *
 * public/ is copied verbatim, so the placeholder is replaced after the bundle is
 * written. A build that has no placeholder is left untouched (nothing to stamp).
 */
function stampServiceWorker() {
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    closeBundle() {
      const file = path.join(ROOT, 'dist', 'sw.js')
      if (!fs.existsSync(file)) return
      const source = fs.readFileSync(file, 'utf8')
      if (!source.includes('__BUILD_ID__')) return
      const id = `${pkg.version}-${Date.now().toString(36)}`
      fs.writeFileSync(file, source.replaceAll('__BUILD_ID__', id))
    },
  }
}

/**
 * Dev-server host allowlist.
 *
 * Vite rejects requests whose Host header is not localhost / 127.0.0.1 (DNS-rebinding
 * protection), which is what produces:
 *   "Blocked request. This host (...) is not allowed."
 * when the dev server is reached through a tunnel or a hosted sandbox domain.
 *
 * Entries starting with "." match any subdomain. Add your own with
 * ALLOWED_HOSTS="my-host.example.com,my-other-host" — do NOT set allowedHosts: true,
 * which switches the protection off entirely.
 */
const extraHosts = String(process.env.ALLOWED_HOSTS || process.env.VITE_ALLOWED_HOSTS || '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean)

const allowedHosts = [
  'sb-78xhxljtwtq7.vercel.run', // current sandbox preview host
  '.vercel.run', // any Vercel sandbox instance
  '.vercel.app', // Vercel preview / production aliases
  ...extraHosts,
]

/**
 * When the dev server is reached through an https tunnel, the HMR websocket must also
 * use wss on the proxy's port. Opt in with VITE_HMR_WSS=1 (not enabled by default so
 * plain localhost dev keeps working).
 */
const hmr = process.env.VITE_HMR_WSS === '1'
  ? { protocol: 'wss', clientPort: Number(process.env.VITE_HMR_PORT || 443) }
  : undefined

/**
 * When the API process is not running, the proxy fails with an opaque 500/ECONNREFUSED
 * and the browser reports "Request failed". Answer with JSON instead so the app can say
 * what is actually wrong.
 */
const apiProxy = {
  target: process.env.VITE_API_PROXY || 'http://localhost:3001',
  changeOrigin: true,
  configure: (proxy) => {
    proxy.on('error', (_err, _req, res) => {
      if (!res || res.headersSent || typeof res.writeHead !== 'function') return
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          ok: false,
          code: 'API_UNREACHABLE',
          error:
            'The API server is not running on the proxy target. Start it with "npm run dev" (API + app), or run "npm run dev:api".',
        }),
      )
    })
  },
}

/**
 * The app compares its own build against the published manifest (public/app/version.json)
 * to offer an update. Baked in at build time so the running bundle always knows its
 * exact version, even offline.
 */
const [vMajor = 0, vMinor = 0, vPatch = 0] = String(pkg.version).split('.').map(Number)

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  // One version string for all three targets. platform.js reads both to compare the
  // running build against the published update manifest.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Same fold as scripts/build-version.mjs — Android needs a monotonic integer.
    __APP_VERSION_CODE__: JSON.stringify(vMajor * 1_000_000 + vMinor * 1_000 + vPatch),
  },
  server: {
    // Deliberately not process.env.PORT: the API server owns that variable.
    port: Number(process.env.VITE_PORT || 5173),
    host: true,
    // Required when the browser reaches this server through an https proxy.
    strictPort: false,
    allowedHosts,
    hmr,
    proxy: { '/api': apiProxy },
  },
  preview: {
    port: 4173,
    host: true,
    allowedHosts,
    proxy: { '/api': apiProxy },
  },
  build: {
    target: 'es2019',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
})
