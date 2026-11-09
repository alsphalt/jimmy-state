/**
 * One app, three delivery targets.
 *
 * Website (a browser tab), PWA (installed from the browser) and the Android APK
 * (a Capacitor shell around the same `dist/`) all run this bundle. This module is
 * the only place that answers "where am I running?" and "is there a newer build?".
 *
 * Device features — saving files, notifications, microphone warm-up, hardware back —
 * live in `native.js`. Keeping the split means there is exactly one implementation
 * of each behaviour, whichever platform calls it.
 */
import { API_BASE } from './api.js'

/* ------------------------------------------------------------- detection */

/** True inside the packaged Android app, false in a browser tab or an installed PWA. */
export function isNativeApp() {
  if (typeof window === 'undefined') return false
  const cap = window.Capacitor
  if (!cap) return false
  if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform()
  if (typeof cap.getPlatform === 'function') return cap.getPlatform() !== 'web'
  return false
}

/** Evaluated once at module load; the platform cannot change while the app runs. */
export const IS_NATIVE_APP = isNativeApp()

/** 'android' inside the APK, 'pwa' when installed to the home screen, else 'web'. */
export function platformName() {
  if (IS_NATIVE_APP) return 'android'
  if (typeof window === 'undefined') return 'web'
  const standalone =
    window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true
  return standalone ? 'pwa' : 'web'
}

export const PLATFORM = platformName()

/** The web bundle's own version — the same string the APK manifest carries. */
export const APP_VERSION =
  (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) || '1.1.0'

/**
 * The same folded integer the Android build uses (see scripts/build-version.mjs), so the
 * website and the PWA compare like-for-like instead of always finding themselves out of
 * date in front of an integer they can never reach.
 */
export const APP_VERSION_CODE =
  typeof __APP_VERSION_CODE__ === 'number' ? __APP_VERSION_CODE__ : 0

/* ------------------------------------------------------- installer bridge */

const pluginCache = new Map()

/**
 * The custom plugin declared in android/app/src/main/java/.../AppUpdaterPlugin.java.
 * It is absent on the web, which is why every call site treats it as optional.
 */
async function appUpdater() {
  if (!IS_NATIVE_APP) return null
  if (pluginCache.has('AppUpdater')) return pluginCache.get('AppUpdater')
  const plugin = (async () => {
    try {
      const { registerPlugin } = await import('@capacitor/core')
      return registerPlugin('AppUpdater')
    } catch {
      return null
    }
  })()
  pluginCache.set('AppUpdater', plugin)
  return plugin
}

/** Installed version of the native app (package manager), or null on the web. */
export async function getAppInfo() {
  const updater = await appUpdater()
  if (updater?.getInfo) {
    try {
      return await updater.getInfo()
    } catch {
      /* fall through to the App plugin */
    }
  }
  if (!IS_NATIVE_APP) return null
  try {
    const { App } = await import('@capacitor/app')
    const info = await App.getInfo()
    return { versionName: info.version, versionCode: Number(info.build) || 0, packageName: '' }
  } catch {
    return null
  }
}

/** True when Android will let this app open the package installer. */
export async function canInstallApk() {
  const updater = await appUpdater()
  if (!updater?.canInstall) return false
  try {
    const result = await updater.canInstall()
    return Boolean(result?.canInstall)
  } catch {
    return false
  }
}

/** Opens the per-app "install unknown apps" toggle. */
export async function openInstallPermission() {
  const updater = await appUpdater()
  try {
    await updater?.openInstallPermission?.()
    return true
  } catch {
    return false
  }
}

/** Opens the app's system settings — where a denied microphone is re-granted. */
export async function openAppSettings() {
  const updater = await appUpdater()
  try {
    await updater?.openAppSettings?.()
    return true
  } catch {
    return false
  }
}

/** Hands an already-downloaded .apk to the system package installer. */
export async function installApk(path) {
  const updater = await appUpdater()
  if (!updater?.install) {
    throw Object.assign(new Error('Installing an update needs the Android app.'), { code: 'NO_INSTALLER' })
  }
  return updater.install({ path })
}

/** Opens a URL outside the app: the system browser on Android, a new tab on the web. */
export function openExternal(url) {
  if (typeof window === 'undefined' || !url) return false
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  return true
}

/* ---------------------------------------------------------------- updates */

/**
 * The manifest is a static file, published next to the app, that names the newest
 * build. Reading it from the same origin as the API means the website, the PWA and
 * the APK all compare against one number — there is no per-platform release table
 * to drift.
 */
const MANIFEST_PATH = '/app/version.json'
const DISMISS_KEY = 'jimmy-state:update-dismissed'

/** Compare dotted version names ("1.2.3"). Returns <0, 0 or >0. */
export function compareVersions(a, b) {
  const parse = (value) =>
    String(value || '')
      .split(/[.+-]/)
      .map((part) => Number.parseInt(part, 10))
      .map((n) => (Number.isFinite(n) ? n : 0))
  const left = parse(a)
  const right = parse(b)
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function readDismissed() {
  try {
    return Number(localStorage.getItem(DISMISS_KEY) || 0)
  } catch {
    return 0
  }
}

/**
 * "Not now" is remembered per versionCode, so a dismissal silences that one build
 * and a newer one still announces itself.
 */
export function dismissUpdate(versionCode) {
  try {
    localStorage.setItem(DISMISS_KEY, String(Number(versionCode) || 0))
  } catch {
    /* private mode — the card simply reappears next launch */
  }
}

export async function fetchManifest({ signal } = {}) {
  const res = await fetch(`${API_BASE}${MANIFEST_PATH}?t=${Date.now()}`, { cache: 'no-store', signal })
  if (!res.ok) throw Object.assign(new Error(`Update check failed (HTTP ${res.status}).`), { code: 'UPDATE_HTTP' })
  const data = await res.json()
  if (!data || typeof data.version !== 'string') {
    throw Object.assign(new Error('The update manifest is not readable.'), { code: 'UPDATE_INVALID' })
  }
  return data
}

/**
 * @returns {Promise<{update:boolean, forced:boolean, manifest:object|null, reason:string}>}
 *   reason: 'current' | 'available' | 'dismissed' | 'unreachable' | 'invalid' | 'no-build'
 */
export async function checkForUpdate({ ignoreDismissed = false, signal } = {}) {
  let manifest
  try {
    manifest = await fetchManifest({ signal })
  } catch (err) {
    return {
      update: false,
      forced: false,
      manifest: null,
      reason: err?.code === 'UPDATE_INVALID' ? 'invalid' : 'unreachable',
    }
  }

  // The package manager is the only trustworthy source for "what is installed":
  // a WebView can be holding a stale bundle from a previous install.
  const installed = IS_NATIVE_APP ? await getAppInfo() : null
  // Native asks the package manager; web and PWA already know their own build.
  const installedCode = IS_NATIVE_APP ? Number(installed?.versionCode || 0) : APP_VERSION_CODE
  const latestCode = Number(manifest.versionCode || 0)

  const outdated = latestCode
    ? latestCode > installedCode
    : compareVersions(manifest.version, installed?.versionName || APP_VERSION) > 0

  const forced = Boolean(manifest.minVersionCode) && installedCode < Number(manifest.minVersionCode)
  if (!outdated) return { update: false, forced: false, manifest, reason: 'current' }
  if (!ignoreDismissed && !forced && readDismissed() >= latestCode) {
    return { update: true, forced: false, manifest, reason: 'dismissed' }
  }
  return { update: true, forced, manifest, reason: 'available' }
}

/**
 * Apply an update.
 *
 * Web / PWA: open the download link — the browser replaces the cached shell on the
 * next load, and the service worker's versioned caches cover the rest.
 *
 * APK: download the new package with the same progress-reporting downloader the
 * media downloads use, stage it in the app cache, then hand it to Android's
 * installer. Installing over the top keeps the app's data directory, which is where
 * the library, playlists, download history, theme and language live — so an update
 * never asks the user to sign in again or re-import anything.
 */
export async function installUpdate(manifest, { onProgress, signal } = {}) {
  if (!manifest?.version) {
    throw Object.assign(new Error('No build has been published yet.'), { code: 'NO_BUILD_PUBLISHED' })
  }

  if (!IS_NATIVE_APP) {
    const registration = await navigator.serviceWorker?.getRegistration?.()
    registration?.waiting?.postMessage('SKIP_WAITING')
    window.location.reload()
    return { method: 'reload' }
  }

  if (!manifest.apkUrl) {
    throw Object.assign(new Error('No Android build has been published yet.'), { code: 'NO_BUILD_PUBLISHED' })
  }

  if (!(await canInstallApk())) {
    await openInstallPermission()
    throw Object.assign(
      new Error('ALLOW_INSTALL_REQUIRED'),
      { code: 'ALLOW_INSTALL_REQUIRED' },
    )
  }

  // Imported here, not at the top of the file: download.js imports this module for
  // isNativeApp(), and a static pair of imports would make the two files circular.
  const { fetchWithProgress } = await import('./download.js')
  const blob = await fetchWithProgress(manifest.apkUrl, {
    expectedSize: Number(manifest.size) || 0,
    onProgress,
    signal,
    idleTimeoutMs: 45000,
  })

  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(Object.assign(new Error('The update file could not be read.'), { code: 'READ_FAILED' }))
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })

  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const fileName = `jimmy-state-${manifest.version || 'update'}.apk`
  const written = await Filesystem.writeFile({
    path: fileName,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  })

  const filePath = String(written?.uri || '').replace(/^file:\/\//, '')
  try {
    await installApk(filePath)
    return { method: 'native', uri: written?.uri || '' }
  } catch (err) {
    // The custom installer plugin is the only piece that can be missing (an older APK,
    // or a build where it failed to register). Falling back to the browser keeps the
    // update reachable instead of leaving the user with a dead button.
    if (err?.code === 'NO_INSTALLER') {
      openExternal(manifest.apkUrl)
      return { method: 'browser' }
    }
    throw err
  }
}
