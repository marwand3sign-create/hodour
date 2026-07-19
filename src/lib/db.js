/**
 * Supabase-backed replacement for the Whacka `db` SDK stub — a thin generic
 * layer over Postgres tables that matches the shape the page and component
 * files already call: selectShared, selectAllShared, insertShared,
 * upsertShared, updateShared, deleteShared, insertManyShared.
 *
 * Row fields in the app's contract are camelCase; Postgres columns are
 * snake_case — that conversion happens centrally here so call sites never
 * need to change. `groupId`/`visibleTo` write opts are accepted (for call
 * site compatibility) but ignored: access control is enforced entirely by
 * Postgres RLS (see supabase/migrations), not by an app-level ACL string.
 *
 * `settings` is a special case: the table stores a generic `value jsonb`
 * column keyed by a literal string id (`key`), but call sites read/write it
 * as a flat object (e.g. `{key:'shift', startTime, endTime, graceMinutes}`)
 * — that unwrapping is handled locally instead of forcing it through the
 * generic camel/snake row mapper.
 */
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

// Business key each collection's upsertShared(...) 3rd arg matches against.
// Everything not listed here matches on the row's own `id` primary key.
const NATURAL_KEY = { employees: 'user_id', settings: 'key' }

const camelToSnake = (s) => s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())
const snakeToCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())

function toSnake(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj || {})) out[camelToSnake(k)] = v
  return out
}
function toCamel(obj) {
  if (!obj) return obj
  const out = {}
  for (const [k, v] of Object.entries(obj)) out[snakeToCamel(k)] = v
  return out
}

function tableOf(collection) {
  const table = TABLE[collection]
  if (!table) throw new Error(`Unknown collection "${collection}"`)
  return table
}

function applyOrder(query, order) {
  if (!order) return query
  const desc = order.startsWith('-')
  const col = camelToSnake(desc ? order.slice(1) : order)
  return query.order(col, { ascending: !desc })
}

function applyFilter(query, filter) {
  for (const [key, val] of Object.entries(filter || {})) {
    const col = camelToSnake(key)
    if (val && typeof val === 'object' && 'between' in val) {
      const [from, to] = val.between
      query = query.gte(col, from).lte(col, to)
    } else {
      query = query.eq(col, val)
    }
  }
  return query
}

// ---- settings: flat-object <-> {key, value jsonb} unwrapping ----
async function selectSettings(filter, opts) {
  let q = supabase.from('settings').select('*')
  if (filter?.key) q = q.eq('key', filter.key)
  if (opts?.limit) q = q.limit(opts.limit)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map((r) => ({ key: r.key, ...(r.value || {}) }))
}
async function upsertSettings(row, id) {
  const { key, ...rest } = row
  const { data, error } = await supabase
    .from('settings')
    .upsert({ key: id || key, value: rest }, { onConflict: 'key' })
    .select()
    .single()
  if (error) throw error
  return { key: data.key, ...(data.value || {}) }
}

export const db = {
  selectShared: async (collection, filter = {}, opts = {}) => {
    if (collection === 'settings') return selectSettings(filter, opts)
    let q = applyFilter(supabase.from(tableOf(collection)).select('*'), filter)
    q = applyOrder(q, opts.order)
    if (opts.limit) q = q.limit(opts.limit)
    const { data, error } = await q
    if (error) throw error
    return (data || []).map(toCamel)
  },

  selectAllShared: async (collection, filter = {}, opts = {}) => {
    if (collection === 'settings') return selectSettings(filter, opts)
    let q = applyFilter(supabase.from(tableOf(collection)).select('*'), filter)
    q = applyOrder(q, opts.order)
    q = q.limit(opts.max || 20000)
    const { data, error } = await q
    if (error) throw error
    return (data || []).map(toCamel)
  },

  insertShared: async (collection, row, _id, _opts) => {
    if (collection === 'settings') return upsertSettings(row, row.key)
    const { data, error } = await supabase.from(tableOf(collection)).insert(toSnake(row)).select().single()
    if (error) throw error
    return toCamel(data)
  },

  upsertShared: async (collection, row, id, _opts) => {
    if (collection === 'settings') return upsertSettings(row, id)
    const table = tableOf(collection)
    const key = NATURAL_KEY[collection] || 'id'
    const payload = { ...toSnake(row), [key]: id }
    const { data, error } = await supabase.from(table).upsert(payload, { onConflict: key }).select().single()
    if (error) throw error
    return toCamel(data)
  },

  updateShared: async (collection, id, patch) => {
    const { data, error } = await supabase.from(tableOf(collection)).update(toSnake(patch)).eq('id', id).select().single()
    if (error) throw error
    return toCamel(data)
  },

  deleteShared: async (collection, id) => {
    if (collection === 'settings') {
      const { error } = await supabase.from('settings').delete().eq('key', id)
      if (error) throw error
      return
    }
    const { error } = await supabase.from(tableOf(collection)).delete().eq('id', id)
    if (error) throw error
  },

  insertManyShared: async (collection, rows, opts = {}) => {
    const table = tableOf(collection)
    const idField = camelToSnake(opts.idField || 'id')
    const payload = (rows || []).map(toSnake)
    const { error } = await supabase.from(table).upsert(payload, { onConflict: idField })
    if (error) throw error
  },
}
