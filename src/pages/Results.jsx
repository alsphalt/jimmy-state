import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MatchSections } from '../components/TrackBits.jsx'
import { EmptyState } from '../components/ui.jsx'
import { IconArrowLeft, IconExternal, IconTrash } from '../components/Icons.jsx'
import { useLibrary, useToast } from '../context/LibraryContext.jsx'
import { formatDate } from '../lib/format.js'

export default function Results() {
  const { t } = useTranslation()
  const { id } = useParams()
  const location = useLocation()
  const { identifications, removeIdentification } = useLibrary()
  const navigate = useNavigate()
  const { toast } = useToast()
  const record = identifications.find((r) => r.id === id)

  if (!record) {
    return (
      <>
        <BackRow />
        <EmptyState title={t('results.notOnDevice')}>
          Results are stored locally. They may have been removed, or this link came from another device.
          <div style={{ marginTop: 12 }}>
            <Link to="/identify" className="btn btn-sm btn-primary">
              Identify a song
            </Link>
          </div>
        </EmptyState>
      </>
    )
  }

  const total = 1 + record.similar.length + record.possible.length

  const remove = async () => {
    await removeIdentification(record.id)
    toast('Identification removed from library', { ttl: 3000 })
    navigate('/library?tab=identified', { replace: true })
  }

  return (
    <>
      <BackRow
        right={
          <>
            <a
              className="icon-btn"
              href={record.exact.youtubeSearchUrl}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Search this track on YouTube"
              title={t('results.searchYouTube')}
            >
              <IconExternal size={18} />
            </a>
            <button type="button" className="icon-btn" aria-label="Delete identification" onClick={remove}>
              <IconTrash size={18} />
            </button>
          </>
        }
      />

      <div className="row gap-8 wrap" style={{ marginBottom: 10 }}>
        <span className="eyebrow">{location.state?.fresh ? t('results.justIdentified') : t('results.savedIdentification')}</span>
        <span className="tiny mute">· {formatDate(record.at)}</span>
        <span className="tiny mute">· {total} results</span>
      </div>

      <MatchSections results={record} />

      <p className="tiny mute" style={{ marginTop: 22, textAlign: 'center' }}>
        One verified match from ACRCloud, plus catalogue recommendations. Similar and possible results are labelled —
        they are not identification claims.
      </p>
    </>
  )
}

function BackRow({ right }) {
  const { t } = useTranslation()
  return (
    <div className="between" style={{ marginBottom: 12 }}>
      <Link to="/" className="btn btn-sm btn-ghost" aria-label={t('nav.homeLabel')}>
        <IconArrowLeft size={16} /> {t('common.back')}
      </Link>
      <div className="row gap-6">{right}</div>
    </div>
  )
}
