import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { applyLanguage, readLanguagePreference, resolveSelection, writeLanguagePreference } from './index.js'
import { DEVICE_LANGUAGE, LANGUAGES, detectDeviceLanguage, languageByCode } from './languages.js'

const LanguageContext = createContext(null)

/**
 * Holds the language selection and keeps three things in step: the stored preference
 * (which may be the literal 'device'), the language actually rendered right now, and
 * the <html lang/dir> the browser sees.
 *
 * The choice itself is never resolved on the way in — a user who picked "use device
 * language" keeps following the phone, including after they later change the phone.
 */
export function LanguageProvider({ children }) {
  const [selection, setSelection] = useState(() => readLanguagePreference())
  const [resolved, setResolved] = useState(() => resolveSelection(readLanguagePreference()))

  useEffect(() => {
    let cancelled = false
    applyLanguage(selection).then((code) => {
      if (!cancelled) setResolved(code)
    })
    return () => {
      cancelled = true
    }
  }, [selection])

  const select = useCallback((next) => {
    const value = next === DEVICE_LANGUAGE || languageByCode(next).code === next ? next : DEVICE_LANGUAGE
    writeLanguagePreference(value)
    setSelection(value)
  }, [])

  const value = useMemo(
    () => ({
      selection,
      resolved,
      current: languageByCode(resolved),
      deviceLanguage: detectDeviceLanguage(),
      languages: LANGUAGES,
      isDevice: selection === DEVICE_LANGUAGE,
      select,
    }),
    [selection, resolved, select],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider')
  return context
}
