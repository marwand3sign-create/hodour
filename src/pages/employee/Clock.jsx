import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, XCircle, MapPin, ScanFace, LogIn, LogOut, Loader2, RefreshCw, CloudOff, CloudUpload } from 'lucide-react'
import FaceCamera from '../../components/FaceCamera'
import { db } from '../../lib/db'
import { auth } from '../../lib/auth'
import { storage } from '../../lib/storage'
import { face, cosineSimilarity, FACE_MATCH_THRESHOLD } from '../../lib/face'
import { offlineQueue } from '../../lib/offlineQueue'
import { groupId, todayStr, fmtTime, fmtDateLong, fmtClock, hoursBetween, distanceMeters, DEFAULT_SHIFT, shiftHours, lateMinutes, detectGpsAnomalies, GPS_FLAG_LABELS } from '../../store'

export default function ClockPage() {
  const me = auth.getCurrentUser()
  const [profile, setProfile] = useState(null)
  const [shift, setShift] = useState(DEFAULT_SHIFT)
  const [locations, setLocations] = useState([])
  const [openRec, setOpenRec] = useState(null)
  const [today, setToday] = useState([])
  const [loading, setLoading] = useState(true)

  const [faceOk, setFaceOk] = useState(false)
  const [geo, setGeo] = useState({ status: 'idle', distance: null, accuracy: null, locationName: null, lat: null, lng: null, msg: '', suspicious: false, blocked: false, flagReasons: [] })
  const [lastFix, setLastFix] = useState(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(new Date())
  const faceStreak = useRef(0)
  const camWrapRef = useRef(null)

  const [pendingQueue, setPendingQueue] = useState([])
  const [syncing, setSyncing] = useState(false)

  // Grab the current camera frame as a JPEG blob and compute a geometric face
  // embedding (see lib/face.js) — both purely local, no network involved, so
  // this works offline as long as the face-detection model was already
  // fetched once (browser HTTP cache) during an earlier online visit.
  async function captureFaceBlob() {
    try {
      const video = camWrapRef.current?.querySelector('video')
      if (!video || !video.videoWidth) return { blob: null, embedding: null }
      const w = 320
      const h = Math.round((video.videoHeight / video.videoWidth) * w) || 320
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.translate(w, 0); ctx.scale(-1, 1) // mirror to match the on-screen (front) view
      ctx.drawImage(video, 0, 0, w, h)
      const embedding = await face.embedFromCanvas(canvas).catch(() => null)
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.82))
      return { blob, embedding }
    } catch { return { blob: null, embedding: null } }
  }

  async function uploadFace(blob, tag) {
    if (!blob) return null
    try { const { url } = await storage.upload(blob, `face-${me.id}-${tag}.jpg`); return url } catch { return null }
  }

  async function refreshQueue() { setPendingQueue(await offlineQueue.list().catch(() => [])) }

  // Replays queued clock-in/out actions in the order they were recorded —
  // a clockOut always enqueues after its clockIn, so by the time we reach it
  // here the clockIn has already produced a real attendance id (idMap).
  async function syncQueue() {
    if (syncing) return
    setSyncing(true)
    try {
      const items = await offlineQueue.list()
      const idMap = {}
      for (const item of items) {
        try {
          if (item.kind === 'clockIn') {
            const faceSnapshot = await uploadFace(item.blob, item.createdAt)
            const inserted = await db.insertShared('attendance', { ...item.payload, faceSnapshot })
            idMap[item.localId] = inserted.id
            if (profile?.id && !profile.referencePhoto && faceSnapshot && item.embedding) {
              try { await db.updateShared('employees', profile.id, { referencePhoto: faceSnapshot, referenceEmbedding: item.embedding }) } catch { /* non-critical */ }
            }
          } else if (item.kind === 'clockOut') {
            const targetId = item.attendanceId || idMap[item.clockInLocalId]
            if (!targetId) throw new Error('queued clockOut has no resolvable target yet')
            const outFaceSnapshot = await uploadFace(item.blob, item.createdAt)
            await db.updateShared('attendance', targetId, { ...item.payload, outFaceSnapshot })
          }
          await offlineQueue.remove(item.localId)
        } catch {
          break // still offline or a real failure — stop and preserve order for the next retry
        }
      }
    } finally {
      await refreshQueue()
      await load()
      setSyncing(false)
    }
  }

  useEffect(() => {
    refreshQueue()
    const onOnline = () => syncQueue()
    window.addEventListener('online', onOnline)
    if (navigator.onLine) syncQueue()
    return () => window.removeEventListener('online', onOnline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [profs, locs, recs, openRecs, settings, mineRecent] = await Promise.all([
        db.selectShared('employees', {}, { limit: 5 }),
        db.selectShared('locations', {}, { limit: 100 }),
        db.selectShared('attendance', { date: todayStr() }, { order: '-createdAt', limit: 20 }),
        db.selectShared('attendance', { status: 'in' }, { order: '-createdAt', limit: 20 }),
        db.selectShared('settings', { key: 'shift' }, { limit: 1 }),
        db.selectShared('attendance', { employeeUserId: me.id }, { order: '-createdAt', limit: 5 }),
      ])
      setProfile(profs[0] || null)
      // Most recent known GPS fix for this employee (for teleport/impossible-speed checks)
      const lastWithGps = (mineRecent || []).find(r => (r.outLat ?? r.gpsLat) != null)
      if (lastWithGps) {
        setLastFix({
          lat: lastWithGps.outLat ?? lastWithGps.gpsLat,
          lng: lastWithGps.outLng ?? lastWithGps.gpsLng,
          time: lastWithGps.checkOut || lastWithGps.checkIn,
        })
      }
      if (settings && settings[0]) setShift({ ...DEFAULT_SHIFT, ...settings[0] })
      setLocations(locs)
      const mine = recs.filter(r => r.employeeUserId === me.id)
      setToday(mine)
      const myOpen = (openRecs || []).filter(r => r.employeeUserId === me.id)
      setOpenRec(myOpen[0] || mine.find(r => r.status === 'in') || null)
    } catch (e) { /* noop */ }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Waits for a real GPS fix instead of settling for the first (often coarse,
  // network-based) reading — keeps sampling for up to ~9s or until accuracy is
  // good enough, and always returns the best sample it saw even on timeout.
  function getAccurateLocation({ timeoutMs = 9000, desiredAccuracy = 20 } = {}) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return }
      let best = null
      let settled = false
      let watchId = null
      const samples = []
      const finish = (err) => {
        if (settled) return
        settled = true
        if (watchId != null) navigator.geolocation.clearWatch(watchId)
        if (best) resolve({ ...best, samples })
        else reject(err || new Error('لم يتم الحصول على الموقع'))
      }
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const c = pos.coords
          samples.push({ lat: c.latitude, lng: c.longitude, accuracy: c.accuracy })
          if (!best || c.accuracy < best.accuracy) best = { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy }
          if (c.accuracy <= desiredAccuracy) finish()
        },
        (err) => finish(err),
        { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs }
      )
      setTimeout(() => finish(), timeoutMs)
    })
  }

  async function checkGeo() {
    setGeo(g => ({ ...g, status: 'checking', msg: '' }))
    try {
      const { lat, lng, accuracy, samples } = await getAccurateLocation()
      const acc = Math.round(accuracy || 0)
      const anomaly = detectGpsAnomalies({ samples, lastFix, now: new Date().toISOString() })
      const flagMsg = anomaly.suspicious ? ' ⚠ ' + anomaly.reasons.map(r => GPS_FLAG_LABELS[r]).join(' · ') : ''
      if (locations.length === 0) {
        setGeo({ status: 'ok', distance: 0, accuracy: acc, locationName: 'بدون نطاق جغرافي', lat, lng, msg: 'لم يتم تحديد مواقع عمل' + flagMsg, suspicious: anomaly.suspicious, blocked: anomaly.blocked, flagReasons: anomaly.reasons })
        return
      }
      let best = null
      for (const loc of locations) {
        const d = distanceMeters(lat, lng, Number(loc.lat), Number(loc.lng))
        if (!best || d < best.d) best = { d, loc }
      }
      const radius = Number(best.loc.radius) || 150
      // GPS readings drift — give a margin equal to the fix's own reported
      // uncertainty (capped) so a slightly-off fix near the edge doesn't wrongly
      // block a legitimately-onsite employee.
      const margin = Math.min(acc, 60)
      if (best.d <= radius + margin) {
        setGeo({ status: 'ok', distance: Math.round(best.d), accuracy: acc, locationName: best.loc.name, lat, lng, msg: flagMsg, suspicious: anomaly.suspicious, blocked: anomaly.blocked, flagReasons: anomaly.reasons })
      } else {
        setGeo({ status: 'far', distance: Math.round(best.d), accuracy: acc, locationName: best.loc.name, lat, lng,
          msg: `أنت على بعد ${Math.round(best.d)} متر من ${best.loc.name} (المسموح ${radius} متر · دقة الموقع ~${acc} متر)` + flagMsg,
          suspicious: anomaly.suspicious, blocked: anomaly.blocked, flagReasons: anomaly.reasons })
      }
    } catch (e) {
      setGeo({ status: 'error', distance: null, accuracy: null, locationName: null, lat: null, lng: null, msg: 'تعذّر تحديد موقعك — تأكد أن خدمة الموقع (GPS) مفعّلة وامنح الإذن، ثم أعد المحاولة', suspicious: false, blocked: false, flagReasons: [] })
    }
  }
  useEffect(() => { if (!loading) checkGeo() }, [loading, locations.length]) // eslint-disable-line

  function onFaces(faces) {
    if (faces && faces.length > 0 && (faces[0].confidence ?? 1) > 0.6) {
      faceStreak.current = Math.min(faceStreak.current + 1, 10)
      if (faceStreak.current >= 3) setFaceOk(true)
    }
  }

  const geoOk = geo.status === 'ok'
  const canAct = faceOk && geoOk && !busy && !geo.blocked

  async function clockIn() {
    if (!canAct) return
    setBusy(true)
    try {
      const { blob, embedding } = await captureFaceBlob()
      const checkInIso = new Date().toISOString()
      const late = lateMinutes(checkInIso, shift)
      // Compare against the employee's stored reference embedding, if any
      // (see FACE_MATCH_THRESHOLD in lib/face.js for why this flags rather
      // than blocks).
      const refEmbedding = profile?.referenceEmbedding || null
      const matchScore = (refEmbedding && embedding) ? cosineSimilarity(refEmbedding, embedding) : null
      const payload = {
        employeeUserId: me.id,
        employeeName: profile?.fullName || me.displayName || 'موظف',
        department: profile?.department || '',
        jobTitle: profile?.jobTitle || '',
        date: todayStr(),
        checkIn: checkInIso,
        lateMinutes: late,
        checkOut: null,
        workedHours: 0,
        overtimeHours: 0,
        gpsLat: geo.lat, gpsLng: geo.lng,
        gpsAccuracy: geo.accuracy ?? null,
        distance: geo.distance,
        locationName: geo.locationName,
        faceVerified: true,
        faceMatchScore: matchScore,
        faceMismatch: matchScore != null && matchScore < FACE_MATCH_THRESHOLD,
        status: 'in',
        gpsSuspicious: !!geo.suspicious,
        gpsFlagReason: (geo.flagReasons || []).map(r => GPS_FLAG_LABELS[r]).join('، ') || null,
      }

      if (!navigator.onLine) {
        const localId = crypto.randomUUID()
        await offlineQueue.enqueue({ localId, kind: 'clockIn', createdAt: Date.now(), payload, blob, embedding })
        await refreshQueue()
        setBusy(false)
        return
      }

      await groupId()
      const faceSnapshot = await uploadFace(blob, Date.now())
      await db.insertShared('attendance', { ...payload, faceSnapshot })
      // First-ever check-in: keep this photo + embedding as the employee's
      // reference — every future snapshot is compared against it, and the
      // manager can visually confirm it's the same person too.
      if (profile?.id && !profile.referencePhoto && faceSnapshot) {
        try {
          await db.updateShared('employees', profile.id, { referencePhoto: faceSnapshot, referenceEmbedding: embedding || null })
          setProfile(p => (p ? { ...p, referencePhoto: faceSnapshot, referenceEmbedding: embedding || null } : p))
        } catch { /* non-critical */ }
      }
      await load()
    } catch (e) { alert('تعذر تسجيل الدخول: ' + (e.message || e)) }
    setBusy(false)
  }

  async function clockOut() {
    if (!effectiveOpenRec || busy) return
    setBusy(true)
    try {
      const target = effectiveOpenRec
      const { blob, embedding } = await captureFaceBlob()
      const out = new Date().toISOString()
      const worked = hoursBetween(target.checkIn, out)
      const overtime = Math.max(0, worked - shiftHours(shift))
      // Same field (gpsSuspicious) is reused on checkout — reported as an UPDATE
      // rising-edge so the manager still gets notified even if check-in looked clean.
      const outSuspicious = !!geo.suspicious
      const alreadyFlagged = !!target.gpsSuspicious
      const outReason = (geo.flagReasons || []).map(r => GPS_FLAG_LABELS[r]).join('، ')
      const refEmbedding = profile?.referenceEmbedding || null
      const outMatchScore = (refEmbedding && embedding) ? cosineSimilarity(refEmbedding, embedding) : null
      const payload = {
        checkOut: out, workedHours: worked, overtimeHours: overtime, status: 'out',
        outLat: geo.lat ?? null, outLng: geo.lng ?? null,
        outFaceMatchScore: outMatchScore,
        outFaceMismatch: outMatchScore != null && outMatchScore < FACE_MATCH_THRESHOLD,
        gpsSuspicious: alreadyFlagged || outSuspicious,
        gpsFlagReason: alreadyFlagged ? target.gpsFlagReason : (outReason ? `عند الخروج: ${outReason}` : target.gpsFlagReason || null),
      }

      if (!navigator.onLine) {
        const localId = crypto.randomUUID()
        await offlineQueue.enqueue({
          localId, kind: 'clockOut', createdAt: Date.now(), payload, blob, embedding,
          attendanceId: target.id || null,
          clockInLocalId: target.localId || null,
        })
        await refreshQueue()
        setBusy(false)
        return
      }

      const outFaceSnapshot = await uploadFace(blob, Date.now())
      await db.updateShared('attendance', target.id, { ...payload, outFaceSnapshot })
      await load()
    } catch (e) { alert('تعذر تسجيل الخروج: ' + (e.message || e)) }
    setBusy(false)
  }

  // Overlay queued-but-not-yet-synced actions onto the server state: a
  // pending clockIn with no matching pending clockOut is still "open"; an
  // open server record with a pending clockOut queued against it reads as
  // closed (avoids a duplicate clock-out attempt before sync catches up).
  const pendingClockOutTargets = new Set(pendingQueue.filter(q => q.kind === 'clockOut').map(q => q.attendanceId || q.clockInLocalId))
  const openPendingClockIn = pendingQueue.find(q => q.kind === 'clockIn' && !pendingClockOutTargets.has(q.localId))
  const effectiveOpenRec = (openRec && !pendingClockOutTargets.has(openRec.id))
    ? openRec
    : (openPendingClockIn
      ? { localId: openPendingClockIn.localId, pending: true, ...openPendingClockIn.payload }
      : null)

  const clockedIn = !!effectiveOpenRec

  return (
    <div className="space-y-5 cn-rise">
      {/* Live clock */}
      <div className="text-center pt-1">
        <div className="font-clock text-5xl md:text-6xl font-bold text-cyan-300 tracking-wider tabular-nums drop-shadow-[0_0_18px_rgba(56,189,248,0.4)]">
          {fmtTime(now.toISOString())}
        </div>
        <div className="text-white/45 text-sm mt-1">{fmtDateLong(now)}</div>
        <div className="mt-2 text-white/70 text-sm">
          مرحبًا <span className="text-white font-semibold">{profile?.fullName || me?.displayName || 'بك'}</span>
          {profile?.jobTitle ? ` · ${profile.jobTitle}` : ''}
        </div>
        <div className="mt-1.5 text-xs text-white/40">الدوام الرسمي: {fmtClock(shift.startTime)} — {fmtClock(shift.endTime)}</div>
      </div>

      {pendingQueue.length > 0 && (
        <div className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-xs border border-amber-400/30 bg-amber-400/10 text-amber-200">
          {syncing ? <CloudUpload size={15} className="animate-pulse shrink-0" /> : <CloudOff size={15} className="shrink-0" />}
          <span>
            {syncing ? 'جارٍ مزامنة ' : 'بانتظار الاتصال بالإنترنت لمزامنة '}
            {pendingQueue.length} {pendingQueue.length === 1 ? 'عملية' : 'عمليات'} حضور مسجّلة محليًا
          </span>
        </div>
      )}

      {/* Camera */}
      <div className="cn-glass rounded-3xl p-4">
        <div ref={camWrapRef} className={`relative rounded-2xl overflow-hidden mx-auto max-w-xs transition ${faceOk ? 'ring-2 ring-emerald-400' : 'ring-2 ring-white/15'}`}
          style={faceOk ? { animation: 'cn-pulse-ring 2s infinite' } : undefined}>
          <FaceCamera mode="detect" maxFaces={1} camera="front" minConfidence={0.5}
            onFaces={onFaces}
            onPresence={(p) => { if (!p) { faceStreak.current = 0; setFaceOk(false) } }}
            className="h-60 w-full" />
        </div>
        <p className="text-center text-xs text-white/40 mt-3">ضع وجهك داخل الإطار للتحقق من الحضور</p>
      </div>

      {/* Status chips */}
      <div className="grid grid-cols-2 gap-3">
        <StatusChip
          ok={faceOk}
          icon={ScanFace}
          title="التحقق من الوجه"
          sub={faceOk ? 'تم التحقق' : 'جارٍ البحث عن الوجه…'}
        />
        <StatusChip
          ok={geoOk}
          pending={geo.status === 'checking'}
          icon={geo.status === 'checking' ? Loader2 : MapPin}
          title="النطاق الجغرافي"
          sub={geo.status === 'ok'
            ? (geo.locationName + (geo.distance != null ? ` · ${geo.distance} متر` : '') + (geo.accuracy != null ? ` · دقة ~${geo.accuracy}م` : ''))
            : geo.status === 'checking' ? 'جارٍ تحسين دقة الموقع…'
            : geo.msg || 'خارج النطاق'}
          onRetry={geo.status !== 'checking' ? checkGeo : null}
        />
      </div>

      {geo.suspicious && (
        <div className={`rounded-2xl p-3 text-xs leading-relaxed border ${geo.blocked ? 'border-red-400/40 bg-red-400/10 text-red-200' : 'border-amber-400/30 bg-amber-400/10 text-amber-200'}`}>
          {geo.blocked
            ? '⚠ تعذّر تسجيل الحضور: تم رصد نمط غير طبيعي في إشارة الموقع (احتمال موقع مزيّف). سيتم إبلاغ المدير بهذه المحاولة.'
            : '⚠ تم رصد إشارة غير معتادة في الموقع — سيُسجَّل هذا للمراجعة من المدير.'}
        </div>
      )}

      {/* Action */}
      {clockedIn ? (
        <div className="space-y-2">
          <div className="text-center text-sm text-white/60">
            تم تسجيل الدخول الساعة {fmtTime(effectiveOpenRec.checkIn)}{effectiveOpenRec.locationName ? ` · ${effectiveOpenRec.locationName}` : ''}
            {effectiveOpenRec.pending && <span className="text-amber-300"> · بانتظار المزامنة</span>}
          </div>
          <button onClick={clockOut} disabled={busy}
            className="w-full py-4 rounded-2xl font-display font-bold text-lg flex items-center justify-center gap-2 bg-amber-400 text-black disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] transition shadow-[0_0_25px_rgba(251,191,36,0.35)]">
            {busy ? <Loader2 className="animate-spin" size={22} /> : <LogOut size={22} />} تسجيل الخروج
          </button>
        </div>
      ) : (
        <button onClick={clockIn} disabled={!canAct}
          className="w-full py-4 rounded-2xl font-display font-bold text-lg flex items-center justify-center gap-2 bg-cyan-400 text-black disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] transition shadow-[0_0_25px_rgba(56,189,248,0.35)]">
          {busy ? <Loader2 className="animate-spin" size={22} /> : <LogIn size={22} />} تسجيل الدخول
        </button>
      )}

      {/* Today log */}
      {(today.length > 0 || openPendingClockIn) && (
        <div className="cn-glass rounded-2xl p-4">
          <div className="text-sm font-semibold text-white/70 mb-2">اليوم</div>
          <div className="space-y-2">
            {today.map(r => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span className="text-white/60">{r.locationName || '—'}</span>
                <span className="tabular-nums text-white/80">
                  {fmtTime(r.checkIn)} ← {r.checkOut ? fmtTime(r.checkOut) : <span className="text-emerald-400">نشط</span>}
                </span>
              </div>
            ))}
            {openPendingClockIn && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">{openPendingClockIn.payload.locationName || '—'} <span className="text-amber-300 text-xs">(محلي)</span></span>
                <span className="tabular-nums text-white/80">
                  {fmtTime(openPendingClockIn.payload.checkIn)} ← <span className="text-amber-300">بانتظار المزامنة</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusChip({ ok, pending, icon: Icon, title, sub, onRetry }) {
  return (
    <div className={`rounded-2xl p-3.5 border transition ${ok ? 'border-emerald-400/40 bg-emerald-400/10' : 'border-white/10 bg-white/5'}`}>
      <div className="flex items-center gap-2">
        <Icon size={18} className={`${pending ? 'animate-spin ' : ''}${ok ? 'text-emerald-400' : 'text-white/50'}`} />
        <span className="text-sm font-semibold text-white/85">{title}</span>
        <span className="ml-auto">
          {ok ? <CheckCircle2 size={18} className="text-emerald-400" /> : !pending && <XCircle size={18} className="text-white/30" />}
        </span>
      </div>
      <div className="mt-1.5 text-xs text-white/50 leading-snug flex items-center gap-1">
        <span className="flex-1">{sub}</span>
        {onRetry && !ok && <button onClick={onRetry} className="text-cyan-300 shrink-0"><RefreshCw size={13} /></button>}
      </div>
    </div>
  )
}
