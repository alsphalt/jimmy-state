import i18n from '../i18n/index.js'

/**
 * The locale the interface is currently in. Intl already knows how to write a date or
 * a relative time in every one of the shipped languages, so these helpers ask it
 * instead of concatenating English particles.
 */
function activeLocale() {
  const fromDocument = typeof document !== 'undefined' ? document.documentElement.lang : ''
  return fromDocument || i18n.language || undefined
}

export function formatBytes(bytes, decimals = 1) {
  const n = Number(bytes)
  if (!n || n < 0) return '—'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(decimals)} ${units[i]}`
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function timeAgo(iso) {
  const then = new Date(iso).getTime()
  if (!then) return ''
  const diff = Date.now() - then
  const min = Math.round(diff / 60000)
  if (min < 1) return i18n.t('common.justNow')
  const locale = activeLocale()
  try {
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })
    if (min < 60) return relative.format(-min, 'minute')
    const hours = Math.round(min / 60)
    if (hours < 24) return relative.format(-hours, 'hour')
    const days = Math.round(hours / 24)
    if (days < 7) return relative.format(-days, 'day')
  } catch {
    // very old engines: fall through to a plain date
  }
  return new Date(then).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

export function formatDate(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(activeLocale(), { year: 'numeric', month: 'short', day: 'numeric' })
}

export function initials(text) {
  return String(text || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

export function compactNumber(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return ''
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return String(v)
}
