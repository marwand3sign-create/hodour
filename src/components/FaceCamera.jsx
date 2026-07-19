/**
 * FaceCamera — MediaPipe face detection / landmarks component.
 * Renders a live camera feed with real-time face detection and
 * optional overlay (bounding boxes or face mesh). Uses MediaPipe WASM.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { face } from '../lib/face'

// Simplified face mesh connections for overlay (outer contour + key features)
const FACE_OVAL = [
  10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,
  377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10,
]
const LEFT_EYE = [33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7,33]
const RIGHT_EYE = [362,398,384,385,386,387,388,466,263,249,390,373,374,380,381,382,362]
const LIPS_OUTER = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185,61]

/**
 * @param {object} props
 * @param {'detect'|'landmarks'} [props.mode='detect'] - Detection mode
 * @param {'front'|'back'} [props.camera='front'] - Which camera to use
 * @param {number} [props.maxFaces=1] - Maximum faces to detect
 * @param {number} [props.minConfidence=0.5] - Minimum detection confidence
 * @param {function} [props.onFaces] - Called with array of detected faces (only when ≥1 present)
 * @param {function} [props.onPresence] - Called true when a face appears, false (debounced) when it leaves
 * @param {boolean} [props.overlay=true] - Draw face overlay on canvas
 * @param {boolean} [props.mirrored=true] - Mirror the camera feed
 * @param {string} [props.className] - CSS class for the container
 * @param {object} [props.style] - Inline styles for the container
 */
export default function FaceCamera({
  mode = 'detect',
  camera = 'front',
  maxFaces = 1,
  minConfidence = 0.5,
  onFaces,
  onPresence,
  overlay = true,
  mirrored = true,
  className = '',
  style = {},
}) {
  const containerRef = useRef(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const detectorRef = useRef(null)
  const callbackRef = useRef(onFaces)
  const presenceCbRef = useRef(onPresence)
  const presentRef = useRef(null)
  const emptyFramesRef = useRef(0)

  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [statusText, setStatusText] = useState('Preparing…')
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => { callbackRef.current = onFaces }, [onFaces])
  useEffect(() => { presenceCbRef.current = onPresence }, [onPresence])

  // Draw overlay for detect mode (bounding boxes)
  const drawDetectOverlay = useCallback((faces, vw, vh, ctx) => {
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.8)'
    ctx.lineWidth = 2
    ctx.fillStyle = 'rgba(34, 197, 94, 0.9)'

    for (const f of faces) {
      // Bounding box
      ctx.strokeRect(f.x, f.y, f.width, f.height)

      // Keypoints
      for (const key of Object.keys(f.keypoints)) {
        const kp = f.keypoints[key]
        ctx.beginPath()
        ctx.arc(kp.x * vw, kp.y * vh, 4, 0, 2 * Math.PI)
        ctx.fill()
      }
    }
  }, [])

  // Draw overlay for landmarks mode (face mesh)
  const drawLandmarksOverlay = useCallback((faces, vw, vh, ctx) => {
    for (const f of faces) {
      const pts = f.landmarks

      function drawPath(indices, color) {
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.beginPath()
        for (let i = 0; i < indices.length; i++) {
          const p = pts[indices[i]]
          if (!p) continue
          if (i === 0) ctx.moveTo(p.x * vw, p.y * vh)
          else ctx.lineTo(p.x * vw, p.y * vh)
        }
        ctx.stroke()
      }

      drawPath(FACE_OVAL, 'rgba(168, 162, 158, 0.5)')
      drawPath(LEFT_EYE, 'rgba(71, 85, 105, 0.8)')
      drawPath(RIGHT_EYE, 'rgba(71, 85, 105, 0.8)')
      drawPath(LIPS_OUTER, 'rgba(244, 63, 94, 0.7)')
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function init() {
      setStatus('loading')
      setError(null)

      try {
        const startFn = mode === 'landmarks' ? face.landmarks : face.detect
        const det = await startFn({
          camera, maxFaces, minConfidence,
          onProgress: (text) => { if (!cancelled) setStatusText(text) },
        })

        if (cancelled) { det.stop(); return }

        detectorRef.current = det
        const videoEl = det.video
        videoEl.style.width = '100%'
        videoEl.style.height = '100%'
        videoEl.style.objectFit = 'cover'
        videoEl.style.display = 'block'
        videoRef.current = videoEl

        if (containerRef.current) {
          const wrapper = containerRef.current.querySelector('[data-face-video]')
          if (wrapper) { wrapper.innerHTML = ''; wrapper.appendChild(videoEl) }
        }

        setStatus('ready')

        det.onResult((result) => {
          if (cancelled) return
          if (result.faces.length > 0) {
            emptyFramesRef.current = 0
            if (presentRef.current !== true) { presentRef.current = true; if (presenceCbRef.current) presenceCbRef.current(true) }
            if (callbackRef.current) callbackRef.current(result.faces)
          } else {
            emptyFramesRef.current += 1
            // fire absence once after a short gap (≈6 frames) so a single dropped frame doesn't flicker
            if (emptyFramesRef.current >= 6 && presentRef.current !== false) {
              presentRef.current = false
              if (presenceCbRef.current) presenceCbRef.current(false)
            }
          }
          if (overlay && canvasRef.current && videoRef.current) {
            const vw = videoRef.current.videoWidth
            const vh = videoRef.current.videoHeight
            const canvas = canvasRef.current
            if (canvas.width !== vw) canvas.width = vw
            if (canvas.height !== vh) canvas.height = vh
            const ctx = canvas.getContext('2d')
            ctx.clearRect(0, 0, vw, vh)
            if (mode === 'landmarks') drawLandmarksOverlay(result.faces, vw, vh, ctx)
            else drawDetectOverlay(result.faces, vw, vh, ctx)
          }
        })
      } catch (err) {
        if (cancelled) return
        console.error('[FaceCamera] init error:', err)
        setStatus('error')
        setError(err.message || 'Failed to start face detection')
      }
    }

    init()
    return () => {
      cancelled = true
      if (detectorRef.current) { detectorRef.current.stop(); detectorRef.current = null }
    }
  }, [mode, camera, maxFaces, minConfidence, retryCount]) // eslint-disable-line react-hooks/exhaustive-deps

  const shouldMirror = mirrored && camera === 'front'

  const containerStyle = {
    position: 'relative', width: '100%', height: '300px',
    borderRadius: '12px', overflow: 'hidden', backgroundColor: '#111',
    ...style,
  }

  const mediaStyle = {
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
    transform: shouldMirror ? 'scaleX(-1)' : 'none',
  }

  return (
    <div ref={containerRef} className={className} style={containerStyle}>
      <div data-face-video style={mediaStyle} />
      {overlay && (
        <canvas ref={canvasRef} style={{ ...mediaStyle, pointerEvents: 'none', objectFit: 'cover' }} />
      )}
      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff', gap: '12px', zIndex: 10,
        }}>
          <div style={{
            width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.3)',
            borderTopColor: '#fff', borderRadius: '50%',
            animation: 'face-spin 0.8s linear infinite',
          }} />
          <span style={{ fontSize: '14px', opacity: 0.9 }}>{statusText}</span>
          <style>{`@keyframes face-spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}
      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.8)', color: '#fff', padding: '20px',
          textAlign: 'center', zIndex: 10,
        }}>
          <span style={{ fontSize: '24px', marginBottom: '8px' }}>&#128247;</span>
          <span style={{ fontSize: '14px', opacity: 0.9, marginBottom: '16px' }}>{error}</span>
          <button
            onClick={() => setRetryCount((c) => c + 1)}
            style={{
              padding: '8px 20px', borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.3)',
              backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff',
              fontSize: '14px', cursor: 'pointer',
            }}
          >Retry</button>
        </div>
      )}
    </div>
  )
}
