import dns from 'node:dns/promises'
import net from 'node:net'

/**
 * Download source policy.
 *
 * Only hosts on this list may be proxied for file saving. Everything here is a
 * provider that publishes the file for public consumption (Apple's preview clips,
 * Apple artwork, and any extra hosts an operator explicitly opts into through
 * DOWNLOAD_ALLOWED_HOSTS). There is no YouTube path, no stream extraction and no
 * DRM handling anywhere in this application.
 */
const DEFAULT_HOSTS = [
  'audio-ssl.itunes.apple.com',
  'video-ssl.itunes.apple.com',
  'itunes.apple.com',
  'mzstatic.com',
]

export function allowedHosts() {
  const extra = String(process.env.DOWNLOAD_ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return [...new Set([...DEFAULT_HOSTS, ...extra])]
}

function hostMatches(host, allowed) {
  if (host === allowed) return true
  // Entry without a dot is treated as a domain suffix (e.g. "mzstatic.com" covers "is1-ssl.mzstatic.com").
  return allowed.includes('.') && !allowed.startsWith('.') && host.endsWith(`.${allowed}`)
}

function isPrivateAddress(address) {
  if (!net.isIP(address)) return true
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    )
  }
  const lower = address.toLowerCase()
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80') ||
    lower.startsWith('::ffff:127.') ||
    lower.startsWith('::ffff:10.') ||
    lower.startsWith('::ffff:192.168.')
  )
}

/**
 * @returns {Promise<{ok:true, url:URL}|{ok:false, reason:string, code:string}>}
 */
export async function assertDownloadable(rawUrl) {
  let url
  try {
    url = new URL(String(rawUrl || '').trim())
  } catch {
    return { ok: false, code: 'INVALID_URL', reason: 'That link is not a valid URL.' }
  }
  if (url.protocol !== 'https:') {
    return { ok: false, code: 'INSECURE_URL', reason: 'Only https:// sources can be saved.' }
  }
  if (url.username || url.password) {
    return { ok: false, code: 'CREDENTIALS_IN_URL', reason: 'Links containing credentials are rejected.' }
  }
  if (url.port && url.port !== '443') {
    return { ok: false, code: 'BAD_PORT', reason: 'Only the standard https port is allowed.' }
  }
  const host = url.hostname.toLowerCase()
  if (net.isIP(host)) {
    return { ok: false, code: 'IP_LITERAL', reason: 'IP-address URLs are not allowed.' }
  }
  if (!allowedHosts().some((allowed) => hostMatches(host, allowed))) {
    return {
      ok: false,
      code: 'HOST_NOT_ALLOWED',
      reason:
        'This source is not on the authorized download list. JIMMY STATE only saves files that a provider publishes for download.',
    }
  }
  try {
    const records = await dns.lookup(host, { all: true })
    if (records.some((r) => isPrivateAddress(r.address))) {
      return { ok: false, code: 'PRIVATE_ADDRESS', reason: 'Host resolves to a private address.' }
    }
  } catch {
    return { ok: false, code: 'DNS_FAILED', reason: 'Could not resolve the source host.' }
  }
  return { ok: true, url }
}

const EXT_BY_TYPE = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/x-m4p': 'm4a',
  'audio/x-aac': 'aac',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'video/mp4': 'mp4',
  'video/x-m4v': 'm4v',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

export function extensionFor(contentType, fallbackName = '') {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase()
  if (EXT_BY_TYPE[type]) return EXT_BY_TYPE[type]
  const m = /\.([a-z0-9]{2,4})$/i.exec(fallbackName)
  return m ? m[1].toLowerCase() : 'bin'
}

export function sanitiseFileName(name, contentType) {
  const base = String(name || 'jimmy-state-download')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'jimmy-state-download'
  const ext = extensionFor(contentType, base)
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`
}

export function isMediaType(contentType) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase()
  return type.startsWith('audio/') || type.startsWith('video/')
}
