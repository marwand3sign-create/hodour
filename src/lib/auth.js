/**
 * Supabase-backed replacement for the Whacka `auth` SDK stub.
 *
 * Every person (owner and employees alike) is a real Supabase Auth user —
 * see team.js for how employees are created/logged in with a handle + PIN.
 * This file only deals with session state and the owner's sign-in entry
 * point (the "owner fallback" button rendered by TeamLogin.jsx).
 */
import { supabase } from './_supabaseClient'

let _user = null
let _ready = supabase.auth.getSession().then(({ data }) => {
  _user = data.session?.user ?? null
})

supabase.auth.onAuthStateChange((_event, session) => {
  _user = session?.user ?? null
})

export const auth = {
  // Synchronous per the existing contract (App.jsx calls it before any auth
  // state is guaranteed loaded) — callers also subscribe via onAuthChange for
  // the authoritative, async-resolved state.
  isAuthenticated: () => !!_user,

  isAppOwner: () => _user?.user_metadata?.role === 'owner',

  onAuthChange: (cb) => {
    _ready.then(() => cb(_user))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      cb(session?.user ?? null)
    })
    return () => data.subscription.unsubscribe()
  },

  getCurrentUser: () => {
    if (!_user) return null
    return {
      id: _user.id,
      displayName: _user.user_metadata?.displayName || _user.user_metadata?.handle || _user.email,
    }
  },

  signOut: () => {
    supabase.auth.signOut()
  },

  // The owner is the one account that isn't provisioned through the
  // handle+PIN team flow, so it needs real credentials. TeamLogin's "owner
  // fallback" button calls this with no arguments, so we collect the
  // email/password here via a plain prompt — this path is meant to be used
  // rarely (see App.jsx's Arabic label: "نادرًا").
  signIn: async () => {
    const email = window.prompt('البريد الإلكتروني للمالك:')
    if (!email) return null
    const password = window.prompt('كلمة المرور:')
    if (!password) return null
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      window.alert(error.message)
      return null
    }
    _user = data.user
    return data.user
  },
}

// Unused anywhere in app code (confirmed) — kept as a no-op for import compatibility.
export const adoptSession = () => {}
