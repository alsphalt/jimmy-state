/**
 * Theme preference: 'dark' | 'light' | 'system'.
 *
 * 'system' is stored as itself, never resolved to a fixed value, so a device that
 * switches at sunset keeps following it. The resolved theme is written to
 * <html data-theme> — CSS keys off that attribute, the tokens themselves live in base.css.
 */
const KEY = 'jimmy-state:theme'
export const THEME_VALUES = ['dark', 'light', 'system']

const THEME_COLOR = { dark: '#05060a', light: '#f4f5fa' }

const systemQuery = () =>
  typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null

export function readTheme() {
  try {
    const stored = localStorage.getItem(KEY)
    return THEME_VALUES.includes(stored) ? stored : 'dark'
  } catch {
    return 'dark'
  }
}

export function resolveTheme(pref = readTheme()) {
  if (pref === 'system') return systemQuery()?.matches ? 'light' : 'dark'
  return pref === 'light' ? 'light' : 'dark'
}

/** Writes the resolved theme to the document. Safe to call before React mounts. */
export function applyTheme(pref = readTheme()) {
  if (typeof document === 'undefined') return 'dark'
  const resolved = resolveTheme(pref)
  const root = document.documentElement
  root.dataset.theme = resolved
  // Native widgets (scrollbars, form controls, the iOS status bar) follow this.
  root.style.colorScheme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[resolved])
  return resolved
}

export function setTheme(pref) {
  const next = THEME_VALUES.includes(pref) ? pref : 'dark'
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* private mode: the choice just will not survive a reload */
  }
  const resolved = applyTheme(next)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('jimmy-state:theme', { detail: { pref: next, resolved } }))
  }
  return resolved
}

/**
 * Keeps 'system' honest while the app is open: when the device flips, the UI follows.
 * Returns an unsubscribe function.
 */
export function watchSystemTheme(onChange) {
  const query = systemQuery()
  if (!query) return () => {}
  const handler = () => {
    if (readTheme() !== 'system') return
    const resolved = applyTheme('system')
    onChange?.(resolved)
  }
  if (query.addEventListener) {
    query.addEventListener('change', handler)
    return () => query.removeEventListener('change', handler)
  }
  query.addListener(handler)
  return () => query.removeListener(handler)
}

export const THEME_OPTIONS = [
  { value: 'dark', label: 'Dark', note: 'Black glass with neon accents — the original look.' },
  { value: 'light', label: 'Light', note: 'Bright surfaces, same accents, easier outdoors.' },
  { value: 'system', label: 'System', note: 'Follows your device appearance setting.' },
]
