import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App.jsx'
import { LibraryProvider } from './context/LibraryContext.jsx'
import { PlayerProvider } from './context/PlayerContext.jsx'
import { DownloadsProvider } from './context/DownloadsContext.jsx'
import './styles/base.css'
import './styles/app.css'
import { applyTheme, watchSystemTheme } from './lib/theme.js'
import { LanguageProvider } from './i18n/LanguageProvider.jsx'
import { applyLanguage, readLanguagePreference } from './i18n/index.js'
import { checkForUpdate, isNativeApp } from './lib/platform.js'
import { initNative, notify } from './lib/native.js'

const root = createRoot(document.getElementById('root'))

/**
 * Two routers, one route table.
 *
 * The APK loads its bundle from the WebView's own origin, where a deep path like
 * /settings/language is not a file and there is no server to rewrite it to index.html.
 * History routing therefore 404s on reload and on every in-app link that the shell
 * re-enters. Hash routing keeps every route inside the document, which the app controls.
 * The website keeps clean URLs because it is still served by a host that rewrites.
 */
const Router = isNativeApp() ? HashRouter : BrowserRouter

const render = () =>
  root.render(
    <React.StrictMode>
      <Router>
        <LanguageProvider>
          <LibraryProvider>
            <PlayerProvider>
              <DownloadsProvider>
                <App />
              </DownloadsProvider>
            </PlayerProvider>
          </LibraryProvider>
        </LanguageProvider>
      </Router>
    </React.StrictMode>,
  )

// The stored language is applied before the first paint, so someone who chose Japanese
// never watches the interface assemble itself in English. A catalogue that fails to
// load simply leaves English in place — it must never block the app from starting.
applyLanguage(readLanguagePreference())
  .catch(() => undefined)
  .then(render)

// index.html already applied the stored theme before paint; this keeps 'system'
// honest if the device appearance changes while the app is open.
applyTheme()
watchSystemTheme()

// Native shell: hardware back, status bar, notification channel.
if (isNativeApp()) {
  initNative().catch((err) => console.warn('[native] boot failed', err?.message))

  // The APK cannot reload itself into a new version the way a tab can, so the only
  // honest place to notice one is at launch. A failed check (offline, server down) is
  // silent — an update prompt is never worth breaking the app for.
  window.setTimeout(() => {
    checkForUpdate()
      .then((result) => {
        if (!result.update) return
        notify({
          title: `JIMMY STATE ${result.manifest.version} is available`,
          body: 'Open Settings → App update to install it. Your library and downloads are kept.',
          id: 4242,
        }).catch(() => undefined)
      })
      .catch(() => undefined)
  }, 4000)
}

if ('serviceWorker' in navigator && import.meta.env.PROD && !isNativeApp()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // A new service worker that is installed but waiting means the open tab is
        // still running the previous build. Reloading once picks up the new one; the
        // guard stops an update loop if two builds land back to back.
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing
          if (!worker) return
          worker.addEventListener('statechange', () => {
            if (worker.state !== 'installed') return
            if (!navigator.serviceWorker.controller) return
            window.dispatchEvent(new CustomEvent('jimmy-state:update-ready'))
          })
        })
        // Check once an hour so a long-lived tab learns about a deploy without reloading.
        window.setInterval(() => registration.update().catch(() => undefined), 60 * 60 * 1000)
      })
      .catch((err) => {
        console.warn('[jimmy-state] service worker registration failed', err)
      })
  })
}
