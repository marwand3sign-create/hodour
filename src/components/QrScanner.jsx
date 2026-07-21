import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { X, ScanLine } from 'lucide-react'

// Lightweight camera QR scanner — reads a value (here: an employee's login
// handle encoded on their badge) and hands it back via onScan, then closes.
// Deliberately separate from FaceCamera.jsx (MediaPipe): jsQR needs nothing
// but raw ImageData, so this stays a tiny, dependency-light overlay usable
// from the (pre-auth) login screen where the heavier face-model stack has no
// reason to load yet.
export default function QrScanner({ onScan, onClose, title = 'امسح الباركود' }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        video.srcObject = stream
        await video.play()
        tick()
      } catch {
        if (!cancelled) setError('تعذّر فتح الكاميرا — امنح الإذن وحاول مرة أخرى')
      }
    }

    function tick() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(frame.data, frame.width, frame.height)
        if (code?.data) { onScan(code.data); return }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    start()
    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-[2147483650] bg-black/80 flex items-center justify-center p-6" style={{ height: 'var(--visual-height, 100dvh)' }}>
      <div className="w-full max-w-sm bg-stone-950 rounded-3xl overflow-hidden border border-white/10">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <span className="flex items-center gap-2 text-sm font-semibold text-white"><ScanLine size={16} className="text-cyan-300" /> {title}</span>
          <button onClick={onClose} className="text-white/50 hover:text-white"><X size={20} /></button>
        </div>
        <div className="relative aspect-square bg-black">
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-8 border-2 border-cyan-400/60 rounded-2xl pointer-events-none" />
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6 bg-black/80 text-center text-sm text-red-300">{error}</div>
          )}
        </div>
        <p className="px-4 py-3 text-center text-xs text-white/40">وجّه الكاميرا نحو باركود بطاقتك</p>
      </div>
    </div>
  )
}
