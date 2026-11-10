import { useEffect, useMemo, useState } from 'react'
import { UserCheck, UserX, Clock3, LogOut, AlarmClockOff, Hourglass, Tablet, Search, Wifi, WifiOff, CloudOff, AlertTriangle } from 'lucide-react'
import { useLiveShared } from '../../lib/useLive'
import { db } from '../../lib/db'
import { todayStr, fmtTime, fmtDateLong, resolveShift, DEFAULT_SHIFT } from '../../store'

/*
 * "Who's here today?" — the manager's morning view. Every active worker is
 * put in exactly one bucket for today:
 *   present (clocked in, not out) · left (clocked out) · not yet (shift hasn't
 *   started + grace) · absent (shift started, no record)
 * plus two cross-cutting lists: late arrivals, and "forgot to clock out"
 * (still open from a previous day, or closed automatically by the server).
 * Everything is live (realtime) — kiosk records appear as they sync.
 */
export default function Today() {
  const { data: employees, loading: l1 } = useLiveShared('employees', { limit: 1000 })
  const { data: attendance, loading: l2 } = useLiveShared('attendance', { order: '-createdAt', limit: 1500 })
  const { data: devices } = useLiveShared('kioskDevices', { limit: 50 })
  const [shift, setShift] = useState(DEFAULT_SHIFT)
  const [departments, setDepartments] = useState([])
  const [tab, setTab] = useState('absent')
  const [query, setQuery] = useState('')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    db.selectShared('settings', { key: 'shift' }, { limit: 1 }).then((r) => r[0] && setShift({ ...DEFAULT_SHIFT, ...r[0] })).catch(() => {})
    db.selectShared('departments', {}, { limit: 200 }).then(setDepartments).catch(() => {})
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const today = todayStr()

  const view = useMemo(() => {
    const staff = (employees || []).filter((e) => !e.deleted && e.active !== false && e.role !== 'owner' && e.userId)
    const recs = attendance || []
    const todays = recs.filter((r) => r.date === today)
    const byUser = new Map()
    for (const r of todays) {
      const prev = byUser.get(r.employeeUserId)
      if (!prev || Date.parse(r.checkIn || 0) > Date.parse(prev.checkIn || 0)) byUser.set(r.employeeUserId, r)
    }
    const nameOf = (e) => e.fullName || e.name || e.handle || 'موظف'

    const present = [], left = [], notYet = [], absent = [], late = []
    for (const e of staff) {
      const r = byUser.get(e.userId)
      const s = resolveShift(e.department, departments, shift)
      const row = { e, r, name: nameOf(e), shift: s }
      if (r) {
        if (r.status === 'in') present.push(row); else left.push(row)
        if ((r.lateMinutes || 0) > 0) late.push(row)
      } else {
        const [h, m] = String(s.startTime || '09:00').split(':').map(Number)
        const start = new Date(); start.setHours(h, m + (Number(s.graceMinutes) || 0), 0, 0)
        if (now < start.getTime()) notYet.push(row); else absent.push(row)
      }
    }

    const staffById = new Map(staff.map((e) => [e.userId, e]))
    const twoDaysAgo = Date.now() - 2 * 86400000
    const forgot = recs
      .filter((r) => (r.status === 'in' && r.date < today) || (r.autoClosed && Date.parse(r.checkOut || r.checkIn || 0) > twoDaysAgo))
      .map((r) => ({ r, e: staffById.get(r.employeeUserId), name: r.employeeName || nameOf(staffById.get(r.employeeUserId) || {}) }))

    late.sort((a, b) => (b.r.lateMinutes || 0) - (a.r.lateMinutes || 0))
    present.sort((a, b) => Date.parse(a.r.checkIn) - Date.parse(b.r.checkIn))
    return { staff, present, left, notYet, absent, late, forgot }
  }, [employees, attendance, departments, shift, today, now])

  const TABS = [
    { k: 'absent', l: 'غائب', n: view.absent.length, icon: UserX, color: 'text-red-300' },
    { k: 'present', l: 'حاضر الآن', n: view.present.length, icon: UserCheck, color: 'text-emerald-300' },
    { k: 'late', l: 'متأخر', n: view.late.length, icon: Clock3, color: 'text-amber-300' },
    { k: 'forgot', l: 'نسي الانصراف', n: view.forgot.length, icon: AlarmClockOff, color: 'text-orange-300' },
    { k: 'left', l: 'انصرف', n: view.left.length, icon: LogOut, color: 'text-indigo-300' },
    { k: 'notYet', l: 'لم يبدأ دوامه', n: view.notYet.length, icon: Hourglass, color: 'text-white/60' },
  ]

  const q = query.trim().toLowerCase()
  const match = (row) => !q || [row.name, row.e?.department, row.e?.jobTitle].filter(Boolean).join(' ').toLowerCase().includes(q)
  const list = (view[tab] || []).filter(match)

  if (l1 || l2) return <div className="text-center text-white/40 py-10">جارٍ التحميل…</div>

  return (
    <div className="space-y-5 cn-rise">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">اليوم</h1>
        <p className="text-white/45 text-sm">{fmtDateLong(new Date())} · {view.staff.length} موظف نشط</p>
      </div>

      <DeviceStatus devices={devices || []} now={now} />

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {TABS.map(({ k, l, n, icon: Icon, color }) => (
          <button key={k} onClick={() => setTab(k)}
            className={`cn-glass rounded-2xl p-3 text-center transition border ${tab === k ? 'border-cyan-400/50' : 'border-transparent'}`}>
            <Icon size={18} className={`mx-auto ${color}`} />
            <div className={`font-display text-xl font-bold tabular-nums ${color}`}>{n}</div>
            <div className="text-[11px] text-white/50">{l}</div>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/35" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو القسم…"
          className="w-full bg-white/5 border border-white/10 rounded-xl pr-10 pl-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50" />
      </div>

      {list.length === 0 ? (
        <div className="cn-glass rounded-2xl p-8 text-center text-white/45 text-sm">لا أحد في هذه القائمة.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {list.map((row) => <Row key={(row.r?.id || '') + (row.e?.userId || row.name)} row={row} tab={tab} />)}
        </div>
      )}
    </div>
  )
}

function Row({ row, tab }) {
  const { r, e, name, shift } = row
  let right = null
  if (tab === 'absent') right = <span className="text-red-300">لم يسجّل · الدوام {shift.startTime}</span>
  else if (tab === 'notYet') right = <span className="text-white/50">يبدأ {shift.startTime}</span>
  else if (tab === 'present') right = <span className="text-emerald-300">دخل {fmtTime(r.checkIn)}</span>
  else if (tab === 'left') right = <span className="text-indigo-300">{fmtTime(r.checkIn)} ← {fmtTime(r.checkOut)}</span>
  else if (tab === 'late') right = <span className="text-amber-300">متأخر {r.lateMinutes} د · {fmtTime(r.checkIn)}</span>
  else if (tab === 'forgot') {
    right = r.autoClosed
      ? <span className="text-orange-300">انصراف تلقائي {fmtTime(r.checkOut)} · {r.date}</span>
      : <span className="text-red-300">مفتوح منذ {r.date} {fmtTime(r.checkIn)}</span>
  }
  return (
    <div className="cn-glass rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white truncate">{name}</div>
        <div className="text-[11px] text-white/45 truncate">{[e?.jobTitle, e?.department].filter(Boolean).join(' · ') || '—'}</div>
      </div>
      <div className="text-xs tabular-nums shrink-0 text-left">{right}</div>
    </div>
  )
}

function ago(ms) {
  const m = Math.round(ms / 60000)
  if (m < 1) return 'الآن'
  if (m < 60) return `قبل ${m} دقيقة`
  const h = Math.round(m / 60)
  if (h < 24) return `قبل ${h} ساعة`
  return `قبل ${Math.round(h / 24)} يوم`
}

function DeviceStatus({ devices, now }) {
  if (!devices.length) return null
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-white/70 flex items-center gap-2"><Tablet size={16} /> أجهزة البوابة</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {devices.map((d) => {
          const age = now - Date.parse(d.lastSeen || 0)
          const state = age < 3 * 60000 ? 'ok' : age < 30 * 60000 ? 'idle' : 'down'
          const dot = state === 'ok' ? 'bg-emerald-400' : state === 'idle' ? 'bg-amber-400' : 'bg-red-500'
          return (
            <div key={d.userId} className="cn-glass rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <span className={`w-2.5 h-2.5 rounded-full ${dot}`} /> {d.name || 'جهاز البوابة'}
                </div>
                <div className="text-[11px] text-white/50 flex items-center gap-1">
                  {state === 'down' ? <WifiOff size={12} /> : <Wifi size={12} />} آخر اتصال {ago(age)}
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/55">
                <span>{d.rosterCount} بصمة وجه</span>
                {d.pending > 0
                  ? <span className="text-amber-300 flex items-center gap-1"><CloudOff size={12} /> {d.pending} تسجيل لم يُرفع بعد</span>
                  : <span className="text-emerald-300/80">كل التسجيلات مرفوعة</span>}
                {d.failed > 0 && <span className="text-red-300 flex items-center gap-1"><AlertTriangle size={12} /> {d.failed} مرفوض</span>}
                {d.locationStatus === 'far' && <span className="text-red-300">خارج موقع العمل</span>}
                {d.locationStatus === 'unknown' && <span className="text-white/40">الموقع غير محدد</span>}
              </div>
              {state === 'down' && (
                <div className="text-[11px] text-red-300/80">الجهاز غير متصل — قد يكون مطفأ أو بدون إنترنت. التسجيلات محفوظة عليه وتُرفع عند عودة الاتصال.</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
