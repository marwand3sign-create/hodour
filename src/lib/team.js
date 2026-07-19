/**
 * Supabase-backed replacement for the Whacka `team` SDK stub.
 *
 * Employees sign in with a username ("handle") + 6-digit PIN. Supabase Auth
 * has no native concept of that, so each person becomes a real Supabase Auth
 * user keyed by a synthetic email `${handle}@hodour.local`, with the PIN
 * used as the Auth password. Admin-only operations (creating/disabling
 * members, resetting PINs) require the service-role key, so those go
 * through the `team-admin` Edge Function instead of running in the browser.
 *
 * Hodour is single-tenant per Supabase project (one deployment = one
 * company), so groupId() is a fixed constant — see _supabaseClient.js.
 */
import { supabase, GROUP_ID } from './_supabaseClient'

const HANDLE_DOMAIN = 'hodour.local'
const emailFor = (handle) => `${String(handle).trim().toLowerCase()}@${HANDLE_DOMAIN}`

async function callTeamAdmin(action, payload) {
  const { data, error } = await supabase.functions.invoke('team-admin', {
    body: { action, ...payload },
  })
  if (error) throw new Error(error.message || 'فشل الإجراء')
  if (data?.error) throw new Error(data.error)
  return data
}

export const team = {
  groupId: async () => GROUP_ID,

  // PIN mode is the only mode this app uses; nothing else to persist.
  config: async () => ({ selfSignup: false, loginConfig: { pin: true, memberPicker: false } }),
  setLoginConfig: async () => {},

  currentMember: async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data, error } = await supabase
      .from('employees')
      .select('role, handle, full_name')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error || !data) return null
    return { role: data.role, handle: data.handle, displayName: data.full_name }
  },

  canManage: async () => {
    const m = await team.currentMember()
    return !!m && (m.role === 'manager' || m.role === 'owner' || m.role === 'admin')
  },

  login: async ({ handle, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailFor(handle),
      password,
    })
    if (error) throw new Error('اسم المستخدم أو الرقم السري غير صحيح')
    return { user: data.user, role: data.user?.user_metadata?.role || 'employee' }
  },

  // These paths (invite links, member-picker, self-signup) are never
  // exercised by this app — RosterAdmin always creates accounts directly —
  // kept as safe stubs so TeamLogin.jsx's imports keep resolving.
  loginRoster: async () => ({ members: [] }),
  inviteInfo: async () => ({ valid: false }),
  acceptInvite: async () => { throw new Error('غير مدعوم') },
  requestAccess: async () => { throw new Error('غير مدعوم') },

  listMembers: async () => {
    const data = await callTeamAdmin('list')
    return data.members
  },

  createMember: async ({ handle, displayName, role, password }) => {
    return callTeamAdmin('create', { handle, displayName, role, password })
  },

  resetPassword: async (userId, password) => {
    return callTeamAdmin('resetPassword', { userId, password })
  },

  enableMember: (userId) => callTeamAdmin('enable', { userId }),

  disableMember: (userId) => callTeamAdmin('disable', { userId }),

  changePassword: async (current, next) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('غير مسجل الدخول')
    const { error: reErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    })
    if (reErr) throw new Error('الرقم السري الحالي غير صحيح')
    const { error } = await supabase.auth.updateUser({ password: next })
    if (error) throw new Error(error.message)
  },
}
