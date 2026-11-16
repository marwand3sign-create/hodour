import { effectiveDailyWage, fridaysInRange, todayStr, resolveShift, shiftHours } from '../store'

export const NO_DEPT = 'بدون قسم'

export const LEAVE_TYPES = [
  { key: 'annual', label: 'سنوية', paid: true },
  { key: 'sick', label: 'مرضية', paid: true },
  { key: 'excuse', label: 'غياب بعذر', paid: true },
  { key: 'unpaid', label: 'بدون راتب', paid: false },
]
export const leaveTypeLabel = (key) => LEAVE_TYPES.find(t => t.key === key)?.label || key

// Every "YYYY-MM-DD" date in [start, end], inclusive.
export function datesInRange(start, end) {
  const out = []
  const d = new Date(start + 'T00:00:00')
  const last = new Date(end + 'T00:00:00')
  while (d <= last) { out.push(todayStr(d)); d.setDate(d.getDate() + 1) }
  return out
}

// Pure payroll computation for [start, end] — the single source of truth used
// by the Reports page (screen, PDF, Excel). No I/O so it can be unit-tested.
//
// A "paid day" is credited at most once per calendar date per employee, with
// this priority: worked > Friday (monthly staff) > paid holiday > paid leave.
// A manager-added "extra day" (record.isManual) is paid at the overtime rate
// instead and never counted as a normal day.
export function computePayroll({ employees = [], records = [], leaves = [], holidays = [], departments = [], globalShift, start, end }) {
  const byUser = {}
  const ensure = (id, name, department) => {
    if (!byUser[id]) {
      byUser[id] = {
        name, department: department || '',
        worked: new Set(), days: 0, hours: 0, extraDays: 0,
        fridayDays: 0, holidayDays: 0, leaveDays: 0, unpaidLeaveDays: 0,
        lateCount: 0, lateMinutes: 0, earlyCount: 0,
      }
    }
    return byUser[id]
  }
  const empByUser = {}
  for (const e of employees) if (e.userId) empByUser[e.userId] = e

  // Monthly-salary staff appear even with zero clock-ins (they're paid Fridays).
  for (const e of employees) if (e.wageType === 'monthly' && e.userId) ensure(e.userId, e.fullName, e.department)

  for (const r of records) {
    if (!r.checkOut) continue
    const row = ensure(r.employeeUserId, r.employeeName, r.department)
    if (r.isManual) {
      row.extraDays += 1
    } else {
      row.days += 1
      row.hours += Number(r.workedHours) || 0
      if (Number(r.lateMinutes) > 0) { row.lateCount += 1; row.lateMinutes += Number(r.lateMinutes) }
      const emp = empByUser[r.employeeUserId]
      const shift = resolveShift(emp?.department || r.department, departments, globalShift)
      if (!r.autoClosed && shiftHours(shift) - (Number(r.workedHours) || 0) > 0.5) row.earlyCount += 1
    }
    row.worked.add(r.date)
  }

  const credited = {} // userId -> Set of dates already paid
  for (const [id, v] of Object.entries(byUser)) credited[id] = new Set(v.worked)

  // Fridays: paid rest day for monthly-salary staff.
  for (const [id, v] of Object.entries(byUser)) {
    if (empByUser[id]?.wageType !== 'monthly') continue
    for (const f of fridaysInRange(start, end)) {
      if (credited[id].has(f)) continue
      credited[id].add(f); v.fridayDays += 1; v.days += 1
    }
  }

  // Paid public holidays: every active employee who already existed that day.
  for (const h of holidays) {
    if (h.paid === false || !h.date || h.date < start || h.date > end) continue
    for (const e of employees) {
      if (!e.userId || e.active === false || e.deleted) continue
      // Unpaid-wage accounts (owner/managers with no wage set) shouldn't pop up as zero rows.
      if (effectiveDailyWage(e, start) <= 0) continue
      if (e.createdAt && todayStr(new Date(e.createdAt)) > h.date) continue
      const v = byUser[e.userId] || ensure(e.userId, e.fullName, e.department)
      credited[e.userId] ||= new Set(v.worked)
      if (credited[e.userId].has(h.date)) continue
      credited[e.userId].add(h.date); v.holidayDays += 1; v.days += 1
    }
  }

  // Leaves, clipped to the report period.
  for (const l of leaves) {
    const e = empByUser[l.employeeUserId]
    if (!e || !l.startDate || !l.endDate) continue
    const from = l.startDate < start ? start : l.startDate
    const to = l.endDate > end ? end : l.endDate
    if (from > to) continue
    const v = byUser[l.employeeUserId] || ensure(l.employeeUserId, e.fullName, e.department)
    credited[l.employeeUserId] ||= new Set(v.worked)
    for (const d of datesInRange(from, to)) {
      if (l.paid === false) { v.unpaidLeaveDays += 1; continue }
      if (credited[l.employeeUserId].has(d)) continue
      credited[l.employeeUserId].add(d); v.leaveDays += 1; v.days += 1
    }
  }

  const rows = Object.entries(byUser).map(([id, v]) => {
    const emp = empByUser[id] || {}
    const ot = Number(emp.overtimeRate) || 0
    const dep = (emp.department || v.department || '').trim() || NO_DEPT
    const daily = effectiveDailyWage(emp, start)
    return {
      id, name: emp.fullName || v.name, department: dep, jobTitle: emp.jobTitle || '',
      days: v.days, hours: v.hours, ot: v.extraDays, daily, otRate: ot,
      fridayDays: v.fridayDays, holidayDays: v.holidayDays, leaveDays: v.leaveDays, unpaidLeaveDays: v.unpaidLeaveDays,
      lateCount: v.lateCount, lateMinutes: v.lateMinutes, earlyCount: v.earlyCount,
      wage: v.days * daily + v.extraDays * ot,
    }
  })
  return rows.sort((a, b) => b.wage - a.wage)
}

export function groupByDepartment(rows) {
  const byDept = {}
  for (const r of rows) (byDept[r.department] ||= []).push(r)
  return Object.entries(byDept).map(([name, list]) => ({
    name,
    rows: list,
    totals: list.reduce((t, r) => ({ days: t.days + r.days, hours: t.hours + r.hours, ot: t.ot + r.ot, wage: t.wage + r.wage }), { days: 0, hours: 0, ot: 0, wage: 0 }),
  })).sort((a, b) => a.name.localeCompare(b.name, 'ar'))
}
