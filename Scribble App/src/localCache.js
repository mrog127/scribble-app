// A local snapshot of the last loaded state, so the app paints instantly on
// open instead of waiting on Supabase. Best-effort in every direction: if
// IndexedDB is unavailable or the browser evicts the data, the app just falls
// back to its normal load.

const DB_NAME = 'scribble-cache'
const STORE = 'state'

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }).catch(err => { dbPromise = null; throw err })
  return dbPromise
}

// A synchronous copy of the same snapshot in localStorage, so the very first
// render can paint from it — IndexedDB can only be read asynchronously, which
// left a blank frame (and a beat with no canvases to add to) on every open.
// Best-effort: skipped if it won't fit.
const LS_PREFIX = 'scribble-cache:'
export function readCacheSync(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function writeCacheSync(key, value) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)) }
  catch { try { localStorage.removeItem(LS_PREFIX + key) } catch { /* ignore */ } }
}

export async function readCache(key) {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch { return null }
}

export async function writeCache(key, value) {
  writeCacheSync(key, value)
  try {
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch { /* cache is optional */ }
}

export async function clearCache(key) {
  try { localStorage.removeItem(LS_PREFIX + key) } catch { /* ignore */ }
  try {
    const db = await openDb()
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = resolve
      tx.onerror = resolve
    })
  } catch { /* nothing to clear */ }
}
