import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LogoD from '../components/LogoD.jsx'

export default function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="center" style={{ minHeight: '60vh', textAlign: 'center', gap: 12 }}>
      <LogoD size={72} />
      <h1 style={{ marginTop: 10 }}>{t('state.notFoundTitle')}</h1>
      <p className="small muted" style={{ maxWidth: '34ch' }}>
        {t('state.notFoundBody')}
      </p>
      <div className="row gap-8" style={{ marginTop: 8 }}>
        <Link to="/" className="btn btn-primary btn-sm">
          {t('nav.home')}
        </Link>
        <Link to="/library" className="btn btn-sm">
          {t('nav.library')}
        </Link>
      </div>
    </div>
  )
}
