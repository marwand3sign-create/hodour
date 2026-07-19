import { useMemo, useState } from 'react'
import { ShieldAlert, ScanFace, MapPin, CalendarDays } from 'lucide-react'
import { useLiveShared } from '../../lib/useLive'
import { fmtDateLong, fmtTime } from '../../store'

export default function Alerts() {
  const [range, setRange] = useState('all') // 'all' | '7' | '30'
  const [kind, setKind] = useState('all') // 'all' | 'gps' | 'face'
  const { data, loading } = useLiveShared('attendance', { order: '-createdAt', limit: 800 })

  const rows = useMemo(() => {
    let flagged = (data || []).filter(r => r.gpsSuspicious || r.faceMismatch || r.outFaceMismatch)
    if (kind === 'gps') flagged = flagged.filter(r => r.gpsSuspicious)
    if (kind === 'face') flagged = flagged.filter(r => r.faceMismatch || r.outFaceMismatch)
    if (range === 'all') return flagged
    const days = Number(range)
    const cutoff = Date.now() - days * 86400000
    return flagged.filter(r => new Date(r.checkIn || r.createdAt).getTime() >= cutoff)
  }, [data, range, kind])

  const teleportCount = rows.filter(r => (r.gpsFlagReason || '').includes('انتقال')).length
  const faceCount = rows.filter(r => r.faceMismatch || r.outFaceMismatch).length

  return (
    <div className="space-y-5 cn-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-white">التنبيهات</h1>
        <div className="flex items-center gap-1 cn-glass rounded-xl p-1">
          {[{ v: 'all', l: 'الكل' }, { v: '7', l: '٧ أيام' }, { v: '30', l: '٣٠ يومًا' }].map(o => (
            <button key={o.v} onClick={() => setRange(o.v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${range === o.v ? 'bg-cyan-400/15 text-cyan-300' : 'text-white/50 hover:bg-white/5'}`}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1 cn-glass rounded-xl p-1 w-fit">
        {[{ v: 'all', l: 'كل الأنواع' }, { v: 'gps', l: 'الموقع' }, { v: 'face', l: 'الوجه' }].map(o => (
          <button key={o.v} onClick={() => setKind(o.v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${kind === o.v ? 'bg-cyan-400/15 text-cyan-300' : 'text-white/50 hover:bg-white/5'}`}>
            {o.l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="cn-glass rounded-2xl p-3.5 text-center">
          <div className="font-display text-xl font-bold text-red-300 tabular-nums">{rows.length}</div>
          <div className="text-[11px] text-white/45">إجمالي التنبيهات</div>
        </div>
        <div className="cn-glass rounded-2xl p-3.5 text-center">
          <div className="font-display text-xl font-bold text-red-300 tabular-nums">{teleportCount}</div>
          <div className="text-[11px] text-white/45">انتقال غير واقعي</div>
        </div>
        <div className="cn-glass rounded-2xl p-3.5 text-center">
          <div className="font-display text-xl font-bold text-amber-300 tabular-nums">{faceCount}</div>
          <div className="text-[11px] text-white/45">وجه غير مطابق</div>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-white/40 py-10">جارٍ التحميل…</div>
      ) : rows.length === 0 ? (
        <div className="cn-glass rounded-2xl p-8 text-center text-white/50">لا توجد تنبيهات في هذه الفترة.</div>
      ) : (
        <div className="space-y-2.5">
          {rows.map(r => {
            const faceFlag = r.faceMismatch || r.outFaceMismatch
            const worstScore = [r.faceMatchScore, r.outFaceMatchScore].filter(s => s != null).sort((a, b) => a - b)[0]
            return (
              <div key={r.id} className={`cn-glass rounded-2xl p-4 border ${r.gpsSuspicious ? 'border-red-400/15' : 'border-amber-400/15'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {r.gpsSuspicious ? <ShieldAlert size={16} className="text-red-400 shrink-0" /> : <ScanFace size={16} className="text-amber-400 shrink-0" />}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{r.employeeName}</div>
                      <div className="text-xs text-white/45 flex items-center gap-1 truncate">
                        <CalendarDays size={11} /> {fmtDateLong(r.date)}
                        <span className="mx-1">·</span>
                        <MapPin size={11} /> {r.locationName || '—'}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-white/60 tabular-nums shrink-0">
                    {fmtTime(r.checkIn)} ← {r.checkOut ? fmtTime(r.checkOut) : <span className="text-emerald-400">نشط</span>}
                  </div>
                </div>
                {r.gpsSuspicious && (
                  <p className="text-xs text-red-300/90 mt-2.5 leading-relaxed">{r.gpsFlagReason || 'إشارة موقع مشبوهة.'}</p>
                )}
                {faceFlag && (
                  <p className="text-xs text-amber-300/90 mt-2.5 leading-relaxed">
                    الوجه المُلتقط لا يتطابق بثقة كافية مع الصورة المرجعية{worstScore != null ? ` (نسبة التطابق ${Math.round(worstScore * 100)}٪)` : ''} — راجع الصور يدويًا من صفحة الحضور.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
