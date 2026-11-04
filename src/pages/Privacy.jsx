import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { IconChevron, IconShield } from '../components/Icons.jsx'
import { storageBackend } from '../lib/db.js'

export default function Privacy() {
  const { t } = useTranslation()
  return (
    <>
      <div className="row gap-8" style={{ marginBottom: 8 }}>
        <IconShield size={18} />
        <span className="eyebrow">{t('privacy.eyebrow')}</span>
      </div>
      <h1>{t('privacy.headline')}</h1>
      <p className="small muted" style={{ marginTop: 6, marginBottom: 16 }}>
        {t('privacy.subtitle')}
      </p>

      <div className="card card-pad">
        <h3>Stored on this device</h3>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          Everything below lives in {storageBackend()} in this browser. Nothing is uploaded to a JIMMY STATE server and
          there is no sync.
        </p>
        <ul className="tiny muted" style={{ paddingLeft: 18, marginTop: 8, lineHeight: 1.7 }}>
          <li><b>Identifications</b> — the matched track and up to 30 related results, with a timestamp.</li>
          <li><b>Favourites, saved videos, Watch Later, recently watched</b> — titles, artwork URLs, provider ids.</li>
          <li><b>Playlists</b> — names and the tracks you add.</li>
          <li><b>Download records</b> — file name, format, size, status. The file itself is on your device’s storage, not in the app database.</li>
          <li><b>Search history</b> — the terms you searched and which mode you used.</li>
          <li><b>Two install flags</b> in localStorage — whether you installed the app and when you dismissed the banner.</li>
        </ul>
      </div>

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <h3>What is sent, and to whom</h3>
        <div className="kv">
          <span>Recognition audio</span>
          <b>ACRCloud</b>
        </div>
        <div className="kv">
          <span>Song / album / artist searches</span>
          <b>Apple iTunes Search API</b>
        </div>
        <div className="kv">
          <span>Charts</span>
          <b>Apple Music public feed</b>
        </div>
        <div className="kv">
          <span>Video search</span>
          <b>YouTube Data API v3</b>
        </div>
        <div className="kv">
          <span>Video playback</span>
          <b>YouTube IFrame Player</b>
        </div>
        <div className="kv">
          <span>Identification counts</span>
          <b>This app’s own database</b>
        </div>
        <p className="tiny muted" style={{ marginTop: 10 }}>
          A successful identification also increments a counter for that track (title, artist, day). It is an
          aggregate — no account, no device id, no address, and no link between you and the track — and it exists only
          so trending can show what this app’s users actually identify.
        </p>
        <p className="tiny muted" style={{ marginTop: 10 }}>
          Audio samples are produced only while you are identifying: a 16 kHz mono WAV is posted to this app’s server,
          forwarded to ACRCloud, and returned — it is not written to disk and is not retained after the request. Search
          terms go from the server to the provider; your API keys stay on the server and never reach the browser.
        </p>
      </div>

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <h3>Cookies and tracking</h3>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          No cookies, no third-party analytics, no advertising identifiers. The only persistent browser values are the
          two install flags described above, and they never leave your device.
        </p>
      </div>

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <h3>Downloads and copyright</h3>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          Only files a provider publishes for download are saved: catalogue preview clips and hosts an operator has
          explicitly put on the authorized list. YouTube videos are streamed through the official player and are never
          downloaded or extracted. Nothing here circumvents DRM, paywalls, access controls or platform terms. If a
          provider does not offer a file, the app says so instead of showing a button that cannot work.
        </p>
      </div>

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <h3>Your controls</h3>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          Clear search history from Library → Searches. Erase everything, or export a JSON copy, from Settings. Removing
          a library entry never deletes a file that was already saved to your device.
        </p>
        <Link to="/settings" className="section-link" style={{ marginTop: 10 }}>
          Open settings <IconChevron size={13} />
        </Link>
      </div>

      <p className="tiny mute" style={{ marginTop: 16 }}>
        Third-party terms apply to the content they serve: ACRCloud, Apple Music / iTunes, and YouTube. Respect the
        rights of the artists and rights holders whose work you are identifying.
      </p>
    </>
  )
}
