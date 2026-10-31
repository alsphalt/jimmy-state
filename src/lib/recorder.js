/**
 * Microphone capture for recognition.
 *
 * Records raw PCM through the Web Audio API instead of MediaRecorder, then encodes
 * a 16 kHz mono WAV. Reason: MediaRecorder's container (WebM/Opus) varies per
 * browser and is not accepted by ACRCloud's sample endpoint, while a WAV buffer is.
 * Raw samples also give the UI a real level meter for the waveform.
 *
 * The stream is always torn down in stop()/cancel() — the microphone is never left
 * open after a recognition attempt, successful or not.
 */

const TARGET_RATE = 16000
const MAX_SECONDS = 15

function micError(err) {
  const name = err?.name || ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return Object.assign(
      new Error(
        'Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.',
      ),
      { code: 'MIC_DENIED' },
    )
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return Object.assign(new Error('No microphone was found on this device.'), { code: 'MIC_MISSING' })
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return Object.assign(
      new Error('The microphone is busy in another app. Close it and try again.'),
      { code: 'MIC_BUSY' },
    )
  }
  return Object.assign(new Error(err?.message || 'Could not start the microphone.'), { code: 'MIC_FAILED' })
}

function downmixToMono(channelData) {
  if (channelData.length === 1) return channelData[0]
  const length = channelData[0].length
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    let sum = 0
    for (let c = 0; c < channelData.length; c++) sum += channelData[c][i] || 0
    out[i] = sum / channelData.length
  }
  return out
}

function downsample(input, inRate, outRate) {
  if (outRate >= inRate) return input
  const ratio = inRate / outRate
  const outLength = Math.floor(input.length / ratio)
  const out = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    let count = 0
    for (let j = start; j < end; j++) {
      sum += input[j]
      count += 1
    }
    out[i] = count ? sum / count : 0
  }
  return out
}

export function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return buffer
}

export class MicRecorder {
  constructor() {
    this.stream = null
    this.ctx = null
    this.source = null
    this.processor = null
    this.chunks = []
    this.sampleRate = 44100
    this.seconds = 0
    this.startedAt = 0
    this.interval = null
  }

  get recording() {
    return Boolean(this.stream)
  }

  async start(onLevel) {
    if (this.recording) return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw Object.assign(
        new Error(
          window.isSecureContext
            ? 'This browser does not expose microphone recording. Try Chrome or Safari.'
            : 'Microphone access needs HTTPS (or localhost). Open the app over a secure connection.',
        ),
        { code: 'MIC_UNSUPPORTED' },
      )
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
    } catch (err) {
      throw micError(err)
    }

    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) {
      this.teardown()
      throw Object.assign(new Error('Web Audio is not available in this browser.'), { code: 'AUDIO_UNSUPPORTED' })
    }

    this.ctx = new Ctx()
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {})
    this.sampleRate = this.ctx.sampleRate
    this.source = this.ctx.createMediaStreamSource(this.stream)

    const processor = this.ctx.createScriptProcessor(4096, 1, 1)
    this.processor = processor
    this.chunks = []
    this.startedAt = performance.now()

    processor.onaudioprocess = (event) => {
      if (!this.recording) return
      const channel = event.inputBuffer.getChannelData(0)
      this.chunks.push(new Float32Array(channel))
      this.seconds = (performance.now() - this.startedAt) / 1000
      if (typeof onLevel === 'function') {
        let sum = 0
        for (let i = 0; i < channel.length; i++) sum += channel[i] * channel[i]
        onLevel(Math.min(1, Math.sqrt(sum / channel.length) * 6), this.seconds)
      }
      if (this.seconds >= MAX_SECONDS) this.onMaxDuration?.()
    }

    this.source.connect(processor)
    // A ScriptProcessor needs a destination to be pulled; route through a silent gain.
    const mute = this.ctx.createGain()
    mute.gain.value = 0
    this.mute = mute
    processor.connect(mute)
    mute.connect(this.ctx.destination)
  }

  /** @returns {{blob: Blob, seconds: number, rms: number}} */
  stop() {
    if (!this.stream) {
      throw Object.assign(new Error('Recorder is not running.'), { code: 'NOT_RECORDING' })
    }
    const seconds = (performance.now() - this.startedAt) / 1000
    const mergedLength = this.chunks.reduce((n, c) => n + c.length, 0)
    const merged = new Float32Array(mergedLength)
    let offset = 0
    for (const chunk of this.chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    let rms = 0
    for (let i = 0; i < merged.length; i += 64) rms += merged[i] * merged[i]
    rms = Math.sqrt(rms / Math.max(1, merged.length / 64))

    const mono = downmixToMono([merged])
    const pcm16k = downsample(mono, this.sampleRate, TARGET_RATE)
    const wav = encodeWav(pcm16k, TARGET_RATE)

    this.teardown()
    return { blob: new Blob([wav], { type: 'audio/wav' }), seconds, rms, peak: Number(wav.byteLength) }
  }

  cancel() {
    this.teardown()
  }

  teardown() {
    this.chunks = []
    this.seconds = 0
    if (this.processor) {
      this.processor.onaudioprocess = null
      try { this.processor.disconnect() } catch {}
      this.processor = null
    }
    if (this.mute) {
      try { this.mute.disconnect() } catch {}
      this.mute = null
    }
    if (this.source) {
      try { this.source.disconnect() } catch {}
      this.source = null
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop())
      this.stream = null
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {})
      this.ctx = null
    }
  }
}

export const RECOGNITION_LIMITS = { maxSeconds: MAX_SECONDS, minSeconds: 4, sampleRate: TARGET_RATE }
