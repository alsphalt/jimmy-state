/** Canonical track shape + stable keys, shared by every page. */

export function normalizeKeyPart(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/feat\.?|ft\.?|featuring/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function trackKey(track) {
  if (track?.key) return track.key
  const artist = String(track?.artist || '').split(/,|&| feat/i)[0]
  return `${normalizeKeyPart(track?.title)}::${normalizeKeyPart(artist)}`
}

export function normalizeTrack(raw) {
  if (!raw) return null
  return {
    key: trackKey(raw),
    title: raw.title || 'Unknown title',
    artist: raw.artist || 'Unknown artist',
    album: raw.album || '',
    artwork: raw.artwork || raw.artworkSmall || '',
    artworkSmall: raw.artworkSmall || raw.artwork || '',
    previewUrl: raw.previewUrl || '',
    storeUrl: raw.storeUrl || '',
    durationMs: Number(raw.durationMs || 0),
    genre: raw.genre || '',
    releaseDate: raw.releaseDate || '',
    trackId: raw.trackId || null,
    kind: raw.kind || 'track',
    confidence: typeof raw.confidence === 'number' ? raw.confidence : null,
    acrScore: typeof raw.acrScore === 'number' ? raw.acrScore : null,
    isrc: raw.isrc || '',
    label: raw.label || '',
    links: Array.isArray(raw.links) ? raw.links : [],
    credits: Array.isArray(raw.credits) ? raw.credits : [],
    providers: Array.isArray(raw.providers) ? raw.providers : [],
    youtubeSearchUrl:
      raw.youtubeSearchUrl ||
      `https://www.youtube.com/results?search_query=${encodeURIComponent(`${raw.title || ''} ${raw.artist || ''}`)}`,
    source: raw.source || 'itunes',
  }
}

export function normalizeVideo(raw) {
  if (!raw) return null
  return {
    videoId: raw.videoId,
    title: raw.title || 'Untitled video',
    channel: raw.channel || '',
    thumbnail: raw.thumbnail || (raw.videoId ? `https://i.ytimg.com/vi/${raw.videoId}/hqdefault.jpg` : ''),
    durationSeconds: Number(raw.durationSeconds || 0),
    views: raw.views ?? null,
    publishedAt: raw.publishedAt || '',
    embeddable: raw.embeddable !== false,
    watchUrl: raw.watchUrl || `https://www.youtube.com/watch?v=${raw.videoId}`,
    previewUrl: raw.previewUrl || '',
    storeUrl: raw.storeUrl || '',
    kind: raw.kind || 'youtube',
    genre: raw.genre || '',
    source: raw.source || 'youtube',
  }
}
