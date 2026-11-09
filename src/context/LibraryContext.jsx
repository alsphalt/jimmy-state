import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as db from '../lib/db.js'
import { normalizeTrack, normalizeVideo, trackKey } from '../lib/track.js'

const LibraryContext = createContext(null)
const ToastContext = createContext(null)

const DEFAULT_SETTINGS = {
  country: 'US',
  askWhereToSave: true,
  autoplayPreview: true,
  notifyInApp: true,
  notifyBrowser: false,
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function LibraryProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [identifications, setIdentifications] = useState([])
  const [favourites, setFavourites] = useState([])
  const [videos, setVideos] = useState([])
  const [watchLater, setWatchLater] = useState([])
  const [watched, setWatched] = useState([])
  const [downloads, setDownloads] = useState([])
  const [playlists, setPlaylists] = useState([])
  const [searches, setSearches] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [notifications, setNotifications] = useState([])
  const [plays, setPlays] = useState([])
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [toasts, setToasts] = useState([])
  const toastTimers = useRef(new Map())

  const toast = useCallback((message, opts = {}) => {
    const id = uid()
    const item = { id, title: opts.title || '', message, type: opts.type || 'info', ttl: opts.ttl ?? 4200 }
    setToasts((list) => [...list.slice(-3), item])
    const timer = setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id))
      toastTimers.current.delete(id)
    }, item.ttl)
    toastTimers.current.set(id, timer)
    return id
  }, [])

  useEffect(() => {
    const timers = toastTimers.current
    return () => timers.forEach((t) => clearTimeout(t))
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [ids, favs, vids, later, seen, dls, pls, hist, subs, notes, played, meta] = await Promise.all([
        db.getAll('identifications').catch(() => []),
        db.getAll('favourites').catch(() => []),
        db.getAll('videos').catch(() => []),
        db.getAll('watchLater').catch(() => []),
        db.getAll('watched').catch(() => []),
        db.getAll('downloads').catch(() => []),
        db.getAll('playlists').catch(() => []),
        db.getAll('searches').catch(() => []),
        db.getAll('subscriptions').catch(() => []),
        db.getAll('notifications').catch(() => []),
        db.getAll('plays').catch(() => []),
        db.getAll('meta').catch(() => []),
      ])
      if (cancelled) return
      const byNewest = (a, b) => new Date(b.at || 0) - new Date(a.at || 0)
      setIdentifications(ids.sort(byNewest))
      setFavourites(favs.sort(byNewest))
      setVideos(vids.sort(byNewest))
      setWatchLater(later.sort(byNewest))
      setWatched(seen.sort(byNewest))
      setDownloads(dls.sort(byNewest).slice(0, 60))
      setPlaylists(pls.sort(byNewest))
      setSearches(hist.sort(byNewest).slice(0, 20))
      setSubscriptions(subs.sort(byNewest))
      setNotifications(notes.sort(byNewest).slice(0, 120))
      setPlays(played.sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0)).slice(0, 60))
      const saved = meta.find((m) => m.key === 'settings')
      if (saved?.value) setSettings({ ...DEFAULT_SETTINGS, ...saved.value })
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /* ------------------------------------------------------------- favourites */
  const favouriteKeys = useMemo(() => new Set(favourites.map((f) => f.key)), [favourites])

  const toggleFavourite = useCallback(
    async (track) => {
      const normalized = normalizeTrack(track)
      const key = normalized.key
      if (favouriteKeys.has(key)) {
        setFavourites((list) => list.filter((f) => f.key !== key))
        await db.del('favourites', key).catch(() => {})
        toast('Removed from favourites', { type: 'info', ttl: 2200 })
        return false
      }
      const record = { key, at: new Date().toISOString(), track: normalized }
      setFavourites((list) => [record, ...list])
      await db.put('favourites', record).catch(() => {})
      toast('Saved to favourites', { title: normalized.title, type: 'ok', ttl: 2600 })
      return true
    },
    [favouriteKeys, toast],
  )

  /* --------------------------------------------------------- identifications */
  const addIdentification = useCallback(async (results) => {
    const record = {
      id: uid(),
      at: new Date().toISOString(),
      exact: results.exact,
      similar: results.similar || [],
      possible: results.possible || [],
      total: results.total || 1 + (results.similar?.length || 0) + (results.possible?.length || 0),
    }
    setIdentifications((list) => [record, ...list].slice(0, 200))
    await db.put('identifications', record).catch(() => {})
    return record
  }, [])

  const removeIdentification = useCallback(async (id) => {
    setIdentifications((list) => list.filter((r) => r.id !== id))
    await db.del('identifications', id).catch(() => {})
  }, [])

  /* ------------------------------------------------------------------ videos */
  const savedVideoIds = useMemo(() => new Set(videos.map((v) => v.videoId)), [videos])
  const laterIds = useMemo(() => new Set(watchLater.map((v) => v.videoId)), [watchLater])

  const toggleSavedVideo = useCallback(
    async (video) => {
      const v = normalizeVideo(video)
      if (!v?.videoId) return false
      if (savedVideoIds.has(v.videoId)) {
        setVideos((list) => list.filter((x) => x.videoId !== v.videoId))
        await db.del('videos', v.videoId).catch(() => {})
        toast('Removed from saved videos', { ttl: 2200 })
        return false
      }
      const record = { videoId: v.videoId, at: new Date().toISOString(), video: v }
      setVideos((list) => [record, ...list])
      await db.put('videos', record).catch(() => {})
      toast('Saved video', { title: v.title, type: 'ok', ttl: 2600 })
      return true
    },
    [savedVideoIds, toast],
  )

  const toggleWatchLater = useCallback(
    async (video) => {
      const v = normalizeVideo(video)
      if (!v?.videoId) return false
      if (laterIds.has(v.videoId)) {
        setWatchLater((list) => list.filter((x) => x.videoId !== v.videoId))
        await db.del('watchLater', v.videoId).catch(() => {})
        toast('Removed from Watch Later', { ttl: 2200 })
        return false
      }
      const record = { videoId: v.videoId, at: new Date().toISOString(), video: v }
      setWatchLater((list) => [record, ...list])
      await db.put('watchLater', record).catch(() => {})
      toast('Added to Watch Later', { title: v.title, type: 'ok', ttl: 2600 })
      return true
    },
    [laterIds, toast],
  )

  const recordWatched = useCallback(async (video) => {
    const v = normalizeVideo(video)
    if (!v?.videoId) return
    const record = { videoId: v.videoId, at: new Date().toISOString(), video: v }
    setWatched((list) => [record, ...list.filter((x) => x.videoId !== v.videoId)].slice(0, 30))
    await db.put('watched', record).catch(() => {})
  }, [])

  /* ----------------------------------------------------------------- history */
  const addSearch = useCallback(async (term, mode) => {
    const clean = String(term || '').trim()
    if (clean.length < 2) return
    const record = { id: `${mode}:${clean.toLowerCase()}`, term: clean, mode, at: new Date().toISOString() }
    setSearches((list) => [record, ...list.filter((s) => s.id !== record.id)].slice(0, 20))
    await db.put('searches', record).catch(() => {})
  }, [])

  const clearSearches = useCallback(async () => {
    setSearches([])
    await db.clear('searches').catch(() => {})
    toast('Search history cleared', { ttl: 2200 })
  }, [toast])

  const removeSearch = useCallback(async (id) => {
    setSearches((list) => list.filter((s) => s.id !== id))
    await db.del('searches', id).catch(() => {})
  }, [])

  /* --------------------------------------------------------------- playlists */
  const createPlaylist = useCallback(
    async (name) => {
      const clean = String(name || '').trim()
      if (!clean) return null
      const record = { id: uid(), name: clean.slice(0, 60), at: new Date().toISOString(), items: [] }
      setPlaylists((list) => [record, ...list])
      await db.put('playlists', record).catch(() => {})
      toast('Playlist created', { title: record.name, type: 'ok', ttl: 2400 })
      return record
    },
    [toast],
  )

  const addToPlaylist = useCallback(
    async (playlistId, track) => {
      const normalized = normalizeTrack(track)
      let updated = null
      setPlaylists((list) =>
        list.map((p) => {
          if (p.id !== playlistId) return p
          if (p.items.some((i) => i.key === normalized.key)) {
            updated = p
            return p
          }
          updated = { ...p, items: [...p.items, normalized] }
          return updated
        }),
      )
      if (updated) {
        await db.put('playlists', updated).catch(() => {})
        toast('Added to playlist', { title: updated.name, type: 'ok', ttl: 2200 })
      }
      return updated
    },
    [toast],
  )

  const removeFromPlaylist = useCallback(async (playlistId, key) => {
    let updated = null
    setPlaylists((list) =>
      list.map((p) => {
        if (p.id !== playlistId) return p
        updated = { ...p, items: p.items.filter((i) => i.key !== key) }
        return updated
      }),
    )
    if (updated) await db.put('playlists', updated).catch(() => {})
  }, [])

  const deletePlaylist = useCallback(
    async (id) => {
      setPlaylists((list) => list.filter((p) => p.id !== id))
      await db.del('playlists', id).catch(() => {})
      toast('Playlist deleted', { ttl: 2200 })
    },
    [toast],
  )

  /* --------------------------------------------------------------- downloads */
  const mergeDownload = useCallback(async (record, persist = false) => {
    setDownloads((list) => {
      const idx = list.findIndex((d) => d.id === record.id)
      if (idx === -1) return [record, ...list].slice(0, 60)
      const next = list.slice()
      next[idx] = record
      return next
    })
    if (persist) {
      const { track, handle, ...meta } = record
      const trackMeta = track
        ? {
            key: track.key,
            title: track.title,
            artist: track.artist,
            artwork: track.artwork,
            previewUrl: track.previewUrl,
          }
        : record.trackMeta || null
      await db.put('downloads', { ...meta, trackMeta }).catch(() => {})
    }
  }, [])

  const removeDownload = useCallback(async (id) => {
    setDownloads((list) => list.filter((d) => d.id !== id))
    await db.del('downloads', id).catch(() => {})
  }, [])

  /* ----------------------------------------------------------------- settings */
  const updateSettings = useCallback(async (patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      db.put('meta', { key: 'settings', value: next }).catch(() => {})
      return next
    })
  }, [])

  /* ------------------------------------------------------------------- erase */
  const eraseAll = useCallback(async () => {
    await db.clearAll()
    setIdentifications([])
    setFavourites([])
    setVideos([])
    setWatchLater([])
    setWatched([])
    setDownloads([])
    setPlaylists([])
    setSearches([])
    setSubscriptions([])
    setNotifications([])
    setPlays([])
    setSettings(DEFAULT_SETTINGS)
    toast('Local library erased', { title: 'Done', type: 'ok' })
  }, [toast])

  /* --------------------------------------------------------- subscriptions */

  const subscribedIds = useMemo(
    () => new Set(subscriptions.map((entry) => String(entry.artistId))),
    [subscriptions],
  )

  const isSubscribed = useCallback(
    (artistId) => subscribedIds.has(String(artistId || '')),
    [subscribedIds],
  )

  /**
   * Follow an artist on this device.
   *
   * `latest` is the newest release known at the moment of subscribing, stored as the
   * watermark the release watcher compares against — so following someone does not
   * immediately produce a notification for a song that was already out.
   */
  const subscribe = useCallback(
    async ({ artistId, name, artwork = '', latest = null }) => {
      const id = String(artistId || '')
      if (!id) return null
      const record = {
        artistId: id,
        name: String(name || 'Artist').slice(0, 120),
        artwork: artwork || '',
        at: new Date().toISOString(),
        watermark: latest?.releaseDate || '',
        watermarkTrackId: latest?.trackId || null,
      }
      setSubscriptions((list) => [record, ...list.filter((entry) => String(entry.artistId) !== id)])
      await db.put('subscriptions', record).catch(() => {})
      toast('Subscribed', { title: record.name, type: 'ok', ttl: 2200 })
      return record
    },
    [toast],
  )

  const unsubscribe = useCallback(
    async (artistId) => {
      const id = String(artistId || '')
      setSubscriptions((list) => list.filter((entry) => String(entry.artistId) !== id))
      await db.del('subscriptions', id).catch(() => {})
      toast('Unsubscribed', { type: 'info', ttl: 1800 })
    },
    [toast],
  )

  const toggleSubscription = useCallback(
    async (artist) => {
      const id = String(artist?.artistId || artist?.id || '')
      if (!id) return
      if (subscribedIds.has(id)) return unsubscribe(id)
      return subscribe(artist)
    },
    [subscribe, subscribedIds, unsubscribe],
  )

  /** Move the watermark forward once the watcher has reported a release. */
  const markReleaseSeen = useCallback(async (artistId, latest) => {
    const id = String(artistId || '')
    let updated = null
    setSubscriptions((list) =>
      list.map((entry) => {
        if (String(entry.artistId) !== id) return entry
        updated = {
          ...entry,
          watermark: latest?.releaseDate || entry.watermark,
          watermarkTrackId: latest?.trackId || entry.watermarkTrackId,
        }
        return updated
      }),
    )
    if (updated) await db.put('subscriptions', updated).catch(() => {})
  }, [])

  /* --------------------------------------------------------- notifications */

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications])

  /**
   * One notification per release: the id is derived from the track id, so a watcher
   * that runs twice (or two tabs) cannot create a duplicate row.
   */
  const addNotification = useCallback(async (entry) => {
    const id = entry.id || `release:${entry.trackId || entry.track?.trackId || uid()}`
    const record = {
      at: new Date().toISOString(),
      type: 'release',
      ...entry,
      id,
      read: false,
    }
    let created = false
    setNotifications((list) => {
      if (list.some((n) => n.id === id)) return list
      created = true
      return [record, ...list].slice(0, 120)
    })
    if (created) await db.put('notifications', record).catch(() => {})
    return created
  }, [])

  const markNotificationRead = useCallback(async (id) => {
    let updated = null
    setNotifications((list) =>
      list.map((n) => {
        if (n.id !== id) return n
        updated = { ...n, read: true }
        return updated
      }),
    )
    if (updated) await db.put('notifications', updated).catch(() => {})
  }, [])

  const markAllNotificationsRead = useCallback(async () => {
    const next = notifications.map((n) => ({ ...n, read: true }))
    setNotifications(next)
    await Promise.all(next.map((n) => db.put('notifications', n).catch(() => {})))
  }, [notifications])

  const removeNotification = useCallback(async (id) => {
    setNotifications((list) => list.filter((n) => n.id !== id))
    await db.del('notifications', id).catch(() => {})
  }, [])

  const clearNotifications = useCallback(async () => {
    setNotifications([])
    await Promise.all(notifications.map((n) => db.del('notifications', n.id).catch(() => {})))
  }, [notifications])

  /* ----------------------------------------------------------- play history */

  /** Every play is recorded once per track, with a running count — real, device-local. */
  const recordPlay = useCallback(async (track) => {
    const normalized = normalizeTrack(track)
    if (!normalized?.key) return
    let record = null
    setPlays((list) => {
      const existing = list.find((entry) => entry.key === normalized.key)
      record = {
        key: normalized.key,
        track: normalized,
        count: (existing?.count || 0) + 1,
        firstAt: existing?.firstAt || new Date().toISOString(),
        lastAt: new Date().toISOString(),
      }
      return [record, ...list.filter((entry) => entry.key !== normalized.key)].slice(0, 60)
    })
    if (record) await db.put('plays', record).catch(() => {})
  }, [])

  const playCountFor = useCallback(
    (track) => plays.find((entry) => entry.key === trackKey(track))?.count || 0,
    [plays],
  )

  const counts = useMemo(
    () => ({
      identifications: identifications.length,
      favourites: favourites.length,
      videos: videos.length,
      watchLater: watchLater.length,
      downloads: downloads.length,
      playlists: playlists.length,
      searches: searches.length,
      subscriptions: subscriptions.length,
      notifications: notifications.length,
    }),
    [identifications, favourites, videos, watchLater, downloads, playlists, searches, subscriptions, notifications],
  )

  const value = {
    ready,
    identifications,
    favourites,
    videos,
    watchLater,
    watched,
    downloads,
    playlists,
    searches,
    settings,
    counts,
    subscriptions,
    subscribedIds,
    isSubscribed,
    subscribe,
    unsubscribe,
    toggleSubscription,
    markReleaseSeen,
    notifications,
    unreadCount,
    addNotification,
    markNotificationRead,
    markAllNotificationsRead,
    removeNotification,
    clearNotifications,
    plays,
    recordPlay,
    playCountFor,
    favouriteKeys,
    savedVideoIds,
    laterIds,
    addIdentification,
    removeIdentification,
    toggleFavourite,
    toggleSavedVideo,
    toggleWatchLater,
    recordWatched,
    addSearch,
    removeSearch,
    clearSearches,
    createPlaylist,
    addToPlaylist,
    removeFromPlaylist,
    deletePlaylist,
    mergeDownload,
    removeDownload,
    updateSettings,
    eraseAll,
    isFavourite: (track) => favouriteKeys.has(trackKey(track)),
    db,
  }

  return (
    <LibraryContext.Provider value={value}>
      <ToastContext.Provider value={{ toasts, toast }}>{children}</ToastContext.Provider>
    </LibraryContext.Provider>
  )
}

export function useLibrary() {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary must be used inside LibraryProvider')
  return ctx
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside LibraryProvider')
  return ctx
}
