import { useEffect, useMemo, useRef, useState } from 'react'
import { Users, Building2, Briefcase, MapPin, UserPlus, Radio, DollarSign, AlertTriangle, Clock3, LogOut as LogOutIcon, CalendarX, Bell, X } from 'lucide-react'
import Chart from '../../components/Chart'
import { db } from '../../lib/db'
import { auth } from '../../lib/auth'
import { triggers } from '../../lib/triggers'
import { useLiveShared } from '../../lib/useLive'
import { todayStr, money, fmtDate, fmtDateLong, WEEKDAYS_AR, DEFAULT_SHIFT, overtimeDays, computeSmartAlerts, ALERT_LOOKBACK_DAYS } from '../../store'

const ALERT_META = {
  late: { label: 'تأخر متكرر', icon: Clock3, color: 'text-amber-300', bg: 'bg-amber-400/10', ring: 'ring-amber-400/20', unit: 'مرة تأخير' },
  earlyLeave: { label: 'خروج مبكر متكرر', icon: LogOutIcon, color: 'text-orange-300', bg: 'bg-orange-400/10', ring: 'ring-orange-400/20', unit: 'مرة خروج مبكر' },
  absence: { label: 'غياب متكرر', icon: CalendarX, color: 'text-red-300', bg: 'bg-red-400/10', ring: 'ring-red-400/20', unit: 'يوم غياب' },
}

export default function Dashboard({ openRoster, canManage }) {
  const [counts, setCounts] = useState({ staff: 0, departments: 0, jobTitles: 0, locations: 0 })
  const [employees, setEmployees] = useState([])
  const [shift, setShift] = useState(DEFAULT_SHIFT)
  const { data: attendance } = useLiveShared('attendance', { order: '-createdAt', limit: 500 })
  const { data: notifications } = useLiveShared('notifications', { order: '-createdAt', limit: 20 })

  useEffect(() => {
    (async () => {
      const [emps, deps, jobs, locs, settings] = await Promise.all([
        db.selectShared('employees', {}, { limit: 500 }),
        db.selectShared('departments', {}, { limit: 200 }),
        db.selectShared('jobTitles', {}, { limit: 200 }),
        db.selectShared('locations', {}, { limit: 200 }),
        db.selectShared('settings', { key: 'shift' }, { limit: 1 }),
      ])
      setEmployees(emps)
      if (settings && settings[0]) setShift({ ...DEFAULT_SHIFT, ...settings[0] })
      const activeCount = emps.filter(e => !e.deleted).length
      setCounts({ staff: activeCount, departments: deps.length, jobTitles: jobs.length, locations: locs.length })
    })().catch(() => {})
  }, [])

  // One-time setup: notify the owner the moment a suspicious-GPS check-in/out
  // lands, even while the app is closed. Guarded by a list check so it's only
  // ever created once (not re-created on every dashboard visit).
  useEffect(() => {
    if (!auth.isAppOwner()) return
    (async () => {
      try {
        const ownerId = import.meta.env.VITE_APP_OWNER_ID
        if (!ownerId) return
        const list = await triggers.list()
        const gpsExists = (list || []).some(t => t.collection === 'attendance' && t.title?.includes('موقع مزيّف'))
        if (!gpsExists) {
          await triggers.create({
            collection: 'attendance',
            on: ['insert', 'update'],
            when: { gpsSuspicious: true },
            action: 'push',
            title: '⚠ تنبيه: احتمال موقع مزيّف',
            body: '{{employeeName}} — {{gpsFlagReason}}',
            target: { userId: ownerId },
          })
        }
        // Immediate ping the moment a check-in lands more than 15 minutes late —
        // the record still saves and the employee is clocked in normally; this
        // just alerts the manager right away with how late they were.
        const lateExists = (list || []).some(t => t.collection === 'attendance' && t.title?.includes('تأخر عن الدوام'))
        if (!lateExists) {
          await triggers.create({
            collection: 'attendance',
            on: ['insert'],
            when: { lateMinutes: { gt: 15 } },
            action: 'push',
            title: '⏰ تأخر عن الدوام',
            body: '{{employeeName}} سجّل حضوره متأخرًا {{lateMinutes}} دقيقة عن بداية الدوام',
            target: { userId: ownerId },
          })
        }
      } catch { /* non-critical */ }
    })()
  }, [])

  const today = todayStr()
  const presentNow = useMemo(() => (attendance || []).filter(r => r.date === today && r.status === 'in').length, [attendance, today])

  const wageByUser = useMemo(() => {
    const m = {}
    for (const e of employees) m[e.userId] = { daily: Number(e.dailyWage) || 0, ot: Number(e.overtimeRate) || 0 }
    return m
  }, [employees])

  // Month-to-date payroll estimate
  const monthStart = today.slice(0, 8) + '01'
  const payroll = useMemo(() => {
    let total = 0
    for (const r of (attendance || [])) {
      if (!r.checkOut || r.date < monthStart) continue
      const w = wageByUser[r.employeeUserId] || { daily: 0, ot: 0 }
      total += w.daily + overtimeDays(r.overtimeHours, shift) * w.ot
    }
    return total
  }, [attendance, wageByUser, monthStart, shift])

  // Last 7 days chart (hours worked)
  const chart = useMemo(() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      days.push({ key, label: WEEKDAYS_AR[d.getDay()] })
    }
    const hoursByDay = {}
    for (const r of (attendance || [])) hoursByDay[r.date] = (hoursByDay[r.date] || 0) + (Number(r.workedHours) || 0)
    return { labels: days.map(d => d.label), data: days.map(d => +(hoursByDay[d.key] || 0).toFixed(1)) }
  }, [attendance])

  const alerts = useMemo(() => computeSmartAlerts(attendance, employees, shift), [attendance, employees, shift])

  const gpsFlags = useMemo(() => {
    const byName = {}
    for (const e of employees) byName[e.userId] = e.name
    return (attendance || [])
      .filter(r => r.gpsSuspicious)
      .slice(0, 8)
      .map(r => ({ ...r, name: byName[r.employeeUserId] || r.employeeName || 'موظف' }))
  }, [attendance, employees])

  const empty = counts.staff === 0

  // Real-time-driven stand-in for OS push: surface the newest notification
  // row as a dismissible toast the moment it lands (see triggers.js).
  const [toast, setToast] = useState(null)
  const seenIds = useRef(new Set())
  const firstRun = useRef(true)
  useEffect(() => {
    if (!notifications || notifications.length === 0) return
    if (firstRun.current) {
      firstRun.current = false
      for (const n of notifications) seenIds.current.add(n.id)
      return
    }
    const fresh = notifications.find(n => !seenIds.current.has(n.id))
    if (fresh) { seenIds.current.add(fresh.id); setToast(fresh) }
  }, [notifications])

  return (
    <div className="space-y-5 cn-rise">
      {toast && <NotificationToast notification={toast} onClose={() => setToast(null)} />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">اللوحة الرئيسية</h1>
          <p className="text-white/45 text-sm">{fmtDateLong()}</p>
        </div>
        {canManage && (
          <button onClick={openRoster} className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-400 text-black font-semibold text-sm">
            <UserPlus size={16} /> إضافة حساب موظف
          </button>
        )}
      </div>

      {empty && (
        <div className="cn-glass rounded-2xl p-6 text-center space-y-3 border border-cyan-400/20">
          <p className="text-white/70">مرحبًا بك في Hudour. ابدأ في 3 خطوات:</p>
          <ol className="text-sm text-white/55 text-right max-w-sm mx-auto space-y-1 list-decimal list-inside">
            <li>أضف موقع عمل مع نطاق جغرافي (الإعدادات)</li>
            <li>أنشئ حسابات للموظفين (إضافة حساب موظف)</li>
            <li>املأ وظيفة وراتب كل موظف (الموظفون)</li>
          </ol>
          {canManage && <button onClick={openRoster} className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-400 text-black font-semibold text-sm"><UserPlus size={16} /> إضافة حساب موظف</button>}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Users} value={counts.staff} label="موظفون" />
        <Kpi icon={Building2} value={counts.departments} label="أقسام" />
        <Kpi icon={Briefcase} value={counts.jobTitles} label="وظائف" />
        <Kpi icon={MapPin} value={counts.locations} label="مواقع" />
      </div>

      {!empty && (
        <div className="cn-glass rounded-2xl p-5 space-y-3 border border-white/5">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className={alerts.length ? 'text-amber-300' : 'text-white/30'} />
            <h2 className="font-display text-base font-bold text-white">تنبيهات ذكية</h2>
            <span className="text-xs text-white/35">آخر {ALERT_LOOKBACK_DAYS} يومًا</span>
          </div>
          {alerts.length === 0 ? (
            <p className="text-sm text-white/40 py-2">لا توجد أنماط متكررة تستدعي الانتباه حاليًا. أداء الفريق طبيعي 👍</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {alerts.map((a, i) => {
                const meta = ALERT_META[a.type]
                const Icon = meta.icon
                return (
                  <div key={a.userId + a.type + i} className={`rounded-xl p-3 flex items-center gap-3 ring-1 ${meta.ring} ${meta.bg}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-black/20`}>
                      <Icon size={16} className={meta.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{a.name || 'موظف'}</div>
                      <div className={`text-xs ${meta.color}`}>{meta.label} · {a.count} {meta.unit}</div>
                    </div>
                    <div className="text-[11px] text-white/35 shrink-0 text-left">آخر مرة<br />{fmtDate(a.lastDate)}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {gpsFlags.length > 0 && (
        <div className="cn-glass rounded-2xl p-5 space-y-3 border border-red-400/20">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-300" />
            <h2 className="font-display text-base font-bold text-white">تنبيهات موقع مزيّف (احتمالية)</h2>
          </div>
          <div className="space-y-2">
            {gpsFlags.map(r => (
              <div key={r.id} className="rounded-xl p-3 flex items-center gap-3 ring-1 ring-red-400/20 bg-red-400/10">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-black/20">
                  <AlertTriangle size={16} className="text-red-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{r.name}</div>
                  <div className="text-xs text-red-300 truncate">{r.gpsFlagReason || 'إشارة موقع غير طبيعية'}</div>
                </div>
                <div className="text-[11px] text-white/35 shrink-0 text-left">{fmtDate(r.date)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="cn-glass rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-400/15 flex items-center justify-center">
            <Radio size={22} className="text-emerald-400" />
          </div>
          <div>
            <div className="font-display text-3xl font-bold text-white tabular-nums">{presentNow}</div>
            <div className="text-white/50 text-sm">مسجلون الآن</div>
          </div>
        </div>
        <div className="cn-glass rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-400/15 flex items-center justify-center">
            <DollarSign size={22} className="text-amber-400" />
          </div>
          <div>
            <div className="font-display text-3xl font-bold text-white tabular-nums">{money(payroll)}</div>
            <div className="text-white/50 text-sm">رواتب هذا الشهر (تقديري)</div>
          </div>
        </div>
      </div>

      <div className="cn-glass rounded-2xl p-5">
        <div className="text-sm font-semibold text-white/70 mb-3">ساعات العمل · آخر 7 أيام</div>
        <Chart spec={{
          kind: 'bar',
          labels: chart.labels,
          series: [{ name: 'ساعات', data: chart.data }],
          options: { title: '' },
        }} />
      </div>
    </div>
  )
}

function NotificationToast({ notification, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 8000)
    return () => clearTimeout(t)
  }, [notification.id, onClose])

  return (
    <div dir="rtl" className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:left-4 sm:w-96 z-50 cn-glass rounded-2xl p-4 border border-cyan-400/25 shadow-2xl flex items-start gap-3 cn-rise">
      <div className="w-9 h-9 rounded-full bg-cyan-400/15 flex items-center justify-center shrink-0">
        <Bell size={16} className="text-cyan-300" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white">{notification.title}</div>
        <div className="text-xs text-white/60 mt-0.5">{notification.body}</div>
      </div>
      <button onClick={onClose} className="text-white/40 hover:text-white/70 shrink-0"><X size={16} /></button>
    </div>
  )
}

function Kpi({ icon: Icon, value, label }) {
  return (
    <div className="cn-glass rounded-2xl p-4">
      <Icon size={18} className="text-cyan-300 mb-2" />
      <div className="font-display text-2xl font-bold text-white tabular-nums">{value}</div>
      <div className="text-xs text-white/45">{label}</div>
    </div>
  )
}
