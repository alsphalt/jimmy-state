/**
 * Locale validator.
 *
 * English is the reference catalogue: it defines the key set and the placeholders. Every
 * other file is checked against it, because a translation with a renamed key is invisible
 * at runtime — i18next just falls back and nobody notices a page is still English.
 *
 *   node scripts/validate-locales.mjs            # all languages
 *   node scripts/validate-locales.mjs fr de      # just these
 *
 * Hard errors (exit 1): unparseable JSON, a key English does not have, a value that is
 * not a string, a placeholder mismatch, an empty value.
 * Warnings: a missing key — legal, it falls back to English, but reported so the gap is
 * visible rather than assumed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LANGUAGES } from '../src/i18n/languages.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LOCALES = path.join(ROOT, 'src', 'i18n', 'locales')

/** Interface chrome every locale should cover: the shell, settings, the picker, states. */
const CORE_PREFIXES = ['nav.', 'common.', 'state.', 'settings.', 'language.', 'install.', 'player.', 'home.', 'tube.']
const CORE_EXACT = [
  'discover.title',
  'identify.title',
  'results.title',
  'videos.title',
  'search.title',
  'library.title',
  'downloads.title',
  'playlists.title',
  'watchLater.title',
  'privacy.title',
  'services.title',
  'tiktok.title',
  'watch.title',
]

const isCore = (key) => CORE_EXACT.includes(key) || CORE_PREFIXES.some((prefix) => key.startsWith(prefix))

const placeholders = (value) => [...String(value).matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort()

const english = JSON.parse(fs.readFileSync(path.join(LOCALES, 'en.json'), 'utf8'))
const englishKeys = Object.keys(english)
const wanted = process.argv.slice(2).filter((arg) => !arg.startsWith('-'))
const codes = LANGUAGES.map((language) => language.code).filter((code) => code !== 'en' && (wanted.length === 0 || wanted.includes(code)))

let errors = 0
let warnings = 0
const rows = []

for (const code of codes) {
  const file = path.join(LOCALES, `${code}.json`)
  const problems = []
  const notes = []

  if (!fs.existsSync(file)) {
    rows.push({ code, state: 'missing', problems: ['no catalogue file'], notes: [] })
    errors += 1
    continue
  }

  let data
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    rows.push({ code, state: 'invalid', problems: [`JSON: ${err.message}`], notes: [] })
    errors += 1
    continue
  }

  const keys = Object.keys(data)
  // A plural variant (`_few`, `_many`, …) is legal when its base key exists in English:
  // Slavic and Arabic catalogues need more categories than English does.
  const known = (key) => key in english || /_(zero|one|two|few|many|other)$/.test(key) && key.replace(/_(zero|one|two|few|many|other)$/, '_one') in english
  const unknown = keys.filter((key) => !known(key))
  if (unknown.length) problems.push(`${unknown.length} unknown key(s): ${unknown.slice(0, 4).join(', ')}`)

  const missingCore = englishKeys.filter((key) => isCore(key) && !(key in data))
  if (missingCore.length) problems.push(`${missingCore.length} core key(s) missing: ${missingCore.slice(0, 4).join(', ')}`)

  for (const key of keys) {
    const value = data[key]
    if (typeof value !== 'string') {
      problems.push(`${key}: not a string`)
      continue
    }
    if (!value.trim()) problems.push(`${key}: empty`)
    if (!(key in english)) continue
    const expected = placeholders(english[key]).join(',')
    const actual = placeholders(value).join(',')
    if (expected !== actual) problems.push(`${key}: placeholders [${actual}] != [${expected}]`)
  }

  const missingOther = englishKeys.filter((key) => !isCore(key) && !(key in data))
  if (missingOther.length) notes.push(`${missingOther.length} non-core key(s) fall back to English`)

  if (problems.length) errors += 1
  else if (missingOther.length) warnings += 1
  rows.push({ code, state: problems.length ? 'fail' : missingOther.length ? 'partial' : 'complete', problems, notes })
}

const width = Math.max(4, ...rows.map((row) => row.code.length))
for (const row of rows) {
  const mark = row.state === 'complete' ? '✓' : row.state === 'partial' ? '·' : '✗'
  console.log(`${mark} ${row.code.padEnd(width)}  ${row.state}${row.notes.length ? ` (${row.notes.join('; ')})` : ''}`)
  for (const problem of row.problems.slice(0, 12)) console.log(`    ${problem}`)
  if (row.problems.length > 12) console.log(`    … ${row.problems.length - 12} more`)
}

const complete = rows.filter((row) => row.state === 'complete').length
console.log(`\n${rows.length} locales · ${complete} complete · ${warnings} partial · ${errors} failing`)

if (errors) {
  console.error('\nLocale validation failed.')
  process.exit(1)
}
