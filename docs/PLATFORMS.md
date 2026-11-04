# One app, three targets

JIMMY STATE runs from a single codebase in three places:

| Target | What it is | How it ships |
|---|---|---|
| **Website** | The React app + Express/serverless API | Vercel build of `dist/` |
| **PWA** | The same bundle installed to the home screen | `manifest.webmanifest` + `public/sw.js` |
| **Android APK** | A Capacitor shell around the same `dist/` | GitHub Actions → release asset `jimmy-state.apk` |

There is no Android fork, no second `src/`, and no per-platform UI. The APK loads the
exact bundle the website serves, so a screen cannot exist on one target and be missing
on another. Everything platform-specific is behind two small modules:

```
src/lib/platform.js   "where am I running?" + "is there a newer build?"
src/lib/native.js     files, notifications, microphone warm-up, hardware back, status bar
```

`native.js` is a no-op in a browser: every helper returns early unless
`isNativeApp()` is true. The web bundle never downloads the Capacitor bridge — the
plugins are imported dynamically and the website's `npm test` asserts that no static
`@capacitor/*` import exists in `platform.js`.

## Shared backend

All three targets call the same API, the same database and the same providers:

- **Website / PWA** call `/api/*` relatively — same origin.
- **APK** has no server of its own (`https://localhost` is the bundled shell), so it
  needs an absolute origin. It is baked in at build time:

  ```bash
  VITE_API_BASE=https://your-deployment.example npm run android:sync
  ```

  If the variable is missing the app still starts and every network screen explains
  that the API is unreachable — it does not silently show empty lists.

Recognition (ACRCloud), search (iTunes / YouTube), streaming and downloads therefore
behave identically on all three. Download records, playlists, favourites and the chosen
language live in the WebView's own storage, which is what makes them survive an update.

## Building the APK

Local, needs JDK 21 + the Android SDK (Android Studio installs both):

```bash
npm install
VITE_API_BASE=https://your-deployment.example npm run android:apk      # release
npm run android:debug                                                # debug
npm run android:open                                                 # Android Studio
```

CI, no local SDK needed — push a tag:

```bash
npm version minor          # bumps package.json, the single source of truth
git push --follow-tags
git tag android-v1.2.0 && git push origin android-v1.2.0
```

`.github/workflows/android.yml` then builds the same `dist/`, wraps it with Capacitor,
signs it and publishes `jimmy-state.apk` on the newest GitHub release.

### Signing

Release signing is read from the environment and never from the repo:

| Variable | Meaning |
|---|---|
| `JIMMY_KEYSTORE` | path to the `.jks` (CI writes it from `JIMMY_KEYSTORE_BASE64`) |
| `JIMMY_KEYSTORE_PASSWORD` | store password |
| `JIMMY_KEY_ALIAS` | key alias |
| `JIMMY_KEY_PASSWORD` | key password |

Without a keystore the build still works, but Gradle warns that it is signed with the
debug key — fine for testers, useless for distribution, because **Android can only
install an update over an app signed with the same key**. Keep the keystore: losing it
means every installed copy must be uninstalled (and lose its data) before updating.

## Update system

One version number governs everything. `package.json` is the source; `npm run build`
derives the rest:

```
package.json version
   ├── public/app/version.json      → published manifest, what the app polls
   ├── android/version.properties   → read by android/app/build.gradle
   └── __APP_VERSION__ (vite define) → baked into the running bundle
```

`versionCode` is folded as `major * 1_000_000 + minor * 1_000 + patch`, because Android
needs a monotonic integer.

How each target updates:

- **Website / PWA** — the service worker is stamped with a build id on every deploy, so
  `activate()` evicts the previous shell. When a new worker installs while a tab is
  open, the app shows *"New version ready — Reload"* instead of quietly serving a stale
  bundle. No data is touched: the shell is code, the library is storage.
- **APK** — Settings → **App update** compares the installed `versionCode` (asked from
  the package manager, not from the bundle) with `public/app/version.json`, downloads
  the new APK with the same progress-reporting downloader the media downloads use, and
  hands it to Android's installer through a local `AppUpdater` plugin. Installing over
  the old app keeps its data directory, so the library, playlists, downloads, theme and
  language stay exactly where they were.

  If the user has never allowed installs from JIMMY STATE, the card says so and offers
  the Android settings toggle instead of failing silently. If the installer plugin is
  somehow unavailable, the button falls back to handing the APK link to the browser.

**What is preserved across an update:** everything. There are no accounts to re-enter —
the app has no login by design. Library, playlists, watch-later, download records,
theme and language all live in the WebView's `localStorage`/IndexedDB, which survive an
in-place APK install because the package name and signing key are unchanged.
`android:allowBackup="true"` additionally lets Android's backup carry that data to a
new device.

## Device capabilities in the APK

| Capability | What makes it work |
|---|---|
| Microphone + recognition | `RECORD_AUDIO` in the manifest, requested at runtime in `MainActivity`; capture itself is the same Web Audio code the website uses |
| Video playback | YouTube/TikTok iframes allowed by the WebView; `setMediaPlaybackRequiresUserGesture(false)` so playback resumes after a screen lock |
| Audio + video downloads | `@capacitor/filesystem` writes to `Documents/JIMMY STATE/`, falling back to app storage; the file path is stored on the download record |
| Notifications | `POST_NOTIFICATIONS` + a `jimmy-state` channel with importance 3; posted when a download finishes and when an update is available |
| Storage permissions | `READ_MEDIA_*` on Android 13+, the legacy pair capped at API 32/28 |
| Hardware back | `App.addListener('backButton')` → router back, or exit at the root |
| Safe areas | `viewport-fit=cover` + `env(safe-area-inset-*)` in the existing CSS — no extra padding needed |

## Tests

```bash
npm test              # routes, SSR smoke, Android wiring, API, db, downloads, routing
npm run test:android  # just the three-platform invariants
```

`tests/android.mjs` is the guard that keeps the targets in sync: it fails if the
manifest loses a permission, the runtime permission request disappears, the version
manifest disagrees with `package.json`, the updater plugin stops exposing a method
`platform.js` calls, or a static Capacitor import leaks into the web bundle.

## Regenerating the Android project

`android/` is committed, and only needs regenerating after a Capacitor major upgrade:

```bash
rm -rf android
npx cap add android
npx cap sync android
```

The manifest permissions, the launcher icon, the `AppUpdater` plugin and the version
plumbing are all in this repository, not in the generator — re-apply them from git
(`git checkout android/`) after regenerating.
