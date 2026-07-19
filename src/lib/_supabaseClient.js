/**
 * Shared Supabase client used by every src/lib/*.js backend module.
 *
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are safe to expose client-side
 * (see .env.example). The service-role key is NEVER used here — it only
 * lives in the `team-admin` Edge Function's server-side environment.
 */
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env and fill them in.')
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
})

// Hodour is single-tenant per Supabase project (one deployment = one company),
// so the app's generic multi-tenant groupId concept collapses to a constant.
// It's kept only so call sites that thread `groupId` through db.*Shared(...)
// opts don't need to change.
export const GROUP_ID = '00000000-0000-0000-0000-000000000001'
