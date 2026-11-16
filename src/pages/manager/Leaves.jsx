import { useEffect, useMemo, useState, useCallback } from 'react'
import { Plus, Trash2, Loader2, CalendarOff, PartyPopper } from 'lucide-react'
import { db } from '../../lib/db'
import { auth } from '../../lib/auth'
import { todayStr, fmtDate } from '../../store'
import { LEAVE_TYPES, leaveTypeLabel, datesInRange } from '../../lib/payroll'

const inputCls = 'bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-sm outline-none [color-scheme:dark] w-full'
const optionStyle = { backgroundColor: '#0b1220', color: '#ffffff' }

export default function Leaves() {
  const [employees, setEmployees] = useState([])
  const [leaves, setLeaves] = useState([])
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(true)
  const [missingTables, setMissingTables] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const [lf, setLf] = useState({ userId: '', type: 'annual', start: todayStr(), end: todayStr(), note: '' })
  const [hf, setHf] = useState({ date: todayStr(), name: '', paid: true })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const emps = await db.selectShared('employees', {}, { limit: 500 })
      setEmployees(emps.filter(e => e.active !== false && !e.deleted && e.userId))
      try {
        const [l, h] = await Promise.all([
          db.selectAllShared('leaves', {}, { order: '-startDate', max: 500 }),
          db.selectShared('holidays', {}, { order: '-date', limit: 200 }),
        ])
        setLeaves(l); setHolidays(h); setMissingTables(false)
      } catch { setMissingTables(true) }
    } catch (e) { setErr(e.message || 'تعذر التحميل') }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const nameOf = useMemo(() => Object.fromEntries(employees.map(e => [e.userId, e.fullName || e.handle])), [employees])
  const paidByType = (t) => LEAVE_TYPES.find(x => x.key === t)?.paid ?? true

  async function addLeave(e) {
    e.preventDefault(); setErr('')
    if (!lf.userId) return setErr('اختر الموظف')
    if (lf.end < lf.start) return setErr('تاريخ النهاية قبل البداية')
    setBusy(true)
    try {
      await db.insertShared('leaves', {
        employeeUserId: lf.userId, employeeName: nameOf[lf.userId] || '',
        startDate: lf.start, endDate: lf.end, type: lf.type, paid: paidByType(lf.type),
        note: lf.note.trim() || null, createdBy: auth.getCurrentUser()?.id || null,
      })
      setLf(f => ({ ...f, note: '' }))
      await load()
    } catch (e2) { setErr(e2.message || 'تعذر الحفظ') }
    setBusy(false)
  }

  async function addHoliday(e) {
    e.preventDefault(); setErr('')
    if (!hf.name.trim()) return setErr('اكتب اسم العطلة')
    setBusy(true)
    try {
      await db.insertShared('holidays', { date: hf.date, name: hf.name.trim(), paid: hf.paid })
      setHf(f => ({ ...f, name: '' }))
      await load()
    } catch (e2) { setErr(/duplicate|unique/i.test(e2.message || '') ? 'يوجد عطلة مسجلة بهذا التاريخ' : (e2.message || 'تعذر الحفظ')) }
    setBusy(false)
  }

  async function remove(collection, id, label) {
    if (!confirm(`حذف ${label}؟`)) return
    try { await db.deleteShared(collection, id); await load() } catch (e) { setErr(e.message || 'تعذر الحذف') }
  }

  return (
    <div className="space-y-5 cn-rise">
      <h1 className="font-display text-2xl font-bold text-white">الإجازات والعطل الرسمية</h1>

      {missingTables && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
          جداول الإجازات غير موجودة بعد في قاعدة البيانات — شغّل ملف الـ migration رقم 0011 أولًا.
        </div>
      )}
      {err && <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{err}</div>}

      <form onSubmit={addLeave} className="cn-glass rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-white font-semibold"><CalendarOff size={17} className="text-cyan-300" /> تسجيل إجازة</div>
        <select value={lf.userId} onChange={e => setLf({ ...lf, userId: e.target.value })} className={inputCls}>
          <option value="" style={optionStyle}>— اختر الموظف —</option>
          {employees.map(e => <option key={e.userId} value={e.userId} style={optionStyle}>{e.fullName || e.handle}{e.department ? ` · ${e.department}` : ''}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-white/50 space-y-1">من<input type="date" value={lf.start} onChange={e => setLf({ ...lf, start: e.target.value, end: e.target.value > lf.end ? e.target.value : lf.end })} className={inputCls} /></label>
          <label className="text-xs text-white/50 space-y-1">إلى<input type="date" value={lf.end} min={lf.start} onChange={e => setLf({ ...lf, end: e.target.value })} className={inputCls} /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          {LEAVE_TYPES.map(t => (
            <button type="button" key={t.key} onClick={() => setLf({ ...lf, type: t.key })}
              className={`px-3 py-1.5 rounded-lg text-sm ${lf.type === t.key ? 'bg-cyan-400 text-black font-semibold' : 'bg-white/5 text-white/70'}`}>
              {t.label}{t.paid ? '' : ' (بدون راتب)'}
            </button>
          ))}
        </div>
        <input value={lf.note} onChange={e => setLf({ ...lf, note: e.target.value })} placeholder="ملاحظة (اختياري)" className={inputCls} />
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/40">{datesInRange(lf.start, lf.end > lf.start ? lf.end : lf.start).length} يوم — {paidByType(lf.type) ? 'تُحتسب أيامًا مدفوعة في الرواتب' : 'لا تُدفع'}</span>
          <button disabled={busy || missingTables} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-400 text-black font-semibold text-sm disabled:opacity-40">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} حفظ
          </button>
        </div>
      </form>

      <form onSubmit={addHoliday} className="cn-glass rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-white font-semibold"><PartyPopper size={17} className="text-cyan-300" /> عطلة رسمية</div>
        <div className="grid grid-cols-[1fr_1.4fr] gap-3">
          <input type="date" value={hf.date} onChange={e => setHf({ ...hf, date: e.target.value })} className={inputCls} />
          <input value={hf.name} onChange={e => setHf({ ...hf, name: e.target.value })} placeholder="مثال: عيد الفطر" className={inputCls} />
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" checked={hf.paid} onChange={e => setHf({ ...hf, paid: e.target.checked })} /> عطلة مدفوعة لكل الموظفين
          </label>
          <button disabled={busy || missingTables} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-400 text-black font-semibold text-sm disabled:opacity-40">
            <Plus size={15} /> إضافة
          </button>
        </div>
      </form>

      {loading ? <div className="text-center text-white/40 py-8">جارٍ التحميل…</div> : (
        <>
          <section className="cn-glass rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 bg-white/[0.06] border-b border-white/10 text-sm font-bold text-white">الإجازات ({leaves.length})</div>
            {leaves.length === 0 && <div className="p-5 text-center text-white/40 text-sm">لا توجد إجازات مسجلة.</div>}
            {leaves.map(l => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-white/5 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="text-white/90 truncate">{nameOf[l.employeeUserId] || l.employeeName || '—'}</div>
                  <div className="text-xs text-white/45">{fmtDate(l.startDate)}{l.endDate !== l.startDate ? ` → ${fmtDate(l.endDate)}` : ''}{l.note ? ` · ${l.note}` : ''}</div>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${l.paid ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-white/50'}`}>{leaveTypeLabel(l.type)}</span>
                <button onClick={() => remove('leaves', l.id, 'هذه الإجازة')} className="text-white/35 hover:text-red-300 p-1"><Trash2 size={15} /></button>
              </div>
            ))}
          </section>

          <section className="cn-glass rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 bg-white/[0.06] border-b border-white/10 text-sm font-bold text-white">العطل الرسمية ({holidays.length})</div>
            {holidays.length === 0 && <div className="p-5 text-center text-white/40 text-sm">لا توجد عطل مسجلة.</div>}
            {holidays.map(h => (
              <div key={h.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-white/5 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="text-white/90 truncate">{h.name}</div>
                  <div className="text-xs text-white/45">{fmtDate(h.date)}</div>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${h.paid ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-white/50'}`}>{h.paid ? 'مدفوعة' : 'غير مدفوعة'}</span>
                <button onClick={() => remove('holidays', h.id, 'هذه العطلة')} className="text-white/35 hover:text-red-300 p-1"><Trash2 size={15} /></button>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
