import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { LibraryProvider } from './context/LibraryContext.jsx'
import { PlayerProvider } from './context/PlayerContext.jsx'
import { DownloadsProvider } from './context/DownloadsContext.jsx'
import './styles/base.css'
import './styles/app.css'
import { applyTheme, watchSystemTheme } from './lib/theme.js'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LibraryProvider>
        <PlayerProvider>
          <DownloadsProvider>
            <App />
          </DownloadsProvider>
        </PlayerProvider>
      </LibraryProvider>
    </BrowserRouter>
  </React.StrictMode>,
)

// index.html already applied the stored theme before paint; this keeps 'system'
// honest if the device appearance changes while the app is open.
applyTheme()
watchSystemTheme()

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[jimmy-state] service worker registration failed', err)
    })
  })
}
