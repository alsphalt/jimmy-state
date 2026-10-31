/**
 * Local persistence.
 *
 * IndexedDB is the primary store. When it is unavailable (private windows,
 * locked-down webviews) every call degrades to a localStorage-backed shim with
 * the same async API, so the library still works instead of throwing.
 *
 * Downloaded FILES are never stored here — only metadata about them. Clearing a
 * library row is not the same as deleting a file from the device, and the UI says so.
 */

const DB_NAME = 'jimmy-state'
const DB_VERSION = 1

export const STORES = {
  identifications: 'id',
  favourites: 'key',
  videos: 'videoId',
  watchLater: 'videoId',
  watched: 'videoId',
  downloads: 'id',
  playlists: 'id',
  searches: 'id',
  meta: 'key',
}

let dbPromise = null
let fallbackReason = null

function open() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const [store, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath })
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
    req.onblocked = () => reject(new Error('IndexedDB blocked by another tab'))
  }).catch((err) => {
    fallbackReason = err.message
    console.warn('[jimmy-state] IndexedDB unavailable, using localStorage:', err.message)
    return null
  })
  return dbPromise
}

/* --------------------------------------------------------- localStorage shim */
const lsKey = (store) => `js.store.${store}`

function lsRead(store) {
  try {
    return JSON.parse(localStorage.getItem(lsKey(store)) || '[]')
  } catch {
    return []
  }
}

function lsWrite(store, rows) {
  try {
    localStorage.setItem(lsKey(store), JSON.stringify(rows))
  } catch (err) {
    console.warn('[jimmy-state] localStorage write failed', err)
  }
}

/* --------------------------------------------------------------- public API */
export async function getAll(store) {
  const db = await open()
  if (!db) return lsRead(store)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

export async function get(store, key) {
  const db = await open()
  if (!db) return lsRead(store).find((r) => r[STORES[store]] === key) || null
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function put(store, value) {
  const db = await open()
  if (!db) {
    const rows = lsRead(store)
    const keyPath = STORES[store]
    const idx = rows.findIndex((r) => r[keyPath] === value[keyPath])
    if (idx >= 0) rows[idx] = value
    else rows.push(value)
    lsWrite(store, rows)
    return value
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value)
    tx.oncomplete = () => resolve(value)
    tx.onerror = () => reject(tx.error)
  })
}

export async function del(store, key) {
  const db = await open()
  if (!db) {
    lsWrite(
      store,
      lsRead(store).filter((r) => r[STORES[store]] !== key),
    )
    return
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function clear(store) {
  const db = await open()
  if (!db) {
    lsWrite(store, [])
    return
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function clearAll() {
  for (const store of Object.keys(STORES)) {
    // eslint-disable-next-line no-await-in-loop
    await clear(store).catch(() => {})
  }
}

export async function exportAll() {
  const out = { exportedAt: new Date().toISOString(), app: 'JIMMY STATE', version: 1, data: {} }
  for (const store of Object.keys(STORES)) {
    // eslint-disable-next-line no-await-in-loop
    out.data[store] = await getAll(store).catch(() => [])
  }
  return out
}

export function storageBackend() {
  return fallbackReason ? 'localStorage' : 'IndexedDB'
}
