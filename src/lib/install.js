import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * PWA installation state.
 *
 * - The banner is only shown when the browser actually fired beforeinstallprompt.
 *   No event means no programmatic install: we show nothing rather than a fake button.
 * - Dismissal is stored with a timestamp; the banner stays away for 5 hours.
 * - A successful install (or an already-installed app) hides it permanently.
 *   Re-detection happens on every load, so uninstalling later can bring it back.
 */

export const DISMISS_KEY = 'js.install.dismissedAt'
export const INSTALLED_KEY = 'js.install.installed'
export const DISMISS_WINDOW_MS = 5 * 60 * 60 * 1000

export function isStandalone() {
  if (typeof window === 'undefined') return false
  const modes = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay']
  return (
    modes.some((m) => window.matchMedia?.(`(display-mode: ${m})`)?.matches) ||
    window.navigator.standalone === true ||
    document.referrer.startsWith('android-app://')
  )
}

function readNumber(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? Number(raw) : 0
  } catch {
    return 0
  }
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [installed, setInstalled] = useState(false)
  const [dismissedAt, setDismissedAt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    setDismissedAt(readNumber(DISMISS_KEY))

    const standalone = isStandalone()
    let flagged = false
    try {
      flagged = localStorage.getItem(INSTALLED_KEY) === '1'
    } catch {
      flagged = false
    }
    if (standalone) {
      setInstalled(true)
      try {
        localStorage.setItem(INSTALLED_KEY, '1')
      } catch {
        /* ignore */
      }
    } else if (flagged) {
      setInstalled(true)
    }

    const onPrompt = (event) => {
      event.preventDefault()
      if (cancelled) return
      setDeferred(event)
      setReady(true)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
      try {
        localStorage.setItem(INSTALLED_KEY, '1')
        localStorage.removeItem(DISMISS_KEY)
      } catch {
        /* ignore */
      }
    }
    const onDisplayChange = () => {
      if (isStandalone()) onInstalled()
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    const mq = window.matchMedia?.('(display-mode: standalone)')
    mq?.addEventListener?.('change', onDisplayChange)

    // Chrome: an installed related app is definitive proof of installation.
    navigator
      .getInstalledRelatedApps?.()
      .then((apps) => {
        if (!cancelled && Array.isArray(apps) && apps.length > 0) onInstalled()
      })
      .catch(() => {})

    // beforeinstallprompt can fire after load; stop waiting after a moment.
    const t = setTimeout(() => !cancelled && setReady(true), 2500)

    // Keep the 5-hour window honest without polling aggressively.
    const tick = setInterval(() => setNow(Date.now()), 60_000)

    return () => {
      cancelled = true
      clearTimeout(t)
      clearInterval(tick)
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      mq?.removeEventListener?.('change', onDisplayChange)
    }
  }, [])

  const dismiss = useCallback(() => {
    const ts = Date.now()
    setDismissedAt(ts)
    setNow(ts)
    try {
      localStorage.setItem(DISMISS_KEY, String(ts))
    } catch {
      /* ignore */
    }
  }, [])

  const install = useCallback(async () => {
    if (!deferred) {
      return { outcome: 'unavailable' }
    }
    setBusy(true)
    try {
      deferred.prompt()
      const choice = await deferred.userChoice
      setDeferred(null)
      if (choice?.outcome === 'accepted') {
        setInstalled(true)
        try {
          localStorage.setItem(INSTALLED_KEY, '1')
          localStorage.removeItem(DISMISS_KEY)
        } catch {
          /* ignore */
        }
        return { outcome: 'accepted' }
      }
      // Declining the OS dialog counts as a dismissal, not a permanent opt-out.
      const ts = Date.now()
      setDismissedAt(ts)
      setNow(ts)
      try {
        localStorage.setItem(DISMISS_KEY, String(ts))
      } catch {
        /* ignore */
      }
      return { outcome: 'dismissed' }
    } catch (err) {
      return { outcome: 'error', message: err?.message || 'Installation could not start.' }
    } finally {
      setBusy(false)
    }
  }, [deferred])

  const available = Boolean(deferred)
  const withinDismissWindow = dismissedAt > 0 && now - dismissedAt < DISMISS_WINDOW_MS

  return {
    canInstall: available,
    available,
    installed,
    busy,
    ready,
    dismissedAt,
    withinDismissWindow,
    showBanner: available && !installed && !withinDismissWindow,
    install,
    dismiss,
    hoursLeft: withinDismissWindow
      ? Math.max(0, Math.ceil((DISMISS_WINDOW_MS - (now - dismissedAt)) / 3_600_000))
      : 0,
  }
}

export function useInstallState() {
  return useMemo(() => ({ standalone: isStandalone() }), [])
}
