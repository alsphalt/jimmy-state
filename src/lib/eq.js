/**
 * Three-band equalizer for an <audio> element, via the Web Audio API.
 *
 * Scope note: this only touches media this app can read — locally picked files and
 * provider preview clips. YouTube playback happens inside YouTube's own iframe, so no
 * page script can process its audio; the settings screen says so rather than offering a
 * control that would silently do nothing.
 *
 * createMediaElementSource may be called once per element for its whole lifetime, so the
 * graph is cached per element.
 */
const graphs = new WeakMap()

export function supportsEqualizer() {
  return typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext)
}

export function attachEqualizer(audio) {
  if (!audio || !supportsEqualizer()) return null
  if (graphs.has(audio)) return graphs.get(audio)

  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    const context = new Ctx()
    const source = context.createMediaElementSource(audio)

    const low = context.createBiquadFilter()
    low.type = 'lowshelf'
    low.frequency.value = 220

    const midBand = context.createBiquadFilter()
    midBand.type = 'peaking'
    midBand.frequency.value = 1100
    midBand.Q.value = 0.9

    const high = context.createBiquadFilter()
    high.type = 'highshelf'
    high.frequency.value = 4200

    source.connect(low)
    low.connect(midBand)
    midBand.connect(high)
    high.connect(context.destination)

    const graph = {
      context,
      apply({ enabled = true, bass = 0, mid = 0, treble = 0 } = {}) {
        const scale = enabled ? 1 : 0
        low.gain.value = bass * scale
        midBand.gain.value = mid * scale
        high.gain.value = treble * scale
      },
      resume() {
        if (context.state === 'suspended') context.resume().catch(() => {})
      },
    }
    graphs.set(audio, graph)
    return graph
  } catch {
    return null
  }
}
