import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { IconCheck, IconChevron, IconDownload, IconLanguage } from '../components/Icons.jsx'
import { applyTheme, readTheme, resolveTheme, setTheme, watchSystemTheme } from '../lib/theme.js'
import { useLanguage } from '../i18n/LanguageProvider.jsx'
import { APP_VERSION, checkForUpdate, dismissUpdate, installUpdate, isNativeApp, platformName } from '../lib/platform.js'

/** Keys, not sentences: the theme list is interface text like everything else. */
const THEMES = [
  { value: 'dark', label: 'settings.themeDark', note: 'settings.themeDarkNote' },
  { value: 'light', label: 'settings.themeLight', note: 'settings.themeLightNote' },
  { value: 'system', label: 'settings.themeSystem', note: 'settings.themeSystemNote' },
]

/**
 * Reads the stored preference, applies it, and keeps 'system' live while the page is
 * open — a phone switching to dark at night repaints without a reload.
 */
function useThemePreference() {
  const [pref, setPref] = useState(() => readTheme())
  const [resolved, setResolved] = useState(() => resolveTheme())

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onCustom = (event) => {
      setPref(event.detail.pref)
      setResolved(event.detail.resolved)
    }
    const off = watchSystemTheme((next) => setResolved(next))
    window.addEventListener('jimmy-state:theme', onCustom)
    setResolved(applyTheme(readTheme()))
    return () => {
      off()
      window.removeEventListener('jimmy-state:theme', onCustom)
    }
  }, [])

  const choose = (value) => {
    const next = setTheme(value)
    setPref(value)
    setResolved(next)
  }

  return { pref, resolved, choose }
}

export default function Settings() {
  const { t } = useTranslation()
  const { pref, resolved, choose } = useThemePreference()
  const { current, isDevice } = useLanguage()

  return (
    <>
      <h1>{t('settings.title')}</h1>

      <div className="card card-pad" style={{ marginTop: 14 }}>
        <span className="eyebrow">{t('settings.appearance')}</span>
        <p className="small muted" style={{ marginTop: 6 }}>
          {t('settings.appearanceNote')}
        </p>

        <div className="theme-list" role="radiogroup" aria-label={t('settings.theme')}>
          {THEMES.map((option) => {
            const active = pref === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                className={`theme-row ${active ? 'is-active' : ''}`}
                onClick={() => choose(option.value)}
              >
                <span className={`theme-swatch is-${option.value}`} aria-hidden="true">
                  <i className="sw-a" />
                  <i className="sw-b" />
                </span>
                <span className="theme-text">
                  <span className="theme-name">{t(option.label)}</span>
                  <span className="theme-note">{t(option.note)}</span>
                </span>
                <span className="theme-check" aria-hidden="true">
                  <IconCheck size={12} />
                </span>
              </button>
            )
          })}
        </div>

        <p className="tiny mute" style={{ marginTop: 12 }}>
          {pref === 'system'
            ? t('settings.followingDevice', { theme: resolved === 'light' ? t('settings.themeLight') : t('settings.themeDark') })
            : `${t('settings.savedOnDevice')} ${resolved === 'light' ? t('settings.lightIsOn') : t('settings.darkIsOn')}`}
        </p>
      </div>

      <div className="card card-pad" style={{ marginTop: 14 }}>
        <span className="eyebrow">{t('settings.language')}</span>
        <p className="small muted" style={{ marginTop: 6 }}>
          {t('settings.languageNote')}
        </p>

        <Link to="/settings/language" className="setting-row">
          <span className="setting-icon" aria-hidden="true">
            <IconLanguage size={18} />
          </span>
          <span className="grow">
            <span className="setting-name">{current.label}</span>
            <span className="setting-note">
              {current.english}
              {isDevice ? ' · ' + t('language.useDevice') : ''}
            </span>
          </span>
          <IconChevron size={16} />
        </Link>
      </div>

      <UpdateCard />

      <p className="tiny mute" style={{ marginTop: 18, textAlign: 'center' }}>
        {t('settings.moreComing')} JIMMY STATE · {t('settings.build', { version: APP_VERSION })}
      </p>
    </>
  )
}

/**
 * App update.
 *
 * The same card serves all three builds because the question — "am I current?" — is the
 * same; only the way out differs. On the website and in the PWA a reload is enough and
 * the service worker handles the shell. In the APK there is nothing to reload into, so
 * the card hands the APK link to the system browser and Android's installer replaces the
 * app in place, keeping its data directory (library, playlists, downloads, language).
 */
function UpdateCard() {
  const { t } = useTranslation()
  const [state, setState] = useState({ status: 'idle' })

  /**
   * Installing runs in place on Android (download + system installer) and hands the
   * link to the browser everywhere else. One button, one behaviour per platform.
   */
  const install = useCallback(async () => {
    const manifest = state.manifest
    if (!manifest?.apkUrl) return
    setState((prev) => ({ ...prev, status: 'installing', percent: 0 }))
    try {
      await installUpdate(manifest, {
        onProgress: ({ percent }) => setState((prev) => ({ ...prev, percent })),
      })
      dismissUpdate(manifest.versionCode)
      setState((prev) => ({ ...prev, status: 'installed' }))
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: err?.code === 'ALLOW_INSTALL_REQUIRED' ? 'permission' : 'failed',
      }))
    }
  }, [state.manifest])

  const run = useCallback(async () => {
    setState({ status: 'checking' })
    const result = await checkForUpdate()
    if (result.reason === 'unreachable' || result.reason === 'invalid') {
      setState({ status: 'failed' })
      return
    }
    if (!result.update) {
      setState({ status: 'current', manifest: result.manifest })
      return
    }
    setState({ status: 'available', manifest: result.manifest, forced: result.forced })
  }, [])

  useEffect(() => {
    let alive = true
    checkForUpdate().then((result) => {
      if (!alive) return
      if (result.update) setState({ status: 'available', manifest: result.manifest, forced: result.forced })
      else if (result.reason === 'current') setState({ status: 'current', manifest: result.manifest })
    })
    return () => {
      alive = false
    }
  }, [])

  const manifest = state.manifest

  return (
    <div className="card card-pad" style={{ marginTop: 14 }}>
      <span className="eyebrow">{t('settings.appUpdate')}</span>

      <div className="kv">
        <span>{t('settings.platform')}</span>
        <b>{isNativeApp() ? 'Android' : platformName() === 'pwa' ? 'PWA' : 'Web'}</b>
      </div>
      <div className="kv">
        <span>{t('settings.version')}</span>
        <b>{APP_VERSION}</b>
      </div>

      <p className="small muted" style={{ marginTop: 8 }}>
        {state.status === 'checking'
          ? t('update.checking')
          : state.status === 'available'
            ? `${t('update.available', { version: manifest?.version })} ${t('update.keepsData')}`
            : state.status === 'installing'
              ? t('update.downloading', { percent: state.percent || 0 })
              : state.status === 'installed'
                ? t('update.installing')
                : state.status === 'permission'
                  ? t('update.allowInstall')
                  : state.status === 'failed'
                    ? t('update.failed')
                    : state.status === 'current'
                ? t('update.current')
                : t('update.keepsData')}
      </p>

      <div className="row gap-8 wrap" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-sm" onClick={run} disabled={state.status === 'checking'}>
          {state.status === 'checking' ? t('update.checking') : t('update.check')}
        </button>

        {state.status === 'available' && manifest && (
          <button type="button" className="btn btn-primary btn-sm" onClick={install}>
            <IconDownload size={15} /> {t('update.install')}
          </button>
        )}
      </div>
    </div>
  )
}
