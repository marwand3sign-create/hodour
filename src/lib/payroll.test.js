import { describe, it, expect, vi } from 'vitest'

// store.js pulls in the Supabase-backed team client; payroll logic never uses it.
vi.mock('./team', () => ({ team: {} }))

const { computePayroll, groupByDepartment, datesInRange } = await import('./payroll')
const store = await import('../store')

const emp = (over = {}) => ({ userId: 'u1', fullName: 'علي', department: 'مبيعات', wageType: 'daily', dailyWage: 100, overtimeRate: 150, active: true, createdAt: '2026-01-01T00:00:00Z', ...over })
const rec = (date, over = {}) => ({ employeeUserId: 'u1', employeeName: 'علي', department: 'مبيعات', date, checkOut: date + 'T17:00:00', workedHours: 8, lateMinutes: 0, ...over })
// Mon 2 Nov 2026 .. Sun 8 Nov 2026 (Fri = 6 Nov)
const P = { start: '2026-11-02', end: '2026-11-08' }

describe('computePayroll — daily wage', () => {
  it('pays one daily wage per worked record', () => {
    const [r] = computePayroll({ employees: [emp()], records: [rec('2026-11-02'), rec('2026-11-03')], ...P })
    expect(r.days).toBe(2)
    expect(r.wage).toBe(200)
  })

  it('ignores records without a check-out', () => {
    const rows = computePayroll({ employees: [emp()], records: [rec('2026-11-02', { checkOut: null })], ...P })
    expect(rows).toHaveLength(0)
  })

  it('pays manager-added extra days at the overtime rate, not as normal days', () => {
    const [r] = computePayroll({ employees: [emp()], records: [rec('2026-11-02'), rec('2026-11-03', { isManual: true })], ...P })
    expect(r.days).toBe(1)
    expect(r.ot).toBe(1)
    expect(r.wage).toBe(100 + 150)
  })

  it('does not pay Fridays to daily-wage staff', () => {
    const rows = computePayroll({ employees: [emp()], records: [rec('2026-11-02')], ...P })
    expect(rows[0].fridayDays).toBe(0)
  })
})

describe('computePayroll — monthly salary', () => {
  const monthly = emp({ wageType: 'monthly', monthlySalary: 3000, dailyWage: 0 }) // November: 30 days → 100/day

  it('appears with zero records and is paid the Friday in the period', () => {
    const [r] = computePayroll({ employees: [monthly], records: [], ...P })
    expect(r.fridayDays).toBe(1)
    expect(r.daily).toBeCloseTo(100)
    expect(r.wage).toBeCloseTo(100)
  })

  it('does not double-count a Friday they clocked in on', () => {
    const [r] = computePayroll({ employees: [monthly], records: [rec('2026-11-06')], ...P })
    expect(r.days).toBe(1)
    expect(r.fridayDays).toBe(0)
  })

  it('uses the day-count of the period start month', () => {
    const feb = emp({ wageType: 'monthly', monthlySalary: 2800, dailyWage: 0 })
    const [r] = computePayroll({ employees: [feb], records: [], start: '2026-02-01', end: '2026-02-07' })
    expect(r.daily).toBeCloseTo(100) // 2800 / 28
  })
})

describe('computePayroll — holidays', () => {
  it('credits a paid holiday to every active employee who existed', () => {
    const rows = computePayroll({ employees: [emp()], records: [], holidays: [{ date: '2026-11-03', name: 'عيد', paid: true }], ...P })
    expect(rows[0].holidayDays).toBe(1)
    expect(rows[0].wage).toBe(100)
  })

  it('does not pay an unpaid holiday', () => {
    const rows = computePayroll({ employees: [emp()], records: [], holidays: [{ date: '2026-11-03', name: 'x', paid: false }], ...P })
    expect(rows).toHaveLength(0)
  })

  it('does not double-pay a holiday that was worked', () => {
    const [r] = computePayroll({ employees: [emp()], records: [rec('2026-11-03')], holidays: [{ date: '2026-11-03', name: 'عيد', paid: true }], ...P })
    expect(r.days).toBe(1)
    expect(r.holidayDays).toBe(0)
  })

  it('skips holidays before the employee was created, and inactive staff', () => {
    const rows = computePayroll({
      employees: [emp({ createdAt: '2026-11-05T00:00:00Z' }), emp({ userId: 'u2', fullName: 'موقوف', active: false })],
      records: [], holidays: [{ date: '2026-11-03', name: 'عيد', paid: true }], ...P,
    })
    expect(rows).toHaveLength(0)
  })

  it('does not create zero-wage rows for accounts with no wage (e.g. owner)', () => {
    const rows = computePayroll({ employees: [emp({ userId: 'boss', fullName: 'مالك', dailyWage: 0 })], records: [], holidays: [{ date: '2026-11-03', name: 'x', paid: true }], ...P })
    expect(rows).toHaveLength(0)
  })

  it('does not credit a holiday outside the period', () => {
    const rows = computePayroll({ employees: [emp()], records: [], holidays: [{ date: '2026-12-25', name: 'x', paid: true }], ...P })
    expect(rows).toHaveLength(0)
  })

  it('a holiday on a monthly staffer\'s Friday is paid once', () => {
    const m = emp({ wageType: 'monthly', monthlySalary: 3000, dailyWage: 0 })
    const [r] = computePayroll({ employees: [m], records: [], holidays: [{ date: '2026-11-06', name: 'x', paid: true }], ...P })
    expect(r.days).toBe(1)
  })
})

describe('computePayroll — leaves', () => {
  const leave = (over = {}) => ({ employeeUserId: 'u1', startDate: '2026-11-03', endDate: '2026-11-05', paid: true, type: 'annual', ...over })

  it('pays each day of a paid leave', () => {
    const [r] = computePayroll({ employees: [emp()], records: [], leaves: [leave()], ...P })
    expect(r.leaveDays).toBe(3)
    expect(r.wage).toBe(300)
  })

  it('does not pay unpaid leave but reports it', () => {
    const rows = computePayroll({ employees: [emp()], records: [rec('2026-11-02')], leaves: [leave({ paid: false })], ...P })
    expect(rows[0].days).toBe(1)
    expect(rows[0].unpaidLeaveDays).toBe(3)
  })

  it('clips a leave that spills outside the period', () => {
    const [r] = computePayroll({ employees: [emp()], records: [], leaves: [leave({ startDate: '2026-10-30', endDate: '2026-11-03' })], ...P })
    expect(r.leaveDays).toBe(2) // 2 and 3 Nov
  })

  it('does not pay a leave day that was also worked', () => {
    const [r] = computePayroll({ employees: [emp()], records: [rec('2026-11-04')], leaves: [leave()], ...P })
    expect(r.days).toBe(3) // 3 Nov leave, 4 Nov worked, 5 Nov leave
    expect(r.leaveDays).toBe(2)
  })

  it('does not double-pay a leave overlapping a holiday', () => {
    const [r] = computePayroll({ employees: [emp()], records: [], leaves: [leave()], holidays: [{ date: '2026-11-04', name: 'x', paid: true }], ...P })
    expect(r.days).toBe(3)
  })

  it('ignores leaves for unknown employees', () => {
    expect(computePayroll({ employees: [emp()], records: [], leaves: [leave({ employeeUserId: 'ghost' })], ...P })).toHaveLength(0)
  })
})

describe('computePayroll — lateness', () => {
  it('counts late arrivals and minutes', () => {
    const [r] = computePayroll({ employees: [emp()], records: [rec('2026-11-02', { lateMinutes: 20 }), rec('2026-11-03', { lateMinutes: 5 }), rec('2026-11-04')], ...P })
    expect(r.lateCount).toBe(2)
    expect(r.lateMinutes).toBe(25)
  })

  it('counts early departures but not auto-closed records', () => {
    const [r] = computePayroll({ employees: [emp()], records: [rec('2026-11-02', { workedHours: 5 }), rec('2026-11-03', { workedHours: 5, autoClosed: true })], ...P })
    expect(r.earlyCount).toBe(1)
  })
})

describe('groupByDepartment / datesInRange', () => {
  it('totals wages per department', () => {
    const rows = computePayroll({
      employees: [emp(), emp({ userId: 'u2', fullName: 'سارة', department: 'إدارة', dailyWage: 200 })],
      records: [rec('2026-11-02'), rec('2026-11-02', { employeeUserId: 'u2', employeeName: 'سارة', department: 'إدارة' })], ...P,
    })
    const g = groupByDepartment(rows)
    expect(g.map(x => x.name).sort()).toEqual(['إدارة', 'مبيعات'].sort())
    expect(g.find(x => x.name === 'إدارة').totals.wage).toBe(200)
  })

  it('lists inclusive dates', () => {
    expect(datesInRange('2026-11-01', '2026-11-03')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
  })
})

describe('store helpers', () => {
  it('shiftHours handles overnight shifts', () => {
    expect(store.shiftHours({ startTime: '22:00', endTime: '06:00' })).toBe(8)
  })
  it('lateMinutes respects grace', () => {
    const d = new Date(2026, 10, 2, 9, 20).toISOString()
    expect(store.lateMinutes(d, { startTime: '09:00', graceMinutes: 15 })).toBe(5)
    expect(store.lateMinutes(new Date(2026, 10, 2, 9, 10).toISOString(), { startTime: '09:00', graceMinutes: 15 })).toBe(0)
  })
  it('clockOutAllowedAt adds the minimum hours', () => {
    const t = store.clockOutAllowedAt('2026-11-02T08:00:00.000Z', { minHoursBeforeOut: 4 })
    expect(t).toBe('2026-11-02T12:00:00.000Z')
  })
  it('flags teleporting GPS fixes as blocked and identical fixes as suspicious', () => {
    const fix = { lat: 33.3, lng: 44.4 }
    expect(store.detectGpsAnomalies({ samples: [fix, fix, fix], now: Date.now() }).suspicious).toBe(true)
    const far = store.detectGpsAnomalies({ samples: [{ lat: 40, lng: 50 }], lastFix: { ...fix, time: new Date(Date.now() - 60000).toISOString() }, now: Date.now() })
    expect(far.blocked).toBe(true)
  })
})

describe('computeSmartAlerts — excused absences', () => {
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return store.todayStr(d) }
  const attendance = [1, 2, 3, 4].map(n => ({ employeeUserId: 'other', employeeName: 'زميل', date: day(n), checkOut: 'x', workedHours: 8 }))
  const staff = [{ userId: 'u1', fullName: 'علي', createdAt: '2020-01-01T00:00:00Z' }]
  const shift = { startTime: '09:00', endTime: '17:00', graceMinutes: 15 }

  it('flags recurring absence without excuses', () => {
    const a = store.computeSmartAlerts(attendance, staff, shift).filter(x => x.userId === 'u1' && x.type === 'absence')
    expect(a[0].count).toBe(4)
  })

  it('ignores days covered by leave or a public holiday', () => {
    const excuses = { leaves: [{ employeeUserId: 'u1', startDate: day(4), endDate: day(3) }], holidays: [{ date: day(2) }] }
    const a = store.computeSmartAlerts(attendance, staff, shift, excuses).filter(x => x.userId === 'u1' && x.type === 'absence')
    expect(a).toHaveLength(0) // only 1 absent day left, below the threshold
  })
})
