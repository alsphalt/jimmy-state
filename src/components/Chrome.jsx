import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import LogoD from './LogoD.jsx'
import { Artwork } from './ui.jsx'
import { api } from '../lib/api.js'
import {
  IconChevron,
  IconClock,
  IconCompass,
  IconDownload,
  IconList,
  IconShield,
  IconTikTok,
  IconTube,
  IconHome,
  IconLibrary,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconRepeat,
  IconRepeatOne,
  IconShuffle,
  IconMenu,
  IconMore,
  IconSearch,
  IconSettings,
  IconVideo,
  IconX,
} from './Icons.jsx'
import { useTranslation } from 'react-i18next'
import { usePlayer } from '../context/PlayerContext.jsx'
import { formatClock } from '../lib/format.js'
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
/* Keys, not labels: the drawer is interface text like every other surface. */
const DRAWER_SECTIONS = [
  {
    title: 'nav.browse',
    items: [{ to: '/search', label: 'nav.search', Icon: IconSearch }],
  },
  {
    title: 'nav.yourStuff',
    items: [
      { to: '/downloads', label: 'nav.downloads', Icon: IconDownload },
      { to: '/playlists', label: 'nav.playlists', Icon: IconList },
      { to: '/watch-later', label: 'nav.watchLater', Icon: IconClock },
    ],
  },
  {
    title: 'nav.tools',
    items: [
      { to: '/tools/tiktok', label: 'nav.tiktok', Icon: IconTikTok },
      { to: '/tools/tube', label: 'nav.tube', Icon: IconTube },
      { to: '/tools/system', label: 'nav.system', Icon: IconMore },
    ],
  },
  {
    title: 'nav.app',
    items: [
      { to: '/settings', label: 'nav.settings', Icon: IconSettings },
      { to: '/privacy', label: 'nav.privacy', Icon: IconShield },
    ],
  },
]

function Drawer({ open, onClose }) {
  const { t } = useTranslation()
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
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
        <div className="drawer-head">
          <LogoD size={30} badge />
          <div className="grow">
            <strong className="drawer-brand">
              JIMMY <span>STATE</span>
            </strong>
            <span className="tiny mute">{t('nav.menu')}</span>
          </div>
          <button type="button" className="icon-btn" aria-label={t('nav.closeMenu')} onClick={onClose}>
            <IconX size={18} />
          </button>
        </div>

        <nav className="drawer-nav">
          {DRAWER_SECTIONS.map((section) => (
            <div className="drawer-section" key={section.title}>
              <span className="drawer-section-title">{t(section.title)}</span>
              {section.items.map(({ to, label, Icon }, index) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `drawer-item ${isActive ? 'is-active' : ''}`}
                  onClick={onClose}
                  ref={index === 0 && section.title === 'nav.browse' ? firstItem : undefined}
                >
                  <Icon size={18} />
                  <span className="grow">{t(label)}</span>
                  <IconChevron size={14} />
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <p className="drawer-foot tiny mute">{t('nav.moreComing')}</p>
      </aside>
    </>
  )
}

export function TopBar() {
  const { t } = useTranslation()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  // Jimmy Tube has its own header and compact nav; stacking the app chrome on top of it
  // would mean two headers and two nav bars on one screen.
  if (location.pathname.startsWith('/tools/tube')) return null

  return (
    <>
      <header className="topbar">
        <div className="shell topbar-inner">
          <Link to="/" className="brand" aria-label={t('nav.homeLabel')}>
            <LogoD size={30} badge />
            <span className="brand-name">
              JIMMY <span>STATE</span>
            </span>
          </Link>
          <div className="grow" />
          <Link to="/search" className="icon-btn" aria-label={t('nav.search')}>
            <IconSearch size={19} />
          </Link>
          <Link to="/services" className="icon-btn" aria-label={t('nav.servicesLabel')}>
            <IconSettings size={19} />
          </Link>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('nav.openMenu')}
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
  const location = useLocation()
  const { t } = useTranslation()
  const { showBanner, install, dismiss, busy } = useInstallPrompt()
  const [closing, setClosing] = useState(false)
  const [mounted, setMounted] = useState(showBanner)
  const onTube = location.pathname.startsWith('/tools/tube')

  useEffect(() => {
    if (showBanner) setMounted(true)
  }, [showBanner])

  if (onTube || !mounted || (!showBanner && !closing)) return null

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
      <div className={`install-banner ${closing ? 'is-leaving' : ''}`} role="region" aria-label={t('install.title')}>
        <img className="install-icon" src="/icons/icon-192.png" alt="" width="42" height="42" />
        <div className="install-copy">
          <strong>{t('install.title')}</strong>
          <p>{t('install.body')}</p>
        </div>
        <div className="install-actions">
          <button type="button" className="install-btn" onClick={onInstall} disabled={busy}>
            {busy ? t('install.installing') : t('install.action')}
          </button>
          <button type="button" className="install-close" aria-label={t('install.dismiss')} onClick={close}>
            <IconX size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * "A new build is live — reload."
 *
 * The website and the PWA can update themselves, but only a reload swaps the running
 * bundle. Without this bar a tab that has been open all day keeps serving the previous
 * build and the user has no way to tell. The APK never shows it: a native build updates
 * through Settings → App update instead.
 */
export function UpdateBar() {
  const location = useLocation()
  const { t } = useTranslation()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const onReady = () => setReady(true)
    window.addEventListener('jimmy-state:update-ready', onReady)
    return () => window.removeEventListener('jimmy-state:update-ready', onReady)
  }, [])

  const onTube = location.pathname.startsWith('/tools/tube')
  if (onTube || !ready) return null

  return (
    <div className="shell">
      <div className="install-banner" role="status" aria-label={t('update.ready')}>
        <div className="install-copy">
          <strong>{t('update.ready')}</strong>
          <p>{t('update.readyBody')}</p>
        </div>
        <div className="install-actions">
          <button type="button" className="install-btn" onClick={() => window.location.reload()}>
            {t('update.reload')}
          </button>
          <button
            type="button"
            className="install-close"
            aria-label={t('update.later')}
            onClick={() => setReady(false)}
          >
            <IconX size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- bottom nav */
const NAV = [
  { to: '/', label: 'nav.home', icon: IconHome, end: true },
  { to: '/discover', label: 'nav.discover', icon: IconCompass },
  { to: '/identify', label: 'nav.identify', identify: true },
  { to: '/videos', label: 'nav.videos', icon: IconVideo },
  { to: '/library', label: 'nav.library', icon: IconLibrary },
]

export function BottomNav() {
  const { t } = useTranslation()
  const location = useLocation()
  if (location.pathname.startsWith('/tools/tube')) return null
  return (
    <nav className="bottom-nav" aria-label={t('nav.primary')}>
      <div className="bottom-nav-inner">
        {NAV.map((item) => {
          if (item.identify) {
            const active = location.pathname.startsWith('/identify')
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`nav-item nav-identify ${active ? 'is-active' : ''}`}
                aria-label={t('nav.identifySong')}
              >
                <span className="nav-d">
                  <LogoD size={30} glow={false} />
                </span>
                <span>{t('nav.identify')}</span>
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
              <span>{t(item.label)}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

/* --------------------------------------------------------------- player bar */
export function PlayerBar() {
  const { t } = useTranslation()
  const {
    current,
    playing,
    progress,
    duration,
    toggle,
    close,
    error,
    next,
    prev,
    shuffle,
    repeat,
    toggleShuffle,
    cycleRepeat,
    seekTo,
    isPreview,
    trackLength,
  } = usePlayer()
  const navigate = useNavigate()
  const [finding, setFinding] = useState(false)
  if (!current) return null

  /**
   * Preview clips are what the catalogue licenses, so full-length listening goes
   * through the authorised player: find the song's video and open the watch page.
   * Nothing is extracted from it — the player streams it in place.
   */
  const openFull = async () => {
    const query = `${current.artist} ${current.title}`
    setFinding(true)
    try {
      const found = await api.resolveYoutube(query)
      if (found?.videoId) {
        navigate(`/watch/${found.videoId}`)
        return
      }
      throw new Error('no video')
    } catch (err) {
      // No key, quota, or no match: hand off to the service's own search rather than
      // pretending a preview is the song.
      window.open(
        err?.searchUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
        '_blank',
        'noopener',
      )
    } finally {
      setFinding(false)
    }
  }
  const pct = duration ? Math.min(100, (progress / duration) * 100) : 0
  return (
    <div className="player-bar" role="region" aria-label={t('player.region')}>
      <div className="player-row">
        <Artwork src={current.artworkSmall || current.artwork} alt="" className="player-art" />
        <button type="button" className="player-meta" onClick={toggle} style={{ textAlign: 'left', background: 'none' }}>
          <strong className="truncate">{current.title}</strong>
          <span className="truncate">{error || current.artist}</span>
          <span
            className="player-preview-tag"
            title={
              isPreview
                ? `${formatClock(duration)} preview of a ${formatClock(trackLength)} track`
                : t('player.preview')
            }
          >
            {isPreview ? `Preview · ${formatClock(duration)}` : t('player.preview')}
          </span>
        </button>

        <div className="player-transport">
          <button
            type="button"
            className={`icon-btn player-mode${shuffle ? ' is-on' : ''}`}
            onClick={toggleShuffle}
            aria-pressed={shuffle}
            aria-label="Shuffle"
            title={shuffle ? 'Shuffle on' : 'Shuffle off'}
          >
            <IconShuffle size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={prev} aria-label="Previous track" title="Previous">
            <IconPrev size={17} />
          </button>
          <button
            type="button"
            className="player-play"
            onClick={toggle}
            aria-label={playing ? t('player.pausePreview') : t('player.playPreview')}
          >
            {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
          </button>
          <button type="button" className="icon-btn" onClick={next} aria-label="Next track" title="Next">
            <IconNext size={17} />
          </button>
          <button
            type="button"
            className={`icon-btn player-mode${repeat !== 'off' ? ' is-on' : ''}`}
            onClick={cycleRepeat}
            aria-label={`Repeat: ${repeat}`}
            title={`Repeat: ${repeat}`}
          >
            {repeat === 'one' ? <IconRepeatOne size={16} /> : <IconRepeat size={16} />}
          </button>
        </div>

        <div className="player-right">
          <span className="player-clock">
            {formatClock(progress)} / {formatClock(duration)}
          </span>
          {current.previewUrl ? (
            <button
              type="button"
              className="player-full"
              onClick={openFull}
              disabled={finding}
              title="Play the full song in the video player"
            >
              {finding ? '…' : (
                <>
                  <span className="pf-long">Full song</span>
                  <span className="pf-short">Full</span>
                </>
              )}
            </button>
          ) : null}
          {current.storeUrl ? (
            <a
              className="icon-btn player-store"
              href={current.storeUrl}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={t('common.fullSong')}
              title={t('common.fullSong')}
              style={{ fontSize: 15, fontWeight: 700 }}
            >
              ↗
            </a>
          ) : null}
          <button type="button" className="icon-btn" onClick={close} aria-label={t('player.close')}>
            <IconX size={18} />
          </button>
        </div>
      </div>

      <label className="player-scrub">
        <span className="sr-only">Seek</span>
        <input
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(progress || 0, duration || 0)}
          onChange={(event) => seekTo(Number(event.target.value))}
          style={{ '--seek': `${pct}%` }}
          aria-valuetext={`${formatClock(progress)} of ${formatClock(duration)}`}
        />
      </label>
    </div>
  )
}
