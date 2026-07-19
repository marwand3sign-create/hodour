import { useEffect, useState, useCallback } from 'react'
import { UserPlus, Pencil, X, Loader2, ShieldCheck, ScanFace, Ban, Trash2, RotateCcw, ChevronDown, Search } from 'lucide-react'
import { team } from '../../lib/team'
import { db } from '../../lib/db'
import { groupId, money } from '../../store'

export default function Staff({ openRoster, canManage }) {
  const [members, setMembers] = useState([])
  const [profiles, setProfiles] = useState({})
  const [departments, setDepartments] = useState([])
  const [jobTitles, setJobTitles] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [busyId, setBusyId] = useState('')
  const [showSuspended, setShowSuspended] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [mem, profs, deps, jobs] = await Promise.all([
        team.listMembers(),
        db.selectShared('employees', {}, { limit: 500 }),
        db.selectShared('departments', {}, { limit: 200 }),
        db.selectShared('jobTitles', {}, { limit: 200 }),
      ])
      setMembers(mem.filter(m => m.role !== 'owner'))
      const map = {}
      profs.forEach(p => { map[p.userId] = p })
      setProfiles(map)
      setDepartments(deps)
      setJobTitles(jobs)
    } catch (e) { /* noop */ }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const deletedIds = new Set(members.filter(m => profiles[m.userId]?.deleted).map(m => m.userId))
  const activeMembers = members.filter(m => m.status !== 'disabled' && !deletedIds.has(m.userId))
  const suspendedMembers = members.filter(m => m.status === 'disabled' && !deletedIds.has(m.userId))
  const deletedMembers = members.filter(m => deletedIds.has(m.userId))

  const q = query.trim().toLowerCase()
  const visibleActiveMembers = q
    ? activeMembers.filter(m => {
        const p = profiles[m.userId] || {}
        const haystack = [p.fullName, m.displayName, m.handle, p.department, p.jobTitle].filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(q)
      })
    : activeMembers

  async function suspendMember(m, name) {
    if (!window.confirm(`إيقاف حساب ${name} مؤقتًا؟ لن يستطيع تسجيل الدخول حتى تُعيد تفعيله، وتبقى بياناته كما هي.`)) return
    setBusyId(m.userId)
    try { await team.disableMember(m.userId); await load() } catch (e) { alert('تعذر الإيقاف: ' + (e.message || e)) }
    setBusyId('')
  }

  async function restoreMember(m) {
    setBusyId(m.userId)
    try {
      await team.enableMember(m.userId)
      const gid = await groupId()
      await db.upsertShared('employees', { userId: m.userId, deleted: false }, m.userId, { groupId: gid, visibleTo: 'user:' + m.userId })
      await load()
    } catch (e) { alert('تعذر الاستعادة: ' + (e.message || e)) }
    setBusyId('')
  }

  async function deleteMember(m, name) {
    if (!window.confirm(`حذف ${name} من قائمة الموظفين؟ لن يظهر بعد الآن في القائمة ولن يستطيع الدخول أو تسجيل الحضور، لكن اسمه وبياناته المالية تبقى محفوظة في تقارير الحضور والرواتب السابقة.`)) return
    setBusyId(m.userId)
    try {
      await team.disableMember(m.userId)
      const gid = await groupId()
      await db.upsertShared('employees', { userId: m.userId, deleted: true }, m.userId, { groupId: gid, visibleTo: 'user:' + m.userId })
      await load()
    } catch (e) { alert('تعذر الحذف: ' + (e.message || e)) }
    setBusyId('')
  }

  return (
    <div className="space-y-5 cn-rise">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-white">الموظفون</h1>
        {canManage && (
          <button onClick={openRoster} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-400 text-black font-semibold text-sm">
            <UserPlus size={16} /> إضافة حساب
          </button>
        )}
      </div>

      <p className="text-white/45 text-sm">أنشئ حسابات الموظفين من «إضافة حساب»، ثم املأ وظيفة وقسم وراتب كل شخص هنا.</p>

      {members.length > 0 && (
        <div className="relative">
          <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ابحث بالاسم أو القسم أو الوظيفة…"
            className="w-full bg-white/5 border border-white/10 rounded-xl pr-10 pl-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50"
          />
        </div>
      )}

      {loading ? (
        <div className="text-center text-white/40 py-10">جارٍ التحميل…</div>
      ) : members.length === 0 ? (
        <div className="cn-glass rounded-2xl p-8 text-center text-white/50">
          لا يوجد موظفون بعد. {canManage && 'اضغط «إضافة حساب» لإنشاء أول حساب موظف.'}
        </div>
      ) : activeMembers.length === 0 ? (
        <div className="cn-glass rounded-2xl p-8 text-center text-white/50">
          لا يوجد موظفون نشطون حاليًا.
        </div>
      ) : visibleActiveMembers.length === 0 ? (
        <div className="cn-glass rounded-2xl p-8 text-center text-white/50">
          لا نتائج تطابق بحثك.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {visibleActiveMembers.map(m => {
            const p = profiles[m.userId] || {}
            const name = p.fullName || m.displayName || m.handle
            const busy = busyId === m.userId
            return (
              <div key={m.userId} className="cn-glass rounded-2xl p-4 flex items-center gap-3">
                <EmployeeAvatar name={name} photo={p.referencePhoto} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                    {name}
                    {m.role === 'manager' && <ShieldCheck size={14} className="text-amber-400" title="مدير" />}
                    {p.referencePhoto && <ScanFace size={13} className="text-emerald-400" title="تم تسجيل صورة الوجه المرجعية" />}
                  </div>
                  <div className="text-xs text-white/45 truncate">
                    {p.jobTitle || m.role || 'موظف'}{p.department ? ` · ${p.department}` : ''}
                  </div>
                  <div className="text-xs tabular-nums mt-0.5">
                    {p.dailyWage
                      ? <span className="text-white/50">{money(p.dailyWage)}/يوم{p.overtimeRate ? ` · ${money(p.overtimeRate)}/يوم إضافي` : ''}</span>
                      : <span className="text-amber-400">اضغط ✎ لإدخال الاسم والراتب</span>}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => setEditing({ member: m, profile: p })} className="text-white/40 hover:text-cyan-300 p-2" title="تعديل"><Pencil size={16} /></button>
                  {canManage && m.role !== 'manager' && (
                    <>
                      <button disabled={busy} onClick={() => suspendMember(m, name)} className="text-white/40 hover:text-amber-300 p-2 disabled:opacity-40" title="إيقاف مؤقت">
                        {busy ? <Loader2 className="animate-spin" size={16} /> : <Ban size={16} />}
                      </button>
                      <button disabled={busy} onClick={() => deleteMember(m, name)} className="text-white/40 hover:text-red-400 p-2 disabled:opacity-40" title="حذف نهائي">
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {canManage && suspendedMembers.length > 0 && (
        <div className="cn-glass rounded-2xl overflow-hidden">
          <button onClick={() => setShowSuspended(s => !s)} className="w-full flex items-center justify-between px-4 py-3 text-sm text-amber-300">
            <span className="flex items-center gap-2"><Ban size={15} /> موقوفون مؤقتًا ({suspendedMembers.length})</span>
            <ChevronDown size={16} className={showSuspended ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          {showSuspended && (
            <div className="px-4 pb-3 space-y-2">
              {suspendedMembers.map(m => {
                const p = profiles[m.userId] || {}
                const name = p.fullName || m.displayName || m.handle
                const busy = busyId === m.userId
                return (
                  <div key={m.userId} className="flex items-center gap-3 bg-white/5 rounded-xl p-2.5">
                    <EmployeeAvatar name={name} photo={p.referencePhoto} />
                    <div className="flex-1 min-w-0 text-sm text-white/70 truncate">{name}</div>
                    <button disabled={busy} onClick={() => restoreMember(m)} className="flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-400/10 px-2.5 py-1.5 rounded-lg disabled:opacity-40">
                      {busy ? <Loader2 className="animate-spin" size={14} /> : <RotateCcw size={14} />} إعادة تفعيل
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {canManage && deletedMembers.length > 0 && (
        <div className="cn-glass rounded-2xl overflow-hidden">
          <button onClick={() => setShowDeleted(s => !s)} className="w-full flex items-center justify-between px-4 py-3 text-sm text-white/40">
            <span className="flex items-center gap-2"><Trash2 size={15} /> محذوفون ({deletedMembers.length})</span>
            <ChevronDown size={16} className={showDeleted ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          {showDeleted && (
            <div className="px-4 pb-3 space-y-2">
              <p className="text-[11px] text-white/35 mb-1">بياناتهم المالية واسمهم محفوظة في التقارير السابقة، لكنهم لا يظهرون في قائمة الموظفين ولا يستطيعون الدخول.</p>
              {deletedMembers.map(m => {
                const p = profiles[m.userId] || {}
                const name = p.fullName || m.displayName || m.handle
                const busy = busyId === m.userId
                return (
                  <div key={m.userId} className="flex items-center gap-3 bg-white/5 rounded-xl p-2.5 opacity-70">
                    <EmployeeAvatar name={name} photo={p.referencePhoto} />
                    <div className="flex-1 min-w-0 text-sm text-white/60 truncate">{name}</div>
                    <button disabled={busy} onClick={() => restoreMember(m)} className="flex items-center gap-1.5 text-xs text-cyan-300 bg-cyan-400/10 px-2.5 py-1.5 rounded-lg disabled:opacity-40">
                      {busy ? <Loader2 className="animate-spin" size={14} /> : <RotateCcw size={14} />} استعادة
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {editing && (
        <EditModal
          member={editing.member}
          profile={editing.profile}
          departments={departments}
          jobTitles={jobTitles}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load() }}
        />
      )}
    </div>
  )
}

function EditModal({ member, profile, departments, jobTitles, onClose, onSaved }) {
  const [form, setForm] = useState({
    fullName: profile.fullName || member.displayName || member.handle || '',
    department: profile.department || '',
    jobTitle: profile.jobTitle || '',
    dailyWage: profile.dailyWage ?? '',
    overtimeRate: profile.overtimeRate ?? '',
  })
  const [resetRef, setResetRef] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.fullName.trim()) { setError('أدخل اسم الموظف'); return }
    setSaving(true); setError('')
    try {
      const gid = await groupId()
      await db.upsertShared('employees', {
        userId: member.userId,
        fullName: form.fullName.trim(),
        department: form.department,
        jobTitle: form.jobTitle,
        dailyWage: Number(form.dailyWage) || 0,
        overtimeRate: Number(form.overtimeRate) || 0,
        active: true,
        ...(resetRef ? { referencePhoto: null } : {}),
      }, member.userId, { groupId: gid, visibleTo: 'user:' + member.userId })
      await onSaved()
    } catch (e) { setError('تعذر الحفظ: ' + (e.message || e)); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-end md:items-center justify-center p-0 md:p-6" style={{ height: 'var(--visual-height, 100dvh)' }}>
      <div className="w-full max-w-md cn-aurora border border-white/10 rounded-t-3xl md:rounded-3xl p-6 overflow-y-auto" style={{ maxHeight: 'calc(var(--visual-height, 100dvh) - 2rem)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold text-white">بيانات الموظف</h2>
          <button onClick={onClose} className="text-white/50"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <Field label="الاسم الكامل">
            <input value={form.fullName} onChange={e => set('fullName', e.target.value)} className={inputCls} placeholder="الاسم الكامل" />
          </Field>
          <Field label="القسم">
            <select value={form.department} onChange={e => set('department', e.target.value)} className={inputCls}>
              <option value="" style={optionStyle}>— لا شيء —</option>
              {departments.map(d => <option key={d.id} value={d.name} style={optionStyle}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="الوظيفة">
            <select value={form.jobTitle} onChange={e => set('jobTitle', e.target.value)} className={inputCls}>
              <option value="" style={optionStyle}>— لا شيء —</option>
              {jobTitles.map(j => <option key={j.id} value={j.name} style={optionStyle}>{j.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الراتب اليومي">
              <input type="number" inputMode="decimal" value={form.dailyWage} onChange={e => set('dailyWage', e.target.value)} className={inputCls} placeholder="0" />
            </Field>
            <Field label="اليوم الإضافي">
              <input type="number" inputMode="decimal" value={form.overtimeRate} onChange={e => set('overtimeRate', e.target.value)} className={inputCls} placeholder="0" />
            </Field>
          </div>

          {profile.referencePhoto && (
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-3">
              <img src={profile.referencePhoto} alt={form.fullName} className={`w-12 h-12 rounded-full object-cover ring-1 ring-cyan-400/30 ${resetRef ? 'opacity-30' : ''}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white/60">الصورة المرجعية للوجه</div>
                <div className="text-[11px] text-white/35">التُقطت تلقائيًا عند أول تسجيل دخول</div>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-amber-300 shrink-0">
                <input type="checkbox" checked={resetRef} onChange={e => setResetRef(e.target.checked)} />
                إعادة تعيينها
              </label>
            </div>
          )}
        </div>
        {error && <div className="mt-3 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}
        <button onClick={save} disabled={saving} className="w-full mt-5 py-3 rounded-xl bg-cyan-400 text-black font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          {saving && <Loader2 className="animate-spin" size={18} />} حفظ
        </button>
      </div>
    </div>
  )
}

function EmployeeAvatar({ name, photo }) {
  const [err, setErr] = useState(false)
  if (photo && !err) {
    return <img src={photo} alt={name} onError={() => setErr(true)} className="w-11 h-11 rounded-full object-cover shrink-0 ring-1 ring-cyan-400/30" />
  }
  return (
    <div className="w-11 h-11 rounded-full bg-cyan-400/15 flex items-center justify-center shrink-0">
      <span className="font-display font-bold text-cyan-300">{(name || '?').charAt(0).toUpperCase()}</span>
    </div>
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
