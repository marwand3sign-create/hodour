/**
 * Supabase-backed replacement for the Whacka `auth` SDK stub.
 *
 * Every person (owner and employees alike) is a real Supabase Auth user —
 * see team.js for how employees are created/logged in with a handle + PIN.
 * This file only deals with session state and the owner's sign-in entry
 * point (the "owner fallback" button rendered by TeamLogin.jsx).
 */
import { supabase } from './_supabaseClient'
import { localCache } from './localCache'

/*
 * Offline sessions
 * ----------------
 * Supabase keeps the signed-in session in localStorage, but with no internet
 * it can't refresh an expired access token, so getSession()/INITIAL_SESSION
 * report "no user" even though the worker never signed out. We keep a copy
 * of the last user object (no tokens) and keep treating them as signed in as
 * long as Supabase's own stored session is still on the device. The moment
 * the connection returns, we ask Supabase to recover the real session.
 */
const LAST_USER_KEY = 'hodour-last-user'

const readJson = (k) => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage full/blocked */ } }
const hasStoredSupabaseSession = () => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (/^sb-.*-auth-token$/.test(k) && localStorage.getItem(k)) return true
    }
  } catch { /* ignore */ }
  return false
}

// Resolves the user to expose: the live Supabase user, else (when there's no
// connection but the stored session survives) the cached one.
function resolveUser(event, session) {
  if (session?.user) {
    const prev = readJson(LAST_USER_KEY)
    if (prev && prev.id !== session.user.id) localCache.clear() // different worker on a shared phone
    writeJson(LAST_USER_KEY, session.user)
    return session.user
  }
  if (event === 'SIGNED_OUT') {
    try { localStorage.removeItem(LAST_USER_KEY) } catch { /* ignore */ }
    localCache.clear()
    return null
  }
  return hasStoredSupabaseSession() ? readJson(LAST_USER_KEY) : null
}

let _user = null
let _ready = supabase.auth.getSession().then(({ data }) => {
  _user = resolveUser('INITIAL_SESSION', data.session)
}).catch(() => {
  _user = resolveUser('INITIAL_SESSION', null)
})

supabase.auth.onAuthStateChange((event, session) => {
  _user = resolveUser(event, session)
})

// Back online → let Supabase refresh the expired token so syncing/writes work.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { supabase.auth.getSession().catch(() => {}) })
}

export const auth = {
  // Synchronous per the existing contract (App.jsx calls it before any auth
  // state is guaranteed loaded) — callers also subscribe via onAuthChange for
  // the authoritative, async-resolved state.
  isAuthenticated: () => !!_user,

  isAppOwner: () => _user?.user_metadata?.role === 'owner',

  getRole: () => _user?.user_metadata?.role || null,

  onAuthChange: (cb) => {
    _ready.then(() => cb(_user))
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      cb(resolveUser(event, session))
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
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const ok = window.confirm('لا يوجد اتصال بالإنترنت. إذا خرجت الآن فلن تستطيع الدخول مرة أخرى إلا بعد عودة الإنترنت. هل تريد الخروج؟')
      if (!ok) return
    }
    supabase.auth.signOut()
    try { localStorage.removeItem(LAST_USER_KEY) } catch { /* ignore */ }
    localCache.clear()
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
