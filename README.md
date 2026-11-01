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
| Platform links, hi-res covers, composer credits | **ACRCloud External Metadata** (ISRC lookup) | Needs `ACR_METADATA_TOKEN`; degrades to no links |
| Music-video search + playback | **iTunes** `entity=musicVideo` | Live, **no key** — each result has a real `.m4v` preview |
| Video search | **YouTube Data API v3** | Needs `YOUTUBE_API_KEY`; keyless fallback is oEmbed for known ids |
| Video playback | **YouTube IFrame Player API** / native `<video>` | Works with a video id, no key required |
| Link metadata | **YouTube oEmbed** | Keyless title/channel/thumbnail for a pasted link |
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
  `video-ssl.itunes.apple.com`, `itunes.apple.com`, `mzstatic.com`)
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
ACR_METADATA_TOKEN=         # optional: console developer token, not the access key
ACR_METADATA_PLATFORMS=applemusic,spotify,deezer,youtube
YOUTUBE_API_KEY=            # optional
DATABASE_URL=               # optional: Neon PostgreSQL, server-side only
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

### Database (Neon PostgreSQL)

`DATABASE_URL` is optional. Without it the app behaves exactly as before — the library
stays on the device and one counter feature goes quiet. With it, the server keeps:

| Table | What it holds | Why |
|---|---|---|
| `track_counts` | one row per track per day: title, artist, artwork, hit count | `/api/insights/trending` — what people actually identify |
| `rate_windows` | hashed bucket + fixed window + hit count | rate limits that hold across serverless instances |

Design rules the code enforces:

- **Server-side only.** Read from `process.env` at request time. Never named `VITE_*`
  (that would inline it into the browser bundle) and never committed (`*.env` is ignored).
- **Parameterised.** Every value goes through `$1, $2 …`; a title containing `'; drop table`
  is stored as text. There is no string interpolation in `server/lib/db.js`.
- **No per-user trail.** Identifications are counted in daily aggregates. No account, no
  device id, no IP, no audio — nothing that ties a person to a track.
- **Never fatal.** A missing, slow (2.5 s cap) or refusing database returns a typed error;
  recognition, search and playback keep working. `/api/health` reports
  `database.configured` / `reachable` / `latencyMs` / `tables` and never the URL.
- **TLS verified.** `rejectUnauthorized: true` by default. `PG_SSL_NO_VERIFY=1` exists for a
  runtime that does not ship Neon's CA — use it only if the connection otherwise fails.

Apply the schema deliberately (the app also does this on its first query):

```bash
npm run db:migrate     # prints the tables and row counts, never the connection string
```

Use Neon's **pooled** connection string on Vercel (the host contains `-pooler`); a direct
string exhausts connections when several functions cold-start together.

### Getting the credentials

**ACRCloud** — <https://console.acrcloud.com> → create a project → *Identification* →
copy host, access key, access secret. Free trial tier is small (order of ~100
identifications per month; check current limits), paid plans beyond that. Each request
uses ~5–12 s of audio.

**ACRCloud metadata token** (optional) — console → **account → developer → create token**.
It is a separate credential from the identify key/secret and cannot be derived from them.
Set `ACR_METADATA_TOKEN` to enable “Listen on …” links, 600 px covers and composer
credits. Lookups are by ISRC (falling back to `title + artist`), cached for 30 minutes.
These links open the owning platform; they are never used as download sources.

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
| GET | `/api/metadata/track?isrc=` \| `?q=&artist=` | platform links, covers, credits; 503 without a token |
| GET | `/api/videos/catalog?q=` | keyless music videos (Apple previews) |
| GET | `/api/videos/catalog/:id` | one catalogue video |
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
npm test                 # 74 API + 8 download-transport + 27 routing checks
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

### Vercel (static frontend + serverless API — this is the one that works on `*.vercel.app`)

**Vercel functions have no catch-all.** A file named `api/[...route].js` is matched as a
*single* path segment, not as "anything below /api" — that is why `/api/health` worked in
production while `/api/music/search` returned Vercel's own 404 page. Each route shape now
has its own small function file, all delegating to the same Express app:

```
api/health.js                 api/music/search.js        api/videos/catalog.js
api/recognize.js              api/music/charts.js        api/videos/catalog/[id].js
api/downloads/resolve.js      api/music/artists.js       api/videos/search.js
api/downloads/file.js         api/music/track/[id].js    api/videos/[id].js
api/metadata/track.js         api/music/albums/[artistId].js   api/videos/[id]/related.js
```

They are generated from the Express route table so the two can never drift:

```bash
npm run api:routes          # regenerate after adding a route
npm run api:routes -- --check   # CI guard (also part of npm test)
```

Because every file delegates to the full app, Vercel's static-vs-dynamic precedence cannot
misroute anything: Express still receives the original URL and does the matching.

The rest of the site is served from `dist/`, with a fallback rewrite for client routes.

1. Import the repo in Vercel. Framework preset **Other**; build command and output
   directory come from `vercel.json` (`npm run build` → `dist`).
2. **Settings → Environment Variables** (Production + Preview):

```
ACR_ACCESS_KEY=…          # required for recognition
ACR_ACCESS_SECRET=…       # required for recognition
ACR_HOST=identify-ap-southeast-1.acrcloud.com
YOUTUBE_API_KEY=…         # optional
ACR_METADATA_TOKEN=…      # optional (platform links)
```

`.env` is gitignored and is **not** uploaded — on Vercel the dashboard is the only
source of configuration. Missing values are reported at `/api/health` under `env`.

3. Redeploy (env-var changes require a new deployment).

4. Verify the deployment serves the API, not just the shell:

```bash
curl -s https://<project>.vercel.app/api/health | head -c 200
curl -s "https://<project>.vercel.app/api/music/search?q=vybz%20katel&limit=30" | head -c 300
```

The first must return JSON with `"musicCatalogue": true`; the second must return JSON with
an `items` array. An HTML page or a plain `The page could not be found` means the functions
directory did not deploy — check that `api/` is committed and that the build log lists the
functions.

Serverless constraints to know:

- **Request body ≤ 4.5 MB** (platform limit). A 10 s WAV sample is ~320 KB, so recognition
  is unaffected; the API also caps uploads at 8 MB for self-hosting.
- **Function duration ≤ 30 s.** Long provider polling loops (the 60–120 s patterns common in
  bot downloaders) cannot run here at all, which is one more reason downloads only ever
  proxy a file the provider already publishes.
- **Rate limiting is per instance**, not global — it is best-effort behind a serverless
  fan-out. Use a shared store if you need a hard global limit.
- **No persistent filesystem** is required by design: recognition samples are never
  written to disk, and the library lives in the browser.
- Cold starts add ~300–800 ms to the first recognition request.

A frontend hosted elsewhere can point at an API on another host with `VITE_API_BASE`
(set at build time) plus `CORS_ORIGINS` on the API.

### Node host (Render, Fly, Railway, VPS)

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

## 13. Recognition troubleshooting

The three errors people actually hit, and what each one means:

| Symptom | Real cause | Fix |
|---|---|---|
| `Request failed (HTTP 404)` | `/api/recognize` answered by a *static* host — the API is not deployed with the site | run `npm run dev` (both processes), or deploy `server/` and set `VITE_API_BASE` |
| `Recognition is not configured` | no `ACR_ACCESS_KEY` / `ACR_ACCESS_SECRET` reached the process | check `/api/health` → `env.recognition` (`missing` vs `empty`) and `env.loadedFiles` |
| `Recognition credentials rejected` | ACRCloud answered `status.code 3001` (invalid access key) or `3002` (bad signature) | key+secret must belong to the project on `ACR_HOST`; check for stray quotes/spaces; keep the server clock accurate |

ACRCloud returns **HTTP 200 with an error code in the body**, so a client that only
checks the status line reports success on a rejected request. The server inspects
`status.code`, maps 3001/3002 to `RECOGNITION_UNAUTHORIZED` (502), 3003 to
`RECOGNITION_QUOTA` (429), and logs `{host, httpStatus, acrCode, acrMsg, keyLength,
clockSkewMs}` — never the credential values, never the audio.

`GET /api/recognize` answers **405 with an explanation** rather than a bare 404, and the
Vite proxy answers `502 API_UNREACHABLE` when the API process is missing, so a missing
backend can no longer masquerade as a missing song.

Split deployment (frontend static, API elsewhere):

```bash
# build-time, frontend
VITE_API_BASE=https://api.example.com
# run-time, API
CORS_ORIGINS=https://jimmystate.example.com
```

On Replit, `.replit` runs `npm run dev` so both processes start together; put
`ACR_ACCESS_KEY`, `ACR_ACCESS_SECRET`, `ACR_HOST` in **Secrets** and restart.

## 14. What was deliberately not copied

A supplied reference module contained a full YouTube graveyard: `ytdl-core` /
`@distube/ytdl-core`, `savetube`, `SaveNow`, `ytdown` and a decryption key. Two independent
reasons it is not in this codebase:

1. **It breaks the rules this app is built on.** Extraction violates YouTube's terms and the
   "no bypassing platform restrictions" requirement; a Data API key does not authorize it.
2. **It would not even run here.** Those providers poll for 60–120 s, and a Vercel function
   is cut off at 30 s — `ytdlv2` alone sleeps 20 × 3 s.

What *was* taken is the engineering discipline behind it, applied where it fits:

| Idea from that module | Where it lives now |
|---|---|
| Hard byte ceiling while streaming, plus cleanup on failure | `/api/downloads/file` counts bytes as they pass; an upstream that streams forever is cut at `MAX_DOWNLOAD_BYTES` and the client gets a truncated file, not a runaway 2 GB transfer |
| Explicit timeout on every outbound request | total timeout on the download proxy (`DOWNLOAD_TIMEOUT_MS`, 120 s) |
| Detect a dead transfer instead of waiting forever | client `fetchWithProgress` aborts after 30 s without a byte and reports `DOWNLOAD_STALLED` so Retry works |
| Single error handler per stream (their MaxListeners bug) | one `error` handler, `destroy()` on close/finish, no per-chunk listeners |
| `Content-Length` is a claim, not a guarantee | verified in tests: the body is counted, never trusted |

Everything else — provider fallback chains, buffer caches keyed by video id, `.part` files on
disk — is unnecessary because this app never writes media to the server.

## 15. Known limitations

- Recognition requires network access and a configured ACRCloud project; without it the
  app says so instead of pretending.
- Previews are 30-second clips. Full-track streaming is not implemented and is not
  claimed anywhere in the UI.
- YouTube *keyword* search needs a key; catalogue music videos, playback of a known id
  and title resolution via oEmbed all work without one.
- No YouTube extraction, by design: `ytdl-core`, `yt-search` scraping and similar are not
  used. The only video files that can be saved are provider-published previews.
- On Android the page cannot choose the Downloads folder — the browser download manager
  does. A native wrapper would be required for arbitrary folder access.
- Video downloads have no authorized host by default, so the UI explains the limit
  instead of offering a button that cannot work.
- Install banner appears only where `beforeinstallprompt` exists (Chromium). iOS gets
  instructions in Settings instead.

## YouTube credentials

`YOUTUBE_API_KEY` must be an **API key** (starts with `AIza`) from a project with
**YouTube Data API v3** enabled. An OAuth client id (`...apps.googleusercontent.com`)
or client secret (`GOCSPX-...`) cannot authorise a public search: those belong to a
user sign-in flow, and the secret must never be committed or shipped to the browser.

The server names the problem instead of failing generically:

| Value supplied | Code |
|---|---|
| unset | `YOUTUBE_NOT_CONFIGURED` |
| `GOCSPX-...` or `...apps.googleusercontent.com` | `YOUTUBE_WRONG_CREDENTIAL` |
| anything not starting with `AIza` | `YOUTUBE_KEY_INVALID` |
| key rejected by Google | `YOUTUBE_KEY_INVALID` with Google's reason |
| key restricted to HTTP referrers | `YOUTUBE_REFERER_BLOCKED` |
| daily quota spent | `YOUTUBE_QUOTA` (429) |

### Referrer-restricted keys

A key created with the *HTTP referrers (web sites)* restriction is refused for
server-side calls, which carry no `Referer`:

```
403 forbidden - Requests from referer <empty> are blocked.
```

Two ways out, in order of preference:

1. Change the key's application restriction to **None** (or **IP addresses**) - the key
   is used from a server, so a website restriction does not describe it.
2. Set `YOUTUBE_REFERER=https://your-site.example` so the API sends the origin the key
   is restricted to. The claim is accurate, but it is opt-in on purpose.

Quota: 10,000 units/day on the free tier and `search.list` costs 100, so roughly 90
searches a day. `videos.list` (durations) costs 1.
