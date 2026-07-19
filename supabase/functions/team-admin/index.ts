// Supabase Edge Function: team-admin
//
// Handles the parts of team.js that need the service-role key (creating
// auth users, listing all members, resetting PINs, enabling/disabling
// accounts) — this key must never reach the browser bundle, so those
// operations are proxied through here instead of running client-side.
//
// The caller's own session JWT is required and re-verified as a manager
// before anything runs — that check is the actual privilege boundary, not
// anything on the client.
//
// Deploy: supabase functions deploy team-admin
// Secrets needed (set once): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are
// provided automatically by the Supabase platform to every Edge Function.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const HANDLE_DOMAIN = 'hodour.local'
const emailFor = (handle: string) => `${handle.trim().toLowerCase()}@${HANDLE_DOMAIN}`
const randomPin = () => String(Math.floor(100000 + Math.random() * 900000))

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Client scoped to the caller's own JWT, used only to identify who's calling.
    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !caller) return json({ error: 'غير مسجل الدخول' }, 401)

    const { data: callerRow } = await callerClient
      .from('employees')
      .select('role')
      .eq('user_id', caller.id)
      .maybeSingle()
    const isManager = callerRow && ['manager', 'owner'].includes(callerRow.role)
    if (!isManager) return json({ error: 'ليست لديك صلاحية إدارة الفريق' }, 403)

    // Admin client (service role) for the actual privileged operations.
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { action, ...body } = await req.json()

    if (action === 'list') {
      const { data: employees, error } = await admin
        .from('employees')
        .select('user_id, handle, role, full_name, deleted')
        .eq('deleted', false)
      if (error) return json({ error: error.message }, 400)

      const members = []
      for (const e of employees ?? []) {
        if (!e.user_id) continue
        const { data: authUser } = await admin.auth.admin.getUserById(e.user_id)
        members.push({
          userId: e.user_id,
          role: e.role,
          status: authUser?.user?.banned_until && authUser.user.banned_until !== 'none' ? 'disabled' : 'active',
          handle: e.handle,
          displayName: e.full_name,
        })
      }
      return json({ members })
    }

    if (action === 'create') {
      const { handle, displayName, role, password } = body
      if (!handle || String(handle).length < 3) return json({ error: 'اسم المستخدم قصير جدًا' }, 400)
      const pin = password || randomPin()
      const email = emailFor(handle)

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: pin,
        email_confirm: true,
        user_metadata: { handle, displayName, role: role || 'employee' },
      })
      if (createErr) return json({ error: createErr.message }, 400)

      const { error: rowErr } = await admin.from('employees').insert({
        user_id: created.user.id,
        handle,
        role: role || 'employee',
        full_name: displayName,
      })
      if (rowErr) return json({ error: rowErr.message }, 400)

      return json({ userId: created.user.id, handle, tempPassword: pin })
    }

    if (action === 'resetPassword') {
      const { userId } = body
      const pin = randomPin()
      const { error } = await admin.auth.admin.updateUserById(userId, { password: pin })
      if (error) return json({ error: error.message }, 400)
      return json({ tempPassword: pin })
    }

    if (action === 'enable' || action === 'disable') {
      const { userId } = body
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: action === 'disable' ? '876000h' : 'none',
      })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    // Moves an existing Supabase Auth account (e.g. the owner, originally
    // created with a real email) onto the same handle+PIN login scheme
    // everyone else uses.
    if (action === 'updateLogin') {
      const { userId, handle, password } = body
      if (!handle || String(handle).length < 3) return json({ error: 'اسم المستخدم قصير جدًا' }, 400)
      const pin = password || randomPin()
      // user_metadata is replaced wholesale by updateUserById, not merged —
      // fetch the existing metadata first so role/displayName survive.
      const { data: existing } = await admin.auth.admin.getUserById(userId)
      const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
        email: emailFor(handle),
        password: pin,
        user_metadata: { ...(existing?.user?.user_metadata || {}), handle },
      })
      if (authErr) return json({ error: authErr.message }, 400)
      const { error: rowErr } = await admin.from('employees').update({ handle }).eq('user_id', userId)
      if (rowErr) return json({ error: rowErr.message }, 400)
      return json({ handle, tempPassword: pin })
    }

    return json({ error: 'إجراء غير معروف' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
