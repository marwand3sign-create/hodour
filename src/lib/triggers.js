/**
 * Supabase-backed replacement for the Whacka `triggers` SDK stub.
 *
 * Backed by a `notification_rules` table + a Postgres trigger on
 * `attendance` that evaluates each rule and inserts a row into
 * `notifications` (see supabase/migrations/0001_hodour_schema.sql).
 *
 * Deliberate v1 simplification: this delivers an in-app realtime
 * notification (Dashboard.jsx subscribes to the `notifications` table),
 * not a true OS push while the app is closed. True Web Push is a documented
 * upgrade path (VAPID keys + service worker + a push_subscriptions table +
 * an Edge Function sender) if that's needed later — not implemented here.
 */
import { supabase } from './_supabaseClient'

const toSnakeRule = (rule) => ({
  collection: rule.collection,
  on_events: rule.on,
  when_cond: rule.when,
  title: rule.title,
  body: rule.body,
  target: rule.target || null,
})
const toCamelRule = (row) => ({
  id: row.id,
  collection: row.collection,
  on: row.on_events,
  when: row.when_cond,
  title: row.title,
  body: row.body,
  target: row.target,
})

export const triggers = {
  list: async () => {
    const { data, error } = await supabase.from('notification_rules').select('*')
    if (error) throw error
    return (data || []).map(toCamelRule)
  },
  create: async (rule) => {
    const { data, error } = await supabase
      .from('notification_rules')
      .insert(toSnakeRule(rule))
      .select()
      .single()
    if (error) throw error
    return toCamelRule(data)
  },
}

export default triggers
