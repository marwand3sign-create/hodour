/**
 * Replacement for the `face` SDK stub — real client-side face detection via
 * MediaPipe Tasks Vision (WASM, runs entirely in the browser, no backend
 * involved). Used by FaceCamera.jsx (in turn used by the employee Clock
 * page) to gate check-in/out on a live face being visible to the camera.
 *
 * `detect` uses the lightweight BlazeFace short-range model (bounding box +
 * 6 keypoints) — this is presence detection, not identity verification; the
 * actual identity check is a human reviewing the captured photo later
 * (Attendance.jsx's face comparison modal).
 * `landmarks` uses the full FaceLandmarker model (468-point face mesh) —
 * not currently used anywhere in the app, but implemented for API parity
 * since FaceCamera.jsx supports a "landmarks" mode.
 */
import { FilesetResolver, FaceDetector, FaceLandmarker } from '@mediapipe/tasks-vision'

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const DETECTOR_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
const LANDMARKER_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

let visionPromise = null
function getVision() {
  if (!visionPromise) visionPromise = FilesetResolver.forVisionTasks(WASM_BASE)
  return visionPromise
}

async function openCamera(camera, onProgress) {
  onProgress?.('جارٍ فتح الكاميرا…')
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: camera === 'back' ? 'environment' : 'user' },
    audio: false,
  })
  const video = document.createElement('video')
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play()
  if (video.readyState < 2) {
    await new Promise((resolve) => { video.onloadeddata = () => resolve() })
  }
  return { video, stream }
}

function startLoop(video, detectForVideo, onFrame) {
  let running = true
  let raf
  function tick() {
    if (!running) return
    if (video.readyState >= 2) {
      try { onFrame(detectForVideo(video, performance.now())) } catch { /* transient decode gaps */ }
    }
    raf = requestAnimationFrame(tick)
  }
  tick()
  return () => { running = false; if (raf) cancelAnimationFrame(raf) }
}

async function startDetector({ camera = 'front', maxFaces = 1, minConfidence = 0.5, onProgress } = {}) {
  onProgress?.('جارٍ تحميل نموذج التعرف على الوجه…')
  const vision = await getVision()
  const detector = await FaceDetector.createFromOptions(vision, {
    baseOptions: { modelAssetPath: DETECTOR_MODEL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    minDetectionConfidence: minConfidence,
  })

  const { video, stream } = await openCamera(camera, onProgress)

  let resultCb = null
  const stopLoop = startLoop(video, (v, ts) => detector.detectForVideo(v, ts), (result) => {
    const faces = (result.detections || []).slice(0, maxFaces).map((d) => ({
      x: d.boundingBox.originX,
      y: d.boundingBox.originY,
      width: d.boundingBox.width,
      height: d.boundingBox.height,
      confidence: d.categories?.[0]?.score ?? 1,
      keypoints: Object.fromEntries((d.keypoints || []).map((k, i) => [String(i), { x: k.x, y: k.y }])),
    }))
    resultCb?.({ faces })
  })

  return {
    video,
    stop: () => { stopLoop(); stream.getTracks().forEach((t) => t.stop()); detector.close() },
    onResult: (cb) => { resultCb = cb },
  }
}

async function startLandmarker({ camera = 'front', maxFaces = 1, minConfidence = 0.5, onProgress } = {}) {
  onProgress?.('جارٍ تحميل نموذج ملامح الوجه…')
  const vision = await getVision()
  const landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: LANDMARKER_MODEL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numFaces: maxFaces,
    minFaceDetectionConfidence: minConfidence,
    minFacePresenceConfidence: minConfidence,
  })

  const { video, stream } = await openCamera(camera, onProgress)

  let resultCb = null
  const stopLoop = startLoop(video, (v, ts) => landmarker.detectForVideo(v, ts), (result) => {
    const faces = (result.faceLandmarks || []).map((lm) => ({
      landmarks: lm.map((p) => ({ x: p.x, y: p.y })),
      confidence: 1,
    }))
    resultCb?.({ faces })
  })

  return {
    video,
    stop: () => { stopLoop(); stream.getTracks().forEach((t) => t.stop()); landmarker.close() },
    onResult: (cb) => { resultCb = cb },
  }
}

// ---------------------------------------------------------------------------
// Identity verification (geometric, not a trained recognition model)
//
// MediaPipe's bundled models here are detection/mesh only — no embedding
// model ships with @mediapipe/tasks-vision. So `embedFromCanvas` builds a
// pose/scale-normalized feature vector from the 468-point face mesh instead:
// distances from a set of stable landmarks to the inter-ocular midpoint,
// divided by inter-ocular distance (removes camera-distance/zoom variance).
// This is weaker than a trained face-recognition embedding (more sensitive to
// pose/expression), so `THRESHOLD` below is deliberately lenient — the goal
// is to flag likely mismatches for a manager to review, not to auto-block a
// legitimate employee having a bad-angle day.
// ---------------------------------------------------------------------------

let landmarkerImagePromise = null
function getImageLandmarker() {
  if (!landmarkerImagePromise) {
    landmarkerImagePromise = getVision().then((vision) => FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: LANDMARKER_MODEL, delegate: 'GPU' },
      runningMode: 'IMAGE',
      numFaces: 1,
    }))
  }
  return landmarkerImagePromise
}

// Stable, expression-resistant landmark indices (jaw, brow, nose, mouth
// corners) sampled relative to the inter-ocular midpoint/distance.
const EMBED_POINTS = [1, 33, 133, 362, 263, 61, 291, 199, 10, 152, 234, 454, 70, 300, 4]
const LEFT_EYE_OUTER = 33
const RIGHT_EYE_OUTER = 263

export async function embedFromCanvas(canvas) {
  const landmarker = await getImageLandmarker()
  const result = landmarker.detect(canvas)
  const pts = result.faceLandmarks?.[0]
  if (!pts || pts.length === 0) return null

  const l = pts[LEFT_EYE_OUTER]
  const r = pts[RIGHT_EYE_OUTER]
  const midX = (l.x + r.x) / 2, midY = (l.y + r.y) / 2
  const ocular = Math.hypot(r.x - l.x, r.y - l.y) || 1

  const vec = []
  for (const idx of EMBED_POINTS) {
    const p = pts[idx]
    vec.push((p.x - midX) / ocular, (p.y - midY) / ocular)
  }
  return vec
}

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// Below this, flag as a possible mismatch for manager review. Lenient by
// design — see the file-level comment on why this isn't a hard block.
export const FACE_MATCH_THRESHOLD = 0.90

export const face = {
  detect: startDetector,
  landmarks: startLandmarker,
  embedFromCanvas,
  cosineSimilarity,
}
