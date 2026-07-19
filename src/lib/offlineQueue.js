/**
 * Local queue for clock-in/out actions attempted while offline.
 *
 * Scope (deliberately narrow): if `navigator.onLine` is false at the moment
 * the employee taps clock-in/out, the action (payload + face photo blob +
 * face embedding — both already computed locally, no network needed) is
 * written to IndexedDB instead of Supabase. It's replayed in order as soon
 * as the browser reports 'online' again, or on next app load.
 *
 * What this does NOT cover: a request that starts while online but fails
 * mid-flight (flaky connection) — that still surfaces as the existing error
 * alert, unchanged. It also doesn't help on a *first-ever* offline session
 * before the face-detection WASM/model files have been fetched once — those
 * are loaded from a CDN and only work offline once the browser has cached
 * them from a prior online visit.
 */
const DB_NAME = 'hodour-offline'
const STORE = 'queue'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'localId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore(mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    const result = fn(store)
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
  })
}

export const offlineQueue = {
  // item: { localId, kind: 'clockIn'|'clockOut', createdAt, payload, blob, embedding, attendanceId? }
  enqueue: (item) => withStore('readwrite', (store) => { store.add(item) }),

  remove: (localId) => withStore('readwrite', (store) => { store.delete(localId) }),

  // Sorted oldest-first so clockIn always replays before a clockOut that depends on it.
  list: async () => {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => a.createdAt - b.createdAt))
      req.onerror = () => reject(req.error)
    })
  },
}
