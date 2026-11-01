import { createServer } from 'vite'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { LibraryProvider } = await vite.ssrLoadModule('/src/context/LibraryContext.jsx')
const { PlayerProvider } = await vite.ssrLoadModule('/src/context/PlayerContext.jsx')
const { DownloadsProvider } = await vite.ssrLoadModule('/src/context/DownloadsContext.jsx')
const { default: App } = await vite.ssrLoadModule('/src/App.jsx')
const h = React.createElement
try {
  const st = renderToString(h(MemoryRouter, { initialEntries: ['/settings'] }, h(LibraryProvider, null, h(PlayerProvider, null, h(DownloadsProvider, null, h(App))))))
  console.log('rendered', st.length, 'bytes')
  console.log('Dark/Light/System:', ['Dark','Light','System'].every((l) => st.includes(l)))
  console.log('old cards gone:', !/ACRCloud|Erase local library|Export library/.test(st))
} catch (e) { console.log('ERROR:', e.message) }
await vite.close()
