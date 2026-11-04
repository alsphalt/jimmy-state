/**
 * i18n engine.
 *
 * One i18next instance, English bundled, every other locale a lazy chunk. English is
 * always the fallback, so a half-finished catalogue degrades to a readable label
 * instead of a raw key or an empty button. Nothing here reads user data: song titles,
 * artist names, video titles and URLs are passed through untouched — only interface
 * text goes through t().
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import {
  DEFAULT_LANGUAGE,
  DEVICE_LANGUAGE,
  LANGUAGES,
  LANGUAGE_STORAGE_KEY,
  detectDeviceLanguage,
  languageByCode,
} from './languages.js'

/* Vite turns this into one dynamic import per locale file, so 50 catalogues do not
 * land in the initial bundle. */
const loaders = import.meta.glob(['./locales/*.json', '!./locales/en.json'])

const loaded = new Map()

export const SUPPORTED_CODES = LANGUAGES.map((language) => language.code)

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_CODES,
  // 'zh-Hans' must stay 'zh-Hans': i18next's default would fold it to 'zh'.
  load: 'currentOnly',
  interpolation: { escapeValue: false },
  returnNull: false,
  returnEmptyString: false,
  react: { useSuspense: false },
})

/** Load one catalogue into the instance, once. Missing file = English fallback. */
export async function loadLocale(code) {
  if (!code || code === DEFAULT_LANGUAGE) return
  if (i18n.hasResourceBundle(code, 'translation')) return
  const loader = loaders[`./locales/${code}.json`]
  if (!loader) return
  if (!loaded.has(code)) {
    loaded.set(
      code,
      loader()
        .then((module) => {
          const data = module?.default || module
          if (data && typeof data === 'object') i18n.addResourceBundle(code, 'translation', data, true, true)
        })
        .catch(() => {
          // A broken catalogue must never break the app: stay on English.
        }),
    )
  }
  await loaded.get(code)
}

/** What was chosen — an explicit code, or 'device'. */
export function readLanguagePreference() {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (stored === DEVICE_LANGUAGE) return DEVICE_LANGUAGE
    if (stored && SUPPORTED_CODES.includes(stored)) return stored
  } catch {
    // private mode / storage disabled
  }
  return DEVICE_LANGUAGE
}

export function writeLanguagePreference(selection) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, selection)
  } catch {
    // not fatal: the choice simply does not survive the session
  }
}

/** The language a selection actually means right now. */
export function resolveSelection(selection) {
  return selection === DEVICE_LANGUAGE ? detectDeviceLanguage() : languageByCode(selection).code
}

/**
 * Apply a language: load it, switch the instance, and mirror it onto <html> so the
 * browser, screen readers and the RTL rules in app.css all agree with the UI.
 */
export async function applyLanguage(selection) {
  const code = resolveSelection(selection)
  await loadLocale(code)
  await i18n.changeLanguage(code)
  const meta = languageByCode(code)
  if (typeof document !== 'undefined') {
    document.documentElement.lang = meta.code
    document.documentElement.dir = meta.dir
    document.documentElement.setAttribute('data-lang', meta.code)
  }
  return code
}

export default i18n
