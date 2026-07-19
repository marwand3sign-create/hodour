/**
 * Replacement for the Whacka `_on-primary` internal stub — computes a
 * readable text color (near-black or white) against either an explicit hex
 * color or the app's `--color-primary` CSS variable (see src/index.css).
 * Used by TeamLogin.jsx for its primary-colored buttons. No backend involved.
 */

function readPrimaryRgb() {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()
    const parts = raw.split(/\s+/).map(Number)
    if (parts.length === 3 && parts.every(Number.isFinite)) return parts
  } catch {}
  return [56, 189, 248] // cyan-400 fallback, matches index.css's default
}

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}

export function onPrimaryColor(color) {
  const [r, g, b] = typeof color === 'string' && /^#/.test(color) ? hexToRgb(color) : readPrimaryRgb()
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#0f172a' : '#ffffff'
}
