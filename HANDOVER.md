# JIMMY STATE — project handover

Written for whoever picks this up next. It describes the project **as it actually is on
disk and in production now**, including what is broken and why. Nothing here is aspirational.

- **Live:** https://jimmy-state.vercel.app
- **Repo:** https://github.com/alsphalt/jimmy-state
- **Branch:** `main` · **Version:** 1.1.0
- **Hosting:** Vercel (static build + serverless API functions)
- **Owner:** alsphalt

---

## 1. What this is

A mobile-first PWA for identifying music from the microphone, then browsing, playing and
saving what it finds. React + Vite frontend, Express backend, deployed as Vercel
functions. All media comes from providers that publish it; nothing is ripped, and there
is no audio fingerprinting of its own — recognition is ACRCloud's API.

Two rules have been held throughout and should keep being held:

1. **No fabrication.** No fake recognition, fake durations, fake downloads, fake install
   prompts. When a provider is unavailable the UI says so.
2. **No extraction of platform media.** YouTube and TikTok posts play through their
   official embeds. There is no ytdl-style downloader and no watermark stripping. This
   has been declined repeatedly and deliberately; see §9.

## 2. Layout

```
jimmy-state/
├── api/                      generated Vercel functions (see §6 — do not hand-edit)
├── public/                   manifest.webmanifest, sw.js, theme-boot.js, icons/
├── scripts/
│   ├── make-api-routes.mjs   generates api/** from the Express route table
│   └── db-migrate.mjs        applies server/lib/schema.sql
├── server/
│   ├── app.js                the whole Express app: every route lives here
│   ├── index.js              local dev server (PORT, default 3001)
│   ├── handler.js            Vercel entry
│   └── lib/
│       ├── acrcloud.js       ACRCloud identify + signature v1 (HMAC-SHA1)
│       ├── acrMetadata.js    platform links / hi-res covers (separate token)
│       ├── itunes.js         catalogue search, charts (+ preview backfill), videos
│       ├── youtube.js        Data API v3 search, ID resolution, durations
│       ├── tiktok.js         link resolution + oEmbed metadata (no media)
│       ├── matches.js        builds Exact / Similar / Possible result sets
│       ├── db.js             Postgres pool, schema bootstrap, parameterised SQL
│       ├── schema.sql        tables (idempotent)
│       ├── netguard.js       SSRF guard for outbound downloads
│       └── rateLimit.js      fixed-window limiter (memory, or shared via Postgres)
├── src/
│   ├── App.jsx               routes
│   ├── main.jsx              boot: theme, service worker
│   ├── components/           Chrome (top bar, drawer, bottom nav, player bar), Icons,
│   │                         Recognizer, YouTubePlayer, TrackBits, ui
│   ├── context/              LibraryContext (IndexedDB), PlayerContext (audio),
│   │                         DownloadsContext
│   ├── lib/                  api client, recorder (16 kHz WAV), download, install,
│   │                         positions (resume points), track normalisation, theme
│   ├── pages/                see §4
│   └── styles/               base.css (tokens), app.css (components)
└── tests/                    run.mjs (API), db.mjs, download-client.mjs,
                              vercel-routing.mjs, ssr-smoke.mjs
```

## 3. Running it

```bash
npm install
cp .env.example .env      # fill in what you have; everything is optional
npm run dev               # Express on :3001 + Vite together
npm run build             # dist/
npm test                  # 151 checks: API, database, downloads, routing
node tests/ssr-smoke.mjs  # renders every route server-side
npm run db:migrate        # applies schema.sql to DATABASE_URL
npm run api:routes        # regenerate api/** after adding a route
```

`npm test` also runs `make-api-routes.mjs --check`, which fails if the generated Vercel
functions are out of date with `server/app.js`.

## 4. Frontend routes

| Route | Page | Notes |
|---|---|---|
| `/` | Home | dashboard: recognise entry, trending chart, continue listening |
| `/discover` | Discover | charts + artists/albums |
| `/identify` | Identify | microphone → POST /api/recognize |
| `/results/:id` | Results | Exact / Similar / Possible (up to 30) |
| `/search` | Search | tabs: Videos, Artists, Albums, Library, Downloads (Music tab intentionally removed) |
| `/song/:key` | SongDetails | preview player, full-play resolution, download if published |
| `/videos` | Videos | catalogue music videos |
| `/watch/:id` | Watch | YouTube embed, or `tt-<id>` TikTok embed |
| `/library` | Library | identifications, favourites, videos (tabs via `?tab=`) |
| `/downloads` | Downloads | download manager |
| `/playlists`, `/playlists/:id` | Playlists | |
| `/watch-later` | WatchLater | |
| `/settings` | Settings | **Appearance only** — Dark / Light / System. Built to grow. |
| `/services` | Services | gear icon: service status (incl. YouTube), install, storage export/erase, microphone, region |
| `/privacy` | Privacy | what is stored and where |
| `/tools/tiktok` | TikTokLink | resolves links, plays the official embed, saves to library |

## 5. API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | capabilities + env diagnostics + database status (no secrets) |
| POST | `/api/recognize` | raw `audio/wav` body → ACRCloud identify → result sets |
| GET | `/api/music/search` | YouTube-backed full tracks, catalogue fallback |
| GET | `/api/music/charts` | Apple charts, each with a preview clip |
| GET | `/api/music/track` | catalogue track by `id` |
| GET | `/api/music/artists` · `/api/music/albums` | discovery |
| GET | `/api/metadata/track` | ACRCloud external metadata (platform links) |
| GET | `/api/videos/search` · `/api/videos/catalog` · `/api/videos/item` · `/api/videos/related` | video catalogue |
| GET | `/api/youtube/resolve` | query or URL → video id (keyless via oEmbed) |
| GET | `/api/tiktok/resolve` | link → id, embed URL, oEmbed metadata |
| POST | `/api/downloads/resolve` | SSRF-guarded fetch of an allowlisted file |
| GET | `/api/downloads/file` | streams an allowed file, size-capped |
| GET | `/api/insights/trending` | aggregate top identified tracks (needs the database) |

## 6. Deployment (the part that bites)

`vercel.json` rewrites everything except `/api/*` to `index.html`, sets a CSP, and maps
`api/**` to 1 GB / 30 s functions.

**Vercel's nested function routing did not work here.** `api/[...route].js` is not a
Next-style catch-all in this setup. The fix that works: `scripts/make-api-routes.mjs`
generates one shallow file per endpoint (e.g. `api/music/search.js`), all delegating to
`server/handler.js`. So:

> Adding a route to `server/app.js` does nothing in production until you run
> `npm run api:routes` and commit the generated files.

Video-by-id uses a query parameter (`/api/videos/catalog?id=`) rather than a path segment
for the same reason.

## 7. Data

**Client-side (the user's library) — nothing is lost when the server changes.**
IndexedDB, falling back to a `localStorage` shim (`js.store.<name>`) in private windows.
Stores: `identifications`, `favourites`, `videos`, `watchLater`, `watched`, `downloads`,
`playlists`, `searches`, `meta`. Plus `jimmy-state:theme` for appearance and resume
positions for long mixes. There is **no cloud sync** — clearing browser data clears the
library, and `/privacy` says so.

**Server-side (optional, Neon Postgres).** `server/lib/db.js` + `schema.sql`:

- `track_counts(day, track_key, title, artist, artwork_url, hits, first_seen, last_seen)`
  — one row per track per day. Aggregate by design: no user, device, IP or audio.
- `rate_windows(bucket, window_start, hits)` — fixed-window counters so limits hold
  across serverless instances instead of per instance.

Applied automatically on first query under a Postgres advisory lock, or explicitly with
`npm run db:migrate`. Every statement is parameterised; the connection string is
redacted from logs and never returned by an endpoint. **Without `DATABASE_URL` the app
behaves exactly as before** — the only consumer is `/api/insights/trending`.

## 8. Environment variables

Server-side only. Never prefix any of these with `VITE_` — that would inline the value
into the browser bundle. `.env` is gitignored; `.env.example` documents each one.

| Name | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | no | Neon **pooled** string (`-pooler` host). Optional. |
| `PG_SSL_NO_VERIFY` | no | `1` only if the runtime cannot verify Neon's certificate. |
| `PG_POOL_MAX` | no | Pool size per instance, default 3. |
| `ACR_HOST` / `ACR_ACCESS_KEY` / `ACR_ACCESS_SECRET` | **for recognition** | ACRCloud identify. |
| `ACR_METADATA_TOKEN` | no | Platform links + hi-res covers (different token from the identify key). |
| `YOUTUBE_API_KEY` | for video search | Data API v3 key (`AIza…`), not OAuth. |
| `YOUTUBE_REFERER` | if key is referrer-restricted | Origin the key is locked to. |
| `CATALOG_COUNTRY` | no | Storefront/charts region, default `US`. |
| `DOWNLOAD_ALLOWED_HOSTS`, `MAX_DOWNLOAD_BYTES` | no | Extra allowlisted download hosts, size cap. |
| `CORS_ORIGINS`, `VITE_API_BASE`, `ALLOWED_HOSTS` | no | Split-origin deployments, Vite host allowlist. |

## 9. State of play (checked 4 Nov 2026)

Working in production: all 17 pages render, charts return playable previews, YouTube
search and embedded full-length playback, video catalogue, TikTok link resolution and
embed, downloads for provider-published files, PWA install, themes.

Blocked — **all three are missing/wrong credentials in Vercel, not code**:

1. **`DATABASE_URL` → `auth_failed`.** Host resolves, TLS completes in ~40 ms, Postgres
   answers "password authentication failed". The string is reachable; the password is
   stale. Reset the role password in Neon, paste the pooled string, redeploy. Verify with
   `/api/health` → `reachable: true, tables: 2`.
2. **Recognition off.** `ACR_HOST` / `ACR_ACCESS_KEY` / `ACR_ACCESS_SECRET` are absent in
   Vercel (they exist in the local `.env`). Until they are added, `/identify` correctly
   shows "Recognition is not configured on this server."
3. **`ACR_METADATA_TOKEN` unset**, so platform links and hi-res covers are dormant. It
   503s cleanly rather than showing dead buttons.

Deliberately not built, do not re-open without a licensed source:

- **No YouTube/TikTok media download.** No ytdl-style dependency, no watermark removal.
  A download only exists for files a provider publishes for it (Apple's `.m4v` music-video
  previews, duration-limited). The TikTok page states this instead of offering a dead button.
- **No catalogue preview → full track.** A 30 s preview cannot become a full song. Full
  playback goes through the YouTube IFrame player when a YouTube result exists.

Smaller known gaps:

- Light theme is implemented from tokens but has **not been visually checked on a
  device** — the environment had no browser to screenshot. Worth one look on a phone.
- `/api/insights/trending` has no UI consumer yet; it exists and is ready.
- Credentials pasted into an earlier chat (`AIza…` YouTube key, Google OAuth client, ACR
  key/secret) should be **rotated**. They are *not* in git history — verified by scanning
  every commit: the only hits for `AIza`, `GOCSPX-` and `postgresql://` are validation
  code, docs and test fixtures.

## 10. Continuing safely

1. `npm install && npm test` before anything else; the suite catches generated-route drift.
2. Never commit `.env`. Never put a secret behind a `VITE_` name.
3. After adding an API route: `npm run api:routes`, then commit `api/`.
4. After changing a schema: `npm run db:migrate`. Add new tables with
   `create table if not exists` and keep statements idempotent.
5. Don't "modernise" the design tokens in `base.css` — both themes read from them.

## 11. About moving this to a different builder

This project is a Node/Express + React/Vite app deployed to Vercel, holding user data in
the browser's IndexedDB. A visual site builder that generates a site from a prompt and
hosts it on its own subdomain cannot take this over in place: it has no Express runtime,
no `api/**` functions, no Neon connection, and no way to run `npm test`. Importing the
code is only meaningful somewhere that runs Node and can attach the same environment
variables — GitHub → Vercel, or any Node host.

What survives a move regardless: the repo (full history), the backup archive, this
document, and the user library, which lives in the browser and is unaffected by where the
app is hosted.
