import { useEffect, useState, useCallback, useRef } from 'react'
import { Building2, Briefcase, MapPin, Plus, Trash2, Crosshair, Loader2, Check, X, AlertCircle, Clock, Image as ImageIcon, KeyRound, ShieldCheck, UserCog, DatabaseBackup, Download, Upload, AlertTriangle, ChevronDown } from 'lucide-react'
import MapView from '../../components/MapView'
import { db } from '../../lib/db'
import { maps } from '../../lib/maps'
import { team } from '../../lib/team'
import { auth } from '../../lib/auth'
import { storage } from '../../lib/storage'
import { download } from '../../lib/download'
import { groupId, DEFAULT_SHIFT, shiftHours } from '../../store'

const BACKUP_COLLECTIONS = ['departments', 'jobTitles', 'locations', 'settings', 'attendance']
const BACKUP_VERSION = 1

// Drop server-managed fields before writing a restored row back — keep the
// original `id` (used as the stable idField for idempotent upsert) but strip
// timestamps and any underscore-prefixed system field.
function stripSystemFields(row) {
  const out = {}
  for (const k of Object.keys(row || {})) {
    if (k === 'createdAt' || k === 'updatedAt' || k.startsWith('_')) continue
    out[k] = row[k]
  }
  return out
}

const SECTIONS = [
  { key: 'company', label: 'الشركة', icon: ImageIcon },
  { key: 'shift', label: 'الدوام', icon: Clock },
  { key: 'departments', label: 'الأقسام', icon: Building2 },
  { key: 'jobTitles', label: 'الوظائف', icon: Briefcase },
  { key: 'locations', label: 'المواقع', icon: MapPin },
  { key: 'backup', label: 'النسخ الاحتياطي', icon: DatabaseBackup },
  { key: 'account', label: 'الحساب', icon: UserCog },
]

function Toast({ msg, onDone }) {
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(onDone, 2200)
    return () => clearTimeout(t)
  }, [msg, onDone])
  if (!msg) return null
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-40 flex items-center gap-2 bg-emerald-500 text-black text-sm font-semibold px-4 py-2.5 rounded-full shadow-lg cn-rise">
      <Check size={16} /> {msg}
    </div>
  )
}

function ConfirmDialog({ open, text, onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" style={{ height: 'var(--visual-height, 100dvh)' }}>
      <div className="w-full max-w-xs cn-glass rounded-2xl p-5 space-y-4 text-center">
        <p className="text-white/85 text-sm">{text}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-white/10 text-white/80 text-sm font-medium">إلغاء</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold">حذف</button>
        </div>
      </div>
    </div>
  )
}

export default function Setup({ openRoster }) {
  const [section, setSection] = useState('company')
  const [toast, setToast] = useState('')
  return (
    <div className="space-y-5 cn-rise">
      <h1 className="font-display text-2xl font-bold text-white">الإعدادات</h1>
      <div className="flex gap-2 cn-glass rounded-xl p-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setSection(key)}
            className={`shrink-0 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap ${section === key ? 'bg-cyan-400 text-black' : 'text-white/55'}`}>
            <Icon size={14} /> <span>{label}</span>
          </button>
        ))}
      </div>
      {section === 'company' && <CompanySettings onToast={setToast} />}
      {section === 'shift' && <ShiftSettings onToast={setToast} />}
      {section === 'departments' && <DepartmentsList onToast={setToast} />}
      {section === 'jobTitles' && <NameList collection="jobTitles" placeholder="مثال: أمين صندوق، سائق، ممرض" label="وظيفة" onToast={setToast} />}
      {section === 'locations' && <Locations onToast={setToast} />}
      {section === 'backup' && <BackupSettings onToast={setToast} />}
      {section === 'account' && <AccountSettings onToast={setToast} openRoster={openRoster} />}
      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  )
}

function BackupSettings({ onToast }) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(null) // parsed backup awaiting confirmation
  const [restoring, setRestoring] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  async function exportBackup() {
    setError('')
    setExporting(true)
    try {
      const [employees, ...rest] = await Promise.all([
        db.selectAllShared('employees'),
        ...BACKUP_COLLECTIONS.map(c => db.selectAllShared(c)),
      ])
      const data = { employees }
      BACKUP_COLLECTIONS.forEach((c, i) => { data[c] = rest[i] })
      const payload = { app: 'ClockNest', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const filename = `clocknest-backup-${todayFileStamp()}.json`
      const { url } = await storage.upload(blob, filename)
      await download.saveFile(url, filename)
      onToast?.('تم إنشاء وحفظ النسخة الاحتياطية')
    } catch (e) { setError('تعذر إنشاء النسخة الاحتياطية: ' + (e?.message || e)) }
    setExporting(false)
  }

  function todayFileStamp() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  async function pickFile(file) {
    setError(''); setResult(null)
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (!parsed || !parsed.data || typeof parsed.data !== 'object') throw new Error('ملف غير صالح')
      const counts = {
        employees: (parsed.data.employees || []).length,
        departments: (parsed.data.departments || []).length,
        jobTitles: (parsed.data.jobTitles || []).length,
        locations: (parsed.data.locations || []).length,
        settings: (parsed.data.settings || []).length,
        attendance: (parsed.data.attendance || []).length,
      }
      setPending({ parsed, counts })
    } catch (e) { setError('تعذرت قراءة الملف — تأكد أنه ملف نسخة احتياطية صادر من التطبيق نفسه.') }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function applyRestore() {
    if (!pending) return
    setRestoring(true)
    setError('')
    try {
      const gid = await groupId()
      const { data } = pending.parsed

      // Employees: each row has its own per-user visibility, so restore one at a time.
      for (const row of (data.employees || [])) {
        const clean = stripSystemFields(row)
        if (!clean.userId) continue
        await db.upsertShared('employees', clean, row.id || clean.userId, { groupId: gid, visibleTo: 'user:' + clean.userId })
      }

      // Uniform-visibility collections: one batched idempotent call each.
      const uniform = [
        ['departments', 'group'],
        ['jobTitles', 'group'],
        ['locations', 'group'],
        ['settings', 'group'],
        ['attendance', 'creator-and-admin'],
      ]
      for (const [coll, visibleTo] of uniform) {
        const rows = (data[coll] || []).map(stripSystemFields).filter(r => r.id)
        for (let i = 0; i < rows.length; i += 500) {
          const batch = rows.slice(i, i + 500)
          if (batch.length) await db.insertManyShared(coll, batch, { groupId: gid, visibleTo, idField: 'id' })
        }
      }

      setResult(pending.counts)
      setPending(null)
      onToast?.('تم استرجاع النسخة الاحتياطية')
    } catch (e) { setError('تعذر الاسترجاع: ' + (e?.message || e)) }
    setRestoring(false)
  }

  return (
    <div className="space-y-4">
      <div className="cn-glass rounded-2xl p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-cyan-400/15 flex items-center justify-center shrink-0">
            <Download className="text-cyan-300" size={20} />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">تصدير نسخة احتياطية</div>
            <div className="text-xs text-white/45 mt-0.5">حفظ نسخة من كل بيانات الشركة كملف على جهازك</div>
          </div>
        </div>
        <p className="text-xs text-white/50 leading-relaxed">
          يشمل الملف: الموظفين، الأقسام، الوظائف، المواقع، إعدادات الدوام والشركة، وكل سجلات الحضور والانصراف. احتفظ بالملف في مكان آمن.
        </p>
        <button onClick={exportBackup} disabled={exporting} className="w-full py-2.5 rounded-xl bg-cyan-400 text-black font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          {exporting ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />} تنزيل نسخة احتياطية الآن
        </button>
      </div>

      <div className="cn-glass rounded-2xl p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-400/15 flex items-center justify-center shrink-0">
            <Upload className="text-amber-300" size={20} />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">استرجاع من نسخة احتياطية</div>
            <div className="text-xs text-white/45 mt-0.5">استعادة البيانات من ملف نسخة احتياطية سابق</div>
          </div>
        </div>
        <p className="text-xs text-white/50 leading-relaxed">
          يستبدل الاسترجاع بيانات أي سجل موجود في الملف بنسخته المحفوظة، ويضيف ما هو غير موجود حاليًا — دون حذف أي سجلات أضفتها بعد إنشاء النسخة.
        </p>
        <input ref={fileRef} type="file" accept="application/json" onChange={e => pickFile(e.target.files?.[0])}
          className="block w-full text-xs text-white/60 file:ml-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/10 file:text-white/80 file:text-xs" />

        {result && (
          <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            <Check size={14} className="shrink-0" /> تم استرجاع النسخة بنجاح.
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle size={14} className="shrink-0" /> <span className="flex-1">{error}</span>
            <button onClick={() => setError('')}><X size={14} /></button>
          </div>
        )}
      </div>

      {pending && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" style={{ height: 'var(--visual-height, 100dvh)' }}>
          <div className="w-full max-w-xs cn-glass rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-amber-300 text-sm font-semibold"><AlertTriangle size={16} /> تأكيد الاسترجاع</div>
            <div className="text-xs text-white/60 leading-relaxed">تم العثور على:</div>
            <ul className="text-xs text-white/70 space-y-1">
              <li>{pending.counts.employees} موظف</li>
              <li>{pending.counts.attendance} سجل حضور</li>
              <li>{pending.counts.locations} موقع</li>
              <li>{pending.counts.departments} قسم · {pending.counts.jobTitles} وظيفة</li>
            </ul>
            <p className="text-xs text-white/45">سيتم استرجاع هذه البيانات ودمجها مع البيانات الحالية. هل تريد المتابعة؟</p>
            <div className="flex gap-2">
              <button onClick={() => setPending(null)} disabled={restoring} className="flex-1 py-2.5 rounded-xl bg-white/10 text-white/80 text-sm font-medium disabled:opacity-50">إلغاء</button>
              <button onClick={applyRestore} disabled={restoring} className="flex-1 py-2.5 rounded-xl bg-amber-400 text-black text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                {restoring ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />} استرجاع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AccountSettings({ onToast, openRoster }) {
  const [member, setMember] = useState(undefined) // undefined = loading, null = no seat (Google owner), object = seat
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmNext, setConfirmNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    team.currentMember().then(setMember).catch(() => setMember(null))
  }, [])

  async function submit() {
    setError(''); setDone(false)
    if (!/^\d{6}$/.test(current) || !/^\d{6}$/.test(next)) { setError('الرقم السري 6 أرقام بالضبط'); return }
    if (next !== confirmNext) { setError('تأكيد الرقم السري الجديد غير مطابق'); return }
    setBusy(true)
    try {
      await team.changePassword(current, next)
      setCurrent(''); setNext(''); setConfirmNext('')
      setDone(true)
      onToast?.('تم تحديث بيانات الدخول')
    } catch (e) { setError('تعذر التحديث: ' + (e?.message || e)) }
    setBusy(false)
  }

  if (member === undefined) return <div className="text-white/40 text-sm py-4 text-center">جارٍ التحميل…</div>

  if (!member) {
    // Signed in via the platform owner account (Google/email) — no in-app username/password exists yet.
    return (
      <div className="cn-glass rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-cyan-400/15 flex items-center justify-center shrink-0">
            <ShieldCheck className="text-cyan-300" size={20} />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">دخولك الحالي عبر حساب المالك الأساسي</div>
            <div className="text-xs text-white/45 mt-0.5">وهذا يُستخدم فقط كخيار احتياطي نادر.</div>
          </div>
        </div>
        <p className="text-xs text-white/50 leading-relaxed">
          لتسجّل الدخول يوميًا باسم مستخدم ورقم سري خاص بك بدل حساب Google، أنشئ لنفسك حساب «مدير» من «إدارة الحسابات»، ثم سجّل خروجك وادخل بذلك الاسم والرقم السري في المرة القادمة. حساب المالك الأساسي يبقى متاحًا دائمًا كطريقة دخول احتياطية إن نسيت رقمك السري.
        </p>
        {openRoster && (
          <button onClick={openRoster} className="w-full py-2.5 rounded-xl bg-cyan-400 text-black font-semibold flex items-center justify-center gap-2">
            <KeyRound size={16} /> إنشاء حساب دخول باسم مستخدم ورقم سري
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="cn-glass rounded-2xl p-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-cyan-400/15 flex items-center justify-center shrink-0">
          <ShieldCheck className="text-cyan-300" size={20} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">{member.displayName || member.handle}</div>
          <div className="text-xs text-white/40 truncate" dir="ltr">@{member.handle}</div>
        </div>
      </div>

      <div className="cn-glass rounded-2xl p-4 space-y-4">
        <div className="text-sm font-semibold text-white/70 flex items-center gap-2"><KeyRound size={15} /> تغيير الرقم السري</div>
        <p className="text-xs text-white/45 leading-relaxed">لتغيير رقمك السري بنفسك أدخل الحالي والجديد (6 أرقام لكل منهما).</p>

        <label className="block space-y-1.5">
          <span className="text-xs text-white/50">الرقم السري الحالي</span>
          <input type="password" dir="ltr" inputMode="numeric" value={current}
            onChange={e => { setCurrent(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50 [color-scheme:dark]" placeholder="6 أرقام" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs text-white/50">الرقم السري الجديد</span>
          <input type="password" dir="ltr" inputMode="numeric" value={next}
            onChange={e => { setNext(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50 [color-scheme:dark]" placeholder="6 أرقام" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs text-white/50">تأكيد الرقم السري الجديد</span>
          <input type="password" dir="ltr" inputMode="numeric" value={confirmNext}
            onChange={e => { setConfirmNext(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50 [color-scheme:dark]" placeholder="6 أرقام" />
        </label>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle size={14} className="shrink-0" /> <span className="flex-1">{error}</span>
            <button onClick={() => setError('')}><X size={14} /></button>
          </div>
        )}
        {done && (
          <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            <Check size={14} className="shrink-0" /> تم تحديث الرقم السري بنجاح
          </div>
        )}

        <button onClick={submit} disabled={busy} className="w-full py-2.5 rounded-xl bg-cyan-400 text-black font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />} حفظ الرقم السري الجديد
        </button>
      </div>
    </div>
  )
}

function CompanySettings({ onToast }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const rows = await db.selectShared('settings', { key: 'company' }, { limit: 1 })
        if (rows[0]) { setName(rows[0].name || '') }
      } catch {}
      setLoading(false)
    })()
  }, [])

  async function save(next) {
    setError('')
    setSaving(true)
    try {
      const gid = await groupId()
      await db.upsertShared('settings', {
        key: 'company', name: next?.name ?? name,
      }, 'company', { groupId: gid, visibleTo: 'group' })
      onToast?.('تم الحفظ')
    } catch (e) { setError('تعذر الحفظ: ' + (e?.message || e)) }
    setSaving(false)
  }

  if (loading) return <div className="text-white/40 text-sm py-4 text-center">جارٍ التحميل…</div>

  return (
    <div className="space-y-4">
      <div className="cn-glass rounded-2xl p-4 space-y-4">
        <div className="text-sm font-semibold text-white/70">هوية الشركة</div>
        <p className="text-xs text-white/45 leading-relaxed">يظهر اسم الشركة في رأس تقارير الرواتب (PDF) بدل اسم التطبيق الافتراضي.</p>

        <label className="block space-y-1.5">
          <span className="text-xs text-white/50">اسم الشركة</span>
          <input value={name} onChange={e => { setName(e.target.value); setError('') }}
            placeholder="مثال: شركة النور للخدمات"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50" />
        </label>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle size={14} className="shrink-0" /> <span className="flex-1">{error}</span>
            <button onClick={() => setError('')}><X size={14} /></button>
          </div>
        )}

        <button onClick={() => save()} disabled={saving} className="w-full py-2.5 rounded-xl bg-cyan-400 text-black font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />} حفظ بيانات الشركة
        </button>
      </div>
    </div>
  )
}

function ShiftSettings({ onToast }) {
  const [form, setForm] = useState(DEFAULT_SHIFT)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const rows = await db.selectShared('settings', { key: 'shift' }, { limit: 1 })
        if (rows[0]) setForm({ ...DEFAULT_SHIFT, ...rows[0] })
      } catch {}
      setLoading(false)
    })()
  }, [])

  async function save() {
    if (!form.startTime || !form.endTime) { setError('حدد وقت البداية والنهاية'); return }
    setError('')
    setBusy(true)
    try {
      const gid = await groupId()
      await db.upsertShared('settings', {
        key: 'shift',
        startTime: form.startTime,
        endTime: form.endTime,
        graceMinutes: Number(form.graceMinutes) || 0,
      }, 'shift', { groupId: gid, visibleTo: 'group' })
      onToast?.('تم حفظ أوقات الدوام')
    } catch (e) { setError('تعذر الحفظ: ' + (e?.message || e)) }
    setBusy(false)
  }

  const hrs = shiftHours(form)

  if (loading) return <div className="text-white/40 text-sm py-4 text-center">جارٍ التحميل…</div>

  return (
    <div className="space-y-4">
      <div className="cn-glass rounded-2xl p-4 space-y-4">
        <div className="text-sm font-semibold text-white/70">أوقات الدوام الرسمية</div>
        <p className="text-xs text-white/45 leading-relaxed">تُستخدم هذه الأوقات لحساب ساعات العمل القياسية، والعمل الإضافي بعد انتهاء الدوام، ورصد التأخير في الحضور.</p>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1.5">
            <span className="text-xs text-white/50">بداية الدوام</span>
            <input type="time" value={form.startTime} onChange={e => { setForm(f => ({ ...f, startTime: e.target.value })); setError('') }}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50 [color-scheme:dark]" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-white/50">انتهاء الدوام</span>
            <input type="time" value={form.endTime} onChange={e => { setForm(f => ({ ...f, endTime: e.target.value })); setError('') }}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50 [color-scheme:dark]" />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs text-white/50">مهلة السماح بالتأخير (دقائق)</span>
          <input type="number" min="0" value={form.graceMinutes} onChange={e => { setForm(f => ({ ...f, graceMinutes: e.target.value })); setError('') }}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50 [color-scheme:dark]" />
        </label>

        <div className="flex items-center gap-2 text-xs text-cyan-300 bg-cyan-400/10 rounded-lg px-3 py-2">
          <Clock size={14} className="shrink-0" />
          <span>ساعات العمل القياسية في اليوم: <span className="font-semibold tabular-nums">{hrs.toFixed(1)}</span> ساعة</span>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle size={14} className="shrink-0" /> <span className="flex-1">{error}</span>
            <button onClick={() => setError('')}><X size={14} /></button>
          </div>
        )}

        <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl bg-cyan-400 text-black font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />} حفظ أوقات الدوام
        </button>
      </div>
    </div>
  )
}

function NameList({ collection, placeholder, label, onToast }) {
  const [items, setItems] = useState([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await db.selectShared(collection, {}, { order: '-createdAt', limit: 300 })) } catch {}
    setLoading(false)
  }, [collection])
  useEffect(() => { load() }, [load])

  async function add() {
    const n = name.trim()
    if (!n) { setError('اكتب الاسم أولًا'); return }
    setError('')
    setBusy(true)
    try {
      const gid = await groupId()
      await db.insertShared(collection, { name: n }, undefined, { groupId: gid, visibleTo: 'group' })
      setName('')
      await load()
      onToast?.('تمت الإضافة')
    } catch (e) { setError('تعذر الحفظ: ' + (e?.message || e)) }
    setBusy(false)
  }

  async function doRemove(id) {
    setConfirmId(null)
    try { await db.deleteShared(collection, id); await load(); onToast?.('تم الحذف') }
    catch (e) { setError('تعذر الحذف: ' + (e?.message || e)) }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={name} onChange={e => { setName(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && add()}
          placeholder={placeholder} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50" />
        <button onClick={add} disabled={busy} className="px-4 rounded-xl bg-cyan-400 text-black font-semibold flex items-center gap-1 disabled:opacity-50">
          {busy ? <Loader2 className="animate-spin" size={16} /> : <Plus size={18} />}
        </button>
      </div>
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertCircle size={14} className="shrink-0" /> <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}
      {loading ? <div className="text-white/40 text-sm py-4 text-center">جارٍ التحميل…</div>
        : items.length === 0 ? <div className="cn-glass rounded-2xl p-6 text-center text-white/50 text-sm">لا يوجد أي {label} بعد.</div>
        : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {items.map(it => (
              <div key={it.id} className="cn-glass rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-white/85 text-sm">{it.name}</span>
                <button onClick={() => setConfirmId(it.id)} className="text-white/25 hover:text-red-400"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      <ConfirmDialog open={confirmId != null} text={'حذف هذا الـ' + label + '؟'}
        onConfirm={() => doRemove(confirmId)} onCancel={() => setConfirmId(null)} />
    </div>
  )
}

function DepartmentsList({ onToast }) {
  const [items, setItems] = useState([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState(null)
  const [openId, setOpenId] = useState(null) // expanded shift editor

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await db.selectShared('departments', {}, { order: '-createdAt', limit: 300 })) } catch {}
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function add() {
    const n = name.trim()
    if (!n) { setError('اكتب الاسم أولًا'); return }
    setError('')
    setBusy(true)
    try {
      const gid = await groupId()
      await db.insertShared('departments', { name: n }, undefined, { groupId: gid, visibleTo: 'group' })
      setName('')
      await load()
      onToast?.('تمت الإضافة')
    } catch (e) { setError('تعذر الحفظ: ' + (e.message || e)) }
    setBusy(false)
  }

  async function doRemove(id) {
    setConfirmId(null)
    try { await db.deleteShared('departments', id); await load(); onToast?.('تم الحذف') }
    catch (e) { setError('تعذر الحذف: ' + (e.message || e)) }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={name} onChange={e => { setName(e.target.value); setError('') }} onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="مثال: المبيعات، العمليات" className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50" />
        <button onClick={add} disabled={busy} className="px-4 rounded-xl bg-cyan-400 text-black font-semibold flex items-center gap-1 disabled:opacity-50">
          {busy ? <Loader2 className="animate-spin" size={16} /> : <Plus size={18} />}
        </button>
      </div>
      <p className="text-xs text-white/40 leading-relaxed">اضغط على أي قسم لتحديد أوقات دوام خاصة به (مثلاً قسم من 6 لـ2، وقسم تاني من 6 لـ5) — القسم من غير أوقات خاصة يستخدم أوقات الدوام العامة.</p>
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertCircle size={14} className="shrink-0" /> <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}
      {loading ? <div className="text-white/40 text-sm py-4 text-center">جارٍ التحميل…</div>
        : items.length === 0 ? <div className="cn-glass rounded-2xl p-6 text-center text-white/50 text-sm">لا يوجد أي قسم بعد.</div>
        : (
          <div className="space-y-2">
            {items.map(it => (
              <DepartmentRow key={it.id} item={it} open={openId === it.id}
                onToggle={() => setOpenId(o => o === it.id ? null : it.id)}
                onDelete={() => setConfirmId(it.id)}
                onSaved={async (msg) => { await load(); onToast?.(msg) }} />
            ))}
          </div>
        )}
      <ConfirmDialog open={confirmId != null} text="حذف هذا القسم؟"
        onConfirm={() => doRemove(confirmId)} onCancel={() => setConfirmId(null)} />
    </div>
  )
}

function DepartmentRow({ item, open, onToggle, onDelete, onSaved }) {
  const hasOverride = !!(item.startTime && item.endTime)
  const [form, setForm] = useState({
    startTime: item.startTime || '09:00',
    endTime: item.endTime || '17:00',
    graceMinutes: item.graceMinutes ?? 15,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true); setError('')
    try {
      await db.updateShared('departments', item.id, {
        startTime: form.startTime, endTime: form.endTime, graceMinutes: Number(form.graceMinutes) || 0,
      })
      await onSaved('تم حفظ أوقات القسم')
    } catch (e) { setError('تعذر الحفظ: ' + (e.message || e)) }
    setSaving(false)
  }

  async function clearOverride() {
    setSaving(true); setError('')
    try {
      await db.updateShared('departments', item.id, { startTime: null, endTime: null, graceMinutes: null })
      await onSaved('تم الرجوع لأوقات الدوام العامة')
    } catch (e) { setError('تعذر الحفظ: ' + (e.message || e)) }
    setSaving(false)
  }

  return (
    <div className="cn-glass rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3">
        <span className="text-white/85 text-sm flex items-center gap-2">
          {item.name}
          {hasOverride && <span className="text-[10px] text-cyan-300 bg-cyan-400/10 rounded px-1.5 py-0.5">دوام خاص</span>}
        </span>
        <span className="flex items-center gap-2">
          <span onClick={(e) => { e.stopPropagation(); onDelete() }} className="text-white/25 hover:text-red-400 p-1"><Trash2 size={15} /></span>
          <ChevronDown size={16} className={`text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-xs text-white/50">بداية الدوام</span>
              <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-cyan-400/50 [color-scheme:dark]" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs text-white/50">انتهاء الدوام</span>
              <input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-cyan-400/50 [color-scheme:dark]" />
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs text-white/50">مهلة السماح بالتأخير (دقائق)</span>
            <input type="number" min="0" value={form.graceMinutes} onChange={e => setForm(f => ({ ...f, graceMinutes: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-cyan-400/50 [color-scheme:dark]" />
          </label>
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="shrink-0" /> <span className="flex-1">{error}</span>
            </div>
          )}
          <div className="flex gap-2">
            {hasOverride && (
              <button onClick={clearOverride} disabled={saving} className="flex-1 py-2 rounded-xl bg-white/5 text-white/70 text-xs font-medium disabled:opacity-50">
                استخدام الدوام العام
              </button>
            )}
            <button onClick={save} disabled={saving} className="flex-1 py-2 rounded-xl bg-cyan-400 text-black text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />} حفظ أوقات هذا القسم
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Locations({ onToast }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', lat: null, lng: null, radius: 150 })
  const [center, setCenter] = useState([25.2048, 55.2708])
  const [locating, setLocating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await db.selectShared('locations', {}, { order: '-createdAt', limit: 200 })
      setItems(rows)
      if (rows[0]) setCenter([Number(rows[0].lat), Number(rows[0].lng)])
    } catch {}
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function useMyLocation() {
    setLocating(true)
    setError('')
    try {
      const { lat, lng } = await maps.getCurrentLocation()
      setForm(f => ({ ...f, lat, lng })); setCenter([lat, lng])
    } catch { setError('تعذر تحديد موقعك. اضغط على الخريطة لتحديد النقطة بدلًا من ذلك.') }
    setLocating(false)
  }

  async function add() {
    if (!form.name.trim()) { setError('أدخل اسم الموقع'); return }
    if (form.lat == null) { setError('حدد الموقع: اضغط على الخريطة أو استخدم «موقعي».'); return }
    setError('')
    setBusy(true)
    try {
      const gid = await groupId()
      await db.insertShared('locations', {
        name: form.name.trim(), lat: form.lat, lng: form.lng, radius: Number(form.radius) || 150,
      }, undefined, { groupId: gid, visibleTo: 'group' })
      setForm({ name: '', lat: null, lng: null, radius: 150 })
      await load()
      onToast?.('تمت إضافة الموقع')
    } catch (e) { setError('تعذر الحفظ: ' + (e?.message || e)) }
    setBusy(false)
  }

  async function doRemove(id) {
    setConfirmId(null)
    try { await db.deleteShared('locations', id); await load(); onToast?.('تم الحذف') }
    catch (e) { setError('تعذر الحذف: ' + (e?.message || e)) }
  }

  const markers = items.map(l => ({ lat: Number(l.lat), lng: Number(l.lng), label: l.name, popup: `${l.name} · ${l.radius} متر` }))
  if (form.lat != null) markers.push({ lat: form.lat, lng: form.lng, label: 'جديد', popup: 'موقع جديد' })

  return (
    <div className="space-y-4">
      <div className="cn-glass rounded-2xl p-4 space-y-3">
        <div className="text-sm font-semibold text-white/70">إضافة موقع عمل</div>
        <input value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setError('') }}
          placeholder="اسم الموقع (مثال: المقر الرئيسي)" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-cyan-400/50" />
        <div className="rounded-xl overflow-hidden border border-white/10">
          <MapView center={center} zoom={15} markers={markers} showUserLocation
            onMapClick={({ lat, lng }) => { setForm(f => ({ ...f, lat, lng })); setError('') }} className="h-56 w-full" />
        </div>
        <p className="text-xs text-white/40">اضغط على الخريطة لتحديد مركز النطاق، أو استخدم موقعك الحالي.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={useMyLocation} disabled={locating} className="flex items-center gap-1.5 text-sm text-cyan-300 disabled:opacity-50">
            {locating ? <Loader2 className="animate-spin" size={15} /> : <Crosshair size={15} />} موقعي
          </button>
          <label className="flex items-center gap-2 text-sm text-white/60">
            نصف القطر
            <input type="number" value={form.radius} onChange={e => setForm(f => ({ ...f, radius: e.target.value }))}
              className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm outline-none [color-scheme:dark]" />متر
          </label>
          {form.lat != null && <span className="text-xs text-white/40 tabular-nums">{form.lat.toFixed(4)}, {form.lng.toFixed(4)}</span>}
        </div>
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle size={14} className="shrink-0" /> <span className="flex-1">{error}</span>
            <button onClick={() => setError('')}><X size={14} /></button>
          </div>
        )}
        <button onClick={add} disabled={busy} className="w-full py-2.5 rounded-xl bg-cyan-400 text-black font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />} إضافة موقع
        </button>
      </div>

      {loading ? <div className="text-white/40 text-sm py-4 text-center">جارٍ التحميل…</div>
        : items.length === 0 ? <div className="cn-glass rounded-2xl p-6 text-center text-white/50 text-sm">لا توجد مواقع بعد.</div>
        : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {items.map(l => (
              <div key={l.id} className="cn-glass rounded-xl px-4 py-3 flex items-center gap-3">
                <MapPin size={16} className="text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-white/85 text-sm truncate">{l.name}</div>
                  <div className="text-xs text-white/40 tabular-nums">{Number(l.lat).toFixed(4)}, {Number(l.lng).toFixed(4)} · {l.radius} متر</div>
                </div>
                <button onClick={() => setConfirmId(l.id)} className="text-white/25 hover:text-red-400"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      <ConfirmDialog open={confirmId != null} text="حذف هذا الموقع؟"
        onConfirm={() => doRemove(confirmId)} onCancel={() => setConfirmId(null)} />
    </div>
  )
}
