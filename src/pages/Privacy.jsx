import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { IconChevron, IconShield } from '../components/Icons.jsx'
import { storageBackend } from '../lib/db.js'

export default function Privacy() {
  const { t } = useTranslation()
  const items = ['identifications', 'library', 'playlists', 'downloads', 'searches', 'flags']
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
        <h3>{t('privacy.storedTitle')}</h3>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          {t('privacy.storedIntro', { backend: storageBackend() })}
        </p>
        <ul className="tiny muted" style={{ paddingLeft: 18, marginTop: 8, lineHeight: 1.7 }}>
          {items.map((key) => (
            <li key={key}>
              <b>{t(`privacy.stored.${key}Label`)}</b> — {t(`privacy.stored.${key}Body`)}
            </li>
          ))}
        </ul>
      </div>

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <h3>{t('privacy.sentTitle')}</h3>
        <div className="kv">
          <span>{t('privacy.sent.audio')}</span>
          <b>ACRCloud</b>
        </div>
        <div className="kv">
          <span>{t('privacy.sent.search')}</span>
          <b>Apple iTunes Search API</b>
        </div>
        <div className="kv">
          <span>{t('privacy.sent.charts')}</span>
          <b>Apple Music public feed</b>
        </div>
        <div className="kv">
          <span>{t('privacy.sent.videoSearch')}</span>
          <b>YouTube Data API v3</b>
        </div>
        <div className="kv">
          <span>{t('privacy.sent.playback')}</span>
          <b>YouTube IFrame Player</b>
        </div>
        <div className="kv">
          <span>{t('privacy.sent.counts')}</span>
          <b>{t('privacy.sent.countsProvider')}</b>
        </div>
        <p className="tiny muted" style={{ marginTop: 10 }}>
          {t('privacy.sent.countsBody')}
        </p>
        <p className="tiny muted" style={{ marginTop: 10 }}>
          {t('privacy.sent.audioBody')}
        </p>
      </div>

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <h3>{t('privacy.cookiesTitle')}</h3>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          {t('privacy.cookiesBody')}
        </p>
      </div>

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <h3>{t('privacy.copyrightTitle')}</h3>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          {t('privacy.copyrightBody')}
        </p>
      </div>

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <h3>{t('privacy.controlsTitle')}</h3>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          {t('privacy.controlsBody')}
        </p>
        <Link to="/settings" className="section-link" style={{ marginTop: 10 }}>
          {t('privacy.openSettings')} <IconChevron size={13} />
        </Link>
      </div>

      <p className="tiny mute" style={{ marginTop: 16 }}>
        {t('privacy.thirdParty')}
      </p>
    </>
  )
}
