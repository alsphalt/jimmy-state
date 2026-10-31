/**
 * Renders every route on the server to catch component-level crashes (bad imports,
 * undefined components, hook misuse) that a successful `vite build` cannot detect.
 *
 * Effects do not run in SSR, so this checks the first paint of each page: exactly the
 * state a first-time visitor gets before any data arrives.
 *
 *   node tests/ssr-smoke.mjs
 */
import { createServer } from 'vite'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const ROUTES = [
  '/',
  '/discover',
  '/identify',
  '/videos',
  '/watch/dQw4w9WgXcQ',
  '/watch/mv-1440933517',
  '/library',
  '/library?tab=favourites',
  '/library?tab=downloads',
  '/downloads',
  '/search',
  '/search?q=amapiano&mode=music',
  '/song/test%3A%3Aartist',
  '/settings',
  '/privacy',
  '/playlists',
  '/watch-later',
  '/results/missing-id',
  '/nope',
]

const vite = await createServer({
  root: ROOT,
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
  logLevel: 'error',
})

let failed = 0
try {
  // React itself is imported by Node (vite externalises it for SSR), so the app
  // modules and this test share one React instance.
  const { renderToString } = ReactDOMServer
  const { LibraryProvider } = await vite.ssrLoadModule('/src/context/LibraryContext.jsx')
  const { PlayerProvider } = await vite.ssrLoadModule('/src/context/PlayerContext.jsx')
  const { DownloadsProvider } = await vite.ssrLoadModule('/src/context/DownloadsContext.jsx')
  const { default: App } = await vite.ssrLoadModule('/src/App.jsx')

  const { createElement: h } = React

  for (const route of ROUTES) {
    try {
      const tree = h(
        MemoryRouter,
        { initialEntries: [route] },
        h(LibraryProvider, null, h(PlayerProvider, null, h(DownloadsProvider, null, h(App)))),
      )
      const html = renderToString(tree)
      const ok = html.length > 800 && html.includes('JIMMY STATE')
      console.log(`${ok ? '  ✓' : '  ✗'} ${route} (${html.length} bytes)`)
      if (!ok) failed += 1
    } catch (err) {
      failed += 1
      console.log(`  ✗ ${route} — ${err.message}`)
      if (process.env.VERBOSE) console.log(err.stack)
    }
  }

  // A route that renders the logo must include the SVG mark, not a placeholder.
  const home = renderToString(
    h(MemoryRouter, { initialEntries: ['/'] }, h(LibraryProvider, null, h(PlayerProvider, null, h(DownloadsProvider, null, h(App))))),
  )
  const hasLogo = home.includes('aria-label="JIMMY STATE"') && home.includes('<svg')
  console.log(`${hasLogo ? '  ✓' : '  ✗'} home renders the D mark inline`)
  if (!hasLogo) failed += 1

  const hasNav = ['Home', 'Discover', 'Identify', 'Videos', 'Library'].every((l) => home.includes(l))
  console.log(`${hasNav ? '  ✓' : '  ✗'} bottom navigation renders all five items`)
  if (!hasNav) failed += 1

  const hasIdentifyCta = home.includes('Identify Any Song')
  console.log(`${hasIdentifyCta ? '  ✓' : '  ✗'} “Identify Any Song” call to action present`)
  if (!hasIdentifyCta) failed += 1
} finally {
  await vite.close()
}

console.log(failed ? `\n${failed} render check(s) failed` : '\nall render checks passed')
process.exitCode = failed ? 1 : 0
