import { useCallback, useEffect, useRef, useState } from 'react'
import { Artwork } from './ui.jsx'
import { IconChevron, IconList, IconX } from './Icons.jsx'
import { useLibrary } from '../context/LibraryContext.jsx'
import { usePlayer } from '../context/PlayerContext.jsx'
import { api } from '../lib/api.js'
import { timeAgo } from '../lib/format.js'

/**
 * Release notifications, driven by the catalogue rather than by fixtures.
 *
 * The app has no accounts and no server-side upload events, so this works from the one
 * real signal available: each followed artist's catalogue is polled, and a release whose
 * date is newer than the watermark stored at subscribe time becomes a notification.
 * Notifications are keyed by track id, so the same release can never be announced twice.
 *
 * Browser notifications need permission and are opt-in twice: a setting, plus the
 * browser's own prompt triggered by a click. When the tab is closed nothing runs — a
 * true background push needs a push service and a user identity, which this app does not
 * have, and the UI says so instead of pretending otherwise.
 */

const CHECK_INTERVAL = 10 * 60 * 1000

export function ReleaseWatcher() {
  const {
    ready,
    subscriptions,
    settings,
    addNotification,
    markReleaseSeen,
    updateSettings,
  } = useLibrary()
  const subsRef = useRef(subscriptions)
  subsRef.current = subscriptions
  const running = useRef(false)

  const check = useCallback(async () => {
    if (running.current) return
    running.current = true
    try {
      for (const sub of subsRef.current) {
        try {
          const data = await api.artistSongs(sub.artistId, 10)
          const releases = (data.items || []).filter((track) => track.releaseDate)
          if (!releases.length) continue
          const newest = releases.sort((a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate)))[0]
          if (!sub.watermark) {
            // A follow created before this code ran has no watermark: adopt silently.
            await markReleaseSeen(sub.artistId, newest)
            continue
          }
          if (String(newest.releaseDate) <= String(sub.watermark)) continue

          if (settings.notifyInApp === false) {
            // Tracking continues, but nothing is written to the in-app centre.
            await markReleaseSeen(sub.artistId, newest)
            if (settings.notifyBrowser && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              try {
                new Notification(`${sub.name} — ${newest.title}`, {
                  body: 'New release on JIMMY STATE',
                  icon: newest.artwork || undefined,
                  tag: `release:${newest.trackId}`,
                })
              } catch {
                /* ignored */
              }
            }
            continue
          }

          const created = await addNotification({
            id: `release:${newest.trackId}`,
            type: 'release',
            artistId: sub.artistId,
            artist: sub.name,
            title: newest.title,
            artwork: newest.artwork,
            track: newest,
            releaseDate: newest.releaseDate,
          })
          await markReleaseSeen(sub.artistId, newest)

          if (created && settings.notifyBrowser && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              new Notification(`${sub.name} — ${newest.title}`, {
                body: 'New release on JIMMY STATE',
                icon: newest.artwork || undefined,
                tag: `release:${newest.trackId}`,
              })
            } catch {
              /* some browsers refuse constructed notifications outside a service worker */
            }
          }
        } catch {
          // One unreachable artist must not stop the rest of the checks.
        }
      }
    } finally {
      running.current = false
    }
  }, [addNotification, markReleaseSeen, settings.notifyBrowser, settings.notifyInApp])

  useEffect(() => {
    if (!ready) return undefined
    check()
    const timer = window.setInterval(check, CHECK_INTERVAL)
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ready, check])

  // `updateSettings` is referenced so the dependency is honest for future settings.
  void updateSettings
  return null
}

export function NotificationBell({ onOpenChange }) {
  const {
    notifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    removeNotification,
    clearNotifications,
    settings,
    updateSettings,
    subscriptions,
  } = useLibrary()
  const player = usePlayer()
  const [open, setOpen] = useState(false)
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  )
  const panelRef = useRef(null)

  useEffect(() => {
    onOpenChange?.(open)
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onClick = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open, onOpenChange])

  const ask = async () => {
    if (typeof Notification === 'undefined' || !Notification.requestPermission) return
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result === 'granted') updateSettings({ notifyBrowser: true })
  }

  const openNotification = async (entry) => {
    await markNotificationRead(entry.id)
    if (entry.track) {
      player.play(entry.track)
      setOpen(false)
    }
  }

  return (
    <div className="notif" ref={panelRef}>
      <button
        type="button"
        className={`notif-btn${open ? ' is-open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
          <path d="M10.3 20a2 2 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 ? <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span> : null}
      </button>

      {open ? (
        <div className="notif-panel" role="dialog" aria-label="Notification centre">
          <div className="notif-head">
            <strong>Notifications</strong>
            <div className="row gap-6">
              <button type="button" className="notif-link" onClick={markAllNotificationsRead} disabled={!unreadCount}>
                Mark all read
              </button>
              <button type="button" className="notif-icon" onClick={() => setOpen(false)} aria-label="Close">
                <IconX size={15} />
              </button>
            </div>
          </div>

          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">
                <IconList size={18} />
                <p>No notifications yet.</p>
                <span>Subscribe to an artist and their next release appears here.</span>
              </div>
            ) : (
              notifications.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`notif-row${entry.read ? '' : ' is-unread'}`}
                  onClick={() => openNotification(entry)}
                >
                  {entry.artwork ? (
                    <Artwork src={entry.artwork} alt="" className="notif-art" />
                  ) : (
                    <span className="notif-art" aria-hidden="true" />
                  )}
                  <span className="notif-text">
                    <strong className="truncate">{entry.title}</strong>
                    <span className="truncate">{entry.artist} · new release</span>
                    <span className="tiny mute">{timeAgo(entry.at)}</span>
                  </span>
                  {entry.track ? <IconChevron size={14} /> : null}
                  <span
                    role="button"
                    tabIndex={0}
                    className="notif-remove"
                    aria-label="Dismiss notification"
                    onClick={(event) => {
                      event.stopPropagation()
                      removeNotification(entry.id)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.stopPropagation()
                        removeNotification(entry.id)
                      }
                    }}
                  >
                    <IconX size={12} />
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="notif-foot">
            <label className="notif-toggle">
              <input
                type="checkbox"
                checked={Boolean(settings.notifyInApp)}
                onChange={(event) => updateSettings({ notifyInApp: event.target.checked })}
              />
              <span>In-app notifications</span>
            </label>
            <label className="notif-toggle">
              <input
                type="checkbox"
                checked={Boolean(settings.notifyBrowser) && permission === 'granted'}
                onChange={(event) => {
                  if (event.target.checked && permission !== 'granted') ask()
                  else updateSettings({ notifyBrowser: event.target.checked })
                }}
              />
              <span>Browser notifications</span>
            </label>
            {permission !== 'granted' ? (
              <button type="button" className="notif-link" onClick={ask}>
                {permission === 'denied' ? 'Blocked in browser settings' : 'Allow browser alerts'}
              </button>
            ) : null}
            <button type="button" className="notif-link" onClick={clearNotifications} disabled={!notifications.length}>
              Clear history
            </button>
            <p className="notif-note">
              Checking {subscriptions.length} followed artist{subscriptions.length === 1 ? '' : 's'} while the app is
              open. No account exists, so alerts cannot be delivered while it is closed.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
