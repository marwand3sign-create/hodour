/**
 * GateLock — the lock screen shown by a PRIVATE published app before any content
 * renders. Platform-injected (not app code): the app boots into this when the
 * server says it's gated and this device isn't unlocked. Self-contained inline
 * styles + the app's own theme color, so it never depends on the app's CSS.
 *
 * The real enforcement is server-side (withRuntimeGuard); this is the UX. On a
 * correct code we store the device pass and reload into a clean app boot.
 */

import React, { useState } from 'react'
import { submitGateCode } from '../lib/_gate'

const isArabic =
  (typeof document !== 'undefined' &&
    (document.documentElement.dir === 'rtl' ||
      /^ar\b/i.test(document.documentElement.lang || ''))) ||
  (typeof navigator !== 'undefined' && /^ar\b/i.test(navigator.language || ''))

const T = isArabic
  ? {
      private: 'تطبيق خاص',
      title: 'هذا التطبيق خاص',
      desc: 'أدخل رمز الدخول للمتابعة',
      placeholder: 'رمز الدخول',
      enter: 'دخول',
      wrong: 'رمز غير صحيح. حاول مرة أخرى.',
      welcome: 'أهلاً بك',
      remembered: 'سنتذكّر هذا الجهاز.',
      opening: 'جارٍ الفتح…',
      hint: 'لا تملك رمزًا؟ اسأل المالك.',
      stealthTitle: 'تطبيق خاص',
    }
  : {
      private: 'Private',
      title: 'This app is private',
      desc: 'Enter your access code',
      placeholder: 'Access code',
      enter: 'Enter',
      wrong: 'Wrong code. Try again.',
      welcome: "You're in",
      remembered: "We'll remember this device.",
      opening: 'Opening…',
      hint: 'Need a code? Ask the owner.',
      stealthTitle: 'Private app',
    }

export default function GateLock({ status = {} }) {
  const stealth = !!status.stealth
  const brand = status.themeColor && /^#?[0-9a-fA-F]{3,8}$/.test(status.themeColor)
    ? (status.themeColor[0] === '#' ? status.themeColor : `#${status.themeColor}`)
    : '#4F46E5'
  const dark = '#1c1a17'

  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (busy || !code.trim()) return
    setBusy(true)
    setErr('')
    const r = await submitGateCode(code.trim())
    if (r.ok) {
      setDone(true)
      // Clean reboot: token is stored, gate/status will report unlocked → app.
      setTimeout(() => window.location.reload(), 650)
    } else {
      setErr(T.wrong)
      setBusy(false)
    }
  }

  const accent = stealth ? dark : brand
  const wrap = {
    position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', textAlign: 'center',
    padding: '24px 28px', boxSizing: 'border-box',
    direction: isArabic ? 'rtl' : 'ltr',
    background: stealth
      ? '#ffffff'
      : `radial-gradient(130% 70% at 50% 6%, ${hexA(brand, 0.13)} 0%, #ffffff 62%)`,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    color: '#1a1613',
  }
  const iconBox = {
    width: 64, height: 64, borderRadius: 17, display: 'grid', placeItems: 'center',
    marginBottom: 14, color: '#fff', fontWeight: 750, fontSize: 26, overflow: 'hidden',
    background: accent, boxShadow: `0 12px 26px -10px ${hexA(accent, 0.55)}`,
  }
  const input = {
    width: '100%', maxWidth: 280, height: 50, borderRadius: 13, boxSizing: 'border-box',
    border: `1.5px solid ${err ? '#dc2626' : '#e7e4dd'}`,
    background: err ? '#fbe9e9' : '#fff', textAlign: 'center',
    fontSize: 17, fontWeight: 650, letterSpacing: '0.12em', color: '#1a1613', outline: 'none',
  }
  const button = {
    width: '100%', maxWidth: 280, height: 50, marginTop: 12, border: 'none', borderRadius: 13,
    background: accent, color: '#fff', fontSize: 15, fontWeight: 680, cursor: 'pointer',
    opacity: busy ? 0.7 : 1, boxShadow: `0 10px 22px -10px ${hexA(accent, 0.7)}`,
  }

  if (done) {
    return (
      <div style={wrap}>
        <Spinner color={accent} />
        <p style={{ fontSize: 18, fontWeight: 720, margin: '0 0 5px' }}>{T.welcome}</p>
        <p style={{ fontSize: 13, color: '#78746c', margin: 0 }}>{T.remembered}</p>
      </div>
    )
  }

  return (
    <div style={wrap}>
      {stealth ? (
        <div style={iconBox} aria-hidden>🔒</div>
      ) : status.appIcon ? (
        <img src={status.appIcon} alt="" style={iconBox} />
      ) : (
        <div style={iconBox} aria-hidden>{(status.appName || 'A').charAt(0).toUpperCase()}</div>
      )}

      {!stealth && status.appName && (
        <p style={{ fontSize: 16, fontWeight: 700, margin: '0 0 22px' }}>{status.appName}</p>
      )}
      {!stealth && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#78746c',
          background: 'rgba(255,255,255,0.7)', border: '1px solid #e7e4dd', borderRadius: 999,
          padding: '4px 11px', marginBottom: 16,
        }}>🔒 {T.private}</span>
      )}

      <p style={{ fontSize: 18, fontWeight: 720, margin: '0 0 5px' }}>{stealth ? T.stealthTitle : T.title}</p>
      <p style={{ fontSize: 13, color: '#78746c', margin: '0 0 22px' }}>{T.desc}</p>

      <form onSubmit={submit} style={{ width: '100%', maxWidth: 280, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value); if (err) setErr('') }}
          placeholder={T.placeholder}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          style={input}
          aria-label={T.placeholder}
        />
        {err && <p style={{ color: '#dc2626', fontSize: 12.5, margin: '8px 0 0' }}>{err}</p>}
        <button type="submit" disabled={busy || !code.trim()} style={button}>
          {busy ? T.opening : T.enter}
        </button>
      </form>

      {!stealth && (
        <p style={{ fontSize: 11.5, color: '#a8a399', marginTop: 20, maxWidth: 240, lineHeight: 1.45 }}>{T.hint}</p>
      )}
    </div>
  )
}

function Spinner({ color }) {
  return (
    <div
      style={{
        width: 34, height: 34, borderRadius: '50%', marginBottom: 18,
        border: `3px solid ${hexA(color, 0.2)}`, borderTopColor: color,
        animation: 'wk-gate-spin 0.8s linear infinite',
      }}
    >
      <style>{'@keyframes wk-gate-spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  )
}

// hex (#rgb / #rrggbb) → rgba() string with the given alpha.
function hexA(hex, a) {
  try {
    let h = hex.replace('#', '')
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    const n = parseInt(h.slice(0, 6), 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
  } catch {
    return `rgba(79,70,229,${a})`
  }
}
