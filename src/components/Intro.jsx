import { useEffect, useState } from 'react'
import NeonBackground from './NeonBackground.jsx'

/**
 * DARKNOTE EVOLUTION startup intro.
 *
 * 0–1.5 s   neon background only
 * 1.5–3.4 s  DARKNOTE EVOLUTION / JIMMY TECH fade in over the same animation
 * 3.4–4.0 s  overlay fades away, revealing the app already mounted underneath
 *
 * Four seconds end to end, on purpose: the intro is a first-paint cover for the
 * bundle, not a destination. Anything longer is time a returning user pays every
 * cold launch, and the timings below are the only place that length is defined.
 *
 * Once per app open: the flag lives in sessionStorage, so internal navigation never
 * replays it, while a fresh launch (new tab, or the PWA reopened after being killed)
 * does. Reduced-motion users skip straight to the app.
 */
const KEY = 'jimmy-state:intro'

export default function Intro() {
  const [phase, setPhase] = useState('idle')

  useEffect(() => {
    let done = false
    try {
      done = window.sessionStorage.getItem(KEY) === '1'
    } catch {
      done = false
    }
    if (done) return undefined

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const mark = () => {
      try {
        window.sessionStorage.setItem(KEY, '1')
      } catch {
        /* private mode: the intro simply repeats on the next load */
      }
    }
    // A dark neon intro in front of a light app is a flash, not a brand moment.
    const lightTheme = document.documentElement.dataset.theme === 'light'
    if (reduce || lightTheme) {
      mark()
      return undefined
    }

    setPhase('bg')
    const toBrand = window.setTimeout(() => setPhase('brand'), 1500)
    const toOut = window.setTimeout(() => setPhase('out'), 3400)
    const toDone = window.setTimeout(() => {
      mark()
      setPhase('done')
    }, 4000)

    return () => {
      window.clearTimeout(toBrand)
      window.clearTimeout(toOut)
      window.clearTimeout(toDone)
    }
  }, [])

  if (phase === 'idle' || phase === 'done') return null

  return (
    <div className={`intro${phase === 'out' ? ' is-out' : ''}`} role="presentation">
      <NeonBackground intro />
      <div className={`intro-brand${phase === 'brand' || phase === 'out' ? ' is-in' : ''}`}>
        <h1 className="intro-title">DARKNOTE EVOLUTION</h1>
        <p className="intro-sub">JIMMY TECH</p>
      </div>
    </div>
  )
}
