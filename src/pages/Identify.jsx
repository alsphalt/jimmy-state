import { Link } from 'react-router-dom'
import Recognizer from '../components/Recognizer.jsx'
import { TrackTile } from '../components/TrackBits.jsx'
import { IconChevron, IconMic, IconShield } from '../components/Icons.jsx'
import { useLibrary } from '../context/LibraryContext.jsx'
import { timeAgo } from '../lib/format.js'

const STEPS = [
  ['Tap the D', 'The browser asks for the microphone the first time. Nothing is recorded before that.'],
  ['Listen for 10s', 'Keep the phone near the speaker. Tap “Stop & identify” to send the sample earlier.'],
  ['Match & save', 'A verified match is saved with artwork, preview and up to 30 related results.'],
]

export default function Identify() {
  const { identifications } = useLibrary()

  return (
    <>
      <div className="row gap-10" style={{ marginBottom: 4 }}>
        <span className="eyebrow">Recognition</span>
      </div>
      <h1 style={{ marginBottom: 14 }}>Identify Any Song</h1>

      <div className="card" style={{ padding: '6px 4px 14px' }}>
        <Recognizer />
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        {STEPS.map(([title, body], i) => (
          <div key={title} className="card card-pad">
            <span className="eyebrow">Step {i + 1}</span>
            <h3 style={{ margin: '6px 0 5px', fontSize: 15 }}>{title}</h3>
            <p className="tiny muted">{body}</p>
          </div>
        ))}
      </div>

      <div className="notice notice-info" style={{ marginTop: 16 }}>
        <IconShield size={17} style={{ flex: 'none', marginTop: 1 }} />
        <div>
          <strong>Microphone privacy.</strong> Capture starts only after you tap the D and stops the moment matching
          begins or you cancel. The WAV sample is uploaded to ACRCloud for identification and is not written to disk.
        </div>
      </div>

      {identifications.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Last matches</h2>
            <Link to="/library?tab=identified" className="section-link">
              Library <IconChevron size={14} />
            </Link>
          </div>
          <div className="hscroll">
            {identifications.slice(0, 6).map((item) => (
              <div key={item.id} className="stack" style={{ gap: 6 }}>
                <TrackTile track={item.exact} />
                <Link to={`/results/${item.id}`} className="tiny mute row gap-6">
                  <IconMic size={11} /> {timeAgo(item.at)}
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
