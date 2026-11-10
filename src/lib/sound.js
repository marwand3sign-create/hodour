/**
 * Audible feedback for the gate kiosk — works offline.
 *  - chime(kind): short synthesized tone (Web Audio, no sound files)
 *  - say(text):   speaks the worker's name with the device's Arabic voice,
 *                 when the device has one (silently skipped otherwise)
 *
 * Browsers only allow audio after a user gesture, so unlock() is wired to the
 * first tap on the kiosk screen.
 */
let ctx = null

export function unlock() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
  } catch { /* no audio */ }
}

const TONES = {
  in: [[660, 0], [880, 0.12]], // rising: welcome
  out: [[880, 0], [660, 0.12]], // falling: goodbye
  already: [[740, 0], [740, 0.16]], // double: already recorded
  error: [[300, 0], [220, 0.18]], // low: not recognised
}

export function chime(kind = 'in') {
  try {
    if (!ctx) unlock()
    if (!ctx || ctx.state !== 'running') return
    const t0 = ctx.currentTime
    for (const [freq, at] of TONES[kind] || TONES.in) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t0 + at)
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.22)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t0 + at)
      osc.stop(t0 + at + 0.25)
    }
  } catch { /* ignore */ }
}

let arabicVoice
function pickVoice() {
  if (arabicVoice !== undefined) return arabicVoice
  const voices = window.speechSynthesis?.getVoices?.() || []
  if (!voices.length) return null // not loaded yet — try again next time
  arabicVoice = voices.find((v) => /^ar/i.test(v.lang)) || null
  return arabicVoice
}

export function say(text) {
  try {
    const synth = window.speechSynthesis
    if (!synth || !text) return
    const voice = pickVoice()
    if (!voice) return
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.voice = voice
    u.lang = voice.lang
    u.rate = 1.05
    synth.speak(u)
  } catch { /* ignore */ }
}
