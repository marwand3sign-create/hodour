import { useEffect, useMemo, useState } from 'react'
import { MapPin, Trash2, ScanFace, CalendarDays, X, ShieldAlert, Pencil, CalendarPlus, Loader2, Check, LogOut } from 'lucide-react'
import { useLiveShared } from '../../lib/useLive'
import { db } from '../../lib/db'
import { groupId, todayStr, fmtTime, DEFAULT_SHIFT, resolveShift, shiftHours, hoursBetween } from '../../store'

export default function Attendance() {
  const [date, setDate] = useState(todayStr())
  const [viewing, setViewing] = useState(null)
  const [editing, setEditing] = useState(null)
  const [addingExtra, setAddingExtra] = useState(false)
  const [checkingOut, setCheckingOut] = useState(null)
  const [employees, setEmployees] = useState({})
  const [deptRows, setDeptRows] = useState([])
  const [shift, setShift] = useState(DEFAULT_SHIFT)
  const { data, loading } = useLiveShared('attendance', { order: '-createdAt', limit: 800 })
  const { data: empData } = useLiveShared('employees', { limit: 500 })

  useEffect(() => {
    const map = {}
    ;(empData || []).forEach(e => { map[e.userId] = e })
    setEmployees(map)
  }, [empData])

  useEffect(() => {
    (async () => {
      try {
        const [depts, sh] = await Promise.all([
          db.selectShared('departments', {}, { limit: 200 }),
          db.selectShared('settings', { key: 'shift' }, { limit: 1 }),
        ])
        setDeptRows(depts || [])
        if (sh?.[0]) setShift({ ...DEFAULT_SHIFT, ...sh[0] })
      } catch { /* non-critical */ }
    })()
  }, [])

  const rows = useMemo(() => (data || []).filter(r => r.date === date && r.status !== 'flag-only'), [data, date])

  async function remove(r) {
    if (!confirm(`حذف سجل ${r.employeeName}؟`)) return
    try { await db.deleteShared('attendance', r.id) } catch (e) { alert('تعذر الحذف: ' + (e.message || e)) }
  }

  return (
    <div className="space-y-5 cn-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-white">الحضور</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 cn-glass rounded-xl px-3 py-2">
            <CalendarDays size={16} className="text-cyan-300" />
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="bg-transparent text-sm text-white outline-none [color-scheme:dark]" />
          </div>
          <button onClick={() => setAddingExtra(true)} title="إضافة يوم إضافي" className="cn-glass rounded-xl px-3 py-2 text-cyan-300 flex items-center gap-1.5 text-sm font-medium">
            <CalendarPlus size={16} /> <span className="hidden sm:inline">يوم إضافي</span>
          </button>
        </div>
      </div>

      <div className="flex gap-3 text-sm">
        <span className="text-white/50">{rows.length} سجل</span>
        <span className="text-emerald-400">{rows.filter(r => r.status === 'in').length} نشط</span>
      </div>

      {loading ? (
        <div className="text-center text-white/40 py-10">جارٍ التحميل…</div>
      ) : rows.length === 0 ? (
        <div className="cn-glass rounded-2xl p-8 text-center text-white/50">لا توجد سجلات في هذا التاريخ.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {rows.map(r => (
            <div key={r.id} className="cn-glass rounded-2xl p-4 flex items-center gap-3">
              <FaceAvatar r={r} onOpen={() => (r.faceSnapshot || r.outFaceSnapshot) && setViewing(r)} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">{r.employeeName}</div>
                <div className="text-xs text-white/45 flex items-center gap-1 truncate">
                  <MapPin size={12} /> {r.locationName || '—'}
                  {r.faceVerified && <ScanFace size={12} className="text-emerald-400 ml-1" />}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {Number(r.lateMinutes) > 0 && (
                    <span className="text-[10px] font-semibold text-amber-300 bg-amber-400/15 rounded px-1.5 py-0.5">متأخر {Number(r.lateMinutes)} د</span>
                  )}
                  {r.gpsSuspicious && (
                    <span title={r.gpsFlagReason || ''} className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-300 bg-red-400/15 rounded px-1.5 py-0.5">
                      <ShieldAlert size={10} /> موقع مشتبه به
                    </span>
                  )}
                  {(r.faceMismatch || r.outFaceMismatch) && (
                    <span title="الوجه المُلتقط لا يتطابق بثقة كافية مع الصورة المرجعية — راجع الصور يدويًا" className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300 bg-amber-400/15 rounded px-1.5 py-0.5">
                      <ScanFace size={10} /> وجه غير مطابق
                    </span>
                  )}
                  {r.isManual && (
                    <span title={r.note || ''} className="inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-300 bg-cyan-400/15 rounded px-1.5 py-0.5">
                      <CalendarPlus size={10} /> يدوي
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-white/70 tabular-nums">{fmtTime(r.checkIn)} ← {r.checkOut ? fmtTime(r.checkOut) : <span className="text-emerald-400">نشط</span>}</div>
                {r.checkOut && (
                  <div className="text-xs text-white/50 tabular-nums">
                    {Number(r.workedHours).toFixed(1)} س{Number(r.overtimeHours) > 0 ? ` · +${Number(r.overtimeHours).toFixed(1)} إضافي` : ''}
                  </div>
                )}
              </div>
              {r.status === 'in' && (
                <button onClick={() => setCheckingOut(r)} title="تسجيل خروج يدوي" className="text-amber-400/70 hover:text-amber-300 shrink-0 p-1"><LogOut size={16} /></button>
              )}
              <button onClick={() => setEditing(r)} className="text-white/25 hover:text-cyan-300 shrink-0 p-1"><Pencil size={15} /></button>
              <button onClick={() => remove(r)} className="text-white/25 hover:text-red-400 shrink-0 p-1"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}

      {viewing && <FaceModal r={viewing} refPhoto={employees[viewing.employeeUserId]?.referencePhoto} onClose={() => setViewing(null)} />}
      {editing && <EditRecordModal r={editing} onClose={() => setEditing(null)} />}
      {addingExtra && <AddExtraDayModal employees={empData || []} defaultDate={date} onClose={() => setAddingExtra(false)} />}
      {checkingOut && (
        <ForceCheckoutModal
          r={checkingOut}
          shift={resolveShift(employees[checkingOut.employeeUserId]?.department, deptRows, shift)}
          onClose={() => setCheckingOut(null)}
        />
      )}
    </div>
  )
}

// <input type="datetime-local"> works in local time with no timezone, so a
// straight `.toISOString().slice(0,16)` would silently shift the displayed
// time by the browser's UTC offset — build/parse the local string by hand.
function toLocalInputValue(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInputValue(str) {
  return new Date(str).toISOString()
}

function ForceCheckoutModal({ r, shift, onClose }) {
  const [checkOutLocal, setCheckOutLocal] = useState(toLocalInputValue(new Date().toISOString()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const checkOutIso = fromLocalInputValue(checkOutLocal)
  const worked = Math.max(0, hoursBetween(r.checkIn, checkOutIso))
  const overtime = Math.max(0, worked - shiftHours(shift))
  const invalid = new Date(checkOutIso) <= new Date(r.checkIn)

  async function save() {
    if (invalid) { setError('وقت الخروج لازم يكون بعد وقت الدخول'); return }
    setSaving(true); setError('')
    try {
      await db.updateShared('attendance', r.id, {
        checkOut: checkOutIso,
        workedHours: worked,
        overtimeHours: overtime,
        status: 'out',
        note: r.note ? r.note : 'تسجيل خروج يدوي بواسطة المدير',
      })
      onClose()
    } catch (e) { setError('تعذر الحفظ: ' + (e.message || e)); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-end md:items-center justify-center p-0 md:p-6" style={{ height: 'var(--visual-height, 100dvh)' }}>
      <div className="w-full max-w-sm cn-aurora border border-white/10 rounded-t-3xl md:rounded-3xl p-6 overflow-y-auto" style={{ maxHeight: 'calc(var(--visual-height, 100dvh) - 2rem)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-white">تسجيل خروج يدوي</h2>
            <p className="text-xs text-white/45">{r.employeeName} — دخل الساعة {fmtTime(r.checkIn)}</p>
          </div>
          <button onClick={onClose} className="text-white/50"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <ModalField label="وقت الخروج">
            <input type="datetime-local" value={checkOutLocal} onChange={e => setCheckOutLocal(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50 [color-scheme:dark]" />
          </ModalField>
          <div className="flex items-center gap-2 text-xs text-cyan-300 bg-cyan-400/10 rounded-lg px-3 py-2">
            <span>سيُحتسب: <span className="font-semibold tabular-nums">{worked.toFixed(1)}</span> ساعة عمل{overtime > 0 && <> · <span className="font-semibold tabular-nums">{overtime.toFixed(1)}</span> ساعة إضافية</>}</span>
          </div>
        </div>
        {error && <div className="mt-3 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}
        <button onClick={save} disabled={saving || invalid} className="w-full mt-5 py-3 rounded-xl bg-amber-400 text-black font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 className="animate-spin" size={18} /> : <LogOut size={18} />} تسجيل الخروج
        </button>
      </div>
    </div>
  )
}

function EditRecordModal({ r, onClose }) {
  const [form, setForm] = useState({
    workedHours: r.workedHours ?? 0,
    overtimeHours: r.overtimeHours ?? 0,
    lateMinutes: r.lateMinutes ?? 0,
    note: r.note || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    setSaving(true); setError('')
    try {
      await db.updateShared('attendance', r.id, {
        workedHours: Number(form.workedHours) || 0,
        overtimeHours: Number(form.overtimeHours) || 0,
        lateMinutes: Number(form.lateMinutes) || 0,
        note: form.note.trim() || null,
      })
      onClose()
    } catch (e) { setError('تعذر الحفظ: ' + (e.message || e)); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-end md:items-center justify-center p-0 md:p-6" style={{ height: 'var(--visual-height, 100dvh)' }}>
      <div className="w-full max-w-sm cn-aurora border border-white/10 rounded-t-3xl md:rounded-3xl p-6 overflow-y-auto" style={{ maxHeight: 'calc(var(--visual-height, 100dvh) - 2rem)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-white">تعديل السجل</h2>
            <p className="text-xs text-white/45">{r.employeeName}</p>
          </div>
          <button onClick={onClose} className="text-white/50"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <ModalField label="ساعات العمل">
              <input type="number" inputMode="decimal" step="0.1" value={form.workedHours} onChange={e => set('workedHours', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50" />
            </ModalField>
            <ModalField label="ساعات إضافية">
              <input type="number" inputMode="decimal" step="0.1" value={form.overtimeHours} onChange={e => set('overtimeHours', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50" />
            </ModalField>
          </div>
          <ModalField label="دقائق التأخير">
            <div className="flex gap-2">
              <input type="number" inputMode="numeric" value={form.lateMinutes} onChange={e => set('lateMinutes', e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50" />
              <button type="button" onClick={() => set('lateMinutes', 0)} className="shrink-0 px-3 rounded-xl bg-white/5 text-xs text-amber-300 hover:bg-white/10">إعفاء من التأخير</button>
            </div>
          </ModalField>
          <ModalField label="ملاحظة (اختياري)">
            <input value={form.note} onChange={e => set('note', e.target.value)} placeholder="سبب التعديل"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50" />
          </ModalField>
        </div>
        {error && <div className="mt-3 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}
        <button onClick={save} disabled={saving} className="w-full mt-5 py-3 rounded-xl bg-cyan-400 text-black font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />} حفظ
        </button>
      </div>
    </div>
  )
}

function AddExtraDayModal({ employees, defaultDate, onClose }) {
  const [userId, setUserId] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    const emp = employees.find(e => e.userId === userId)
    if (!emp) { setError('اختر الموظف'); return }
    setSaving(true); setError('')
    try {
      const gid = await groupId()
      const iso = new Date(date + 'T00:00:00').toISOString()
      await db.insertShared('attendance', {
        employeeUserId: emp.userId,
        employeeName: emp.fullName,
        department: emp.department || '',
        jobTitle: emp.jobTitle || '',
        date,
        checkIn: iso,
        checkOut: iso,
        workedHours: 0,
        overtimeHours: 0,
        lateMinutes: 0,
        status: 'out',
        faceVerified: false,
        isManual: true,
        note: note.trim() || 'يوم إضافي بواسطة المدير',
      }, undefined, { groupId: gid, visibleTo: 'creator-and-admin' })
      onClose()
    } catch (e) { setError('تعذر الإضافة: ' + (e.message || e)); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-end md:items-center justify-center p-0 md:p-6" style={{ height: 'var(--visual-height, 100dvh)' }}>
      <div className="w-full max-w-sm cn-aurora border border-white/10 rounded-t-3xl md:rounded-3xl p-6 overflow-y-auto" style={{ maxHeight: 'calc(var(--visual-height, 100dvh) - 2rem)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold text-white">إضافة يوم إضافي</h2>
          <button onClick={onClose} className="text-white/50"><X size={20} /></button>
        </div>
        <p className="text-xs text-white/45 mb-4">يُضاف كسجل حضور كامل يوم واحد (بدون ساعات عمل مرتبطة به) — يُحتسب في التقارير كيوم عمل عادي.</p>
        <div className="space-y-3">
          <ModalField label="الموظف">
            <select value={userId} onChange={e => setUserId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50">
              <option value="" style={{ backgroundColor: '#0b1220' }}>— اختر —</option>
              {employees.filter(e => !e.deleted).map(e => (
                <option key={e.userId} value={e.userId} style={{ backgroundColor: '#0b1220' }}>{e.fullName || e.userId}</option>
              ))}
            </select>
          </ModalField>
          <ModalField label="التاريخ">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50 [color-scheme:dark]" />
          </ModalField>
          <ModalField label="ملاحظة (اختياري)">
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="مثال: تعويض عطلة رسمية"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50" />
          </ModalField>
        </div>
        {error && <div className="mt-3 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}
        <button onClick={save} disabled={saving} className="w-full mt-5 py-3 rounded-xl bg-cyan-400 text-black font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />} إضافة
        </button>
      </div>
    </div>
  )
}

function ModalField({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs text-white/50 mb-1 block">{label}</span>
      {children}
    </label>
  )
}

function FaceAvatar({ r, onOpen }) {
  const [err, setErr] = useState(false)
  const src = r.faceSnapshot || r.outFaceSnapshot
  if (src && !err) {
    return (
      <button onClick={onOpen} className="w-11 h-11 rounded-full overflow-hidden shrink-0 ring-1 ring-cyan-400/30 active:scale-95 transition">
        <img src={src} alt={r.employeeName} onError={() => setErr(true)} className="w-full h-full object-cover" />
      </button>
    )
  }
  return (
    <div className="w-11 h-11 rounded-full bg-cyan-400/15 flex items-center justify-center shrink-0">
      <span className="font-display font-bold text-cyan-300">{(r.employeeName || '?').charAt(0).toUpperCase()}</span>
    </div>
  )
}

function FaceModal({ r, refPhoto, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-6" style={{ height: 'var(--visual-height, 100dvh)' }} onClick={onClose}>
      <div className="w-full max-w-sm cn-aurora border border-white/10 rounded-3xl p-5 overflow-y-auto" style={{ maxHeight: 'calc(var(--visual-height, 100dvh) - 4rem)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-white">{r.employeeName}</h2>
            <p className="text-xs text-white/45">قارن الصور يدويًا للتأكد من الهوية</p>
          </div>
          <button onClick={onClose} className="text-white/50"><X size={20} /></button>
        </div>
        <div className={`grid ${refPhoto ? 'grid-cols-3' : 'grid-cols-2'} gap-2.5`}>
          {refPhoto && <FacePane label="المرجعية" src={refPhoto} accent />}
          <FacePane label={`دخول · ${fmtTime(r.checkIn)}`} src={r.faceSnapshot} score={r.faceMatchScore} mismatch={r.faceMismatch} />
          <FacePane label={r.checkOut ? `خروج · ${fmtTime(r.checkOut)}` : 'خروج · —'} src={r.outFaceSnapshot} score={r.outFaceMatchScore} mismatch={r.outFaceMismatch} />
        </div>
        {refPhoto && <p className="text-[11px] text-white/35 mt-3 text-center">قارن صورة المرجع مع صور التسجيل للتأكد أنهما الشخص ذاته — نسبة التطابق تلقائية وتقريبية، والتأكيد النهائي بعين المدير.</p>}
      </div>
    </div>
  )
}

function FacePane({ label, src, accent, score, mismatch }) {
  const [err, setErr] = useState(false)
  return (
    <div>
      <div className={`rounded-2xl overflow-hidden bg-white/5 aspect-square flex items-center justify-center ${accent ? 'ring-2 ring-amber-400/50' : mismatch ? 'ring-2 ring-red-400/50' : ''}`}>
        {src && !err
          ? <img src={src} alt={label} onError={() => setErr(true)} className="w-full h-full object-cover" />
          : <ScanFace size={28} className="text-white/25" />}
      </div>
      <div className={`text-[11px] text-center mt-1.5 ${accent ? 'text-amber-300' : 'text-white/50'}`}>{label}</div>
      {score != null && (
        <div className={`text-[10px] text-center tabular-nums ${mismatch ? 'text-red-300' : 'text-emerald-400/70'}`}>
          تطابق {Math.round(score * 100)}٪
        </div>
      )}
    </div>
  )
}
