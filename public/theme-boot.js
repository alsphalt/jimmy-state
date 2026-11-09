/* Applies the stored theme before the first paint.
 *
 * This has to be a separate file rather than an inline <script>: the site's CSP is
 * script-src 'self', so an inline block is refused outright (and logs a violation on
 * every page). Loaded synchronously from <head>, it still runs before the body paints,
 * which is what stops a light-theme user seeing a black flash.
 *
 * Kept dependency-free and ES5-only: it runs before any bundler polyfill exists.
 */
(function () {
  try {
    var pref = localStorage.getItem('jimmy-state:theme') || 'dark'
    var isLight =
      pref === 'light' ||
      (pref === 'system' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: light)').matches)
    var theme = isLight ? 'light' : 'dark'
    var root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.style.colorScheme = theme
    var color = document.querySelector('meta[name="theme-color"]')
    if (color) color.setAttribute('content', theme === 'light' ? '#f4f5fa' : '#05060a')
    var scheme = document.querySelector('meta[name="color-scheme"]')
    if (scheme) scheme.setAttribute('content', theme)
  } catch (e) {
    /* blocked storage (private mode, embedded webview): fall through to the dark default */
  }
})()

/* Boot watchdog.
 *
 * A deploy replaces the hashed bundle; a client that still holds the previous
 * index.html (or a half-updated service-worker cache) can end up with a document whose
 * script no longer exists. Nothing throws on screen — the page simply stays as it was
 * painted, which reads as a black app.
 *
 * Eight seconds after load, if the boot mark is still the only thing in #root, React
 * never mounted. Rather than leave a dead screen, offer the one action that fixes it:
 * drop the caches and the worker, then reload. Runs only in that failure case.
 */
;(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  var wait = 8000
  function stuck() {
    var root = document.getElementById('root')
    if (!root) return
    if (!root.querySelector('.js-boot')) return
    var wrap = document.createElement('div')
    wrap.className = 'js-boot'
    wrap.setAttribute('role', 'alert')
    var title = document.createElement('span')
    title.className = 'js-boot-mark'
    title.textContent = 'JIMMY STATE'
    var note = document.createElement('span')
    note.style.cssText = 'font-size:11px;letter-spacing:.04em;text-indent:0;opacity:.75;max-width:240px;text-align:center'
    note.textContent = 'The app did not start. Reloading usually fixes it.'
    var btn = document.createElement('button')
    btn.textContent = 'Reload app'
    btn.style.cssText =
      'margin-top:6px;padding:10px 18px;border-radius:999px;border:1px solid rgba(199,125,255,.5);' +
      'background:#8300ff;color:#fff;font:600 13px system-ui;letter-spacing:0;text-indent:0;cursor:pointer'
    btn.onclick = function () {
      btn.disabled = true
      btn.textContent = 'Reloading…'
      var done = function () {
        window.location.reload()
      }
      try {
        if (window.caches && caches.keys) {
          caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) { return caches.delete(k) }))
          }).then(function () {
            if (!navigator.serviceWorker) return done()
            return navigator.serviceWorker.getRegistrations().then(function (regs) {
              return Promise.all(regs.map(function (r) { return r.unregister() }))
            })
          }).then(done).catch(done)
        } else {
          done()
        }
      } catch (e) {
        done()
      }
    }
    wrap.appendChild(title)
    wrap.appendChild(note)
    wrap.appendChild(btn)
    root.innerHTML = ''
    root.appendChild(wrap)
  }
  window.setTimeout(stuck, wait)
})();
