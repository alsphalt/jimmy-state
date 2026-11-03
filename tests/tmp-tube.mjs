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
const html = (path) => renderToString(h(MemoryRouter, { initialEntries: [path] }, h(LibraryProvider, null, h(PlayerProvider, null, h(DownloadsProvider, null, h(App))))))
const tube = html('/tools/tube')
console.log('heading      :', tube.includes('Jimmy Tube'))
console.log('search field :', /placeholder="Songs, artists, mixes/.test(tube))
console.log('quick chips  :', (tube.match(/Amapiano mix|Afrobeats 2026|Gospel worship/g) || []).length)
console.log('start empty  :', tube.includes('Start with a search'))
console.log('no downloads :', !/Download video|download mp3/i.test(tube))
const draw = html('/')
console.log('drawer entry :', draw.includes('Jimmy Tube') && draw.includes('/tools/tube'))
await vite.close()
