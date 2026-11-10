import { useEffect, useRef, useState } from 'react'
import { ScanFace, Loader2, LogIn, LogOut, UserX, Users, CloudOff, CloudUpload, MapPin, Eye, Power, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../lib/_supabaseClient'
import { db } from '../../lib/db'
import { auth } from '../../lib/auth'
import { storage } from '../../lib/storage'
import { offlineQueue } from '../../lib/offlineQueue'
import { localCache, isNetworkError } from '../../lib/localCache'
import { loadModels, quickDetect, analyzeFrame, rank, classify, createBlinkDetector, scoreFromDistance } from '../../lib/faceId'
import { EMBLEM, todayStr, fmtTime, fmtDateLong, hoursBetween, shiftHours, lateMinutes, resolveShift, DEFAULT_SHIFT, distanceMeters } from '../../store'

/*
 * Shared gate device ("kiosk"). One account, one tablet at the site entrance:
 * workers walk up one after another and each is identified by face among all
 * enrolled workers, then clocked in (or out, if already in).
 *
 * Built for a queue of workers:
 *  - A cheap detector runs every frame; the expensive 128-d recognition only
 *    runs once a single, close-enough face is in view.
 *  - Two consecutive matching frames are enough to accept a confident match.
 *  - Recording is instant: it's written to the on-device queue first (same
 *    path as offline) and uploaded in the background, so the screen is ready
 *    for the next person ~1.5 s later.
 *  - A worker who was just recorded and is still in frame is silently skipped
 *    (no duplicate, no blocking message) so the next person can step in.
 *
 * Safety:
 *  - Lookalikes: when the best match isn't clearly better than the next
 *    worker, the worker picks their own name; that record is flagged
 *    (face_mismatch) for the manager to review with the photo.
 *  - Every record carries the captured photo.
 *  - Optional blink liveness (REQUIRE_BLINK) — off by default for speed.
 */

const REQUIRE_BLINK = false // true = worker must blink before recording (slower, stops printed photos)
const CONSENSUS_FRAMES = 2
const DECIDE_AFTER_FRAMES = 4 // full-recognition frames before falling back to "pick your name"/unknown
const GREETING_MS = 1600 // how long the "مرحبًا فلان" card stays up
const NEXT_READY_MS = 1200 // scanning resumes after this (overlaps the greeting fade)
const REPEAT_GUARD_MS = 2 * 60 * 1000 // same worker again within 2 min → ignored
const MIN_FACE_PX = 80
const ROSTER_KEY = 'kiosk:roster'

export default function Kiosk() {
  const videoRef = useRef(null)
  const runRef = useRef(true)
  const busyRef = useRef(false)
  const blinkRef = useRef(createBlinkDetector())
  const framesRef = useRef([])
  const lastSeenRef = useRef(0)
  const cooldownRef = useRef(0)
  const greetTimerRef = useRef(null)

  const rosterRef = useRef([])
  const ctxRef = useRef({ shift: DEFAULT_SHIFT, departments: [], records: [], geo: null })
  const queueRef = useRef([])
  const recentRef = useRef(new Map()) // userId → time recorded on this device
  const syncingRef = useRef(false)
  const syncAgainRef = useRef(false)

  const [now, setNow] = useState(new Date())
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [rosterCount, setRosterCount] = useState(0)
  const [status, setStatus] = useState({ kind: 'idle' })
  const [greeting, setGreeting] = useState(null)
  const [log, setLog] = useState([]) // last few recorded workers
  const [geo, setGeo] = useState({ status: 'checking' })
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)

  // ---- data -------------------------------------------------------------
  async function loadRoster() {
    try {
      const { data, error } = await supabase.rpc('kiosk_roster')
      if (error) throw error
      const rows = (data || []).map((r) => ({
        userId: r.user_id, fullName: r.full_name, department: r.department, jobTitle: r.job_title,
        referencePhoto: r.reference_photo, faceDescriptors: r.face_descriptors || [],
      }))
      localCache.set(ROSTER_KEY, rows)
      rosterRef.current = rows
    } catch {
      rosterRef.current = (await localCache.get(ROSTER_KEY)) || rosterRef.current
    }
    setRosterCount(rosterRef.current.filter((p) => p.faceDescriptors?.length).length)
  }

  async function loadContext() {
    const [settings, departments, locations, openRecs, todayRecs] = await Promise.all([
      db.selectShared('settings', { key: 'shift' }, { limit: 1 }).catch(() => []),
      db.selectShared('departments', {}, { limit: 200 }).catch(() => []),
      db.selectShared('locations', {}, { limit: 100 }).catch(() => []),
      db.selectAllShared('attendance', { status: 'in' }).catch(() => []),
      db.selectAllShared('attendance', { date: todayStr() }).catch(() => []),
    ])
    const byId = new Map()
    for (const r of [...openRecs, ...todayRecs]) byId.set(r.id, r)
    ctxRef.current = {
      ...ctxRef.current,
      shift: settings?.[0] ? { ...DEFAULT_SHIFT, ...settings[0] } : DEFAULT_SHIFT,
      departments: departments || [],
      locations: locations || [],
      records: [...byId.values()],
    }
  }

  async function refreshQueue() {
    queueRef.current = await offlineQueue.list().catch(() => [])
    setPending(queueRef.current.length)
  }

  // ---- location of the device ---------------------------------------------
  async function checkGeo() {
    const locations = ctxRef.current.locations || []
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }))
      const { latitude: lat, longitude: lng, accuracy } = pos.coords
      if (!locations.length) { setGeoState({ status: 'ok', lat, lng, accuracy, locationName: 'بدون نطاق جغرافي', distance: 0 }); return }
      let best = null
      for (const loc of locations) {
        const d = distanceMeters(lat, lng, Number(loc.lat), Number(loc.lng))
        if (!best || d < best.d) best = { d, loc }
      }
      const radius = Number(best.loc.radius) || 150
      const ok = best.d <= radius + Math.min(accuracy || 0, 60)
      setGeoState({ status: ok ? 'ok' : 'far', lat, lng, accuracy, locationName: best.loc.name, distance: Math.round(best.d), radius })
    } catch {
      // Indoor tablets often can't get a fix — don't lock everyone out; the
      // records are marked so the manager knows the location wasn't verified.
      setGeoState({ status: 'unknown' })
    }
  }
  function setGeoState(g) { ctxRef.current.geo = g; setGeo(g) }

  // ---- background upload ------------------------------------------------------
  async function uploadFace(blob, userId, tag) {
    if (!blob) return null
    try { const { url } = await storage.upload(blob, `face-${userId}-${tag}.jpg`); return url } catch (e) {
      if (isNetworkError(e)) throw e
      return null
    }
  }

  async function syncQueue() {
    if (!navigator.onLine) return
    if (syncingRef.current) { syncAgainRef.current = true; return }
    syncingRef.current = true
    setSyncing(true)
    try {
      do {
        syncAgainRef.current = false
        const items = await offlineQueue.list()
        const idMap = {}
        for (const item of items) {
          try {
            const uid = item.employeeUserId || item.payload?.employeeUserId
            if (item.kind === 'clockIn') {
              const faceSnapshot = await uploadFace(item.blob, uid, item.createdAt)
              const inserted = await db.insertShared('attendance', { ...item.payload, faceSnapshot })
              idMap[item.localId] = inserted.id
            } else {
              const targetId = item.attendanceId || idMap[item.clockInLocalId]
              if (!targetId) throw new Error('clock-out target not synced yet')
              const outFaceSnapshot = await uploadFace(item.blob, uid, item.createdAt)
              await db.updateShared('attendance', targetId, { ...item.payload, outFaceSnapshot })
            }
            await offlineQueue.remove(item.localId)
          } catch { break }
        }
        await loadContext().catch(() => {})
        await refreshQueue()
      } while (syncAgainRef.current && navigator.onLine)
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }

  // ---- who is in right now (server + not-yet-synced local actions) ---------
  function stateOf(userId) {
    const q = queueRef.current
    const closedTargets = new Set(q.filter((i) => i.kind === 'clockOut').map((i) => i.attendanceId || i.clockInLocalId))
    const pendingIn = q.find((i) => i.kind === 'clockIn' && i.payload.employeeUserId === userId && !closedTargets.has(i.localId))
    if (pendingIn) return { open: { localId: pendingIn.localId, ...pendingIn.payload }, lastAt: pendingIn.createdAt }
    const mine = ctxRef.current.records.filter((r) => r.employeeUserId === userId)
    const open = mine.find((r) => r.status === 'in' && !closedTargets.has(r.id))
    const times = [
      recentRef.current.get(userId) || 0,
      ...mine.map((r) => Date.parse(r.checkOut || r.checkIn || 0) || 0),
      ...q.filter((i) => (i.employeeUserId || i.payload?.employeeUserId) === userId).map((i) => i.createdAt),
    ]
    return { open: open || null, lastAt: Math.max(0, ...times) }
  }

  const justRecorded = (userId) => Date.now() - stateOf(userId).lastAt < REPEAT_GUARD_MS

  // ---- record (instant: local queue first, upload in background) ------------
  async function record(person, { d, flagged }) {
    const { open } = stateOf(person.userId)
    const blob = await snapshot(videoRef.current)
    const g = ctxRef.current.geo || { status: 'unknown' }
    const geoReason = g.status === 'unknown' ? 'تعذّر تحديد موقع جهاز البوابة' : null
    const score = d != null ? scoreFromDistance(d) : null
    const shift = resolveShift(person.department, ctxRef.current.departments, ctxRef.current.shift)
    const nowIso = new Date().toISOString()
    let item, result

    if (open) {
      const worked = hoursBetween(open.checkIn, nowIso)
      const payload = {
        checkOut: nowIso, workedHours: worked, status: 'out',
        overtimeHours: Math.round(Math.max(0, worked - shiftHours(shift)) * 100) / 100,
        outLat: g.lat ?? null, outLng: g.lng ?? null,
        outFaceMatchScore: score, outFaceMismatch: !!flagged,
        gpsSuspicious: !!open.gpsSuspicious,
        gpsFlagReason: open.gpsFlagReason || (geoReason ? `عند الخروج: ${geoReason}` : null),
      }
      item = { localId: crypto.randomUUID(), kind: 'clockOut', createdAt: Date.now(), payload, blob, employeeUserId: person.userId, attendanceId: open.id || null, clockInLocalId: open.localId || null }
      result = { action: 'out', worked }
    } else {
      const payload = {
        employeeUserId: person.userId,
        employeeName: person.fullName || 'موظف',
        department: person.department || '',
        jobTitle: person.jobTitle || '',
        date: todayStr(), checkIn: nowIso, lateMinutes: lateMinutes(nowIso, shift),
        checkOut: null, workedHours: 0, overtimeHours: 0,
        gpsLat: g.lat ?? null, gpsLng: g.lng ?? null, gpsAccuracy: g.accuracy ?? null,
        distance: g.distance ?? null, locationName: g.locationName || 'جهاز البوابة',
        faceVerified: true, faceMatchScore: score, faceMismatch: !!flagged,
        status: 'in', gpsSuspicious: false, gpsFlagReason: geoReason,
      }
      item = { localId: crypto.randomUUID(), kind: 'clockIn', createdAt: Date.now(), payload, blob, employeeUserId: person.userId }
      result = { action: 'in', late: payload.lateMinutes }
    }

    try {
      await offlineQueue.enqueue(item)
      queueRef.current = [...queueRef.current, item]
      setPending(queueRef.current.length)
      recentRef.current.set(person.userId, Date.now())
      greet({ person, ...result })
      setLog((l) => [{ id: item.localId, name: person.fullName, action: result.action, at: nowIso }, ...l].slice(0, 5))
      syncQueue() // background — never blocks the next worker
    } catch (e) {
      greet({ error: 'تعذّر الحفظ على الجهاز: ' + (e.message || e) })
    }
  }

  function greet(g) {
    clearTimeout(greetTimerRef.current)
    setGreeting(g)
    setStatus({ kind: 'idle' })
    framesRef.current = []
    blinkRef.current.reset()
    cooldownRef.current = Date.now() + NEXT_READY_MS
    busyRef.current = false
    greetTimerRef.current = setTimeout(() => setGreeting(null), GREETING_MS)
  }

  // ---- camera loop ------------------------------------------------------------
  async function loop() {
    const v = videoRef.current
    while (runRef.current) {
      if (busyRef.current || Date.now() < cooldownRef.current || !v || v.readyState < 2) { await sleep(80); continue }
      if (ctxRef.current.geo?.status === 'far') { await sleep(1000); continue } // device outside work site

      let q
      try { q = await quickDetect(v) } catch { await sleep(150); continue }
      if (busyRef.current) continue

      if (q.count === 0) {
        if (Date.now() - lastSeenRef.current > 800) {
          blinkRef.current.reset(); framesRef.current = []
          setStatus((s) => (s.kind === 'idle' ? s : { kind: 'idle' }))
        }
        await sleep(60)
        continue
      }
      lastSeenRef.current = Date.now()
      if (q.count > 1) { framesRef.current = []; setStatus({ kind: 'multi' }); await sleep(100); continue }
      if (q.box.width < MIN_FACE_PX) { setStatus({ kind: 'closer' }); await sleep(80); continue }

      // One close face → full recognition for this frame.
      let r
      try { r = await analyzeFrame(v) } catch { continue }
      if (!r.face || r.count !== 1 || busyRef.current) continue

      if (REQUIRE_BLINK && !blinkRef.current.push(r.face.ear)) { setStatus({ kind: 'blink' }); continue }

      const c = classify(rank(r.face.descriptor, rosterRef.current))

      // The worker we just recorded is still standing there → skip quietly.
      if (c.kind === 'match' && justRecorded(c.person.userId)) {
        framesRef.current = []
        setStatus({ kind: 'done', person: c.person })
        await sleep(250)
        continue
      }

      framesRef.current.push(c)
      const recent = framesRef.current.slice(-CONSENSUS_FRAMES)
      const sameMatch = recent.length === CONSENSUS_FRAMES && recent.every((x) => x.kind === 'match' && x.person.userId === recent[0].person.userId)
      if (sameMatch) {
        busyRef.current = true
        const avgD = recent.reduce((s, x) => s + x.d, 0) / recent.length
        await record(recent[0].person, { d: avgD, flagged: false })
        continue
      }
      setStatus({ kind: 'scanning' })

      if (framesRef.current.length >= DECIDE_AFTER_FRAMES) {
        // Not a clear single match — collect every plausible candidate across the frames.
        const pool = new Map()
        for (const f of framesRef.current) {
          const list = f.kind === 'match' ? [{ person: f.person, d: f.d }] : f.kind === 'ambiguous' ? f.candidates : []
          for (const cand of list) {
            const prev = pool.get(cand.person.userId)
            if (!prev || cand.d < prev.d) pool.set(cand.person.userId, cand)
          }
        }
        const candidates = [...pool.values()].sort((a, b) => a.d - b.d).slice(0, 3)
        framesRef.current = []
        if (!candidates.length) {
          greet({ unknown: true })
        } else {
          busyRef.current = true
          setStatus({ kind: 'ambiguous', candidates })
          setTimeout(() => {
            setStatus((s) => {
              if (s.kind !== 'ambiguous') return s
              busyRef.current = false
              return { kind: 'idle' }
            })
          }, 15000)
        }
      }
    }
  }

  // ---- lifecycle ------------------------------------------------------------
  useEffect(() => {
    runRef.current = true
    let stream
    ;(async () => {
      try {
        // Camera + models first; roster/context come from the device cache
        // when offline, so none of this waits on the network.
        const camera = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false })
        await Promise.all([loadModels(), loadRoster(), loadContext(), refreshQueue()])
        stream = await camera
        const v = videoRef.current
        v.srcObject = stream
        await v.play()
        setReady(true)
        loop()
        checkGeo()
        syncQueue()
      } catch (e) {
        setError('تعذّر تشغيل الكاميرا أو نموذج التعرف: ' + (e.message || e))
      }
    })()
    const tick = setInterval(() => setNow(new Date()), 1000)
    const refresh = setInterval(() => { loadRoster(); loadContext().catch(() => {}); syncQueue() }, 5 * 60 * 1000)
    const geoTimer = setInterval(checkGeo, 10 * 60 * 1000)
    const retry = setInterval(() => { if (queueRef.current.length) syncQueue() }, 30 * 1000)
    const on = () => { setOnline(true); syncQueue(); loadRoster() }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      runRef.current = false
      stream?.getTracks().forEach((t) => t.stop())
      ;[tick, refresh, geoTimer, retry].forEach(clearInterval)
      clearTimeout(greetTimerRef.current)
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pickCandidate(c) {
    setStatus({ kind: 'idle' })
    record(c.person, { d: c.d, flagged: true }) // chosen by hand → manager reviews the photo
  }
  function noneOfThem() { greet({ unknown: true }) }

  function signOut() {
    if (window.confirm('إيقاف جهاز البوابة وتسجيل الخروج؟')) auth.signOut()
  }

  const blocked = geo.status === 'far'

  // ---- UI -------------------------------------------------------------------
  return (
    <div className="h-full cn-aurora flex flex-col text-white overflow-hidden" dir="rtl">
      <header className="flex items-center justify-between px-4 pt-[calc(var(--sat)+12px)] pb-2">
        <div className="flex items-center gap-2">
          <img src={EMBLEM} alt="" className="w-8 h-8 rounded-lg" />
          <span className="font-display font-bold">Hudour · البوابة</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/60">
          <span className="flex items-center gap-1"><Users size={14} /> {rosterCount}</span>
          {pending > 0 && (
            <span className="flex items-center gap-1 text-amber-300">
              {syncing ? <CloudUpload size={14} className="animate-pulse" /> : <CloudOff size={14} />} {pending}
            </span>
          )}
          {!online && <span className="flex items-center gap-1 text-amber-300"><CloudOff size={14} /> بدون إنترنت</span>}
          <button onClick={signOut} className="p-1.5 text-white/40 hover:text-white" title="خروج"><Power size={16} /></button>
        </div>
      </header>

      <div className="text-center">
        <div className="font-clock text-5xl font-bold text-cyan-300 tabular-nums">{fmtTime(now.toISOString())}</div>
        <div className="text-white/45 text-sm">{fmtDateLong(now)}</div>
      </div>

      <main className="flex-1 flex flex-col items-center justify-center gap-3 px-4 pb-4 min-h-0">
        <div className="relative w-full max-w-md aspect-[3/4] max-h-[55vh] rounded-3xl overflow-hidden bg-black/60 border border-white/10">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover -scale-x-100" />
          {!ready && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
              <Loader2 className="animate-spin" /> جارٍ تجهيز جهاز البوابة…
            </div>
          )}
          {!greeting && <Overlay status={status} />}
          {greeting && <Greeting g={greeting} />}
        </div>

        {error && <div className="text-red-300 text-sm text-center">{error}</div>}
        {blocked && (
          <div className="flex items-center gap-2 text-red-300 text-sm text-center">
            <MapPin size={16} /> الجهاز خارج موقع العمل ({geo.distance} متر عن {geo.locationName}) — التسجيل متوقف
          </div>
        )}
        {ready && rosterCount === 0 && (
          <div className="flex items-center gap-2 text-amber-300 text-sm text-center">
            <AlertTriangle size={16} /> لا توجد بصمات وجه مسجلة بعد — سجّلها من صفحة الموظفين في حساب المدير
          </div>
        )}

        {status.kind === 'ambiguous' && !blocked && (
          <div className="w-full max-w-md space-y-2">
            <div className="text-center text-sm text-amber-200">وجهك يشبه أكثر من شخص — اضغط على اسمك</div>
            <div className="grid grid-cols-1 gap-2">
              {status.candidates.map((c) => (
                <button key={c.person.userId} onClick={() => pickCandidate(c)} className="flex items-center gap-3 cn-glass rounded-2xl p-3 text-right active:scale-[0.98]">
                  <Avatar person={c.person} />
                  <div className="flex-1">
                    <div className="font-semibold">{c.person.fullName}</div>
                    <div className="text-xs text-white/50">{[c.person.jobTitle, c.person.department].filter(Boolean).join(' · ')}</div>
                  </div>
                </button>
              ))}
              <button onClick={noneOfThem} className="py-2.5 rounded-xl bg-white/10 text-white/70 text-sm">لست أيًا منهم</button>
            </div>
          </div>
        )}

        {log.length > 0 && status.kind !== 'ambiguous' && (
          <div className="w-full max-w-md space-y-1">
            {log.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-xs bg-white/5 rounded-lg px-3 py-1.5">
                <span className="flex items-center gap-1.5">
                  {e.action === 'out' ? <LogOut size={13} className="text-indigo-300" /> : <LogIn size={13} className="text-emerald-300" />}
                  {e.name}
                </span>
                <span className="text-white/45 tabular-nums">{fmtTime(e.at)}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function Overlay({ status }) {
  const box = 'absolute inset-x-3 bottom-3 rounded-2xl px-4 py-3 text-center backdrop-blur-md'
  switch (status.kind) {
    case 'idle':
      return <div className={`${box} bg-black/50 text-white/80`}><ScanFace className="inline ml-2" size={18} />قف أمام الكاميرا لتسجيل الحضور</div>
    case 'closer':
      return <div className={`${box} bg-black/50 text-white/80`}>اقترب من الكاميرا قليلًا</div>
    case 'multi':
      return <div className={`${box} bg-amber-500/30 text-amber-100`}>شخص واحد فقط أمام الكاميرا</div>
    case 'blink':
      return <div className={`${box} bg-cyan-500/25 text-cyan-100`}><Eye className="inline ml-2" size={18} />ارمش بعينيك</div>
    case 'scanning':
      return <div className={`${box} bg-cyan-500/25 text-cyan-100`}><Loader2 className="inline ml-2 animate-spin" size={18} />جارٍ التعرف…</div>
    case 'done':
      return <div className={`${box} bg-emerald-600/30 text-emerald-100`}><CheckCircle2 className="inline ml-2" size={18} />تم تسجيل {status.person?.fullName?.split(' ')[0]} — التالي تفضّل</div>
    case 'ambiguous':
      return <div className={`${box} bg-amber-500/30 text-amber-100`}>اختر اسمك من القائمة</div>
    default:
      return null
  }
}

function Greeting({ g }) {
  if (g.error) return <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-red-300 text-center px-6">{g.error}</div>
  if (g.unknown) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-center px-6">
        <UserX size={48} className="text-red-300" />
        <div className="text-xl font-bold">لم يتم التعرف عليك</div>
        <div className="text-white/60 text-sm">إذا لم تُسجَّل بصمة وجهك بعد، راجع المدير</div>
      </div>
    )
  }
  const { person, action } = g
  const first = (person.fullName || '').split(' ')[0]
  return (
    <div className={`absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6 ${action === 'out' ? 'bg-indigo-950/80' : 'bg-emerald-950/80'}`}>
      {action === 'out' ? <LogOut size={56} className="text-indigo-300" /> : <LogIn size={56} className="text-emerald-300" />}
      <div className="text-3xl font-display font-bold">{action === 'out' ? `مع السلامة ${first}` : `مرحبًا ${first}`}</div>
      <div className="text-white/80">{person.fullName}</div>
      <div className="text-lg">
        {action === 'in' && <>تم تسجيل الحضور {g.late > 0 && <span className="text-amber-300 text-sm">(متأخر {g.late} دقيقة)</span>}</>}
        {action === 'out' && <>تم تسجيل الانصراف · {Number(g.worked || 0).toFixed(1)} ساعة</>}
      </div>
    </div>
  )
}

function Avatar({ person }) {
  const [broken, setBroken] = useState(false)
  if (person.referencePhoto && !broken) {
    return <img src={person.referencePhoto} onError={() => setBroken(true)} alt="" className="w-12 h-12 rounded-xl object-cover" />
  }
  return <div className="w-12 h-12 rounded-xl bg-cyan-400/15 text-cyan-200 flex items-center justify-center font-bold">{(person.fullName || '?').slice(0, 1)}</div>
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function snapshot(video) {
  try {
    const w = 320
    const h = Math.round((video.videoHeight / video.videoWidth) * w) || 240
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const ctx = c.getContext('2d')
    ctx.translate(w, 0); ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, w, h)
    return await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82))
  } catch { return null }
}
