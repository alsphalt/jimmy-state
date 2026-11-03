/**
 * Jimmy Tube preferences — playback + equalizer settings, per device.
 *
 * Kept in localStorage rather than the library database: these are device-level audio
 * preferences, not content, and they must survive a library wipe.
 */
const KEY = 'jimmy-state:tube'

export const EQ_PRESETS = [
  { id: 'flat', label: 'Flat', bass: 0, mid: 0, treble: 0 },
  { id: 'bass', label: 'Bass', bass: 7, mid: 0, treble: 1 },
  { id: 'vocal', label: 'Vocal', bass: -2, mid: 4, treble: 1 },
  { id: 'bright', label: 'Bright', bass: 0, mid: 1, treble: 6 },
  { id: 'loud', label: 'Loud', bass: 5, mid: 2, treble: 5 },
]

export const DEFAULT_PREFS = {
  eqEnabled: false,
  eqPreset: 'flat',
  bass: 0,
  mid: 0,
  treble: 0,
  autoplayNext: true,
  rememberPosition: true,
}

export function readTubePrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}')
    const merged = { ...DEFAULT_PREFS, ...(raw && typeof raw === 'object' ? raw : {}) }
    // Clamp, so a hand-edited value cannot blow the speakers.
    for (const band of ['bass', 'mid', 'treble']) {
      const value = Number(merged[band])
      merged[band] = Number.isFinite(value) ? Math.max(-12, Math.min(12, value)) : 0
    }
    if (!EQ_PRESETS.some((preset) => preset.id === merged.eqPreset)) merged.eqPreset = 'flat'
    return merged
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function writeTubePrefs(patch) {
  const next = { ...readTubePrefs(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private mode: the choice lasts for this session only */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('jimmy-state:tube-prefs', { detail: next }))
  }
  return next
}
