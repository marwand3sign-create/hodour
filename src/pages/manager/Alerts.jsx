import { useMemo, useState } from 'react'
import { ShieldAlert, ScanFace, MapPin, CalendarDays, AlarmClockOff, Check, X, Undo2, Loader2, Tablet } from 'lucide-react'
import { useLiveShared } from '../../lib/useLive'
import { db } from '../../lib/db'
import { auth } from '../../lib/auth'
import { fmtDateLong, fmtTime } from '../../store'

/*
 * Review queue for doubtful records: lookalike / weak face match, suspicious
 * GPS, and automatic clock-outs. The manager compares the captured photos
 * with the worker's reference photo and marks each record ✓ correct or
 * ✗ wrong. Wrong records stay in the history (for audit) but are excluded
 * from payroll/reports.
 */
export default function Alerts() {
  const [status, setStatus] = useState('pending') // pending | ok | rejected | all
  const [kind, setKind] = useState('all') // all | face | gps | auto
  const [busyId, setBusyId] = useState('')
  const { data, loading } = useLiveShared('attendance', { order: '-createdAt', limit: 1500 })
  const { data: employees } = useLiveShared('employees', { limit: 1000 })

  const refPhoto = useMemo(() => {
    const m = new Map()
    for (const e of employees || []) m.set(e.userId, e.referencePhoto)
    return m
  }, [employees])

  const flagged = useMemo(() => (data || []).filter((r) => r.gpsSuspicious || r.faceMismatch || r.outFaceMismatch || r.autoClosed), [data])

  const rows = useMemo(() => {
    let out = flagged
    if (kind === 'gps') out = out.filter((r) => r.gpsSuspicious)
    if (kind === 'face') out = out.filter((r) => r.faceMismatch || r.outFaceMismatch)
    if (kind === 'auto') out = out.filter((r) => r.autoClosed)
    if (status === 'pending') out = out.filter((r) => !r.reviewStatus)
    if (status === 'ok') out = out.filter((r) => r.reviewStatus === 'ok')
    if (status === 'rejected') out = out.filter((r) => r.reviewStatus === 'rejected')
    return out
  }, [flagged, kind, status])

  const pendingCount = flagged.filter((r) => !r.reviewStatus).length

  async function review(r, value) {
    setBusyId(r.id)
    try {
      await db.updateShared('attendance', r.id, {
        reviewStatus: value,
        reviewedAt: value ? new Date().toISOString() : null,
        reviewedBy: value ? auth.getCurrentUser()?.id || null : null,
      })
    } catch (e) { alert('تعذر الحفظ: ' + (e.message || e)) }
    setBusyId('')
  }

  const chip = (active) => `px-3 py-1.5 rounded-lg text-xs font-medium transition ${active ? 'bg-cyan-400/15 text-cyan-300' : 'text-white/50 hover:bg-white/5'}`

  return (
    <div className="space-y-5 cn-rise">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">مراجعة الحالات</h1>
        <p className="text-white/45 text-sm">قارن صورة التسجيل بصورة العامل الأصلية، ثم اختر «صحيح» أو «خطأ». السجلات الخاطئة لا تُحسب في الرواتب والتقارير.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1 cn-glass rounded-xl p-1">
          {[{ v: 'pending', l: `بانتظار المراجعة (${pendingCount})` }, { v: 'ok', l: 'صحيح' }, { v: 'rejected', l: 'خطأ' }, { v: 'all', l: 'الكل' }].map((o) => (
            <button key={o.v} onClick={() => setStatus(o.v)} className={chip(status === o.v)}>{o.l}</button>
          ))}
        </div>
        <div className="flex items-center gap-1 cn-glass rounded-xl p-1">
          {[{ v: 'all', l: 'كل الأنواع' }, { v: 'face', l: 'الوجه' }, { v: 'gps', l: 'الموقع' }, { v: 'auto', l: 'انصراف تلقائي' }].map((o) => (
            <button key={o.v} onClick={() => setKind(o.v)} className={chip(kind === o.v)}>{o.l}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-white/40 py-10">جارٍ التحميل…</div>
      ) : rows.length === 0 ? (
        <div className="cn-glass rounded-2xl p-8 text-center text-white/50">
          {status === 'pending' ? 'لا توجد حالات بانتظار المراجعة 👍' : 'لا توجد سجلات هنا.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {rows.map((r) => {
            const faceFlag = r.faceMismatch || r.outFaceMismatch
            const busy = busyId === r.id
            return (
              <div key={r.id} className={`cn-glass rounded-2xl p-4 space-y-3 border ${r.reviewStatus === 'rejected' ? 'border-red-400/40' : r.reviewStatus === 'ok' ? 'border-emerald-400/30' : 'border-amber-400/20'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{r.employeeName}</div>
                    <div className="text-xs text-white/45 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="flex items-center gap-1"><CalendarDays size={11} /> {fmtDateLong(r.date)}</span>
                      <span className="flex items-center gap-1"><MapPin size={11} /> {r.locationName || '—'}</span>
                      {r.deviceName && <span className="flex items-center gap-1"><Tablet size={11} /> {r.deviceName}</span>}
                    </div>
                  </div>
                  <div className="text-xs text-white/60 tabular-nums shrink-0">
                    {fmtTime(r.checkIn)} ← {r.checkOut ? fmtTime(r.checkOut) : <span className="text-emerald-400">نشط</span>}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {faceFlag && <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-400/10 text-amber-200"><ScanFace size={12} /> الوجه غير مؤكد — اختار اسمه بنفسه أو تطابق ضعيف</span>}
                  {r.gpsSuspicious && <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-400/10 text-red-200"><ShieldAlert size={12} /> {r.gpsFlagReason || 'موقع مشبوه'}</span>}
                  {r.autoClosed && <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-400/10 text-orange-200"><AlarmClockOff size={12} /> نسي الانصراف — أُغلق تلقائيًا على نهاية الدوام</span>}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Photo label="الصورة الأصلية" src={refPhoto.get(r.employeeUserId)} accent />
                  <Photo label={`دخول ${fmtTime(r.checkIn)}`} src={r.faceSnapshot} score={r.faceMatchScore} bad={r.faceMismatch} />
                  <Photo label={r.checkOut ? `خروج ${fmtTime(r.checkOut)}` : 'خروج —'} src={r.outFaceSnapshot} score={r.outFaceMatchScore} bad={r.outFaceMismatch} />
                </div>

                {r.reviewStatus ? (
                  <div className="flex items-center justify-between text-xs">
                    <span className={r.reviewStatus === 'ok' ? 'text-emerald-300' : 'text-red-300'}>
                      {r.reviewStatus === 'ok' ? '✓ تمت المراجعة: صحيح' : '✗ تمت المراجعة: خطأ (لا يُحسب)'}
                      {r.reviewedAt && <span className="text-white/35"> · {fmtTime(r.reviewedAt)}</span>}
                    </span>
                    <button disabled={busy} onClick={() => review(r, null)} className="flex items-center gap-1 text-white/50 hover:text-white disabled:opacity-40">
                      <Undo2 size={13} /> تراجع
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button disabled={busy} onClick={() => review(r, 'ok')} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-500/20 text-emerald-200 font-semibold text-sm disabled:opacity-40">
                      {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} صحيح
                    </button>
                    <button disabled={busy} onClick={() => review(r, 'rejected')} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500/20 text-red-200 font-semibold text-sm disabled:opacity-40">
                      <X size={15} /> خطأ
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Photo({ label, src, accent, score, bad }) {
  const [err, setErr] = useState(false)
  return (
    <div>
      <div className={`rounded-xl overflow-hidden bg-white/5 aspect-square flex items-center justify-center ${accent ? 'ring-2 ring-cyan-400/50' : bad ? 'ring-2 ring-amber-400/50' : ''}`}>
        {src && !err
          ? <img src={src} alt={label} onError={() => setErr(true)} className="w-full h-full object-cover" />
          : <ScanFace size={26} className="text-white/20" />}
      </div>
      <div className={`text-[10px] text-center mt-1 ${accent ? 'text-cyan-300' : 'text-white/50'}`}>{label}</div>
      {score != null && <div className={`text-[10px] text-center tabular-nums ${bad ? 'text-amber-300' : 'text-emerald-400/70'}`}>تطابق {Math.round(score * 100)}٪</div>}
    </div>
  )
}
