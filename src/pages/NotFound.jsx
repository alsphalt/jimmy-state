import { Link } from 'react-router-dom'
import LogoD from '../components/LogoD.jsx'

export default function NotFound() {
  return (
    <div className="center" style={{ minHeight: '60vh', textAlign: 'center', gap: 12 }}>
      <LogoD size={72} />
      <h1 style={{ marginTop: 10 }}>That page is off the record.</h1>
      <p className="small muted" style={{ maxWidth: '34ch' }}>
        The link you followed does not exist in JIMMY STATE.
      </p>
      <div className="row gap-8" style={{ marginTop: 8 }}>
        <Link to="/" className="btn btn-primary btn-sm">
          Home
        </Link>
        <Link to="/library" className="btn btn-sm">
          Library
        </Link>
      </div>
    </div>
  )
}
