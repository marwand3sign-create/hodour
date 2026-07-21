import { team } from './lib/team'

export const EMBLEM = 'https://api.whacka.app/storage/v1/object/public/app-images/5682ec9c-0981-4d03-8703-288cf27f4803/d2adf5a0-4856-46e9-aec2-9be6eff30a9d.png'

export const ROLES = [
  { name: 'employee', label: 'موظف' },
  { name: 'manager', label: 'مدير', admin: true },
]

// Explicit Arabic labels for the platform team-admin panel — passed so it always
// renders in Arabic regardless of the device language / dir detection.
export const TEAM_LABELS_AR = {
  title: 'الفريق',
  subtitle: 'إدارة من يمكنه تسجيل الدخول وما يمكنه فعله.',
  close: 'إغلاق',
  deniedTitle: 'ليست لديك صلاحية إدارة الفريق.',
  deniedBody: 'اطلب من المشرف منحك الصلاحية.',
  goBack: 'رجوع',
  tabMembers: 'الأعضاء',
  tabAdd: 'إضافة',
  tabRequests: 'الطلبات',
  tabSignIn: 'الدخول',
  membersLoadError: 'تعذر تحميل الأعضاء',
  membersEmpty: 'لا يوجد أعضاء بعد. أضف شخصًا من تبويب «إضافة أشخاص».',
  memberFallback: 'عضو',
  disabledBadge: 'موقوف',
  ownerBadge: 'المالك',
  save: 'حفظ',
  resetPin: 'إعادة تعيين الرقم السري',
  resetPassword: 'إعادة تعيين كلمة المرور',
  reEnable: 'إعادة تفعيل',
  disable: 'إيقاف',
  actionFailed: 'فشل الإجراء',
  adminAlwaysManages: 'دور «admin» يدير الفريق دائمًا',
  roleAppliesTo: 'ينطبق على كل من يحمل دور «{role}»',
  canManageRole: 'يمكنه إدارة الفريق (كل من يحمل دور «{role}»)',
  tempPin: 'الرقم السري المؤقت:',
  tempPassword: 'كلمة المرور المؤقتة:',
  methodLink: 'دعوة برابط',
  methodPassword: 'إنشاء حساب دخول',
  methodImport: 'رفع ملف',
  introLinkPin: 'اختر اسم المستخدم والدور ثم أرسل الرابط — وسيختار هو رقمه السري المكوّن من 6 أرقام.',
  introLink: 'اختر اسم المستخدم والدور ثم أرسل الرابط — وسيعيّن هو كلمة مروره.',
  introCredsPin: 'اختر اسم المستخدم ثم سلّمه الرقم السري المُولَّد — دون حاجة لرابط.',
  introCreds: 'اختر اسم المستخدم وكلمة المرور ثم سلّمهما له — دون حاجة لرابط.',
  username: 'اسم المستخدم',
  usernamePlaceholder: 'مثال: sara',
  role: 'الدور',
  expiry: 'الصلاحية',
  expiry30: 'تنتهي خلال 30 يومًا',
  expiry7: 'تنتهي خلال 7 أيام',
  expiryNever: 'لا تنتهي',
  pinLabel: 'الرقم السري (PIN)',
  passwordLabel: 'كلمة المرور',
  optionalHint: '(اختياري)',
  autoGenerate: 'يُولَّد تلقائيًا',
  adding: 'جارٍ الإضافة…',
  createInvite: 'إنشاء دعوة',
  createLogin: 'إنشاء حساب',
  createdHandThese: 'تم إنشاء الحساب — سلّم هذه البيانات إلى @{handle}:',
  appLine: 'التطبيق:',
  usernameLine: 'اسم المستخدم:',
  copyLoginDetails: 'نسخ بيانات الدخول',
  addFailed: 'تعذرت إضافة العضو',
  invitesLoadError: 'تعذر تحميل الدعوات',
  invitesEmpty: 'لا توجد دعوات بعد.',
  inviteAccepted: 'مقبولة',
  invitePending: 'قيد الانتظار',
  inviteExpired: 'منتهية',
  copyInviteLink: 'نسخ رابط الدعوة',
  revoke: 'إلغاء',
  selfSignupTitle: 'السماح بطلبات الانضمام',
  selfSignupBody: 'عند التفعيل، يمكن لأي شخص لديه رابط التطبيق طلب حساب — وتوافق أنت على كل طلب أدناه.',
  requestsLoadError: 'تعذر تحميل الطلبات',
  updateFailed: 'تعذر التحديث',
  rejectAllConfirm: 'رفض جميع الطلبات المعلقة ({count})؟ سيتم حذفها نهائيًا.',
  rejectAll: 'رفض الكل',
  noPending: 'لا توجد طلبات معلقة حاليًا.',
  turnOnHint: 'فعّل «طلبات الانضمام» أعلاه للسماح للناس بطلب حساب.',
  pendingOne: 'طلب معلق',
  pendingMany: 'طلبات معلقة',
  roleToGive: 'الدور الذي سيُمنح',
  approve: 'موافقة',
  reject: 'رفض',
  pinModeTitle: 'تسجيل الدخول برقم سري (PIN)',
  pinModeBody: 'تحصل الحسابات الجديدة على رقم سري من 6 أرقام بدلًا من كلمة المرور — الأسهل للموظفين والطلاب. كلمات المرور الحالية تظل صالحة؛ أعد تعيين أي عضو لتحويله إلى رقم سري.',
  pickerTitle: 'تسجيل الدخول باختيار الاسم',
  pickerBody: 'تعرض شاشة الدخول قائمة الأعضاء ليضغط كل شخص على اسمه بدلًا من كتابة اسم المستخدم. يمكن لأي شخص يفتح التطبيق رؤية هذه القائمة — مناسب لفصل دراسي أو فريق صغير؛ اتركه مغلقًا إذا كانت قائمة الأعضاء خاصة.',
  importIntroPin: 'ارفع جدول بيانات (‎.csv أو ‎.xlsx) بموظفيك، وحدد العمود الذي يحوي اسم المستخدم، وأنشئ جميع الحسابات دفعة واحدة. تُولَّد الأرقام السرية لتسليمها.',
  importIntro: 'ارفع جدول بيانات (‎.csv أو ‎.xlsx) بموظفيك، وحدد العمود الذي يحوي اسم المستخدم، وأنشئ جميع الحسابات دفعة واحدة. تُولَّد كلمات المرور لتسليمها.',
  fileNoRows: 'الملف لا يحتوي على صفوف.',
  fileReadError: 'تعذرت قراءة الملف.',
  reading: 'جارٍ القراءة…',
  chooseFile: 'اختر ملف ‎.csv أو ‎.xlsx',
  rowsFound: 'تم العثور على {count} صفًا — حدد الأعمدة:',
  usernameCol: 'اسم المستخدم *',
  displayNameCol: 'الاسم الظاهر',
  roleCol: 'عمود الدور',
  roleForAll: 'الدور للجميع',
  noneOption: '— بدون —',
  selectColumn: 'اختر العمود',
  creating: 'جارٍ الإنشاء…',
  createLogins: 'إنشاء {count} حسابًا',
  noUsableRows: 'لا توجد صفوف صالحة — اختر العمود الذي يحوي اسم المستخدم.',
  importCap: 'الملف يحتوي {count} صفًا؛ الحد 100 في المرة الواحدة. قسّم الملف.',
  createdCount: 'تم إنشاء {count} حسابًا',
  skippedCount: ' · تم تخطي {count}',
  copyAllLogins: 'نسخ جميع الحسابات',
  importAnother: 'استيراد ملف آخر',
  importFailed: 'فشل الاستيراد.',
  copied: 'تم النسخ',
  copy: 'نسخ',
}

export const WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
export const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

// Fallback standard working hours per day before overtime kicks in
export const STANDARD_HOURS = 8

// Default shift schedule used until the manager configures one in Setup.
export const DEFAULT_SHIFT = { startTime: '09:00', endTime: '17:00', graceMinutes: 15 }

// Number of scheduled work hours in a shift (handles overnight shifts).
export function shiftHours(shift) {
  const s = shift || DEFAULT_SHIFT
  const [sh, sm] = String(s.startTime || '09:00').split(':').map(Number)
  const [eh, em] = String(s.endTime || '17:00').split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins <= 0) mins += 24 * 60
  return mins / 60
}

// Converts overtime hours worked into a fraction of a full extra day, using the
// shift's own length as "one day" — overtime is paid as a day-rate, not an hourly rate.
export function overtimeDays(hours, shift) {
  const h = shiftHours(shift)
  if (!h) return 0
  return (Number(hours) || 0) / h
}

// Number of calendar days in the month a "YYYY-MM-DD" date falls in —
// the divisor for turning a monthly salary into an effective daily rate.
export function daysInMonth(dateStr) {
  const d = new Date(dateStr || todayStr())
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

// Every Friday date ("YYYY-MM-DD") in [start, end] — monthly-salary employees
// are paid for Fridays as a rest day even without clocking in (see
// Reports.jsx). getDay() === 5 is Friday.
export function fridaysInRange(start, end) {
  const out = []
  const d = new Date(start + 'T00:00:00')
  const last = new Date(end + 'T00:00:00')
  while (d <= last) {
    if (d.getDay() === 5) out.push(todayStr(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

// Some employees are paid a fixed monthly salary instead of a per-day rate
// (see employees.wageType/monthlySalary) — this reduces either shape to the
// per-day figure Reports.jsx's payroll math already works in. `periodStart`
// picks which month's day-count to divide by (a monthly salary paid this
// January is a different day-rate than the same salary in February).
export function effectiveDailyWage(employee, periodStart) {
  if (employee?.wageType === 'monthly') {
    return (Number(employee.monthlySalary) || 0) / daysInMonth(periodStart)
  }
  return Number(employee?.dailyWage) || 0
}

// A department can override the company-wide shift (e.g. one department
// 6am-2pm, another 6am-5pm — see Setup.jsx's department shift editor).
// Falls back to the global shift when the department has no override, or
// isn't found (deleted, or the employee has no department set).
export function resolveShift(departmentName, departments, globalShift) {
  const dep = (departments || []).find(d => d.name === departmentName)
  if (dep?.startTime && dep?.endTime) {
    return { startTime: dep.startTime, endTime: dep.endTime, graceMinutes: dep.graceMinutes ?? globalShift?.graceMinutes ?? DEFAULT_SHIFT.graceMinutes }
  }
  return globalShift || DEFAULT_SHIFT
}

// Minutes an arrival is late vs the shift start (after the grace period). 0 = on time.
export function lateMinutes(checkInIso, shift) {
  if (!checkInIso) return 0
  const s = shift || DEFAULT_SHIFT
  const [sh, sm] = String(s.startTime || '09:00').split(':').map(Number)
  const grace = Number(s.graceMinutes) || 0
  const d = new Date(checkInIso)
  const startMins = sh * 60 + sm + grace
  const inMins = d.getHours() * 60 + d.getMinutes()
  return Math.max(0, inMins - startMins)
}

// e.g. "9:00 ص" from a "HH:MM" string
export function fmtClock(hhmm) {
  if (!hhmm) return '—'
  const [h0, m] = String(hhmm).split(':')
  let h = Number(h0)
  const period = h < 12 ? 'ص' : 'م'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${period}`
}

let _gid = null
export async function groupId() {
  if (_gid) return _gid
  _gid = await team.groupId()
  return _gid
}

export function todayStr(d = new Date()) {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  let h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const period = h < 12 ? 'ص' : 'م'
  h = h % 12 || 12
  return `${h}:${m} ${period}`
}

export function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`
}

// e.g. "الإثنين، 12/03/2026"
export function fmtDateLong(d = new Date()) {
  const x = new Date(d)
  const day = String(x.getDate()).padStart(2, '0')
  const month = String(x.getMonth() + 1).padStart(2, '0')
  return `${WEEKDAYS_AR[x.getDay()]}، ${day}/${month}/${x.getFullYear()}`
}

export function hoursBetween(a, b) {
  if (!a || !b) return 0
  return Math.max(0, (new Date(b) - new Date(a)) / 3600000)
}

export function money(n) {
  const v = Number(n) || 0
  return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

// Thresholds for the manager's smart-alerts panel — how many times a pattern
// must repeat within the lookback window before it's flagged as "recurring".
export const ALERT_LOOKBACK_DAYS = 30
export const ALERT_THRESHOLDS = { late: 3, earlyLeave: 3, absence: 3 }

// Scans raw attendance records + the employee roster and surfaces recurring
// behavior patterns a manager would otherwise have to dig out of the reports
// manually: repeated lateness, repeated early departure, repeated absence.
// Absence is derived from the company's OWN calendar (days someone actually
// clocked in) rather than a hardcoded weekend, so it adapts to any work week.
export function computeSmartAlerts(attendance, employees, shift) {
  const today = todayStr()
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - ALERT_LOOKBACK_DAYS)
  const cutoffStr = todayStr(cutoff)
  const recent = (attendance || []).filter(r => r.date >= cutoffStr && r.date < today)

  const byEmployee = {}
  const ensure = (uid, name) => {
    if (!byEmployee[uid]) byEmployee[uid] = { userId: uid, name, late: [], early: [], daysPresent: new Set() }
    return byEmployee[uid]
  }

  const workingDays = new Set() // any day where at least one person clocked in
  for (const r of recent) {
    if (!r.employeeUserId) continue
    const bucket = ensure(r.employeeUserId, r.employeeName)
    bucket.daysPresent.add(r.date)
    workingDays.add(r.date)
    if (Number(r.lateMinutes) > 0) bucket.late.push(r.date)
    if (r.checkOut) {
      const worked = Number(r.workedHours) || 0
      const expected = shiftHours(shift)
      if (expected - worked > 0.5) bucket.early.push(r.date)
    }
  }

  const alerts = []
  const activeEmployees = (employees || []).filter(e => e.userId)
  for (const e of activeEmployees) {
    const b = byEmployee[e.userId] || ensure(e.userId, e.fullName)
    b.name = e.fullName || b.name
    // Only count working days that occurred after this person joined, so brand-new hires
    // aren't flagged absent for days before they existed.
    const joined = e.createdAt ? todayStr(new Date(e.createdAt)) : cutoffStr
    const absentDays = [...workingDays].filter(d => d >= joined && !b.daysPresent.has(d))

    if (b.late.length >= ALERT_THRESHOLDS.late) {
      alerts.push({ userId: e.userId, name: b.name, type: 'late', count: b.late.length, lastDate: b.late.sort().at(-1) })
    }
    if (b.early.length >= ALERT_THRESHOLDS.earlyLeave) {
      alerts.push({ userId: e.userId, name: b.name, type: 'earlyLeave', count: b.early.length, lastDate: b.early.sort().at(-1) })
    }
    if (absentDays.length >= ALERT_THRESHOLDS.absence) {
      alerts.push({ userId: e.userId, name: b.name, type: 'absence', count: absentDays.length, lastDate: absentDays.sort().at(-1) })
    }
  }

  return alerts.sort((a, b) => b.count - a.count)
}

// Best-effort fake/mock-GPS detection. IMPORTANT LIMITATION: a browser cannot see
// whether a coordinate came from a spoofing app — that happens below the web
// layer (Android mock-location providers, jailbreak GPS spoofers). These are
// heuristic signals for the manager to review, not a guaranteed detector:
//  - 'identical-fix': several live GPS samples taken seconds apart returned the
//    exact same coordinate with zero jitter — real GPS chips have tiny receiver
//    noise even standing still; a static replayed/injected fix does not.
//  - 'teleport': the distance from this employee's last known check-in/out point
//    implies an impossible travel speed for the time elapsed.
export function detectGpsAnomalies({ samples, lastFix, now }) {
  const reasons = []
  if (samples && samples.length >= 3) {
    let maxJitter = 0
    for (let i = 1; i < samples.length; i++) {
      const d = distanceMeters(samples[0].lat, samples[0].lng, samples[i].lat, samples[i].lng)
      if (d > maxJitter) maxJitter = d
    }
    if (maxJitter === 0) reasons.push('identical-fix')
  }
  const cur = samples && samples[0]
  if (lastFix && lastFix.lat != null && lastFix.lng != null && lastFix.time && cur) {
    const dist = distanceMeters(lastFix.lat, lastFix.lng, cur.lat, cur.lng)
    const hours = Math.max((new Date(now) - new Date(lastFix.time)) / 3600000, 1 / 3600)
    const speedKmh = (dist / 1000) / hours
    if (speedKmh > 250) reasons.push('teleport')
  }
  return { reasons, suspicious: reasons.length > 0, blocked: reasons.includes('teleport') }
}

export const GPS_FLAG_LABELS = {
  'identical-fix': 'إحداثيات متطابقة تمامًا دون أي تذبذب طبيعي للإشارة — إشارة محتملة على موقع مزيّف',
  'teleport': 'انتقال مسافة كبيرة جدًا خلال وقت قصير جدًا — سرعة غير واقعية',
}

// Haversine distance in meters between two lat/lng points
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
