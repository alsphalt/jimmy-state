/**
 * The three targets have to stay one app.
 *
 * These checks are cheap and they catch the failure modes that are invisible until
 * an APK is on a phone: a manifest that forgot the microphone, a version file that
 * disagrees with package.json, a plugin that was never registered, or a Capacitor
 * import that leaked into the website bundle.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const exists = (rel) => fs.existsSync(path.join(ROOT, rel))

const pkg = JSON.parse(read('package.json'))
const results = []
const check = (name, fn) => {
  try {
    fn()
    results.push(`ok   ${name}`)
  } catch (err) {
    results.push(`FAIL ${name}\n     ${err.message}`)
    process.exitCode = 1
  }
}

/* ------------------------------------------------------------ capacitor */

const config = JSON.parse(read('capacitor.config.json'))

check('capacitor config targets the shared web bundle', () => {
  assert.equal(config.webDir, 'dist')
  assert.equal(config.appId, 'com.jimmystate.app')
  assert.ok(config.appName, 'appName is set')
})

check('the shell loads over https, not a file:// origin', () => {
  assert.equal(config.server?.androidScheme, 'https')
})

check('the Android project matches the Capacitor app id', () => {
  const gradle = read('android/app/build.gradle')
  assert.match(gradle, /applicationId\s+"com\.jimmystate\.app"/)
  assert.match(gradle, /namespace\s+"com\.jimmystate\.app"/)
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  assert.match(manifest, /android:name="\.MainActivity"/)
})

/* ------------------------------------------------------------- manifest */

const manifest = read('android/app/src/main/AndroidManifest.xml')

check('the APK asks for exactly the permissions its features use', () => {
  for (const permission of [
    'android.permission.INTERNET',
    'android.permission.RECORD_AUDIO',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.READ_MEDIA_AUDIO',
    'android.permission.READ_MEDIA_VIDEO',
    'android.permission.REQUEST_INSTALL_PACKAGES',
  ]) {
    assert.ok(manifest.includes(permission), `${permission} missing`)
  }
})

check('cleartext traffic stays off', () => {
  assert.match(manifest, /android:usesCleartextTraffic="false"/)
})

check('the installer can be resolved on API 30+', () => {
  assert.match(manifest, /application\/vnd\.android\.package-archive/)
})

check('the app declares a FileProvider for handing files to other apps', () => {
  assert.match(manifest, /androidx\.core\.content\.FileProvider/)
  assert.match(read('android/app/src/main/res/xml/file_paths.xml'), /cache-path/)
})

/* ------------------------------------------------------- native wiring */

check('the custom updater plugin is registered before the bridge starts', () => {
  const activity = read('android/app/src/main/java/com/jimmystate/app/MainActivity.java')
  assert.match(activity, /registerPlugin\(AppUpdaterPlugin\.class\)/)
  assert.ok(
    activity.indexOf('registerPlugin(AppUpdaterPlugin.class);') < activity.indexOf('super.onCreate('),
    'registerPlugin must run before super.onCreate()',
  )
  assert.ok(exists('android/app/src/main/java/com/jimmystate/app/AppUpdaterPlugin.java'))
})

check('runtime permissions are requested, not just declared', () => {
  // A manifest entry grants nothing on Android 6+. Without the request the microphone
  // prompt never appears and getUserMedia() rejects — recognition would look broken.
  const activity = read('android/app/src/main/java/com/jimmystate/app/MainActivity.java')
  assert.match(activity, /ActivityCompat\.requestPermissions/)
  assert.match(activity, /Manifest\.permission\.RECORD_AUDIO/)
  assert.match(activity, /requestCorePermissions\(\)/)
  // The bundled shell must keep playing after a screen lock.
  assert.match(activity, /setMediaPlaybackRequiresUserGesture\(false\)/)
  assert.match(activity, /setDomStorageEnabled\(true\)/)
})

check('the plugin exposes what platform.js calls', () => {
  const plugin = read('android/app/src/main/java/com/jimmystate/app/AppUpdaterPlugin.java')
  for (const method of ['getInfo', 'canInstall', 'openInstallPermission', 'openAppSettings', 'install']) {
    assert.match(plugin, new RegExp(`public void ${method}\\(PluginCall`), `${method} missing`)
  }
  assert.match(plugin, /FileProvider\.getUriForFile/)
})

/* -------------------------------------------------------------- version */

const [, major, minor, patch] = /^(\d+)\.(\d+)\.(\d+)/.exec(pkg.version).map(Number)
const expectedCode = major * 1_000_000 + minor * 1_000 + patch

check('the published update manifest matches package.json', () => {
  const manifestJson = JSON.parse(read('public/app/version.json'))
  assert.equal(manifestJson.version, pkg.version)
  assert.equal(manifestJson.versionCode, expectedCode)
  assert.match(manifestJson.apkUrl, /jimmy-state\.apk$/)
})

check('the Gradle build reads its version from the generated file', () => {
  const gradle = read('android/app/build.gradle')
  assert.match(gradle, /version\.properties/)
  assert.match(gradle, /versionCode appVersionCode/)
  const props = read('android/version.properties')
  assert.match(props, new RegExp(`versionName=${pkg.version.replace(/\./g, '\\.')}`))
  assert.match(props, new RegExp(`versionCode=${expectedCode}`))
})

check('release signing comes from the environment, never the repo', () => {
  const gradle = read('android/app/build.gradle')
  assert.match(gradle, /System\.getenv\('JIMMY_KEYSTORE'\)/)
  assert.ok(!fs.readdirSync(path.join(ROOT, 'android')).some((f) => /\.(jks|keystore)$/.test(f)))
})

/* ------------------------------------------------------------ web side */

check('the website never bundles the native bridge eagerly', () => {
  const platform = read('src/lib/platform.js')
  const staticImports = [...platform.matchAll(/^import[^\n]*from '(@capacitor\/[^']+)'/gm)].map((m) => m[1])
  assert.deepEqual(staticImports, [], `static Capacitor imports: ${staticImports.join(', ')}`)
  assert.match(platform, /import\('@capacitor\//)
})

check('native code is only reached through isNativeApp()', () => {
  const download = read('src/lib/download.js')
  assert.match(download, /if \(isNativeApp\(\)\)/)
  const native = read('src/lib/native.js')
  assert.match(native, /if \(!isNativeApp\(\)\) return/)
})

check('the PWA keeps its clean URLs and the APK uses hash routes', () => {
  const main = read('src/main.jsx')
  assert.match(main, /isNativeApp\(\) \? HashRouter : BrowserRouter/)
})

/* The WebView serves the bundle from https://localhost, so a relative /api path
 * would hit the shell itself. A native build must resolve an absolute API origin. */
check('the APK calls an absolute API origin, not the WebView shell', () => {
  const api = read('src/lib/api.js')
  assert.match(api, /isNativePlatform\?\.\(\)/)
  assert.match(api, /IS_NATIVE \? NATIVE_ORIGIN : ''/)
  const origin = /const NATIVE_ORIGIN = '([^']+)'/.exec(api)
  assert.ok(origin, 'NATIVE_ORIGIN is declared')
  assert.match(origin[1], /^https:\/\//, 'the fallback origin is https')
})

check('the API accepts the app origin, so the APK needs no extra CORS setup', () => {
  const app = read('server/app.js')
  assert.match(app, /'https:\/\/localhost'/)
  assert.match(app, /APP_ORIGINS/)
})

console.log(results.join('\n'))
if (process.exitCode) {
  console.error('\nandroid checks failed')
} else {
  console.log('\nandroid checks passed')
}
