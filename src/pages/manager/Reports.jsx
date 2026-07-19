import { useEffect, useMemo, useState, useCallback } from 'react'
import { FileDown, FileSpreadsheet, Loader2 } from 'lucide-react'
import { db } from '../../lib/db'
import { docs } from '../../lib/docs'
import { download } from '../../lib/download'
import { todayStr, money, DEFAULT_SHIFT, overtimeDays } from '../../store'

function startOfWeek() { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return todayStr(d) }
function startOfMonth() { return todayStr().slice(0, 8) + '01' }

const PRESETS = [
  { key: 'today', label: 'اليوم', range: () => [todayStr(), todayStr()] },
  { key: 'week', label: 'هذا الأسبوع', range: () => [startOfWeek(), todayStr()] },
  { key: 'month', label: 'هذا الشهر', range: () => [startOfMonth(), todayStr()] },
]

const NO_DEPT = 'بدون قسم'

export default function Reports() {
  const [start, setStart] = useState(startOfMonth())
  const [end, setEnd] = useState(todayStr())
  const [dept, setDept] = useState('all')
  const [employees, setEmployees] = useState([])
  const [records, setRecords] = useState([])
  const [company, setCompany] = useState({ name: '' })
  const [shift, setShift] = useState(DEFAULT_SHIFT)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [emps, recs, comp, sh] = await Promise.all([
        db.selectShared('employees', {}, { limit: 500 }),
        db.selectAllShared('attendance', { date: { between: [start, end] } }, { max: 20000 }),
        db.selectShared('settings', { key: 'company' }, { limit: 1 }),
        db.selectShared('settings', { key: 'shift' }, { limit: 1 }),
      ])
      setEmployees(emps); setRecords(recs)
      if (comp[0]) setCompany({ name: comp[0].name || '' })
      if (sh[0]) setShift({ ...DEFAULT_SHIFT, ...sh[0] })
    } catch (e) { /* noop */ }
    setLoading(false)
  }, [start, end])
  useEffect(() => { load() }, [load])

  const wageByUser = useMemo(() => {
    const m = {}
    for (const e of employees) m[e.userId] = { name: e.fullName, department: e.department, jobTitle: e.jobTitle, daily: Number(e.dailyWage) || 0, ot: Number(e.overtimeRate) || 0 }
    return m
  }, [employees])

  // Flat per-employee rows across the whole period
  const flatRows = useMemo(() => {
    const byUser = {}
    for (const r of records) {
      if (!r.checkOut) continue
      const id = r.employeeUserId
      if (!byUser[id]) byUser[id] = { name: r.employeeName, department: r.department || '', days: 0, hours: 0, ot: 0 }
      byUser[id].days += 1
      byUser[id].hours += Number(r.workedHours) || 0
      byUser[id].ot += Number(r.overtimeHours) || 0
    }
    return Object.entries(byUser).map(([id, v]) => {
      const w = wageByUser[id] || { daily: 0, ot: 0 }
      const dep = (w.department || v.department || '').trim() || NO_DEPT
      const otDays = overtimeDays(v.ot, shift)
      const wage = v.days * w.daily + otDays * w.ot
      return {
        id, name: w.name || v.name, department: dep, jobTitle: w.jobTitle || '',
        days: v.days, hours: v.hours, ot: otDays, daily: w.daily, otRate: w.ot, wage,
      }
    }).sort((a, b) => b.wage - a.wage)
  }, [records, wageByUser, shift])

  const departments = useMemo(() => {
    const set = new Set(flatRows.map(r => r.department))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'))
  }, [flatRows])

  // Grouped by department (used for both the "all" view and export)
  const groups = useMemo(() => {
    const byDept = {}
    for (const r of flatRows) {
      if (!byDept[r.department]) byDept[r.department] = []
      byDept[r.department].push(r)
    }
    return Object.entries(byDept).map(([name, rows]) => {
      const totals = rows.reduce((t, r) => ({ days: t.days + r.days, hours: t.hours + r.hours, ot: t.ot + r.ot, wage: t.wage + r.wage }), { days: 0, hours: 0, ot: 0, wage: 0 })
      return { name, rows, totals }
    }).sort((a, b) => a.name.localeCompare(b, 'ar'))
  }, [flatRows])

  const visibleGroups = useMemo(() => dept === 'all' ? groups : groups.filter(g => g.name === dept), [groups, dept])
  const grandTotals = useMemo(() => visibleGroups.reduce((t, g) => ({
    days: t.days + g.totals.days, hours: t.hours + g.totals.hours, ot: t.ot + g.totals.ot, wage: t.wage + g.totals.wage,
  }), { days: 0, hours: 0, ot: 0, wage: 0 }), [visibleGroups])
  const visibleRowCount = useMemo(() => visibleGroups.reduce((n, g) => n + g.rows.length, 0), [visibleGroups])

  function applyPreset(p) { const [s, e] = p.range(); setStart(s); setEnd(e) }

  // The export container has dir="rtl" (see docs.js renderSpecToCanvas), so
  // the browser itself places the first column at the rightmost position —
  // the array must be in natural reading order (name first), not reversed.
  const deptTableColumns = [
    { header: 'الموظف', key: 'name', align: 'right' },
    { header: 'الأيام', key: 'days', align: 'left' },
    { header: 'إضافي (يوم)', key: 'ot', align: 'left' },
    { header: 'الأجر اليومي', key: 'daily', align: 'left' },
    { header: 'الإجمالي', key: 'wage', align: 'left' },
  ]

  async function exportPDF() {
    setExporting('pdf')
    try {
      const periodLabel = `الفترة من ${start} إلى ${end}`
      const scopeLabel = dept === 'all' ? 'كل الأقسام' : dept
      const companyName = company.name?.trim() || 'Hudour'

      const sections = [
        { type: 'heading', text: 'تقرير الرواتب', level: 1 },
        ...(company.name?.trim() ? [{ type: 'paragraph', text: [{ text: company.name.trim(), bold: true }] }] : []),
        { type: 'paragraph', text: [
          { text: periodLabel, color: '#64748b' },
          { text: '   ·   ' },
          { text: scopeLabel, bold: true, color: '#0ea5e9' },
        ] },
        { type: 'spacer' },
        {
          type: 'kpiCards',
          cards: [
            { value: String(visibleRowCount), label: 'الموظفون' },
            { value: String(visibleGroups.length), label: 'الأقسام' },
            { value: String(grandTotals.days), label: 'إجمالي الأيام' },
            { value: grandTotals.ot.toFixed(2), label: 'أيام إضافية' },
            { value: money(grandTotals.wage), label: 'إجمالي الرواتب', color: '#0ea5e9' },
          ],
        },
        { type: 'divider' },
      ]

      visibleGroups.forEach((g, gi) => {
        if (gi > 0) sections.push({ type: 'spacer' })
        sections.push({ type: 'heading', text: `${g.name}  ·  ${g.rows.length} موظف`, level: 3 })
        sections.push({
          type: 'table',
          columns: deptTableColumns,
          rows: g.rows.map(r => ({
            name: r.name, days: r.days, ot: r.ot.toFixed(2), daily: money(r.daily), wage: money(r.wage),
          })),
          totals: { name: `مجموع ${g.name}`, days: g.totals.days, ot: g.totals.ot.toFixed(2), daily: '', wage: money(g.totals.wage) },
        })
      })

      if (visibleGroups.length > 1) {
        sections.push({ type: 'divider' })
        sections.push({ type: 'heading', text: 'المقارنة بين الأقسام', level: 3 })
        sections.push({
          type: 'table',
          columns: [
            { header: 'القسم', key: 'name', align: 'right' },
            { header: 'الموظفون', key: 'count', align: 'left' },
            { header: 'الأيام', key: 'days', align: 'left' },
            { header: 'إضافي (يوم)', key: 'ot', align: 'left' },
            { header: 'الإجمالي', key: 'wage', align: 'left' },
          ],
          rows: visibleGroups.map(g => ({ name: g.name, count: g.rows.length, days: g.totals.days, ot: g.totals.ot.toFixed(2), wage: money(g.totals.wage) })),
          totals: { name: 'المجموع الكلي', count: visibleRowCount, days: grandTotals.days, ot: grandTotals.ot.toFixed(2), wage: money(grandTotals.wage) },
        })
      }

      const file = await docs.pdf({
        title: 'تقرير الرواتب',
        theme: { primary: '#0ea5e9', accent: '#10b981', fontSize: 'sm' },
        header: { left: companyName, right: 'تقرير الرواتب', line: true },
        footer: { center: periodLabel, pageNumbers: true, line: true },
        pages: [{ sections }],
      })
      await download.saveFile(file, `payroll-${dept === 'all' ? 'all' : dept}-${start}_${end}.pdf`)
    } catch (e) { alert('تعذر التصدير: ' + (e.message || e)) }
    setExporting('')
  }

  async function exportXLSX() {
    setExporting('xlsx')
    try {
      const sheets = visibleGroups.map(g => ({
        name: g.name.slice(0, 28) || 'قسم',
        headerColor: '#0ea5e9',
        columns: [
          { header: 'الموظف', key: 'name' },
          { header: 'الأيام', key: 'days', align: 'right' },
          { header: 'أيام إضافية', key: 'ot', numFmt: '0.00', align: 'right' },
          { header: 'الأجر اليومي', key: 'daily', numFmt: '#,##0.00', align: 'right' },
          { header: 'إجمالي الراتب', key: 'wage', numFmt: '#,##0.00', align: 'right' },
        ],
        rows: g.rows.map(r => ({ name: r.name, days: r.days, ot: r.ot, daily: r.daily, wage: r.wage })),
        totals: { name: 'الإجمالي', days: g.totals.days, ot: g.totals.ot, wage: g.totals.wage },
      }))
      const file = await docs.xlsx({ sheets: sheets.length ? sheets : [{ name: 'الرواتب', columns: deptTableColumns, rows: [] }] })
      await download.saveFile(file, `payroll-${dept === 'all' ? 'all' : dept}-${start}_${end}.xlsx`)
    } catch (e) { alert('تعذر التصدير: ' + (e.message || e)) }
    setExporting('')
  }

  return (
    <div className="space-y-5 cn-rise">
      <h1 className="font-display text-2xl font-bold text-white">تقارير الرواتب</h1>

      <div className="cn-glass rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button key={p.key} onClick={() => applyPreset(p)} className="px-3 py-1.5 rounded-lg bg-white/5 text-sm text-white/70 hover:bg-white/10">{p.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-white/60">من
            <input type="date" value={start} onChange={e => setStart(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm outline-none [color-scheme:dark]" /></label>
          <label className="flex items-center gap-2 text-sm text-white/60">إلى
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm outline-none [color-scheme:dark]" /></label>
          <label className="flex items-center gap-2 text-sm text-white/60">القسم
            <select value={dept} onChange={e => setDept(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm outline-none [color-scheme:dark]">
              <option value="all" style={optionStyle}>كل الأقسام</option>
              {departments.map(d => <option key={d} value={d} style={optionStyle}>{d}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="الموظفون" value={visibleRowCount} />
        <Stat label="الأيام" value={grandTotals.days} />
        <Stat label="الرواتب" value={money(grandTotals.wage)} />
      </div>

      <div className="flex gap-3">
        <button onClick={exportPDF} disabled={!!exporting || visibleRowCount === 0}
          className="flex-1 py-3 rounded-xl bg-cyan-400 text-black font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
          {exporting === 'pdf' ? <Loader2 className="animate-spin" size={18} /> : <FileDown size={18} />} PDF
        </button>
        <button onClick={exportXLSX} disabled={!!exporting || visibleRowCount === 0}
          className="flex-1 py-3 rounded-xl bg-emerald-400 text-black font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
          {exporting === 'xlsx' ? <Loader2 className="animate-spin" size={18} /> : <FileSpreadsheet size={18} />} Excel
        </button>
      </div>

      {loading ? (
        <div className="text-center text-white/40 py-10">جارٍ التحميل…</div>
      ) : visibleRowCount === 0 ? (
        <div className="cn-glass rounded-2xl p-8 text-center text-white/50">لا توجد سجلات حضور مكتملة في هذه الفترة.</div>
      ) : (
        <>
          {visibleGroups.map(g => (
            <div key={g.name} className="cn-glass rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 bg-white/[0.06] border-b border-white/10 flex items-center justify-between">
                <span className="text-sm font-bold text-white">{g.name}</span>
                <span className="text-xs text-white/40">{g.rows.length} موظف</span>
              </div>
              <div className="grid grid-cols-[1.3fr_.5fr_.6fr_.7fr_.8fr] gap-1.5 px-4 py-1.5 text-[11px] text-white/40">
                <span>الموظف</span><span className="text-right">الأيام</span><span className="text-right">إضافي (يوم)</span><span className="text-right">اليومي</span><span className="text-right">الإجمالي</span>
              </div>
              {g.rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1.3fr_.5fr_.6fr_.7fr_.8fr] gap-1.5 px-4 py-1.5 text-sm border-t border-white/5">
                  <span className="text-white/90 truncate">{r.name}</span>
                  <span className="text-right text-white/70 tabular-nums">{r.days}</span>
                  <span className="text-right text-amber-400 tabular-nums">{r.ot > 0 ? r.ot.toFixed(2) : '—'}</span>
                  <span className="text-right text-white/60 tabular-nums">{money(r.daily)}</span>
                  <span className="text-right text-white font-semibold tabular-nums">{money(r.wage)}</span>
                </div>
              ))}
              <div className="grid grid-cols-[1.3fr_.5fr_.6fr_.7fr_.8fr] gap-1.5 px-4 py-2 text-sm bg-white/5 border-t border-white/10">
                <span className="text-white/80 font-semibold">مجموع القسم</span>
                <span className="text-right text-white/70 tabular-nums">{g.totals.days}</span>
                <span className="text-right text-amber-400 tabular-nums">{g.totals.ot.toFixed(2)}</span>
                <span />
                <span className="text-right text-cyan-300 font-bold tabular-nums">{money(g.totals.wage)}</span>
              </div>
            </div>
          ))}

          {visibleGroups.length > 1 && (
            <div className="cn-glass rounded-2xl overflow-hidden border border-cyan-400/20">
              <div className="grid grid-cols-[1.3fr_.5fr_.6fr_.8fr] gap-1.5 px-4 py-2.5 text-sm bg-cyan-400/10">
                <span className="text-white font-bold">المجموع الكلي</span>
                <span className="text-right text-white/70 tabular-nums">{grandTotals.days}</span>
                <span className="text-right text-amber-400 tabular-nums">{grandTotals.ot.toFixed(2)}</span>
                <span className="text-right text-cyan-300 font-bold tabular-nums">{money(grandTotals.wage)}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const optionStyle = { backgroundColor: '#0b1220', color: '#ffffff' }

function Stat({ label, value }) {
  return (
    <div className="cn-glass rounded-2xl p-3.5 text-center">
      <div className="font-display text-lg md:text-xl font-bold text-white tabular-nums truncate">{value}</div>
      <div className="text-[11px] text-white/45">{label}</div>
    </div>
  )
}
