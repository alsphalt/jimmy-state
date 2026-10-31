import { searchMusic } from './itunes.js'
import { normaliseAcrTrack } from './acrcloud.js'
import { lookupMetadata, applyMetadata } from './acrMetadata.js'

/**
 * Build the result set around one verified identification.
 *
 * Rules that keep this honest:
 *  - exactly one entry may be kind === 'exact', and it always comes from the
 *    recognition provider, never from a keyword search;
 *  - everything else is explicitly labelled 'similar' or 'possible';
 *  - the set is capped at 30 and de-duplicated by title+artist.
 */

const MAX_RESULTS = 30

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/feat\.?|ft\.?|featuring/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const primaryArtist = (artist) => String(artist || '').split(/,|&| feat/i)[0].trim()

export function resultKey(title, artist) {
  return `${norm(title)}::${norm(primaryArtist(artist))}`
}

function similarity(a, b) {
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const setA = new Set(x.split(' '))
  const setB = new Set(y.split(' '))
  let shared = 0
  for (const w of setA) if (setB.has(w)) shared += 1
  return shared / Math.max(setA.size, setB.size)
}

function toResult(track, kind) {
  return {
    key: resultKey(track.title, track.artist),
    kind,
    title: track.title,
    artist: track.artist,
    album: track.album || '',
    artwork: track.artwork || '',
    artworkSmall: track.artworkSmall || track.artwork || '',
    previewUrl: track.previewUrl || '',
    storeUrl: track.storeUrl || '',
    durationMs: track.durationMs || 0,
    genre: track.genre || (track.genres?.[0] ?? ''),
    releaseDate: track.releaseDate || '',
    isrc: track.isrc || '',
    trackId: track.trackId || null,
    acrScore: typeof track.score === 'number' ? track.score : null,
    confidence: typeof track.score === 'number' ? Math.max(0, Math.min(1, track.score / 100)) : null,
    providers: [...new Set([track.source, track.enrichedBy].filter(Boolean))],
    links: [],
    credits: [],
    youtubeSearchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(
      `${track.title} ${primaryArtist(track.artist)}`,
    )}`,
  }
}

/**
 * @param {Array} acrMatches raw ACRCloud metadata.music entries (index 0 = best)
 */
export async function buildRecognitionResults(acrMatches, { country = 'US' } = {}) {
  const acrTracks = (acrMatches || []).map(normaliseAcrTrack).filter((t) => t.title)
  if (!acrTracks.length) {
    return { exact: null, similar: [], possible: [], total: 0 }
  }

  const best = acrTracks[0]
  const seen = new Set([resultKey(best.title, best.artist)])

  // --- enrich the verified match with artwork + an authorized preview ---
  let exact = toResult(best, 'exact')
  exact.confidence = exact.confidence ?? 0.9

  /**
   * Enrichment runs in parallel so a slow metadata call cannot delay the match:
   *  - ACRCloud metadata (ISRC → platform links, hi-res cover, extra previews)
   *  - iTunes search (fallback artwork/preview, plus the similar-song pool)
   * Both are optional; the verified match is returned even if both fail.
   */
  const artist = primaryArtist(best.artist)
  const [metaResult, itunesResult] = await Promise.allSettled([
    lookupMetadata({ isrc: best.isrc || '', query: best.title, artists: artist ? [artist] : [] }),
    searchMusic(`${best.title} ${artist}`, { limit: 10, country }),
  ])

  if (metaResult.status === 'fulfilled' && metaResult.value?.ok) {
    exact = applyMetadata(exact, metaResult.value)
  }

  if (itunesResult.status === 'fulfilled') {
    const candidates = itunesResult.value || []
    const ranked = candidates
      .map((c) => ({ c, s: similarity(c.title, best.title) + similarity(c.artist, best.artist) * 0.6 }))
      .filter((r) => r.s > 0.55)
      .sort((a, b) => b.s - a.s)
    if (ranked[0]) {
      const hit = ranked[0].c
      exact = {
        ...exact,
        artwork: exact.artwork || hit.artwork,
        artworkSmall: exact.artworkSmall || hit.artworkSmall,
        previewUrl: exact.previewUrl || hit.previewUrl || '',
        storeUrl: exact.storeUrl || hit.storeUrl,
        album: exact.album || hit.album,
        genre: exact.genre || hit.genre,
        durationMs: exact.durationMs || hit.durationMs,
        trackId: exact.trackId || hit.trackId,
        releaseDate: exact.releaseDate || hit.releaseDate,
        providers: [...new Set([...exact.providers, 'itunes'])],
      }
    }
  }

  const similar = []
  const possible = []

  // --- similar: more from the same artist (real catalogue data) ---
  try {
    const sameArtist = await searchMusic(primaryArtist(best.artist), { limit: 24, country })
    for (const track of sameArtist) {
      const key = resultKey(track.title, track.artist)
      if (seen.has(key)) continue
      if (similarity(track.artist, best.artist) < 0.5) continue
      seen.add(key)
      similar.push(toResult(track, 'similar'))
      if (similar.length >= 20) break
    }
  } catch {
    /* ignore provider failure */
  }

  // --- possible: same title by other artists, plus lower-confidence ACR candidates ---
  for (const alt of acrTracks.slice(1, 5)) {
    const key = resultKey(alt.title, alt.artist)
    if (seen.has(key)) continue
    seen.add(key)
    possible.push({ ...toResult(alt, 'possible'), confidence: alt.score ? Math.min(1, alt.score / 100) : null })
  }
  try {
    const sameTitle = await searchMusic(`${best.title}`, { limit: 16, country })
    for (const track of sameTitle) {
      const key = resultKey(track.title, track.artist)
      if (seen.has(key)) continue
      if (similarity(track.title, best.title) < 0.6) continue
      seen.add(key)
      possible.push(toResult(track, 'possible'))
      if (possible.length >= 9) break
    }
  } catch {
    /* ignore provider failure */
  }

  // --- budget: exact (1) + similar + possible <= 30 ---
  const trimmedSimilar = similar.slice(0, Math.min(20, MAX_RESULTS - 1 - Math.min(possible.length, 9)))
  const trimmedPossible = possible.slice(0, MAX_RESULTS - 1 - trimmedSimilar.length)
  const total = 1 + trimmedSimilar.length + trimmedPossible.length

  return { exact, similar: trimmedSimilar, possible: trimmedPossible, total }
}

export const _internal = { similarity, norm, primaryArtist, MAX_RESULTS, toResult }
