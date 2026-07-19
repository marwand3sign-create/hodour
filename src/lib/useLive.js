/**
 * Supabase-backed replacement for the Whacka `useLiveShared`/`useLive` stub.
 *
 * useLiveShared(collection, opts) does an initial fetch, then subscribes to
 * Postgres changes on that table and re-fetches on any insert/update/delete
 * — simpler and less error-prone than hand-patching the array client-side,
 * and cheap enough for this app's data volumes. RLS (see supabase/migrations)
 * scopes both the initial fetch and which realtime events a given client
 * receives, so manager-vs-employee visibility needs no extra code here.
 */
import { useEffect, useRef, useState } from 'react'
import { supabase } from './_supabaseClient'

const TABLE = {
  employees: 'employees',
  attendance: 'attendance',
  departments: 'departments',
  jobTitles: 'job_titles',
  locations: 'locations',
  settings: 'settings',
  notifications: 'notifications',
}

const camelToSnake = (s) => s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())
const snakeToCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
const toCamel = (obj) => {
  const out = {}
  for (const [k, v] of Object.entries(obj || {})) out[snakeToCamel(k)] = v
  return out
}

export function useLiveShared(collection, opts = {}) {
  const [state, setState] = useState({ data: [], loading: true })
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    const table = TABLE[collection]
    if (!table) throw new Error(`Unknown collection "${collection}"`)
    let alive = true

    async function load() {
      let q = supabase.from(table).select('*')
      const { order, limit } = optsRef.current
      if (order) {
        const desc = order.startsWith('-')
        q = q.order(camelToSnake(desc ? order.slice(1) : order), { ascending: !desc })
      }
      if (limit) q = q.limit(limit)
      const { data, error } = await q
      if (!alive) return
      if (error) { setState({ data: [], loading: false }); return }
      setState({ data: (data || []).map(toCamel), loading: false })
    }

    load()
    const channel = supabase
      .channel(`live:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, load)
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection, opts.order, opts.limit])

  return state
}

// Unused anywhere in app code (confirmed) — kept for import compatibility.
export function useLive() {
  return { data: [], loading: false }
}
