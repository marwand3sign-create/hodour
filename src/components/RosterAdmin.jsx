import { useCallback, useEffect, useState } from 'react'
import { X, UserPlus, KeyRound, UserX, UserCheck, Copy, Check, Loader2, ShieldCheck, Pencil } from 'lucide-react'
import { team } from '../lib/team'
import { db } from '../lib/db'
import { ROLES, groupId } from '../store'

const normHandle = (s) => (s || '').toLowerCase().trim().replace(/[^a-z0-9_]/g, '')
const roleLabel = (name) => ROLES.find(r => r.name === name)?.label || name

export default function RosterAdmin({ onClose }) {
  const [members, setMembers] = useState(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const mem = await team.listMembers()
      setMembers(mem.filter(m => m.role !== 'owner'))
    } catch (e) { setErr('تعذر تحميل الأعضاء: ' + (e.message || e)) }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="fixed inset-0 z-40 flex overflow-y-auto bg-black/60 backdrop-blur-sm"
      style={{ padding: 'max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left))' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div dir="rtl" className="m-auto w-full max-w-md cn-aurora border border-white/10 rounded-3xl p-5 shadow-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-cyan-400/15 flex items-center justify-center shrink-0">
            <UserPlus className="text-cyan-300" size={20} />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-xl font-bold text-white">إدارة الحسابات</h1>
            <p className="text-xs text-white/45">أنشئ حسابات الموظفين وتحكّم في الدخول.</p>
          </div>
          <button onClick={onClose} className="text-white/50 p-1"><X size={20} /></button>
        </div>

        <AddForm onCreated={load} />

        <div className="mt-5">
          <div className="text-xs text-white/40 mb-2">الموظفون</div>
          {err && <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-2">{err}</div>}
          {!members ? (
            <div className="flex justify-center py-8 text-white/40"><Loader2 className="animate-spin" size={20} /></div>
          ) : members.length === 0 ? (
            <div className="cn-glass rounded-2xl p-6 text-center text-white/45 text-sm">لا يوجد موظفون بعد. أنشئ أول حساب من الأعلى.</div>
          ) : (
            <div className="cn-glass rounded-2xl divide-y divide-white/5">
              {members.map(m => <MemberRow key={m.userId} member={m} onChanged={load} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AddForm({ onCreated }) {
  const [fullName, setFullName] = useState('')
  const [handle, setHandle] = useState('')
  const [role, setRole] = useState(ROLES[0]?.name || 'employee')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [created, setCreated] = useState(null)

  async function submit() {
    setErr('')
    const name = fullName.trim()
    const h = normHandle(handle)
    if (!name) { setErr('أدخل اسم الموظف'); return }
    if (h.length < 3) { setErr('اسم المستخدم 3 أحرف على الأقل (حروف/أرقام إنجليزية)'); return }
    if (pin && !/^\d{6}$/.test(pin)) { setErr('الرقم السري يجب أن يكون 6 أرقام'); return }
    setBusy(true)
    try {
      const res = await team.createMember({ handle: h, displayName: name, role, password: pin || undefined })
      // Store the name as the employee profile so it shows in attendance + reports right away.
      try {
        const gid = await groupId()
        await db.upsertShared('employees', {
          userId: res.userId, fullName: name, department: '', jobTitle: '',
          dailyWage: 0, overtimeRate: 0, active: true,
        }, res.userId, { groupId: gid, visibleTo: 'user:' + res.userId })
      } catch { /* profile can also be filled later from الموظفون */ }
      setCreated({ name, handle: res.handle, pin: pin || res.tempPassword })
      setFullName(''); setHandle(''); setPin(''); setRole(ROLES[0]?.name || 'employee')
      onCreated?.()
    } catch (e) {
      setErr('تعذر الإنشاء: ' + (e.message || e))
    }
    setBusy(false)
  }

  return (
    <div className="cn-glass rounded-2xl p-4 space-y-3">
      <Field label="الاسم الكامل">
        <input value={fullName} onChange={e => setFullName(e.target.value)} className={inputCls} placeholder="مثال: أحمد محمد" />
      </Field>
      <Field label="اسم المستخدم (للدخول فقط)">
        <input value={handle} onChange={e => setHandle(e.target.value)} dir="ltr" autoCapitalize="none" autoCorrect="off"
          className={inputCls + ' text-left'} placeholder="ahmad" />
        <span className="text-[11px] text-white/35 mt-1 block">حروف وأرقام إنجليزية فقط — يستخدمه الموظف عند تسجيل الدخول.</span>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الدور">
          <select value={role} onChange={e => setRole(e.target.value)} className={inputCls}>
            {ROLES.map(r => <option key={r.name} value={r.name} style={optionStyle}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="الرقم السري (اختياري)">
          <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} dir="ltr"
            inputMode="numeric" className={inputCls + ' text-left'} placeholder="يُولَّد تلقائيًا" />
        </Field>
      </div>
      {err && <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{err}</div>}
      <button onClick={submit} disabled={busy}
        className="w-full py-3 rounded-xl bg-cyan-400 text-black font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
        {busy ? <Loader2 className="animate-spin" size={18} /> : <UserPlus size={18} />} إنشاء الحساب
      </button>

      {created && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3.5 space-y-2">
          <p className="text-[13px] font-semibold text-emerald-200">تم إنشاء حساب {created.name} — سلّمه هذه البيانات:</p>
          <div className="text-sm text-white/85 space-y-1" dir="ltr">
            <div>اسم المستخدم: <span className="font-semibold">{created.handle}</span></div>
            <div>الرقم السري: <code className="font-bold text-cyan-200">{created.pin}</code></div>
          </div>
          <CopyBtn value={`اسم المستخدم: ${created.handle}\nالرقم السري: ${created.pin}`} />
        </div>
      )}
    </div>
  )
}

function MemberRow({ member, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [tempPin, setTempPin] = useState(null)
  const [customPinOpen, setCustomPinOpen] = useState(false)
  const [customPin, setCustomPin] = useState('')
  const disabled = member.status === 'disabled'
  const name = member.displayName || member.handle

  const run = async (fn) => {
    setBusy(true); setMsg('')
    try { await fn(); onChanged?.() }
    catch (e) { setMsg(e?.message || 'فشل الإجراء') }
    setBusy(false)
  }

  async function setCustomPinNow() {
    if (!/^\d{6}$/.test(customPin)) { setMsg('الرقم السري يجب أن يكون 6 أرقام'); return }
    await run(async () => {
      const { tempPassword } = await team.resetPassword(member.userId, customPin)
      if (tempPassword) setTempPin(tempPassword)
    })
    setCustomPinOpen(false); setCustomPin('')
  }

  return (
    <div className="p-3.5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-cyan-400/15 flex items-center justify-center shrink-0">
          <span className="font-display font-bold text-cyan-300">{(name || '?').charAt(0).toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
            {name}
            {member.role === 'manager' && <ShieldCheck size={13} className="text-amber-400" />}
          </div>
          <div className="text-xs text-white/40 truncate" dir="ltr">
            @{member.handle} · <span dir="rtl">{roleLabel(member.role)}</span>
            {disabled && <span className="ms-1 text-red-300">(موقوف)</span>}
          </div>
        </div>
        <button title="رقم سري عشوائي جديد" disabled={busy}
          onClick={() => run(async () => { const { tempPassword } = await team.resetPassword(member.userId); if (tempPassword) setTempPin(tempPassword) })}
          className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:text-cyan-300 disabled:opacity-50">
          <KeyRound size={16} />
        </button>
        <button title="تعيين رقم سري مخصص" disabled={busy}
          onClick={() => setCustomPinOpen(o => !o)}
          className={`w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-50 ${customPinOpen ? 'bg-cyan-400/15 text-cyan-300' : 'bg-white/5 text-white/50 hover:text-cyan-300'}`}>
          <Pencil size={15} />
        </button>
        {disabled ? (
          <button title="إعادة تفعيل" disabled={busy} onClick={() => run(() => team.enableMember(member.userId))}
            className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-emerald-400 hover:bg-white/10 disabled:opacity-50">
            <UserCheck size={16} />
          </button>
        ) : (
          <button title="إيقاف" disabled={busy} onClick={() => run(() => team.disableMember(member.userId))}
            className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-red-400 hover:bg-white/10 disabled:opacity-50">
            <UserX size={16} />
          </button>
        )}
      </div>
      {customPinOpen && (
        <div className="mt-2 flex items-center gap-2" dir="ltr">
          <input value={customPin} onChange={e => setCustomPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456" maxLength={6} inputMode="numeric"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-cyan-400/50" />
          <button disabled={busy || customPin.length !== 6} onClick={setCustomPinNow}
            className="px-3 py-2 rounded-xl bg-cyan-400 text-black text-xs font-semibold disabled:opacity-40" dir="rtl">
            {busy ? <Loader2 className="animate-spin" size={14} /> : 'تعيين'}
          </button>
        </div>
      )}
      {tempPin && (
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/5 p-2 ps-3" dir="ltr">
          <span className="text-xs text-white/50">الرقم السري الجديد:</span>
          <code className="text-sm font-bold text-cyan-200">{tempPin}</code>
          <CopyBtn value={tempPin} compact />
        </div>
      )}
      {msg && <div className="mt-1.5 text-xs text-red-300">{msg}</div>}
    </div>
  )
}

function CopyBtn({ value, compact }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }
  return (
    <button onClick={copy} className={`flex items-center gap-1 rounded-full bg-cyan-400 text-black font-semibold ${compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs'}`}>
      {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'تم النسخ' : 'نسخ'}
    </button>
  )
}

const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50 [color-scheme:dark]'
const optionStyle = { backgroundColor: '#0b1220', color: '#ffffff' }
function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs text-white/50 mb-1 block">{label}</span>
      {children}
    </label>
  )
}
