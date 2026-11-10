/**
 * Tiny IndexedDB key-value cache used for offline reads.
 *
 * Every successful read from Supabase is mirrored here; when the device has
 * no internet (or the request dies on the network) the last known copy is
 * served instead. Cleared on sign-out/user change so a shared phone never
 * shows one worker's data to another.
 */
const DB_NAME = 'hodour-cache'
const STORE = 'kv'

let dbPromise = null
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => { dbPromise = null; reject(req.error) }
    })
  }
  return dbPromise
}

async function run(mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(req?.result)
    tx.onerror = () => reject(tx.error)
  })
}

export const localCache = {
  get: (key) => run('readonly', (s) => s.get(key)).catch(() => undefined),
  set: (key, value) => run('readwrite', (s) => s.put(value, key)).catch(() => {}),
  clear: () => run('readwrite', (s) => s.clear()).catch(() => {}),
}

// True for "couldn't reach the server" failures (as opposed to a real
// server-side error like an RLS denial) — those are the ones we may paper
// over with cached data or a queued write.
export function isNetworkError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = String(err?.message || err || '')
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|ERR_INTERNET/i.test(msg)
}
