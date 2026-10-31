# JIMMY STATE

Music recognition, discovery, video streaming, authorized downloads and a personal
library — in one installable mobile-first app.

Black/charcoal interface, electric blue → purple → cyan accents, an original animated
**D** mark for identification, real providers behind every button, and no fake results
anywhere.

```bash
cp .env.example .env     # add ACRCloud + (optionally) YouTube credentials
npm install
npm run dev              # API on :3001, app on :5173
```

Production:

```bash
npm run build
npm start                # single server on :3001 serving dist/ + the API
```

---

## 1. What is actually wired up

| Area | Provider | State |
|---|---|---|
| Song recognition | **ACRCloud** `/v1/identify` (signed request) | Live with the credentials in `.env` |
| Artwork, 30s previews, similar songs | **iTunes Search API** (no key) | Live |
| Charts / trending | **Apple Music** marketing feed, legacy iTunes RSS fallback | Live |
| Video search | **YouTube Data API v3** | Needs `YOUTUBE_API_KEY`; otherwise the UI shows setup instructions |
| Video playback | **YouTube IFrame Player API** | Works with a video id, no key required |
| Downloads | Authorized hosts only (Apple preview clips by default) | Live |
| Library, playlists, history | IndexedDB (localStorage fallback) | Live, offline-capable |
| Install banner / PWA | `beforeinstallprompt`, `appinstalled`, manifest, service worker | Live over HTTPS |

**Not offered, on purpose:** downloading YouTube videos or extracting their audio.
A Data API key authorizes search and embedded playback only. The scraper providers from
the reference snippet (savetube, ytdown, SaveNow, ytdl-core) were deliberately left out —
they break platform terms and the download requirements you set. Instead the download
manager handles files a provider actually publishes.

## 2. Recognition flow

1. Tap the D → `getUserMedia` is called **only now**. The screen explains why.
2. Audio is captured as raw PCM through the Web Audio API (not MediaRecorder, whose
   WebM/Opus container ACRCloud's sample endpoint does not accept), then downsampled to
   **16 kHz mono WAV** in the browser.
3. The WAV is POSTed to `/api/recognize`. The server validates the RIFF/WAVE header,
   signs the request with HMAC-SHA1, and forwards it to ACRCloud.
4. Nothing is written to disk. The sample lives for the duration of the request.
5. A verified match is saved to the library, and **up to 30 results** are assembled:

```
exact     1   the provider match, enriched with artwork + preview
similar  ≤20  more from the same artist (labelled "Similar songs")
possible ≤9   same title / other candidates (labelled "Possible matches")
```

The single `exact` entry always comes from recognition — never from a keyword search.
Similar and possible results are visually labelled and never presented as identifications.

Capture stops automatically after 10 s, when matching starts, or on Cancel. A timeout
aborts the request after 25 s, and the server aborts upstream after 20 s.

## 3. Downloads: what is allowed and why

```
Browser → /api/downloads/resolve  → host allowlist + DNS/private-IP check + media type + size
        → /api/downloads/file     → streams the file with Content-Length
        → File System Access API  (desktop: user picks the folder)
          or <a download> blob    (Android/iOS: the browser's download manager writes it)
```

Guards:

- https only, no credentials in the URL, no non-standard ports, no IP literals
- host must be on `DOWNLOAD_ALLOWED_HOSTS` (default: `audio-ssl.itunes.apple.com`,
  `itunes.apple.com`, `mzstatic.com`)
- DNS is resolved and private/loopback ranges are rejected
- response must be `audio/*` or `video/*`, under `MAX_DOWNLOAD_BYTES` (60 MB)
- the proxy refuses any URL that fails the same checks, so it cannot be used as an open relay

The file really lands on the device: the browser's download manager or the OS save
dialog writes it. The library only stores a **record** of the download — deleting the
record never deletes the file, and the UI says so. Files are never stored in IndexedDB.

## 4. Install banner

- Shown only if the browser fired `beforeinstallprompt` (no event → no banner, and no
  fake prompt).
- Install triggers `prompt()`; `accepted` → banner gone permanently and
  `js.install.installed` is set.
- X (or declining the OS dialog) stores `js.install.dismissedAt`; the banner stays away
  for **5 hours**, then can return on a later visit.
- Already installed is detected via `display-mode: standalone`, `navigator.standalone`,
  `getInstalledRelatedApps()`, and the stored flag. Uninstalling clears the standalone
  detection, so the banner can come back.

## 5. Environment

```ini
ACR_HOST=identify-ap-southeast-1.acrcloud.com
ACR_ACCESS_KEY=…
ACR_ACCESS_SECRET=…
YOUTUBE_API_KEY=            # optional
CATALOG_COUNTRY=US
DOWNLOAD_ALLOWED_HOSTS=     # optional extra hosts you may save from
MAX_DOWNLOAD_BYTES=62914560
PORT=3001
```

ACRCloud needs a host + key + **secret** (it signs requests), so it is not a single
`MUSIC_RECOGNITION_API_KEY`. The YouTube key keeps the `YOUTUBE_API_KEY` name from your
brief. Both stay server-side; no key is ever sent to the browser.

`.env` is read from the **project root**, whatever directory the server was started from,
and real environment variables (a host's dashboard) win over the file. `.env` is
gitignored, so a fresh clone needs `cp .env.example .env` — a deployed copy will not have
it, and must get the variables from the platform instead.

If credentials are ever missing, `/api/health` says exactly what was checked and what it
found, without printing values:

```json
"env": {
  "loadedFiles": [".env"],
  "checked": [{ "path": ".env", "exists": true }],
  "recognition": { "ACR_HOST": "present", "ACR_ACCESS_KEY": "present",
                   "ACR_ACCESS_SECRET": "present", "configured": true },
  "youtube": { "YOUTUBE_API_KEY": "missing" }
}
```

`missing` means the variable is absent, `empty` means it exists but is blank — those are
different problems, and the server log plus the recognition error both name them.

### Getting the credentials

**ACRCloud** — <https://console.acrcloud.com> → create a project → *Identification* →
copy host, access key, access secret. Free trial tier is small (order of ~100
identifications per month; check current limits), paid plans beyond that. Each request
uses ~5–12 s of audio.

**YouTube Data API v3** — Google Cloud console → enable “YouTube Data API v3” → create an
API key → restrict it. Default quota is 10,000 units/day; a `search.list` call costs 100
units, `videos.list` costs 1, so roughly 90 searches/day on the free quota. Requests are
made server-side and cached in memory for the catalogue calls.

Without these keys the app still runs: recognition reports “not configured”, video
search shows setup steps, and library/playlists/downloads keep working.

## 6. API

| Method | Route | Notes |
|---|---|---|
| GET | `/api/health` | capabilities + `env`/`deployment` free summary, never secrets |
| POST | `/api/recognize` | `audio/wav` body, ≤8 MB, 12 requests/min per IP |
| GET | `/api/music/search?q=&limit=` | iTunes catalogue |
| GET | `/api/music/track/:id` | single track |
| GET | `/api/music/artists?q=` | artist search |
| GET | `/api/music/albums/:artistId` | albums for an artist |
| GET | `/api/music/charts?limit=&country=` | real chart data, with fallback source |
| GET | `/api/videos/search?q=` | 503 + `YOUTUBE_NOT_CONFIGURED` when no key |
| GET | `/api/videos/:id` · `/api/videos/:id/related` | metadata / related |
| POST | `/api/downloads/resolve` | validate a source, return size/format/stream URL |
| GET | `/api/downloads/file?url=&name=` | streamed attachment (allowlist enforced) |

All errors are `{ ok: false, code, error }` with a human-readable message. Rate limits use
a bounded in-memory window per IP: 12/min for recognition, 30/min for downloads, 90/min
for catalogue reads.

## 7. Project structure

```
server/
  index.js            express app, routes, headers, static + SPA fallback
  lib/acrcloud.js     signed identification + WAV validation
  lib/matches.js      30-result assembly (exact / similar / possible)
  lib/itunes.js        catalogue, artwork, previews, charts (+ fallback)
  lib/youtube.js       Data API v3 search/metadata only
  lib/netguard.js      download allowlist, DNS/private-IP checks, file naming
  lib/rateLimit.js     bounded fixed-window limiter
src/
  main.jsx  App.jsx    router + providers
  context/             LibraryContext (IDB + toasts), PlayerContext, DownloadsContext
  lib/                 db (IndexedDB + fallback), api, recorder (WAV), download, install, format, track
  components/          Chrome (topbar/nav/player/banner), Recognizer, TrackBits, VideoCard, YouTubePlayer, ui
  pages/               Home, Discover, Identify, Results, Videos, Watch, Library, Downloads,
                       Search, SongDetails, Settings, Privacy, Playlists, PlaylistDetail, WatchLater, NotFound
  styles/              base.css (tokens/primitives), app.css (chrome/media)
public/                manifest.webmanifest, sw.js, icons/*
scripts/make-icons.mjs generates the PNG icon set from the D geometry (no dependencies)
tests/                 API integration suite + SSR render smoke test
```

## 8. Storage model

| Store | Key | Contents |
|---|---|---|
| `identifications` | `id` | exact + similar + possible + timestamp |
| `favourites` | `key` | track snapshot |
| `videos` / `watchLater` / `watched` | `videoId` | video snapshot |
| `downloads` | `id` | file name, format, size, status, retryable source — never the file |
| `playlists` | `id` | name + track snapshots |
| `searches` | `mode:term` | term, mode, timestamp |
| `meta` | `key` | settings |

Queue left mid-transfer at close is marked *interrupted* on next load instead of showing a
bar that will never move. Clearing browser data deletes this library permanently — there
is no cloud sync, and the UI states that.

Offline: the service worker caches the shell and static assets (`network-first` for
navigation, stale-while-revalidate for assets). `/api/*` is deliberately **not** cached,
so recognition never answers with a stale match; the UI shows an offline notice instead.
`/api` and cross-origin media bypass the worker entirely, so nothing large is preloaded.

## 9. Security & privacy

- CSP, `nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` (microphone
  only for self).
- Secrets only in `.env` (gitignored); health output lists configuration *state*, not values.
- Audio validated before forwarding; request bodies capped; JSON bodies capped at 64 kB.
- Download proxy restricted to an allowlist with DNS + private-range checks.
- No accounts, cookies, analytics or third-party scripts beyond the YouTube player.
- Local-only library with export (JSON) and erase in Settings.

## 10. Tests

```bash
npm test                 # API suite (34 checks) — spawns the server on a random port
node tests/ssr-smoke.mjs # renders all 18 routes server-side and asserts the shell
```

Covered: health, SPA shell + deep links, manifest/service worker, `/.env` not served,
non-audio rejection, catalogue search/charts/lookup, honest “not configured” video
behaviour, all download-policy refusals (foreign host, http, IP literal, YouTube), a real
authorized preview resolving + streaming with matching `Content-Length`, proxy-relay
refusal, and rate limiting. The recognition check performs a **real signed request**: a
synthetic tone returns `NO_MATCH` with ACRCloud `status.code: 0` — proving the signature
is accepted rather than rejected.

Not machine-tested here (needs a physical device/browser): microphone permission dialog,
the actual match against real music, file-system save dialogs, and the install prompt.
Those paths are implemented against the documented browser APIs and fail with explicit
messages rather than silent success.

## 11. Deploy

1. Any Node host with HTTPS (required for microphone + PWA): Render, Fly, Railway, a VPS
   behind Caddy/nginx.
2. `npm ci && npm run build`, then `node server/index.js` with `NODE_ENV=production`
   and the env vars set in the host's dashboard.
3. Don't commit `.env`. Rotate the ACRCloud secret if it has been pasted anywhere public.
4. Reverse proxies should forward `X-Forwarded-For` (the app trusts one proxy hop for
   rate limiting) and must not strip `Content-Type` on POSTs.

## 12. Dev server behind a tunnel or hosted sandbox

If you open the Vite dev server through a proxy domain, Vite's DNS-rebinding guard blocks
it with **“Blocked request. This host (…) is not allowed.”** — the server is fine, it just
refuses an unfamiliar `Host` header.

`vite.config.js` allows `sb-78xhxljtwtq7.vercel.run`, `.vercel.run` and `.vercel.app`, and
you can add more without editing the file:

```bash
ALLOWED_HOSTS="my-tunnel.example.com,staging.example.org" npm run dev
```

Do **not** set `allowedHosts: true` — that disables the protection instead of extending it.
If the console then complains about the HMR websocket, the tunnel is https on 443:

```bash
VITE_HMR_WSS=1 npm run dev      # VITE_HMR_PORT=443 is the default
```

`npm run dev` starts the API on `:3001` and the app on `:5173`; the app proxies `/api` to
the API. If you see `EADDRINUSE`, a stale server is still holding the port:

```bash
ps -eo pid,args | grep "[s]erver/index.js"
```

## 13. Known limitations

- Recognition requires network access and a configured ACRCloud project; without it the
  app says so instead of pretending.
- Previews are 30-second clips. Full-track streaming is not implemented and is not
  claimed anywhere in the UI.
- Video search needs a YouTube key; playback of a known id works without one.
- On Android the page cannot choose the Downloads folder — the browser download manager
  does. A native wrapper would be required for arbitrary folder access.
- Video downloads have no authorized host by default, so the UI explains the limit
  instead of offering a button that cannot work.
- Install banner appears only where `beforeinstallprompt` exists (Chromium). iOS gets
  instructions in Settings instead.
