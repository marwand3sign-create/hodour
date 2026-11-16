// Supabase Edge Function: pin-login
//
// Handle + 6-digit PIN sign-in WITH per-account lockout. A 6-digit PIN has only
// a million combinations, so unlimited guesses against one handle is a real
// risk. This function counts failures per handle and locks the account for
// LOCK_MINUTES after MAX_FAILS wrong PINs. A successful login (or a manager
// resetting the PIN via team-admin) clears the counter.
//
// Returns { access_token, refresh_token } on success; the client then calls
// supabase.auth.setSession(...).
//
// Deploy: supabase functions deploy pin-login
// (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are provided
// automatically.)
//
// LIMITATION: this only protects clients that sign in through this function.
// Someone calling Supabase Auth's /token endpoint directly bypasses it — close
// that with Auth rate limits in the dashboard (and, on plans that have it, a
// password-verification-attempt auth hook).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const HANDLE_DOMAIN = 'hodour.local'
const MAX_FAILS = 5
const LOCK_MINUTES = 15

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { handle, password } = await req.json()
    const h = String(handle || '').trim().toLowerCase()
    if (!h || !password) return json({ error: 'بيانات ناقصة' }, 400)

    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: row } = await admin.from('login_attempts').select('*').eq('handle', h).maybeSingle()
    if (row?.locked_until && new Date(row.locked_until) > new Date()) {
      const mins = Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 60000)
      return json({ error: `الحساب مقفل مؤقتًا بسبب محاولات خاطئة. حاول بعد ${mins} دقيقة أو اطلب من المدير إعادة تعيين الرقم السري.`, locked: true }, 429)
    }

    const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })
    const { data, error } = await anon.auth.signInWithPassword({ email: `${h}@${HANDLE_DOMAIN}`, password: String(password) })

    if (error || !data.session) {
      // Lock window already expired → start counting from zero again.
      const expired = row?.locked_until && new Date(row.locked_until) <= new Date()
      const failed = (expired ? 0 : row?.failed || 0) + 1
      const lock = failed >= MAX_FAILS
      await admin.from('login_attempts').upsert({
        handle: h,
        failed: lock ? 0 : failed,
        locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      if (lock) return json({ error: `تم قفل الحساب ${LOCK_MINUTES} دقيقة بعد ${MAX_FAILS} محاولات خاطئة.`, locked: true }, 429)
      return json({ error: 'اسم المستخدم أو الرقم السري غير صحيح', remaining: MAX_FAILS - failed }, 401)
    }

    if (row) await admin.from('login_attempts').delete().eq('handle', h)
    return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
