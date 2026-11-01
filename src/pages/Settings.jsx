import { useEffect, useState } from 'react'
import { IconCheck } from '../components/Icons.jsx'
import { THEME_OPTIONS, applyTheme, readTheme, resolveTheme, setTheme, watchSystemTheme } from '../lib/theme.js'

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
  const { pref, resolved, choose } = useThemePreference()

  return (
    <>
      <h1>Settings</h1>

      <div className="card card-pad" style={{ marginTop: 14 }}>
        <span className="eyebrow">Appearance</span>
        <p className="small muted" style={{ marginTop: 6 }}>
          Choose how JIMMY STATE looks on this device.
        </p>

        <div className="theme-list" role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.map((option) => {
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
                  <span className="theme-name">{option.label}</span>
                  <span className="theme-note">{option.note}</span>
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
            ? `Following your device — currently ${resolved}.`
            : `Saved on this device. ${resolved === 'light' ? 'Light is on.' : 'Dark is on.'}`}
        </p>
      </div>

      <p className="tiny mute" style={{ marginTop: 18, textAlign: 'center' }}>
        More settings are coming. JIMMY STATE · v1.1.0
      </p>
    </>
  )
}
