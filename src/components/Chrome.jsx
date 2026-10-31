import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import LogoD from './LogoD.jsx'
import { Artwork } from './ui.jsx'
import {
  IconChevron,
  IconClock,
  IconCompass,
  IconDownload,
  IconList,
  IconShield,
  IconTikTok,
  IconHome,
  IconLibrary,
  IconPause,
  IconPlay,
  IconMenu,
  IconSearch,
  IconSettings,
  IconVideo,
  IconX,
} from './Icons.jsx'
import { usePlayer } from '../context/PlayerContext.jsx'
import { useInstallPrompt } from '../lib/install.js'

/* ------------------------------------------------------------------ top bar */
/**
 * Side drawer.
 *
 * Contents are the destinations this app already has — nothing invented here:
 * /search, /downloads, /playlists, /watch-later, /tools/tiktok, /settings, /privacy.
 * Each entry is a real route that existed before the drawer, so the pages and their
 * behaviour are untouched.
 */
const DRAWER_SECTIONS = [
  {
    title: 'Browse',
    items: [{ to: '/search', label: 'Search', Icon: IconSearch }],
  },
  {
    title: 'Your stuff',
    items: [
      { to: '/downloads', label: 'Downloads', Icon: IconDownload },
      { to: '/playlists', label: 'Playlists', Icon: IconList },
      { to: '/watch-later', label: 'Watch later', Icon: IconClock },
    ],
  },
  {
    title: 'Tools',
    items: [{ to: '/tools/tiktok', label: 'TikTok link to video', Icon: IconTikTok }],
  },
  {
    title: 'App',
    items: [
      { to: '/settings', label: 'Settings', Icon: IconSettings },
      { to: '/privacy', label: 'Privacy', Icon: IconShield },
    ],
  },
]

function Drawer({ open, onClose }) {
  const location = useLocation()
  const firstItem = useRef(null)

  // Close on navigation, Escape, or when the route changes under us.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('drawer-open')
    const focusTimer = setTimeout(() => firstItem.current?.focus?.(), 120)
    return () => {
      clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('drawer-open')
    }
  }, [open, onClose])

  useEffect(() => {
    if (open) onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  if (!open) return null

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="drawer-head">
          <LogoD size={30} badge />
          <div className="grow">
            <strong className="drawer-brand">
              JIMMY <span>STATE</span>
            </strong>
            <span className="tiny mute">Menu</span>
          </div>
          <button type="button" className="icon-btn" aria-label="Close menu" onClick={onClose}>
            <IconX size={18} />
          </button>
        </div>

        <nav className="drawer-nav">
          {DRAWER_SECTIONS.map((section) => (
            <div className="drawer-section" key={section.title}>
              <span className="drawer-section-title">{section.title}</span>
              {section.items.map(({ to, label, Icon }, index) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `drawer-item ${isActive ? 'is-active' : ''}`}
                  onClick={onClose}
                  ref={index === 0 && section.title === 'Browse' ? firstItem : undefined}
                >
                  <Icon size={18} />
                  <span className="grow">{label}</span>
                  <IconChevron size={14} />
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <p className="drawer-foot tiny mute">More options coming soon.</p>
      </aside>
    </>
  )
}

export function TopBar() {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  return (
    <>
      <header className="topbar">
        <div className="shell topbar-inner">
          <Link to="/" className="brand" aria-label="JIMMY STATE home">
            <LogoD size={30} badge />
            <span className="brand-name">
              JIMMY <span>STATE</span>
            </span>
          </Link>
          <div className="grow" />
          <Link to="/search" className="icon-btn" aria-label="Search">
            <IconSearch size={19} />
          </Link>
          <Link to="/settings" className="icon-btn" aria-label="Settings">
            <IconSettings size={19} />
          </Link>
          <button
            type="button"
            className="icon-btn"
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <IconMenu size={20} />
          </button>
        </div>
      </header>
      <Drawer open={open} onClose={close} />
    </>
  )
}

export function InstallBanner() {
  const { showBanner, install, dismiss, busy } = useInstallPrompt()
  const [closing, setClosing] = useState(false)
  const [mounted, setMounted] = useState(showBanner)

  useEffect(() => {
    if (showBanner) setMounted(true)
  }, [showBanner])

  if (!mounted || (!showBanner && !closing)) return null

  const close = () => {
    setClosing(true)
    dismiss()
    setTimeout(() => {
      setMounted(false)
      setClosing(false)
    }, 240)
  }

  const onInstall = async () => {
    const result = await install()
    if (result.outcome === 'accepted') {
      setClosing(true)
      setTimeout(() => {
        setMounted(false)
        setClosing(false)
      }, 240)
    }
  }

  return (
    <div className="shell">
      <div className={`install-banner ${closing ? 'is-leaving' : ''}`} role="region" aria-label="Install JIMMY STATE">
        <img className="install-icon" src="/icons/icon-192.png" alt="" width="42" height="42" />
        <div className="install-copy">
          <strong>Install JIMMY STATE</strong>
          <p>Install the app for faster access to your music, videos, and library.</p>
        </div>
        <div className="install-actions">
          <button type="button" className="install-btn" onClick={onInstall} disabled={busy}>
            {busy ? 'Installing…' : 'Install'}
          </button>
          <button type="button" className="install-close" aria-label="Dismiss install banner" onClick={close}>
            <IconX size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- bottom nav */
const NAV = [
  { to: '/', label: 'Home', icon: IconHome, end: true },
  { to: '/discover', label: 'Discover', icon: IconCompass },
  { to: '/identify', label: 'Identify', identify: true },
  { to: '/videos', label: 'Videos', icon: IconVideo },
  { to: '/library', label: 'Library', icon: IconLibrary },
]

export function BottomNav() {
  const location = useLocation()
  return (
    <nav className="bottom-nav" aria-label="Primary">
      <div className="bottom-nav-inner">
        {NAV.map((item) => {
          if (item.identify) {
            const active = location.pathname.startsWith('/identify')
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`nav-item nav-identify ${active ? 'is-active' : ''}`}
                aria-label="Identify a song"
              >
                <span className="nav-d">
                  <LogoD size={30} glow={false} />
                </span>
                <span>Identify</span>
              </NavLink>
            )
          }
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}
            >
              <Icon size={21} />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

/* --------------------------------------------------------------- player bar */
export function PlayerBar() {
  const { current, playing, progress, duration, toggle, close, error } = usePlayer()
  if (!current) return null
  const pct = duration ? Math.min(100, (progress / duration) * 100) : 0
  return (
    <div className="player-bar" role="region" aria-label="Preview player">
      <Artwork src={current.artworkSmall || current.artwork} alt="" className="player-art" />
      <button type="button" className="player-meta" onClick={toggle} style={{ textAlign: 'left', background: 'none' }}>
        <strong className="truncate">{current.title}</strong>
        <span className="truncate">{error || current.artist}</span>
        <span className="player-preview-tag">Preview</span>
      </button>
      {current.storeUrl ? (
        <a
          className="icon-btn"
          href={current.storeUrl}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Hear the full song"
          title="Hear the full song"
          style={{ fontSize: 15, fontWeight: 700 }}
        >
          ↗
        </a>
      ) : null}
      <button type="button" className="icon-btn" onClick={toggle} aria-label={playing ? 'Pause preview' : 'Play preview'}>
        {playing ? <IconPause size={20} /> : <IconPlay size={20} />}
      </button>
      <button type="button" className="icon-btn" onClick={close} aria-label="Close player">
        <IconX size={18} />
      </button>
      <div className="player-progress" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
