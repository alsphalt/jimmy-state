import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState, ErrorBlock, Loading, Segmented } from '../components/ui.jsx'
import { TrackRow } from '../components/TrackBits.jsx'
import { IconChevron, IconMusic, IconSearch } from '../components/Icons.jsx'
import { api } from '../lib/api.js'
import { formatDate } from '../lib/format.js'

const GENRES = [
  'Afrobeats',
  'Amapiano',
  'Pop',
  'Hip-Hop',
  'R&B',
  'Gospel',
  'Rock',
  'Jazz',
  'Electronic',
  'Reggae',
  'Country',
  'Latin',
  'K-Pop',
  'Soul',
]

export default function Discover() {
  const [tab, setTab] = useState('top')
  const [charts, setCharts] = useState({ loading: true, items: [], error: null })
  const [genre, setGenre] = useState('')
  const [genreResults, setGenreResults] = useState({ loading: false, items: [], error: null })
  const [artistTerm, setArtistTerm] = useState('')
  const [artists, setArtists] = useState({ loading: false, items: [], error: null, done: false })
  const navigate = useNavigate()

  const loadCharts = () => {
    setCharts({ loading: true, items: [], error: null })
    api
      .charts(25)
      .then((d) => setCharts({ loading: false, items: d.items || [], error: null }))
      .catch((e) => setCharts({ loading: false, items: [], error: e.message }))
  }

  useEffect(loadCharts, [])

  const pickGenre = async (name) => {
    setGenre(name)
    setGenreResults({ loading: true, items: [], error: null })
    try {
      const data = await api.searchMusic(name, 25)
      setGenreResults({ loading: false, items: data.items || [], error: null })
    } catch (err) {
      setGenreResults({ loading: false, items: [], error: err.message })
    }
  }

  const searchArtists = async (event) => {
    event.preventDefault()
    const q = artistTerm.trim()
    if (!q) return
    setArtists({ loading: true, items: [], error: null, done: false })
    try {
      const data = await api.artists(q)
      setArtists({ loading: false, items: data.items || [], error: null, done: true })
    } catch (err) {
      setArtists({ loading: false, items: [], error: err.message, done: true })
    }
  }

  return (
    <>
      <h1>Discover</h1>
      <p className="small muted" style={{ marginTop: 4, marginBottom: 14 }}>
        Real catalogue data from Apple’s public feeds. No fabricated charts.
      </p>

      <Segmented
        label="Discover sections"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'top', label: 'Top songs' },
          { value: 'genres', label: 'Genres' },
          { value: 'artists', label: 'Artists' },
        ]}
      />

      {tab === 'top' && (
        <section className="section" style={{ marginTop: 16 }}>
          {charts.loading && <Loading label="Loading the chart…" rows={5} />}
          {charts.error && <ErrorBlock error={charts.error} onRetry={loadCharts} />}
          {!charts.loading && !charts.error && charts.items.length === 0 && (
            <EmptyState title="No chart data right now" />
          )}
          {charts.items.length > 0 && (
            <>
              <div className="list">
                {charts.items.map((t, i) => (
                  <TrackRow key={t.id} track={t} rank={i + 1} subtitle={`${t.artist}${t.genre ? ` · ${t.genre}` : ''}`} />
                ))}
              </div>
              <p className="tiny mute" style={{ marginTop: 12 }}>
                Source: Apple Music most-played feed · updated {formatDate(new Date().toISOString())}
              </p>
            </>
          )}
        </section>
      )}

      {tab === 'genres' && (
        <section className="section" style={{ marginTop: 16 }}>
          <div className="row wrap gap-8">
            {GENRES.map((g) => (
              <button key={g} type="button" className={`chip ${genre === g ? 'is-active' : ''}`} onClick={() => pickGenre(g)}>
                {g}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 18 }}>
            {!genre && <EmptyState icon={<IconMusic size={22} />} title="Pick a genre">We search the live catalogue for that genre and show real results.</EmptyState>}
            {genreResults.loading && <Loading label={`Loading ${genre}…`} rows={4} />}
            {genreResults.error && <ErrorBlock error={genreResults.error} onRetry={() => pickGenre(genre)} />}
            {!genreResults.loading && !genreResults.error && genreResults.items.length > 0 && (
              <>
                <div className="section-head">
                  <h2 style={{ fontSize: 16 }}>{genre}</h2>
                  <span className="tiny mute">{genreResults.items.length} tracks</span>
                </div>
                <div className="list">
                  {genreResults.items.map((t) => (
                    <TrackRow key={t.id} track={t} subtitle={`${t.artist}${t.album ? ` · ${t.album}` : ''}`} />
                  ))}
                </div>
              </>
            )}
            {!genreResults.loading && !genreResults.error && genre && genreResults.items.length === 0 && (
              <EmptyState title={`Nothing found for ${genre}`} />
            )}
          </div>
        </section>
      )}

      {tab === 'artists' && (
        <section className="section" style={{ marginTop: 16 }}>
          <form onSubmit={searchArtists} role="search">
            <label className="field">
              <IconSearch size={18} className="field-icon" />
              <input
                value={artistTerm}
                onChange={(e) => setArtistTerm(e.target.value)}
                placeholder="Search an artist"
                aria-label="Search artists"
                enterKeyHint="search"
              />
              <button type="submit" className="btn btn-sm" disabled={!artistTerm.trim()}>
                Search
              </button>
            </label>
          </form>

          <div style={{ marginTop: 16 }}>
            {artists.loading && <Loading label="Searching artists…" rows={3} />}
            {artists.error && <ErrorBlock error={artists.error} onRetry={searchArtists} />}
            {!artists.loading && !artists.error && artists.done && artists.items.length === 0 && (
              <EmptyState title="No artists matched" />
            )}
            {artists.items.length > 0 && (
              <div className="list">
                {artists.items.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="list-row"
                    style={{ textAlign: 'left', width: '100%' }}
                    onClick={() => navigate(`/search?q=${encodeURIComponent(a.name)}&mode=music`)}
                  >
                    <span
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: '50%',
                        display: 'grid',
                        placeItems: 'center',
                        background: 'var(--grad-soft)',
                        border: '1px solid var(--line)',
                        fontWeight: 700,
                      }}
                    >
                      {a.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="track-row-title truncate" style={{ display: 'block' }}>
                        {a.name}
                      </span>
                      <span className="track-row-sub">{a.genre || 'Artist'}</span>
                    </span>
                    <IconChevron size={16} />
                  </button>
                ))}
              </div>
            )}
            {!artists.done && !artists.loading && (
              <EmptyState icon={<IconMusic size={22} />} title="Find an artist">
                Search a name to browse their catalogue and open tracks.
              </EmptyState>
            )}
          </div>
        </section>
      )}

      <div className="card card-pad" style={{ marginTop: 26 }}>
        <span className="eyebrow">How this works</span>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          Charts come from Apple’s public marketing feed; artwork and preview clips come from the iTunes Search
          API. Both are queried by this app’s server, so no keys reach your browser. Preview clips are the only audio
          available for download.
        </p>
      </div>
    </>
  )
}
