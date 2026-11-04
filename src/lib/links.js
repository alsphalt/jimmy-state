/**
 * A pasted link is an instruction, not a query. YouTube ids open the in-app player;
 * TikTok links hand over to the resolver. Anything else falls through to text search.
 */
export function readLink(raw) {
  const value = String(raw || '').trim()
  if (!/^https?:\/\//i.test(value)) return null
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\./i, '').toLowerCase()
  if (/^(youtu\.be|m\.youtube\.com|youtube\.com|music\.youtube\.com)$/.test(host)) {
    const fromQuery = url.searchParams.get('v') || ''
    const fromPath = (url.pathname.match(/\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{6,})/) || [])[1] || ''
    const id = (host === 'youtu.be' ? url.pathname.slice(1) : fromQuery || fromPath || fromQuery).slice(0, 32)
    if (/^[A-Za-z0-9_-]{6,}$/.test(id)) return { kind: 'youtube', id }
    return { kind: 'invalid', note: 'That YouTube link has no video id in it.' }
  }
  if (/^(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)$/.test(host)) return { kind: 'tiktok', url: value }
  return { kind: 'invalid', note: 'Only YouTube and TikTok links are recognised in this box.' }
}
