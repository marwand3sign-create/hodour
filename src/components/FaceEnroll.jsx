import { useEffect, useRef, useState } from 'react'
import { X, Loader2, ScanFace, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react'
import { loadModels, analyzeFrame, rank, meanDescriptor, distance, compact, LOOKALIKE_WARN, MATCH_MAX } from '../lib/faceId'
import { db } from '../lib/db'
import { storage } from '../lib/storage'

// Each step asks for a slightly different pose so the kiosk recognises the
// worker from more than one angle.
const STEPS = [
  'انظر إلى الكاميرا مباشرة',
  'أدر رأسك قليلًا إلى اليمين',
  'أدر رأسك قليلًا إلى اليسار',
  'ارفع ذقنك قليلًا',
  'انظر إلى الكاميرا مباشرة مرة أخرى',
]
const SAMPLE_GAP_MS = 450
const MIN_FACE_PX = 90

/**
 * Manager-side face enrollment for one worker: captures 5 recognition
 * descriptors (one per pose), checks they're consistent (same person), warns
 * if the face is close to someone already enrolled (lookalikes), then saves
 * them to employees.face_descriptors for the kiosk to match against.
 */
export default function FaceEnroll({ profile, name, others = [], onClose, onSaved }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const samplesRef = useRef([])
  const photoRef = useRef(null)
  const lastRef = useRef(0)
  const runRef = useRef(true)

  const [phase, setPhase] = useState('loading') // loading | capturing | review | saving | error
  const [hint, setHint] = useState('جارٍ تحميل نموذج التعرف على الوجه…')
  const [count, setCount] = useState(0)
  const [result, setResult] = useState(null) // { consistent, lookalikes:[{name,d}] }
  const [err, setErr] = useState('')

  useEffect(() => {
    runRef.current = true
    start()
    return () => { runRef.current = false; stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  async function start() {
    try {
      await loadModels()
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false })
      streamRef.current = stream
      const v = videoRef.current
      v.srcObject = stream
      await v.play()
      samplesRef.current = []
      photoRef.current = null
      setCount(0)
      setPhase('capturing')
      loop()
    } catch (e) {
      setErr('تعذر فتح الكاميرا أو تحميل النموذج: ' + (e.message || e))
      setPhase('error')
    }
  }

  async function loop() {
    while (runRef.current && samplesRef.current.length < STEPS.length) {
      const v = videoRef.current
      if (!v || v.readyState < 2) { await sleep(150); continue }
      let r
      try { r = await analyzeFrame(v) } catch { await sleep(200); continue }
      const n = samplesRef.current.length
      if (r.count === 0) setHint('لا يظهر وجه — قرّب الوجه من الكاميرا')
      else if (r.count > 1) setHint('يجب أن يظهر شخص واحد فقط أمام الكاميرا')
      else if (r.face.box.width < MIN_FACE_PX) setHint('قرّب الوجه أكثر من الكاميرا')
      else if (r.face.score < 0.7) setHint('حسّن الإضاءة ووجّه الوجه للكاميرا')
      else if (Date.now() - lastRef.current >= SAMPLE_GAP_MS) {
        if (n === 0) photoRef.current = await snapshot(v)
        samplesRef.current.push(r.face.descriptor)
        lastRef.current = Date.now()
        setCount(samplesRef.current.length)
        setHint(STEPS[Math.min(samplesRef.current.length, STEPS.length - 1)])
        continue
      } else setHint(STEPS[n])
      await sleep(120)
    }
    if (runRef.current && samplesRef.current.length >= STEPS.length) review()
  }

  function review() {
    stop()
    const samples = samplesRef.current
    const mean = meanDescriptor(samples)
    // All samples must be the same person (guards against someone else stepping in mid-capture).
    const consistent = samples.every((s) => distance(s, mean) < 0.4)
    const roster = others.filter((o) => o.userId !== profile.userId && o.faceDescriptors?.length)
    const lookalikes = rank(mean, roster)
      .filter((r) => r.d < LOOKALIKE_WARN)
      .map((r) => ({ name: r.person.fullName || r.person.name || r.person.handle, d: r.d, strong: r.d < MATCH_MAX }))
    setResult({ consistent, lookalikes })
    setPhase('review')
  }

  async function save() {
    setPhase('saving')
    try {
      const patch = { faceDescriptors: samplesRef.current.map(compact) }
      if (!profile.referencePhoto && photoRef.current) {
        try {
          const { url } = await storage.upload(photoRef.current, `face-${profile.userId}-enroll-${Date.now()}.jpg`)
          patch.referencePhoto = url
        } catch { /* photo is optional */ }
      }
      await db.updateShared('employees', profile.id, patch)
      onSaved?.()
      onClose()
    } catch (e) {
      setErr('تعذر الحفظ: ' + (e.message || e))
      setPhase('review')
    }
  }

  function retry() {
    setResult(null)
    setErr('')
    runRef.current = true
    setPhase('loading') // re-mount the <video> before reopening the camera
    setTimeout(start, 50)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="cn-glass rounded-3xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-semibold">
            <ScanFace size={18} className="text-cyan-300" /> بصمة وجه: {name}
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white p-1"><X size={18} /></button>
        </div>

        {(phase === 'loading' || phase === 'capturing') && (
          <>
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3]">
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover -scale-x-100" />
              {phase === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center text-white/70"><Loader2 className="animate-spin" /></div>
              )}
            </div>
            <div className="text-center text-cyan-200 text-sm min-h-[1.25rem]">{hint}</div>
            <div className="flex gap-1.5 justify-center">
              {STEPS.map((_, i) => (
                <span key={i} className={`h-1.5 w-8 rounded-full ${i < count ? 'bg-cyan-400' : 'bg-white/15'}`} />
              ))}
            </div>
          </>
        )}

        {phase === 'error' && <div className="text-red-300 text-sm">{err}</div>}

        {(phase === 'review' || phase === 'saving') && result && (
          <div className="space-y-3 text-sm">
            {result.consistent ? (
              <div className="flex items-center gap-2 text-emerald-300"><CheckCircle2 size={16} /> تم التقاط 5 صور للوجه بنجاح</div>
            ) : (
              <div className="flex items-start gap-2 text-red-300">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                الصور غير متطابقة — ربما تحرّك شخص آخر أمام الكاميرا. أعد المحاولة.
              </div>
            )}
            {result.lookalikes.length > 0 && (
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-amber-200 space-y-1">
                <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={15} /> هذا الوجه يشبه:</div>
                {result.lookalikes.map((l) => (
                  <div key={l.name}>• {l.name} {l.strong ? '— تشابه كبير جدًا، تأكد أنه ليس نفس الشخص' : ''}</div>
                ))}
                <div className="text-amber-200/70 text-xs">عند التشابه سيطلب جهاز البوابة من العامل اختيار اسمه بدل التسجيل التلقائي.</div>
              </div>
            )}
            {err && <div className="text-red-300">{err}</div>}
            <div className="flex gap-2">
              <button onClick={retry} disabled={phase === 'saving'} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/10 text-white disabled:opacity-40">
                <RotateCcw size={15} /> إعادة
              </button>
              <button onClick={save} disabled={!result.consistent || phase === 'saving'} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-cyan-400 text-black font-semibold disabled:opacity-40">
                {phase === 'saving' ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} حفظ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function snapshot(video) {
  const w = 320
  const h = Math.round((video.videoHeight / video.videoWidth) * w) || 240
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  ctx.translate(w, 0); ctx.scale(-1, 1)
  ctx.drawImage(video, 0, 0, w, h)
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85))
}
