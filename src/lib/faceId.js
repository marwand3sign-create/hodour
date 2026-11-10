/**
 * Face IDENTIFICATION (who is this, out of every worker?) for the shared
 * kiosk device.
 *
 * Unlike lib/face.js (MediaPipe landmark geometry — fine for "is this still
 * the same person" but far too weak to tell 100 workers apart), this uses a
 * trained face-recognition network (dlib-style ResNet, 128-d descriptors,
 * ~99.4% on LFW) via @vladmandic/face-api. All three models are served from
 * /public/models and precached by the service worker, so identification runs
 * fully on-device with no internet.
 *
 * Descriptor distance is Euclidean: same person is typically < 0.45,
 * different people usually > 0.55. Lookalikes are handled by also looking at
 * the SECOND-best worker — a match is only "confident" when the best is close
 * AND clearly closer than anyone else (see classify()).
 */
import * as faceapi from '@vladmandic/face-api'

const MODEL_URL = '/models'

// Tuned for dlib 128-d descriptors.
export const MATCH_MAX = 0.45 // best distance must be below this to auto-accept
export const AMBIGUOUS_MAX = 0.55 // up to this, offer as a candidate to confirm
export const MIN_MARGIN = 0.07 // best must beat the runner-up (another worker) by this much
export const LOOKALIKE_WARN = 0.5 // enrollment: warn if a new face is this close to someone else

let loading = null
export function loadModels() {
  if (!loading) {
    loading = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ])
      // Warm-up: the first inference compiles GPU shaders (~10s on some
      // devices). Do it now, during the loading screen, not on the first worker.
      .then(async () => {
        const c = document.createElement('canvas')
        c.width = 160; c.height = 160
        try { await faceapi.detectAllFaces(c, detectorOpts).withFaceLandmarks().withFaceDescriptors() } catch { /* ignore */ }
      })
      .catch((e) => { loading = null; throw e })
  }
  return loading
}

// 224 is ~2x faster than 320 and plenty for a face 30-80 cm from the camera.
const detectorOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })

/**
 * Cheap pass (detector only, ~10-30 ms): is there exactly one usable face?
 * The expensive landmarks + 128-d descriptor are only computed once this says yes.
 * → { count, box, score }
 */
export async function quickDetect(input) {
  const dets = await faceapi.detectAllFaces(input, detectorOpts)
  if (!dets.length) return { count: 0, box: null, score: 0 }
  const main = dets.reduce((a, b) => (b.box.area > a.box.area ? b : a))
  const others = dets.filter((d) => d !== main && d.box.area > main.box.area * 0.45)
  return { count: 1 + others.length, box: main.box, score: main.score }
}

/**
 * Analyse one video frame. Returns
 *   { count, face: { descriptor:number[], score, box, ear } | null }
 * `count` > 1 means several people are in frame (we refuse to guess).
 */
export async function analyzeFrame(input) {
  const results = await faceapi
    .detectAllFaces(input, detectorOpts)
    .withFaceLandmarks()
    .withFaceDescriptors()
  if (!results.length) return { count: 0, face: null }
  // Largest face = the person standing at the device.
  const main = results.reduce((a, b) => (b.detection.box.area > a.detection.box.area ? b : a))
  const others = results.filter((r) => r !== main && r.detection.box.area > main.detection.box.area * 0.45)
  return {
    count: 1 + others.length,
    face: {
      descriptor: Array.from(main.descriptor),
      score: main.detection.score,
      box: main.detection.box,
      ear: eyeAspectRatio(main.landmarks.positions),
    },
  }
}

// Eye aspect ratio (Soukupová & Čech) averaged over both eyes — drops sharply
// during a blink; used as a basic liveness check against a printed photo.
function ear6(p) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
  return (d(p[1], p[5]) + d(p[2], p[4])) / (2 * d(p[0], p[3]) || 1)
}
function eyeAspectRatio(pts) {
  return (ear6(pts.slice(36, 42)) + ear6(pts.slice(42, 48))) / 2
}

/** Tracks EAR over frames and reports when a full blink (open→closed→open) happened. */
export function createBlinkDetector() {
  let openEar = 0
  let closed = false
  let blinked = false
  return {
    push(ear) {
      if (ear == null) return blinked
      openEar = Math.max(openEar * 0.98, ear) // slowly-decaying "eyes open" baseline
      if (!closed && openEar > 0.2 && ear < openEar * 0.68) closed = true
      else if (closed && ear > openEar * 0.85) { closed = false; blinked = true }
      return blinked
    },
    get blinked() { return blinked },
    reset() { openEar = 0; closed = false; blinked = false },
  }
}

export function distance(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d }
  return Math.sqrt(s)
}

/**
 * Rank every enrolled worker against a descriptor.
 * roster: [{ userId, fullName, ..., faceDescriptors: number[][] }]
 * → [{ person, d }] sorted best-first (one entry per worker).
 */
export function rank(descriptor, roster) {
  const out = []
  for (const person of roster) {
    const descs = person.faceDescriptors || []
    if (!descs.length) continue
    let best = Infinity
    for (const ref of descs) best = Math.min(best, distance(descriptor, ref))
    out.push({ person, d: best })
  }
  return out.sort((a, b) => a.d - b.d)
}

/**
 * Decide what to do with a ranking:
 *  - { kind: 'match', person, d }            confident, unique
 *  - { kind: 'ambiguous', candidates:[...] } close to 2+ workers (lookalikes) or borderline
 *  - { kind: 'unknown' }                      nobody close enough
 */
export function classify(ranking) {
  const [first, second] = ranking
  if (!first || first.d > AMBIGUOUS_MAX) return { kind: 'unknown', best: first?.d ?? null }
  const margin = second ? second.d - first.d : Infinity
  if (first.d <= MATCH_MAX && margin >= MIN_MARGIN) return { kind: 'match', person: first.person, d: first.d, margin }
  const candidates = ranking.filter((r) => r.d <= AMBIGUOUS_MAX).slice(0, 3)
  return { kind: 'ambiguous', candidates }
}

/** Similarity 0..1 for display/storage (1 = identical). */
export const scoreFromDistance = (d) => Math.max(0, Math.min(1, 1 - d))

/** Average several descriptors into one (used to sanity-check enrollment samples). */
export function meanDescriptor(list) {
  const n = list.length
  const out = new Array(list[0].length).fill(0)
  for (const v of list) for (let i = 0; i < v.length; i++) out[i] += v[i] / n
  return out
}

/** Round to 4 decimals so stored descriptors stay small. */
export const compact = (desc) => desc.map((x) => Math.round(x * 10000) / 10000)
