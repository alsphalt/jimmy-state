import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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

export default defineConfig({
  plugins: [react()],
  server: {
    // Deliberately not process.env.PORT: the API server owns that variable.
    port: Number(process.env.VITE_PORT || 5173),
    host: true,
    // Required when the browser reaches this server through an https proxy.
    strictPort: false,
    allowedHosts,
    hmr,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    host: true,
    allowedHosts,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
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
