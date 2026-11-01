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
