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
  '/search?q=amapiano&mode=videos',
  '/song/test%3A%3Aartist',
  '/settings',
  '/services',
  '/privacy',
  '/tools/tiktok',
  '/tools/tube',
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
      // Jimmy Tube shows its own brand instead of the app header, on purpose.
      const ok = html.length > 800 && (html.includes('JIMMY STATE') || html.includes('JIMMY'))
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

  const watchHtml = renderToString(
    h(
      MemoryRouter,
      { initialEntries: ['/watch/dQw4w9WgXcQ'] },
      h(LibraryProvider, null, h(PlayerProvider, null, h(DownloadsProvider, null, h(App)))),
    ),
  )
  const fullVideoLabel = watchHtml.includes('Full video')
  console.log(`${fullVideoLabel ? '  ✓' : '  ✗'} watch page labels full-length YouTube playback`)
  if (!fullVideoLabel) failed += 1

  // Jimmy Tube owns its header and compact nav; the app chrome must not render there.
  const tubeHtml = renderToString(
    h(
      MemoryRouter,
      { initialEntries: ['/tools/tube'] },
      h(LibraryProvider, null, h(PlayerProvider, null, h(DownloadsProvider, null, h(App)))),
    ),
  )
  const noDoubleNav = tubeHtml.includes('class="tube-nav"') && !tubeHtml.includes('class="bottom-nav"')
  console.log(`${noDoubleNav ? '  ✓' : '  ✗'} Jimmy Tube has one nav, not two`)
  if (!noDoubleNav) failed += 1

  const hasNav = ['Home', 'Discover', 'Identify', 'Videos', 'Library'].every((l) => home.includes(l))
  console.log(`${hasNav ? '  ✓' : '  ✗'} bottom navigation renders all five items`)
  if (!hasNav) failed += 1

  // The recognition panel belongs to /identify only.
  const homeHasPanel = home.includes('Identify Any Song') || home.includes('d-stage') || home.includes('rec-timer')
  console.log(`${!homeHasPanel ? '  ✓' : '  ✗'} home has no recognition panel`)
  if (homeHasPanel) failed += 1

  const identifyHtml = renderToString(
    h(
      MemoryRouter,
      { initialEntries: ['/identify'] },
      h(LibraryProvider, null, h(PlayerProvider, null, h(DownloadsProvider, null, h(App)))),
    ),
  )
  const identifyHasPanel = identifyHtml.includes('Identify Any Song') && identifyHtml.includes('d-stage')
  console.log(`${identifyHasPanel ? '  ✓' : '  ✗'} identify page renders the recognition panel`)
  if (!identifyHasPanel) failed += 1

  const homeLeadsToIdentify = home.includes('href="/identify"')
  console.log(`${homeLeadsToIdentify ? '  ✓' : '  ✗'} home links to the identify page`)
  if (!homeLeadsToIdentify) failed += 1
} finally {
  await vite.close()
}

console.log(failed ? `\n${failed} render check(s) failed` : '\nall render checks passed')
process.exitCode = failed ? 1 : 0
