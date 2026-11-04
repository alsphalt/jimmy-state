/**
 * The language registry.
 *
 * One entry per shipped locale. `code` is the BCP 47 tag the app stores and hands to
 * i18next; `label` is how the language names itself (a language picker that says
 * "Japanese" to a Japanese speaker is a picker they cannot use); `english` exists so
 * someone who cannot read the script can still find it; `dir` drives <html dir>.
 *
 * Adding a language is two steps: add the row here and drop a JSON file with the same
 * code into ./locales. validate-locales.mjs checks that the two never drift apart.
 */
export const LANGUAGES = [
  { code: 'en', label: 'English', english: 'English', dir: 'ltr' },
  { code: 'sw', label: 'Kiswahili', english: 'Swahili', dir: 'ltr' },
  { code: 'fr', label: 'Français', english: 'French', dir: 'ltr' },
  { code: 'es', label: 'Español', english: 'Spanish', dir: 'ltr' },
  { code: 'pt', label: 'Português', english: 'Portuguese', dir: 'ltr' },
  { code: 'de', label: 'Deutsch', english: 'German', dir: 'ltr' },
  { code: 'it', label: 'Italiano', english: 'Italian', dir: 'ltr' },
  { code: 'ar', label: 'العربية', english: 'Arabic', dir: 'rtl' },
  { code: 'zh-Hans', label: '简体中文', english: 'Chinese (Simplified)', dir: 'ltr' },
  { code: 'zh-Hant', label: '繁體中文', english: 'Chinese (Traditional)', dir: 'ltr' },
  { code: 'ja', label: '日本語', english: 'Japanese', dir: 'ltr' },
  { code: 'ko', label: '한국어', english: 'Korean', dir: 'ltr' },
  { code: 'hi', label: 'हिन्दी', english: 'Hindi', dir: 'ltr' },
  { code: 'bn', label: 'বাংলা', english: 'Bengali', dir: 'ltr' },
  { code: 'ur', label: 'اردو', english: 'Urdu', dir: 'rtl' },
  { code: 'tr', label: 'Türkçe', english: 'Turkish', dir: 'ltr' },
  { code: 'ru', label: 'Русский', english: 'Russian', dir: 'ltr' },
  { code: 'nl', label: 'Nederlands', english: 'Dutch', dir: 'ltr' },
  { code: 'sv', label: 'Svenska', english: 'Swedish', dir: 'ltr' },
  { code: 'nb', label: 'Norsk bokmål', english: 'Norwegian', dir: 'ltr' },
  { code: 'da', label: 'Dansk', english: 'Danish', dir: 'ltr' },
  { code: 'fi', label: 'Suomi', english: 'Finnish', dir: 'ltr' },
  { code: 'pl', label: 'Polski', english: 'Polish', dir: 'ltr' },
  { code: 'uk', label: 'Українська', english: 'Ukrainian', dir: 'ltr' },
  { code: 'el', label: 'Ελληνικά', english: 'Greek', dir: 'ltr' },
  { code: 'he', label: 'עברית', english: 'Hebrew', dir: 'rtl' },
  { code: 'th', label: 'ไทย', english: 'Thai', dir: 'ltr' },
  { code: 'vi', label: 'Tiếng Việt', english: 'Vietnamese', dir: 'ltr' },
  { code: 'id', label: 'Bahasa Indonesia', english: 'Indonesian', dir: 'ltr' },
  { code: 'ms', label: 'Bahasa Melayu', english: 'Malay', dir: 'ltr' },
  { code: 'fil', label: 'Filipino', english: 'Filipino', dir: 'ltr' },
  { code: 'am', label: 'አማርኛ', english: 'Amharic', dir: 'ltr' },
  { code: 'so', label: 'Soomaali', english: 'Somali', dir: 'ltr' },
  { code: 'yo', label: 'Yorùbá', english: 'Yoruba', dir: 'ltr' },
  { code: 'ha', label: 'Hausa', english: 'Hausa', dir: 'ltr' },
  { code: 'zu', label: 'isiZulu', english: 'Zulu', dir: 'ltr' },
  { code: 'xh', label: 'isiXhosa', english: 'Xhosa', dir: 'ltr' },
  { code: 'fa', label: 'فارسی', english: 'Persian', dir: 'rtl' },
  { code: 'ro', label: 'Română', english: 'Romanian', dir: 'ltr' },
  { code: 'cs', label: 'Čeština', english: 'Czech', dir: 'ltr' },
  { code: 'hu', label: 'Magyar', english: 'Hungarian', dir: 'ltr' },
]

export const DEFAULT_LANGUAGE = 'en'

/** The stored preference for "follow the phone". Not a language code. */
export const DEVICE_LANGUAGE = 'device'

export const LANGUAGE_STORAGE_KEY = 'jimmy-state:language'

const BY_CODE = new Map(LANGUAGES.map((language) => [language.code.toLowerCase(), language]))

/** Exact tag, then base language, then English. */
export function resolveLanguage(tag) {
  if (!tag) return null
  const lower = String(tag).toLowerCase().replace('_', '-')
  if (BY_CODE.has(lower)) return BY_CODE.get(lower)
  const base = lower.split('-')[0]
  return BY_CODE.get(base) || null
}

export function languageByCode(code) {
  return resolveLanguage(code) || BY_CODE.get(DEFAULT_LANGUAGE)
}

export function isRtl(code) {
  return languageByCode(code)?.dir === 'rtl'
}

/** The browser's ordered preference list, first match that we actually ship. */
export function detectDeviceLanguage() {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE
  const tags = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language].filter(Boolean)
  for (const tag of tags) {
    const match = resolveLanguage(tag)
    if (match) return match.code
  }
  return DEFAULT_LANGUAGE
}
