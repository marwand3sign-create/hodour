/**
 * TeamLogin — the complete sign-in surface for a Whacka Teams app. Drop it in as the
 * app's auth gate; it handles all three entry paths:
 *
 *   - Staff, first time  → opened via an invite link (`?join=<code>`): "accept" mode.
 *       The admin already assigned their username on the invite, so they only set a
 *       password. (See team.createInvite — the admin picks the username.)
 *   - Staff, returning   → no invite code: "login" mode. They enter the username +
 *       password the admin gave them (team.login).
 *   - The OWNER          → a built-in "Sign in as owner" button (auth.signIn, Whacka ID).
 *       The owner is NOT a Team seat; this component includes their entry so you don't
 *       have to add it separately.
 *
 * On any success it calls onSignedIn({ user, role }); the user is then signed in
 * everywhere (auth.getCurrentUser(), db, social all work). For a modal instead of an
 * embedded form, call team.signIn().
 *
 *   <TeamLogin appName="Bouchaib" onSignedIn={() => navigate('/')} />
 *
 * Props:
 *   appName       {string}   shown in the heading
 *   mode          {'login'|'accept'}  force a mode; default auto-detects from ?join=
 *   code          {string}   invite code; default reads ?join= from the URL
 *   ownerSignIn   {boolean}  show the "Sign in as owner" button in login mode (default true)
 *   onSignedIn    {function} called with { user, role } after a successful sign-in
 *   onClose       {function} if provided, renders a close (×) button (used by the modal)
 *   fullScreen    {boolean}  render as the whole sign-in GATE — a self-centering, scrollable
 *                            full-screen surface (same recipe as the auth modal) that never
 *                            clips. Use this instead of hand-building a centered login page.
 *   brand         {node}     optional logo/tagline shown above the card (fullScreen only)
 *   bgClassName   {string}   background class for the fullScreen surface (default 'bg-stone-50')
 *   labels        {object}   override any UI string (localize the form without touching this
 *                            file): { title, subtitle, username, usernamePlaceholder,
 *                            displayName, displayNameHint, displayNamePlaceholder, password,
 *                            passwordPlaceholder, submit, busy, owner, ownerButton, ownerBusy,
 *                            invalidInvite, genericError, requestLink, requestSubmit,
 *                            requestedTitle, requestedBody, backToSignIn, poweredBy, close,
 *                            pin, pinPlaceholder, pinSetPlaceholder, pinSubtitle,
 *                            pinAcceptSubtitle, pickName, findName, notYou }.
 *                            e.g. labels={{ title: 'تسجيل الدخول' }}. Arabic apps get Arabic
 *                            defaults automatically (same detection as the platform auth modal);
 *                            explicit labels always win.
 *
 * PIN mode & member picker (owner opt-in via team.setLoginConfig — nothing to wire here):
 * when the app's loginConfig has pin:true the secret field becomes a 6-digit numeric PIN
 * input, and with memberPicker:true the login form lists active members to TAP instead of
 * typing a username (falls back to the typed form when the roster is large or unavailable).
 */

import React, { useState, useEffect } from 'react'
import { QrCode } from 'lucide-react'
import { team } from '../lib/team'
import { auth } from '../lib/auth'
import { onPrimaryColor } from '../lib/_on-primary'
import { brandingHidden, onBrandingChange, refreshBranding } from '../lib/_branding'
import QrScanner from './QrScanner'

// Same detection cascade as GateLock / the platform auth modal: app-declared
// direction or lang first, then device language. Evaluated per render — apps
// set documentElement.dir/lang during their own boot.
function detectArabic() {
  try {
    if (document.documentElement.dir === 'rtl') return true
    if (/^ar\b/i.test(document.documentElement.lang || '')) return true
  } catch {}
  try { return /^ar\b/i.test(navigator.language || '') } catch {}
  return false
}

// Overlay padding that clears notches / home indicator in standalone PWAs while
// keeping the 16px minimum everywhere else (env() is 0 on desktop).
const SAFE_PAD = {
  padding:
    'max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) ' +
    'max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left))',
}

function readInviteCode() {
  try { return new URLSearchParams(window.location.search).get('join') } catch { return null }
}

// Whacka brand mark — yellow disc + stroke + purple dot. Used in the footer.
function WhackaMark({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true" style={{ overflow: 'visible' }}>
      <circle cx="17" cy="19" r="15" fill="#F7C518" />
      <path d="M9 15 L13 24 L18 17.5 L23 24 L27 15" fill="none" stroke="#141414" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="29.5" cy="6.5" r="4" fill="#7C2FE0" />
    </svg>
  )
}

const FIELD =
  'w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-[15px] text-stone-900 ' +
  'outline-none transition placeholder:text-stone-400 hover:border-stone-300 ' +
  'focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/15'

export default function TeamLogin({ appName, mode, code, ownerSignIn = true, onSignedIn, onClose, fullScreen = false, brand = null, bgClassName = 'bg-stone-50', labels = {} }) {
  const inviteCode = code || readInviteCode()
  const accepting = (mode || (inviteCode ? 'accept' : 'login')) === 'accept'
  const isArabic = detectArabic()

  // UI strings — Arabic apps get Arabic defaults; every key still overridable
  // via the `labels` prop (explicit localization always wins).
  const name = appName || (isArabic ? 'هذا التطبيق' : 'this app')
  const D = isArabic
    ? {
        title: accepting ? `الانضمام إلى ${name}` : `تسجيل الدخول إلى ${name}`,
        subtitle: accepting
          ? 'عيّن كلمة مرور لإكمال إعداد حسابك.'
          : 'أدخل اسم المستخدم وكلمة المرور.',
        username: 'اسم المستخدم',
        usernamePlaceholder: accepting ? 'مثال: ahmed' : 'اسم المستخدم',
        displayName: 'الاسم الظاهر',
        displayNameHint: '(اختياري)',
        displayNamePlaceholder: 'اسمك',
        password: 'كلمة المرور',
        passwordPlaceholder: accepting ? '6 أحرف على الأقل' : 'كلمة المرور',
        submit: accepting ? 'إنشاء الحساب والانضمام' : 'تسجيل الدخول',
        busy: 'يرجى الانتظار…',
        owner: 'المالك',
        ownerButton: 'تسجيل الدخول كمالك',
        ownerBusy: 'جارٍ الفتح…',
        invalidInvite: 'رابط الدعوة هذا لم يعد صالحًا. اطلب رابطًا جديدًا من المشرف.',
        genericError: 'حدث خطأ ما. حاول مرة أخرى.',
        requestLink: 'جديد هنا؟ اطلب الانضمام',
        requestSubmit: 'طلب الانضمام',
        requestedTitle: 'تم إرسال الطلب',
        requestedBody: 'سيراجع المشرف طلبك — ستتمكن من تسجيل الدخول بعد الموافقة.',
        backToSignIn: 'العودة لتسجيل الدخول',
        poweredBy: 'مقدَّم من Whacka',
        close: 'إغلاق',
        pin: 'الرقم السري (PIN)',
        pinPlaceholder: 'رمزك المكوّن من 6 أرقام',
        pinSetPlaceholder: '6 أرقام',
        pinSubtitle: 'أدخل اسم المستخدم والرقم السري.',
        pinAcceptSubtitle: 'اختر رقمًا سريًا من 6 أرقام لإكمال إعداد حسابك.',
        pickName: 'اختر اسمك',
        findName: 'ابحث عن اسمك',
        notYou: 'لست أنت؟',
      }
    : {
        title: accepting ? `Join ${name}` : `Sign in to ${name}`,
        subtitle: accepting
          ? 'Set a password to finish setting up your account.'
          : 'Enter your username and password.',
        username: 'Username',
        usernamePlaceholder: accepting ? 'e.g. ahmed' : 'Your username',
        displayName: 'Display name',
        displayNameHint: '(optional)',
        displayNamePlaceholder: 'Your name',
        password: 'Password',
        passwordPlaceholder: accepting ? 'At least 6 characters' : 'Your password',
        submit: accepting ? 'Create account & join' : 'Sign in',
        busy: 'Please wait…',
        owner: 'Owner',
        ownerButton: 'Sign in as owner',
        ownerBusy: 'Opening…',
        invalidInvite: 'This invite link is no longer valid. Ask your admin for a new one.',
        genericError: 'Something went wrong. Please try again.',
        requestLink: 'New here? Request to join',
        requestSubmit: 'Request to join',
        requestedTitle: 'Request submitted',
        requestedBody: "An admin will review your request — you'll be able to sign in once you're approved.",
        backToSignIn: 'Back to sign in',
        poweredBy: 'Powered by Whacka',
        close: 'Close',
        pin: 'PIN',
        pinPlaceholder: 'Your 6-digit PIN',
        pinSetPlaceholder: '6 digits',
        pinSubtitle: 'Enter your username and PIN.',
        pinAcceptSubtitle: 'Choose a 6-digit PIN to finish setting up your account.',
        pickName: 'Tap your name',
        findName: 'Find your name',
        notYou: 'Not you?',
      }
  const L = { ...D, ...labels }

  // White-label: "Remove Whacka branding" (Pro/Ultra) also hides this footer.
  // Reactive because the gate can mount at boot, before the server confirms.
  const [brandHidden, setBrandHidden] = useState(brandingHidden)
  useEffect(() => {
    refreshBranding()
    return onBrandingChange(setBrandHidden)
  }, [])

  const [handle, setHandle] = useState('')        // login mode, or legacy-invite fallback
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ownerBusy, setOwnerBusy] = useState(false)
  const [selfSignup, setSelfSignup] = useState(false)
  const [pinMode, setPinMode] = useState(false)
  const [memberPicker, setMemberPicker] = useState(false)
  const [view, setView] = useState('signin')   // 'signin' | 'request' | 'requested'
  const [scanning, setScanning] = useState(false)

  // Per-app sign-in config: "request to join" option + PIN mode + member picker.
  // Accept (invite) mode needs it too — the new member sets a PIN there.
  useEffect(() => {
    let alive = true
    team.config().then((c) => {
      if (!alive) return
      setSelfSignup(!!c?.selfSignup)
      setPinMode(c?.loginConfig?.pin === true)
      setMemberPicker(c?.loginConfig?.memberPicker === true)
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  // Member picker roster (login mode only). null = typed form (picker off, roster
  // too large, fetch failed, or empty) — every failure path degrades to typing.
  const [pickerMembers, setPickerMembers] = useState(null)
  const [pickedMember, setPickedMember] = useState(null)
  const [pickerFilter, setPickerFilter] = useState('')
  useEffect(() => {
    if (!memberPicker || accepting) return
    let alive = true
    team.loginRoster()
      .then((r) => { if (alive && Array.isArray(r?.members) && r.members.length > 0) setPickerMembers(r.members) })
      .catch(() => {})
    return () => { alive = false }
  }, [memberPicker, accepting])

  // accept mode: the admin-assigned username (read-only) for this invite.
  const [assignedHandle, setAssignedHandle] = useState(null)
  const [inviteState, setInviteState] = useState(accepting ? 'loading' : 'ok') // loading | ok | invalid

  useEffect(() => {
    if (!accepting || !inviteCode) return
    let alive = true
    team.inviteInfo(inviteCode)
      .then((info) => { if (!alive) return; setAssignedHandle(info?.handle || null); setInviteState(info?.valid ? 'ok' : 'invalid') })
      .catch(() => { if (alive) setInviteState('invalid') })
    return () => { alive = false }
  }, [accepting, inviteCode])

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setErr(null)
    setBusy(true)
    try {
      const result = accepting
        ? await team.acceptInvite({ code: inviteCode, password, displayName, handle: assignedHandle ? undefined : handle })
        : await team.login({ handle, password })
      onSignedIn?.(result)
    } catch (e) {
      setErr(e?.message || L.genericError)
    } finally {
      setBusy(false)
    }
  }

  // Badge QR encodes "handle:pin" (see Staff.jsx printBadge) — scanning it
  // logs in immediately with no further typing, so it's called straight
  // away rather than just filling the form fields.
  async function loginFromBadge(handleValue, pinValue) {
    setErr(null)
    setBusy(true)
    try {
      const result = await team.login({ handle: handleValue, password: pinValue })
      onSignedIn?.(result)
    } catch (e) {
      setErr(e?.message || L.genericError)
    } finally {
      setBusy(false)
    }
  }

  async function submitRequest(e) {
    e.preventDefault()
    if (busy) return
    setErr(null)
    setBusy(true)
    try {
      await team.requestAccess({ handle, password, displayName })
      setView('requested')
    } catch (e) {
      setErr(e?.message || L.genericError)
    } finally {
      setBusy(false)
    }
  }

  async function ownerSignInClick() {
    if (ownerBusy) return
    setOwnerBusy(true)
    try {
      const user = await auth.signIn()
      if (user) onSignedIn?.({ user, role: null, owner: true })
    } finally {
      setOwnerBusy(false)
    }
  }

  // PIN mode swaps the secret field's copy + keyboard; the member picker replaces
  // typing a username with tapping a name (login mode only, typed-form fallback).
  const pickerActive = !accepting && view === 'signin' && !!pickerMembers
  const showSecret = !pickerActive || !!pickedMember
  const secretLabel = pinMode ? L.pin : L.password
  const secretPlaceholder = pinMode
    ? (accepting || view === 'request' ? L.pinSetPlaceholder : L.pinPlaceholder)
    : L.passwordPlaceholder
  const secretProps = pinMode ? { inputMode: 'numeric', pattern: '[0-9]*', maxLength: 6 } : {}
  const subtitle = pinMode ? (accepting ? L.pinAcceptSubtitle : view === 'signin' ? L.pinSubtitle : L.subtitle) : L.subtitle
  const pickerQuery = pickerFilter.trim().toLowerCase()
  const pickerShown = pickerActive && !pickedMember
    ? pickerMembers.filter((m) => !pickerQuery
        || (m.displayName || '').toLowerCase().includes(pickerQuery)
        || (m.handle || '').toLowerCase().includes(pickerQuery))
    : []

  const card = (
    <div dir={isArabic ? 'rtl' : 'ltr'} className="relative w-full max-w-sm rounded-3xl border border-stone-200/80 bg-white p-6 shadow-2xl shadow-stone-900/10">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={L.close}
          className="absolute end-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-lg leading-none text-stone-400 transition hover:border-stone-900 hover:bg-stone-900 hover:text-white"
        >
          ×
        </button>
      )}

      <div className={`mb-5 ${onClose ? 'pe-10' : ''}`}>
        <h2 className="text-2xl font-bold tracking-tight text-stone-900">
          {L.title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-stone-500">
          {subtitle}
        </p>
      </div>

      {view === 'requested' ? (
        <div className="space-y-3">
          <p className="text-base font-semibold text-stone-900">{L.requestedTitle}</p>
          <p className="text-sm leading-relaxed text-stone-500">{L.requestedBody}</p>
          <button type="button" onClick={() => { setView('signin'); setErr(null); setHandle(''); setPassword(''); setDisplayName('') }} className="text-sm font-semibold text-primary hover:underline">{L.backToSignIn}</button>
        </div>
      ) : view === 'request' ? (
        <form onSubmit={submitRequest} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-stone-700">{L.username}</label>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder={L.usernamePlaceholder} className={FIELD} required />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-stone-700">{L.displayName} <span className="font-normal text-stone-400">{L.displayNameHint}</span></label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={L.displayNamePlaceholder} className={FIELD} />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-stone-700">{secretLabel}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder={secretPlaceholder} className={FIELD} required {...secretProps} />
          </div>
          {err && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{err}</p>}
          <button type="submit" disabled={busy} style={{ color: onPrimaryColor() }} className="mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 font-semibold shadow-sm transition hover:opacity-90 active:scale-[0.99] disabled:opacity-60">
            {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current opacity-70" style={{ borderTopColor: 'transparent' }} />}
            {busy ? L.busy : L.requestSubmit}
          </button>
          <button type="button" onClick={() => { setView('signin'); setErr(null) }} className="w-full text-center text-sm font-medium text-stone-500 hover:text-stone-700">{L.backToSignIn}</button>
        </form>
      ) : accepting && inviteState === 'invalid' ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm font-medium text-red-700">
          {L.invalidInvite}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {accepting ? (
            // Username is assigned by the admin → show it read-only (legacy invites with
            // no assigned username fall back to an editable field).
            assignedHandle ? (
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-stone-700">{L.username}</label>
                <div className="flex items-center rounded-xl border border-stone-200 bg-stone-100 px-3.5 py-2.5 text-[15px] font-medium text-stone-700">
                  {assignedHandle}
                </div>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-stone-700">{L.username}</label>
                <input value={handle} onChange={(e) => setHandle(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder={L.usernamePlaceholder} className={FIELD} required />
              </div>
            )
          ) : pickerActive && !pickedMember ? (
            // Member picker: tap your name instead of typing a username.
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-stone-700">{L.pickName}</label>
              {pickerMembers.length > 12 && (
                <input
                  value={pickerFilter}
                  onChange={(e) => setPickerFilter(e.target.value)}
                  placeholder={L.findName}
                  className={`${FIELD} mb-2`}
                />
              )}
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-1.5">
                {pickerShown.map((m) => (
                  <button
                    type="button"
                    key={m.handle}
                    onClick={() => { setPickedMember(m); setHandle(m.handle); setErr(null) }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start transition hover:bg-white hover:shadow-sm"
                  >
                    <span className="h-8 w-8 shrink-0 rounded-full bg-stone-200 bg-cover bg-center" style={m.avatarUrl ? { backgroundImage: `url(${m.avatarUrl})` } : undefined} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-stone-900">{m.displayName || m.handle}</span>
                      {m.displayName && m.displayName !== m.handle && (
                        <span className="block truncate text-xs text-stone-400">@{m.handle}</span>
                      )}
                    </span>
                  </button>
                ))}
                {pickerShown.length === 0 && (
                  <p className="px-2.5 py-3 text-center text-sm text-stone-400">·</p>
                )}
              </div>
            </div>
          ) : pickerActive && pickedMember ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-stone-200 bg-stone-100 px-3 py-2">
              <span className="h-8 w-8 shrink-0 rounded-full bg-stone-200 bg-cover bg-center" style={pickedMember.avatarUrl ? { backgroundImage: `url(${pickedMember.avatarUrl})` } : undefined} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-stone-900">{pickedMember.displayName || pickedMember.handle}</span>
              <button
                type="button"
                onClick={() => { setPickedMember(null); setHandle(''); setPassword(''); setErr(null) }}
                className="shrink-0 text-xs font-semibold text-primary hover:underline"
              >
                {L.notYou}
              </button>
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-stone-700">{L.username}</label>
              <div className="flex gap-2">
                <input value={handle} onChange={(e) => setHandle(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder={L.usernamePlaceholder} className={FIELD} required />
                <button type="button" onClick={() => setScanning(true)} title={isArabic ? 'مسح باركود البطاقة' : 'Scan badge barcode'}
                  className="shrink-0 w-11 rounded-xl border border-stone-200 bg-stone-50 flex items-center justify-center text-stone-500 hover:border-stone-300 hover:text-stone-700">
                  <QrCode size={18} />
                </button>
              </div>
            </div>
          )}

          {accepting && (
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-stone-700">
                {L.displayName} <span className="font-normal text-stone-400">{L.displayNameHint}</span>
              </label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={L.displayNamePlaceholder} className={FIELD} />
            </div>
          )}

          {showSecret && (
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-stone-700">{secretLabel}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={accepting ? 'new-password' : 'current-password'}
                placeholder={secretPlaceholder}
                className={FIELD}
                autoFocus={pickerActive && !!pickedMember}
                required
                {...secretProps}
              />
            </div>
          )}

          {err && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{err}</p>
          )}

          {showSecret && (
            <button
              type="submit"
              disabled={busy || (accepting && inviteState === 'loading')}
              style={{ color: onPrimaryColor() }}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 font-semibold shadow-sm transition hover:opacity-90 active:scale-[0.99] disabled:opacity-60 disabled:active:scale-100"
            >
              {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current opacity-70" style={{ borderTopColor: 'transparent' }} />}
              {busy ? L.busy : L.submit}
            </button>
          )}
        </form>
      )}

      {/* Owner entry — the person who runs the app signs in with their Whacka ID. */}
      {view === 'signin' && !accepting && ownerSignIn && (
        <div className="mt-5">
          <div className="flex items-center gap-3 text-stone-300">
            <div className="h-px flex-1 bg-stone-200" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">{L.owner}</span>
            <div className="h-px flex-1 bg-stone-200" />
          </div>
          <button
            type="button"
            onClick={ownerSignInClick}
            disabled={ownerBusy}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-stone-200 bg-white py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 disabled:opacity-60"
          >
            {ownerBusy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-600" />}
            {ownerBusy ? L.ownerBusy : L.ownerButton}
          </button>
        </div>
      )}

      {view === 'signin' && selfSignup && !accepting && (
        <button type="button" onClick={() => { setView('request'); setErr(null) }} className="mt-3 w-full text-center text-sm font-medium text-stone-500 transition hover:text-stone-700">
          {L.requestLink}
        </button>
      )}

      {!brandHidden && (
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs font-medium text-stone-400">
          <WhackaMark size={14} />
          {L.poweredBy}
        </p>
      )}

      {scanning && (
        <QrScanner
          title={isArabic ? 'امسح باركود البطاقة' : 'Scan your badge'}
          onClose={() => setScanning(false)}
          onScan={(value) => {
            setScanning(false)
            const v = value.trim()
            const sep = v.indexOf(':')
            if (sep > 0) {
              const h = v.slice(0, sep), p = v.slice(sep + 1)
              setHandle(h); setPassword(p)
              loginFromBadge(h, p)
            } else {
              setHandle(v); setErr(null)
            }
          }}
        />
      )}
    </div>
  )

  // fullScreen: render as the whole sign-in gate using the same robust overlay recipe as
  // the platform auth modal (fixed + overflow-y-auto + margin-auto card) — centers when
  // short, scrolls when tall, never clips behind a device frame / on a short viewport.
  // Optional `brand` (logo/tagline) renders above the card inside the scroll area.
  if (fullScreen) {
    return (
      <div className={`fixed inset-0 flex overflow-y-auto ${bgClassName}`} style={SAFE_PAD}>
        <div className="m-auto w-full max-w-sm">
          {brand && <div className="mb-7 text-center">{brand}</div>}
          {card}
        </div>
      </div>
    )
  }
  return card
}

/**
 * Imperative entry used by team.signIn(): mounts <TeamLogin> in a modal overlay and
 * resolves with { user, role } on success, or null if dismissed.
 * @param {object} [options] - forwarded to <TeamLogin> ({ appName, code, mode, ownerSignIn })
 * @returns {Promise<{ user, role } | null>}
 */
export async function openTeamLogin(options = {}) {
  const { createRoot } = await import('react-dom/client')
  return new Promise((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let settled = false

    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
      setTimeout(() => {
        try { root.unmount() } catch {}
        host.remove()
      }, 0)
    }

    // Same overlay recipe as the platform auth modal (auth-modal.js): a fixed, flex,
    // overflow-y-auto layer with a margin-auto card — centers when short, scrolls when
    // tall, never clips the bottom.
    root.render(
      <div
        className="fixed inset-0 z-[2147483600] flex overflow-y-auto bg-stone-950/50 backdrop-blur-sm"
        style={SAFE_PAD}
        onClick={(e) => { if (e.target === e.currentTarget) finish(null) }}
      >
        <div className="m-auto w-full max-w-sm">
          <TeamLogin
            {...options}
            onSignedIn={(result) => finish(result)}
            onClose={() => finish(null)}
          />
        </div>
      </div>
    )
  })
}
