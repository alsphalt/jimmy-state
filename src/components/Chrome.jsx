import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import LogoD from './LogoD.jsx'
import { Artwork } from './ui.jsx'
import {
  IconCompass,
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
export function TopBar() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // Close on outside click / Escape, the way a native menu behaves.
  useEffect(() => {
    if (!menuOpen) return undefined
    const onDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
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
        <button type="button" className="icon-btn" aria-label="Settings" onClick={() => navigate('/settings')}>
          <IconSettings size={19} />
        </button>

        <div className="menu-wrap" ref={menuRef}>
          <button
            type="button"
            className={`icon-btn ${menuOpen ? 'is-active' : ''}`}
            aria-label="More"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <IconMenu size={19} />
          </button>
          {menuOpen && (
            <div className="menu-panel" role="menu">
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false)
                  navigate('/tools/tiktok')
                }}
              >
                <span>TikTok link to video</span>
                <IconChevron size={14} />
              </button>
              <p className="menu-empty eyebrow">Coming soon</p>
              <p className="menu-note">More options will land here.</p>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

/* ------------------------------------------------------------ install banner */
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
