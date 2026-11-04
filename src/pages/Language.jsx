import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../components/ui.jsx'
import { IconArrowLeft, IconCheck, IconGlobe, IconSearch, IconX } from '../components/Icons.jsx'
import { useLanguage } from '../i18n/LanguageProvider.jsx'
import { DEVICE_LANGUAGE } from '../i18n/languages.js'

/**
 * Language picker.
 *
 * Names are shown the way the language writes itself, with the English name underneath
 * so the list is still navigable for someone who cannot read the script. Song titles,
 * artist names and video titles are deliberately out of scope — only the interface
 * changes, which the footnote states.
 */
export default function Language() {
  const { t } = useTranslation()
  const { selection, current, deviceLanguage, languages, select } = useLanguage()
  const [query, setQuery] = useState('')
  const listRef = useRef(null)

  const deviceEntry = useMemo(
    () => languages.find((language) => language.code === deviceLanguage) || languages[0],
    [languages, deviceLanguage],
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return languages
    return languages.filter(
      (language) =>
        language.label.toLowerCase().includes(q) ||
        language.english.toLowerCase().includes(q) ||
        language.code.toLowerCase().includes(q),
    )
  }, [languages, query])

  const choose = (code) => {
    select(code)
    listRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <Link to="/settings" className="btn btn-sm btn-ghost">
          <IconArrowLeft size={16} /> {t('settings.title')}
        </Link>
      </div>

      <h1>{t('language.title')}</h1>
      <p className="small muted" style={{ marginTop: 6 }}>
        {t('language.subtitle')}
      </p>

      <div className="card card-pad lang-now">
        <span className="eyebrow">{t('language.current')}</span>
        <div className="row between" style={{ marginTop: 8 }}>
          <div className="grow">
            <strong className="lang-now-name">{current.label}</strong>
            <span className="tiny mute" style={{ display: 'block', marginTop: 2 }}>
              {current.english}
            </span>
          </div>
          <span className="badge">{current.code}</span>
        </div>
        {current.dir === 'rtl' ? (
          <p className="tiny mute" style={{ marginTop: 8 }}>
            {t('language.rtlNote')}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        className={`theme-row lang-device ${selection === DEVICE_LANGUAGE ? 'is-active' : ''}`}
        role="radio"
        aria-checked={selection === DEVICE_LANGUAGE}
        onClick={() => choose(DEVICE_LANGUAGE)}
        style={{ marginTop: 12, width: '100%' }}
      >
        <span className="lang-swatch" aria-hidden="true">
          <IconGlobe size={17} />
        </span>
        <span className="theme-text">
          <span className="theme-name">{t('language.useDevice')}</span>
          <span className="theme-note">{t('language.deviceDetected', { language: deviceEntry.label })}</span>
        </span>
        <span className="theme-check" aria-hidden="true">
          <IconCheck size={12} />
        </span>
      </button>

      <div className="field" style={{ marginTop: 16 }}>
        <IconSearch size={17} className="field-icon" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('language.searchPlaceholder')}
          aria-label={t('language.searchPlaceholder')}
          type="search"
          autoComplete="off"
          spellCheck="false"
        />
        {query ? (
          <button type="button" className="icon-btn" aria-label={t('common.clear')} onClick={() => setQuery('')} style={{ width: 28, height: 28 }}>
            <IconX size={14} />
          </button>
        ) : null}
      </div>

      <div className="section-head" style={{ marginTop: 16, marginBottom: 8 }}>
        <span className="eyebrow">{t('language.count', { count: results.length })}</span>
        {query ? <span className="tiny mute truncate">“{query}”</span> : null}
      </div>

      {results.length === 0 ? (
        <EmptyState icon={<IconGlobe size={22} />} title={t('language.noMatch', { query })}>
          {t('language.noMatchHint')}
        </EmptyState>
      ) : (
        <div className="lang-list" role="radiogroup" aria-label={t('language.title')} ref={listRef}>
          {results.map((language) => {
            const active = selection === language.code
            return (
              <button
                key={language.code}
                type="button"
                role="radio"
                aria-checked={active}
                className={`lang-row ${active ? 'is-active' : ''}`}
                onClick={() => choose(language.code)}
                lang={language.code}
              >
                <span className="lang-text">
                  <span className="lang-name" dir={language.dir}>
                    {language.label}
                  </span>
                  <span className="lang-sub">{language.english}</span>
                </span>
                {language.dir === 'rtl' ? <span className="badge lang-rtl">RTL</span> : null}
                <span className="theme-check" aria-hidden="true">
                  <IconCheck size={12} />
                </span>
              </button>
            )
          })}
        </div>
      )}

      <p className="tiny mute" style={{ marginTop: 16, lineHeight: 1.5 }}>
        {t('language.note')}
      </p>
    </>
  )
}
