import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconChevron, IconMore } from '../components/Icons.jsx'

const TOOL_URL = '/tools/system.html'

export default function System() {
  const { t } = useTranslation()
  const frameRef = useRef(null)
  const [height, setHeight] = useState(640)

  /* The tool is a full document, so it is framed, not re-implemented.
     Its own scroll is disabled: the frame is sized to the content so the
     page keeps one scrollbar and the bottom navigation stays reachable. */
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const measure = () => {
      try {
        const doc = frame.contentDocument
        if (!doc || !doc.documentElement) return
        const next = Math.max(560, doc.documentElement.scrollHeight)
        setHeight((prev) => (Math.abs(prev - next) > 24 ? next : prev))
      } catch {
        /* cross-origin or not loaded yet — keep the fallback height */
      }
    }
    frame.addEventListener('load', measure)
    const id = window.setInterval(measure, 1500)
    return () => {
      frame.removeEventListener('load', measure)
      window.clearInterval(id)
    }
  }, [])

  return (
    <>
      <div className="row gap-8" style={{ marginBottom: 8 }}>
        <IconMore size={18} />
        <span className="eyebrow">{t('system.eyebrow')}</span>
      </div>
      <h1>{t('system.title')}</h1>
      <p className="small muted" style={{ marginTop: 6, marginBottom: 14 }}>
        {t('system.subtitle')}
      </p>

      <div className="card card-pad" style={{ padding: 0, overflow: 'hidden' }}>
        <iframe
          ref={frameRef}
          src={TOOL_URL}
          title={t('system.title')}
          loading="eager"
          allow="camera; microphone; geolocation; clipboard-write"
          style={{
            display: 'block',
            width: '100%',
            height,
            border: 0,
            background: 'transparent',
          }}
        />
      </div>

      <div className="row gap-8" style={{ marginTop: 14 }}>
        <span className="tiny mute grow">{t('system.note')}</span>
        <a className="section-link" href={TOOL_URL} target="_blank" rel="noreferrer">
          {t('system.open')} <IconChevron size={13} />
        </a>
      </div>
    </>
  )
}
