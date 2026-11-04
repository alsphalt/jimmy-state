import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { initials } from '../lib/format.js'
import { IconAlert, IconCheck, IconChevron, IconExternal, IconX } from './Icons.jsx'
import { useToast } from '../context/LibraryContext.jsx'

export function Artwork({ src, alt = '', className = 'art', style, size }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  const dimension = size ? { width: size, height: size } : undefined
  return (
    <div className={className} style={{ ...dimension, ...style }}>
      {!failed && src ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <span className="art-fallback" aria-hidden="true">
          {initials(alt || 'JS')}
        </span>
      )}
    </div>
  )
}

export function Section({ title, action, children, to, actionLabel, className = 'section' }) {
  const { t } = useTranslation()
  return (
    <section className={className}>
      <div className="section-head">
        <h2>{title}</h2>
        {action || (to && (
          <Link to={to} className="section-link">
            {actionLabel || t('common.seeAll')} <IconChevron size={14} />
          </Link>
        ))}
      </div>
      {children}
    </section>
  )
}

export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="empty">
      {icon}
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function Loading({ label, rows = 3 }) {
  const { t } = useTranslation()
  const text = label || t('common.loading')
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="row gap-8 muted tiny" style={{ marginBottom: 10 }}>
        <span className="spinner" /> {text}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="row gap-12" style={{ marginBottom: 10 }}>
          <div className="skeleton" style={{ width: 52, height: 52 }} />
          <div className="grow">
            <div className="skeleton" style={{ height: 11, width: `${58 + i * 8}%`, marginBottom: 7 }} />
            <div className="skeleton" style={{ height: 9, width: `${34 + i * 6}%` }} />
          </div>
        </div>
      ))}
      <span className="sr-only">{text}</span>
    </div>
  )
}

export function ErrorBlock({ error, onRetry, children }) {
  const { t } = useTranslation()
  if (!error) return null
  return (
    <div className="notice notice-error" role="alert" style={{ alignItems: 'flex-start' }}>
      <IconAlert size={17} style={{ flex: 'none', marginTop: 1 }} />
      <div className="grow">
        <div>{error}</div>
        {children}
        {onRetry && (
          <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={onRetry}>
            {t('common.retry')}
          </button>
        )}
      </div>
    </div>
  )
}

export function Toasts() {
  const { toasts } = useToast()
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type === 'ok' ? 'ok' : t.type === 'err' ? 'err' : ''}`}>
          <span style={{ flex: 'none', marginTop: 1, color: t.type === 'ok' ? 'var(--green)' : t.type === 'err' ? 'var(--red)' : 'var(--cyan)' }}>
            {t.type === 'ok' ? <IconCheck size={15} /> : t.type === 'err' ? <IconAlert size={15} /> : <IconX size={15} />}
          </span>
          <div className="grow">
            {t.title && <strong>{t.title}</strong>}
            <span>{t.message}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function OfflineNote() {
  const { t } = useTranslation()
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine)
  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  if (!offline) return null
  return (
    <div className="notice" style={{ marginBottom: 14 }}>
      <IconAlert size={17} style={{ flex: 'none', marginTop: 1 }} />
      <div>
        <strong>{t('state.offlineTitle')}</strong> {t('state.offlineBody')}
      </div>
    </div>
  )
}

/**
 * "Listen on …" links. These are opens, not downloads: playback stays with the
 * platform that owns the stream.
 */
export function PlatformLinks({ links = [], title }) {
  const { t } = useTranslation()
  if (!links?.length) return null
  return (
    <div className="stack gap-6" style={{ alignItems: 'center' }}>
      <span className="eyebrow">{title || t('song.listenOn')}</span>
      <div className="row wrap gap-8" style={{ justifyContent: 'center' }}>
        {links.map((link) => (
          <a
            key={`${link.platform}-${link.id || link.url}`}
            className="chip"
            href={link.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            {link.label}
            <IconExternal size={12} />
          </a>
        ))}
      </div>
    </div>
  )
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          className={`tab ${value === opt.value ? 'is-active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
