import crypto from 'node:crypto'

/**
 * ACRCloud identification client.
 *
 * Auth is a signed request (signature_version=1):
 *   stringToSign = "POST\n/v1/identify\n<access_key>\naudio\n1\n<timestamp>"
 *   signature    = base64( HMAC-SHA1(stringToSign, access_secret) )
 *
 * Credentials stay on the server. The browser never sees them.
 */

const DEFAULT_HOST = 'identify-ap-southeast-1.acrcloud.com'

export const ACR = {
  host: process.env.ACR_HOST || DEFAULT_HOST,
  key: process.env.ACR_ACCESS_KEY || '',
  secret: process.env.ACR_ACCESS_SECRET || '',
}

export function acrConfigured() {
  return Boolean(ACR.key && ACR.secret && ACR.host)
}

export function signAcr(accessKey, accessSecret, timestamp = Math.floor(Date.now() / 1000)) {
  const stringToSign = ['POST', '/v1/identify', accessKey, 'audio', '1', String(timestamp)].join('\n')
  return crypto.createHmac('sha1', accessSecret).update(stringToSign).digest('base64')
}

/** Basic WAV sniffing so we never forward junk to the provider. */
export function inspectAudio(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1024) {
    return { ok: false, reason: 'The recording was too short. Hold the button longer and try again.' }
  }
  const riff = buffer.subarray(0, 4).toString('ascii') === 'RIFF'
  const wave = buffer.subarray(8, 12).toString('ascii') === 'WAVE'
  if (!riff || !wave) {
    return { ok: false, reason: 'Unsupported audio container. JIMMY STATE expects a WAV sample from the browser recorder.' }
  }
  return { ok: true }
}

/**
 * Identify a WAV buffer.
 * @returns {Promise<{ok:boolean, matched:boolean, reason?:string, matches:Array, raw?:object}>}
 */
export async function identify(buffer) {
  const check = inspectAudio(buffer)
  if (!check.ok) return { ok: false, matched: false, reason: check.reason, matches: [] }

  if (!acrConfigured()) {
    return {
      ok: false,
      matched: false,
      code: 'RECOGNITION_NOT_CONFIGURED',
      reason:
        'Music recognition is not configured on this server. Add ACR_ACCESS_KEY and ACR_ACCESS_SECRET to .env, then restart.',
      matches: [],
    }
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const form = new FormData()
  form.append('sample', new Blob([buffer], { type: 'audio/wav' }), 'sample.wav')
  form.append('sample_bytes', String(buffer.length))
  form.append('access_key', ACR.key)
  form.append('data_type', 'audio')
  form.append('signature_version', '1')
  form.append('timestamp', String(timestamp))
  form.append('signature', signAcr(ACR.key, ACR.secret, timestamp))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  let res, body
  try {
    res = await fetch(`https://${ACR.host}/v1/identify`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
      headers: { 'User-Agent': 'JimmyState/1.0' },
    })
    body = await res.json().catch(() => null)
  } catch (err) {
    clearTimeout(timer)
    const aborted = err?.name === 'AbortError'
    return {
      ok: false,
      matched: false,
      code: aborted ? 'RECOGNITION_TIMEOUT' : 'RECOGNITION_UNREACHABLE',
      reason: aborted
        ? 'The recognition service did not answer in time. Check your connection and try again.'
        : 'Could not reach the recognition service. Check the server connection and try again.',
      matches: [],
    }
  }
  clearTimeout(timer)

  if (!res.ok) {
    return {
      ok: false,
      matched: false,
      code: 'RECOGNITION_HTTP_ERROR',
      reason: `Recognition service returned HTTP ${res.status}.`,
      matches: [],
    }
  }

  const code = body?.status?.code
  if (code === 1001) {
    return {
      ok: true,
      matched: false,
      code: 'NO_MATCH',
      reason: 'No match found. Move closer to the speakers, keep it quiet, and try again.',
      matches: [],
    }
  }
  if (code !== 0) {
    return {
      ok: false,
      matched: false,
      code: 'RECOGNITION_ERROR',
      reason: body?.status?.msg || 'The recognition service could not process this sample.',
      matches: [],
    }
  }

  const music = Array.isArray(body?.metadata?.music) ? body.metadata.music : []
  if (music.length === 0) {
    // ACRCloud can answer 0 with an empty music array; treat it exactly like 1001.
    return {
      ok: true,
      matched: false,
      code: 'NO_MATCH',
      reason: 'No match found. Move closer to the speakers, keep the room quiet, and try again.',
      matches: [],
      raw: body,
    }
  }
  return { ok: true, matched: true, matches: music, raw: body, code: 'MATCH' }
}

/** Normalise one ACRCloud music entry into the shape the frontend uses. */
export function normaliseAcrTrack(entry, index = 0) {
  const artists = (entry?.artists || []).map((a) => a?.name).filter(Boolean)
  return {
    title: entry?.title || 'Unknown title',
    artist: artists.join(', ') || 'Unknown artist',
    album: entry?.album?.name || '',
    releaseDate: entry?.release_date || '',
    label: entry?.label || '',
    genres: (entry?.genres || []).map((g) => g?.name).filter(Boolean),
    isrc: entry?.external_ids?.isrc || '',
    score: typeof entry?.score === 'number' ? entry.score : null,
    source: 'acrcloud',
    sourceIndex: index,
  }
}
