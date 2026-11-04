/**
 * Everything that only exists inside the Android shell.
 *
 * Each helper is a no-op on the website and in the PWA, so callers never need to know
 * which platform they run on: `saveFile()` tries the native writer first and falls back
 * to the browser download manager.
 *
 * Plugins are imported dynamically. A static import would drag the Capacitor bridge into
 * the web bundle and into the SSR tests, where `window` does not exist.
 */
import { isNativeApp } from './platform.js'

// Literal specifiers, dynamically imported: each plugin lands in its own chunk, so the
// website never downloads the native bridge while a native build still gets the full API.
const fs = () => import('@capacitor/filesystem')
const notifications = () => import('@capacitor/local-notifications')
const app = () => import('@capacitor/app')
const statusbar = () => import('@capacitor/status-bar')
const share = () => import('@capacitor/share')
const splash = () => import('@capacitor/splash-screen')

const CHANNEL = 'jimmy-state'
const ANDROID = { Directory: 'DOCUMENTS' }

/* ------------------------------------------------------------------ boot */

/**
 * Wires the shell to the app: hardware back button, status-bar colour and the
 * notification channel. Called once from main.jsx, and only on native.
 *
 * Without the back-button handler Android closes the activity on the first press — the
 * single most obvious "this is a web page in a box" tell in a packaged app.
 */
export async function initNative({ onBack } = {}) {
  if (!isNativeApp()) return

  try {
    const { App } = await app()
    App.addListener('backButton', ({ canGoBack }) => {
      const handled = onBack?.()
      if (handled) return
      if (canGoBack) window.history.back()
      else App.exitApp()
    })
  } catch (err) {
    console.warn('[native] back button unavailable', err?.message)
  }

  try {
    const { StatusBar, Style } = await statusbar()
    const theme = document.documentElement.getAttribute('data-theme')
    await StatusBar.setOverlaysWebView({ overlay: true })
    await StatusBar.setStyle({ style: theme === 'light' ? Style.Light : Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#00000000' })
  } catch (err) {
    console.warn('[native] status bar unavailable', err?.message)
  }

  try {
    const { LocalNotifications } = await notifications()
    await LocalNotifications.createChannel({
      id: CHANNEL,
      name: 'JIMMY STATE',
      description: 'Downloads and app updates',
      importance: 3,
      visibility: 1,
    })
  } catch (err) {
    console.warn('[native] notification channel unavailable', err?.message)
  }

  try {
    const { SplashScreen } = await splash()
    await SplashScreen.hide()
  } catch {
    /* no splash plugin — nothing to hide */
  }
}

/** Keeps the native status bar in step with the in-app theme switch. */
export async function syncStatusBar(theme) {
  if (!isNativeApp()) return
  try {
    const { StatusBar, Style } = await statusbar()
    await StatusBar.setStyle({ style: theme === 'light' ? Style.Light : Style.Dark })
  } catch {
    /* cosmetic only */
  }
}

/* -------------------------------------------------------------- files */

const base64ToBlob = (base64, mime) => {
  const bytes = atob(base64)
  const buffer = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i += 1) buffer[i] = bytes.charCodeAt(i)
  return new Blob([buffer], { type: mime || 'application/octet-stream' })
}

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('Could not read the file.'))
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.readAsDataURL(blob)
  })

/**
 * Writes the finished download into the phone's shared Documents folder so it shows up
 * in the Files app and in music/video players, not just inside the app sandbox.
 *
 * Two paths, because Android storage rules differ by version: the public Documents
 * directory first (MediaStore on Android 10+), then app-private storage if the system
 * refuses. Returning the second one is still a successful save — the file exists and
 * the app can share or re-download it — so we report which happened rather than
 * pretending the first attempt worked.
 */
export async function saveFileNative(blob, fileName, mime) {
  if (!isNativeApp()) return null
  const { Filesystem } = await fs()
  const data = await blobToBase64(blob)
  const folder = 'JIMMY STATE'

  try {
    await Filesystem.mkdir({ path: folder, directory: ANDROID.Directory, recursive: true }).catch(() => {})
    const res = await Filesystem.writeFile({
      path: `${folder}/${fileName}`,
      data,
      directory: ANDROID.Directory,
      recursive: true,
    })
    return { method: 'native', uri: res.uri, location: `Documents/${folder}/${fileName}`, shared: true }
  } catch (err) {
    console.warn('[native] public Documents unavailable, using app storage', err?.message)
  }

  const res = await Filesystem.writeFile({
    path: `downloads/${fileName}`,
    data,
    directory: 'DATA',
    recursive: true,
  })
  return { method: 'native-private', uri: res.uri, location: fileName, shared: false }
}

/**
 * Hands a saved file to another app (music player, WhatsApp, Drive). This is what makes
 * a download feel finished on a phone — the file can leave the app.
 */
export async function shareFile(uri, title) {
  if (!isNativeApp() || !uri) return false
  try {
    const { Share } = await share()
    await Share.share({ title: title || 'JIMMY STATE', url: uri, dialogTitle: title || 'JIMMY STATE' })
    return true
  } catch {
    return false
  }
}

/** Reads a saved file back into a Blob — used by "play from device" and re-share. */
export async function readFileNative(path, directory = 'DATA') {
  if (!isNativeApp()) return null
  const { Filesystem } = await fs()
  const res = await Filesystem.readFile({ path, directory })
  return base64ToBlob(res.data, '')
}

/* --------------------------------------------------------------- notify */

/** Android 13+ asks for POST_NOTIFICATIONS at runtime; below that it is granted. */
export async function ensureNotificationPermission() {
  if (!isNativeApp()) return false
  try {
    const { LocalNotifications } = await notifications()
    const status = await LocalNotifications.checkPermissions()
    if (status.display === 'granted') return true
    const asked = await LocalNotifications.requestPermissions()
    return asked.display === 'granted'
  } catch {
    return false
  }
}

/**
 * A finished download that only shows a toast is invisible the moment the user switches
 * apps — which is exactly when a long download finishes. This posts a real notification.
 */
export async function notify({ title, body, id = Date.now() % 100000 }) {
  if (!isNativeApp()) return false
  try {
    if (!(await ensureNotificationPermission())) return false
    const { LocalNotifications } = await notifications()
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title,
          body,
          channelId: CHANNEL,
          smallIcon: 'ic_stat_jimmy',
          iconColor: '#8b5cf6',
          schedule: { at: new Date(Date.now() + 250) },
        },
      ],
    })
    return true
  } catch (err) {
    console.warn('[native] notification failed', err?.message)
    return false
  }
}

/* ------------------------------------------------------------ microphone */

/**
 * Touching getUserMedia once makes Android surface the microphone prompt while the user
 * is looking at the Identify screen, instead of in the middle of a recognition attempt.
 * The permission itself is declared in AndroidManifest.xml and requested by MainActivity;
 * this only warms the WebView grant.
 */
export async function primeMicrophone() {
  if (!isNativeApp() || !navigator.mediaDevices?.getUserMedia) return false
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((track) => track.stop())
    return true
  } catch (err) {
    console.warn('[native] microphone not granted yet', err?.name)
    return false
  }
}
