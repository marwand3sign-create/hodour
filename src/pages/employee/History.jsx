import { useMemo } from 'react'
import { CalendarClock, Clock3, TrendingUp } from 'lucide-react'
import { useLiveShared } from '../../lib/useLive'
import { auth } from '../../lib/auth'
import { fmtTime, MONTHS_AR } from '../../store'

export default function HistoryPage() {
  const me = auth.getCurrentUser()
  const { data, loading } = useLiveShared('attendance', { order: '-createdAt', limit: 200 })

  const rows = useMemo(() => (data || []).filter(r => r.employeeUserId === me.id), [data, me.id])

  const totals = useMemo(() => {
    let hours = 0, ot = 0, days = 0
    for (const r of rows) { if (r.checkOut) { hours += Number(r.workedHours) || 0; ot += Number(r.overtimeHours) || 0; days++ } }
    return { hours, ot, days }
  }, [rows])

  return (
    <div className="space-y-5 cn-rise">
      <h1 className="font-display text-2xl font-bold text-white">سجل حضوري</h1>

      <div className="grid grid-cols-3 gap-3">
        <Stat icon={CalendarClock} label="أيام" value={totals.days} />
        <Stat icon={Clock3} label="ساعات" value={totals.hours.toFixed(1)} />
        <Stat icon={TrendingUp} label="إضافي" value={totals.ot.toFixed(1)} />
      </div>

      {loading ? (
        <div className="text-center text-white/40 py-10">جارٍ التحميل…</div>
      ) : rows.length === 0 ? (
        <div className="cn-glass rounded-2xl p-8 text-center text-white/50">لا توجد سجلات حضور بعد. سجّل دخولك من تبويب التسجيل.</div>
      ) : (
        <div className="space-y-2.5">
          {rows.map(r => (
            <div key={r.id} className="cn-glass rounded-2xl p-4 flex items-center gap-3">
              <div className="w-11 text-center">
                <div className="font-display text-lg font-bold text-cyan-300 leading-none">{new Date(r.checkIn).getDate()}</div>
                <div className="text-[10px] text-white/40">{MONTHS_AR[new Date(r.checkIn).getMonth()]}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white/85 truncate">{r.locationName || '—'}</div>
                <div className="text-xs text-white/45 tabular-nums">{fmtTime(r.checkIn)} ← {r.checkOut ? fmtTime(r.checkOut) : 'نشط'}</div>
              </div>
              <div className="text-right">
                {r.checkOut ? (
                  <>
                    <div className="text-sm font-semibold text-white tabular-nums">{Number(r.workedHours).toFixed(1)} س</div>
                    {Number(r.overtimeHours) > 0 && <div className="text-[11px] text-amber-400 tabular-nums">+{Number(r.overtimeHours).toFixed(1)} إضافي</div>}
                  </>
                ) : (
                  <span className="text-xs px-2 py-1 rounded-full bg-emerald-400/15 text-emerald-400">نشط</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="cn-glass rounded-2xl p-3.5 text-center">
      <Icon size={18} className="text-cyan-300 mx-auto mb-1" />
      <div className="font-display text-xl font-bold text-white tabular-nums">{value}</div>
      <div className="text-[11px] text-white/45">{label}</div>
    </div>
  )
}
