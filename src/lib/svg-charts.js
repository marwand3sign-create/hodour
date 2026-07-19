/**
 * Replacement for the Whacka `svg-charts` SDK stub. Purely client-side SVG
 * rendering, no backend involved — used by Chart.jsx (in turn used by
 * Dashboard.jsx's 7-day hours bar chart).
 */

export const xesc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
export const safeColor = (c, fallback = '#0ea5e9') => (typeof c === 'string' && HEX_RE.test(c) ? c : fallback)

const PALETTE = ['#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#14b8a6', '#eab308', '#6366f1']

function svgWrap(width, height, inner) {
  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" width="100%" style="display:block">${inner}</svg>`
}

function maxOf(series) {
  let m = 0
  for (const s of series) for (const v of s.data || []) m = Math.max(m, Number(v) || 0)
  return m || 1
}

function renderBar(spec, horizontal) {
  const W = 640, H = 300, padL = horizontal ? 90 : 40, padB = horizontal ? 20 : 44, padT = 24, padR = 16
  const series = spec.series || []
  const labels = spec.labels || []
  const max = spec.options?.yMax || maxOf(series)
  const plotW = W - padL - padR, plotH = H - padT - padB
  const n = labels.length || (series[0]?.data.length ?? 0)
  let bars = ''
  let axis = ''

  if (!horizontal) {
    const groupW = plotW / Math.max(n, 1)
    const barW = Math.min(28, groupW * 0.6) / (series.length || 1)
    for (let i = 0; i < n; i++) {
      series.forEach((s, si) => {
        const v = Number(s.data[i]) || 0
        const h = (v / max) * plotH
        const x = padL + i * groupW + groupW / 2 - (series.length * barW) / 2 + si * barW
        const y = padT + plotH - h
        const color = safeColor(s.color, PALETTE[si % PALETTE.length])
        bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barW - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${color}" />`
      })
      const lx = padL + i * groupW + groupW / 2
      axis += `<text x="${lx.toFixed(1)}" y="${H - padB + 16}" font-size="11" fill="#64748b" text-anchor="middle">${xesc(labels[i] ?? '')}</text>`
    }
  } else {
    const rowH = plotH / Math.max(n, 1)
    const barH = Math.min(22, rowH * 0.6)
    for (let i = 0; i < n; i++) {
      const s = series[0] || { data: [] }
      const v = Number(s.data[i]) || 0
      const w = (v / max) * plotW
      const y = padT + i * rowH + rowH / 2 - barH / 2
      const color = safeColor(s.color, PALETTE[0])
      bars += `<rect x="${padL}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="${color}" />`
      axis += `<text x="${padL - 8}" y="${(y + barH / 2 + 4).toFixed(1)}" font-size="11" fill="#64748b" text-anchor="end">${xesc(labels[i] ?? '')}</text>`
    }
  }

  const axisLine = `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="#e2e8f0" /><line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#e2e8f0" />`
  const title = spec.options?.title ? `<text x="${padL}" y="16" font-size="13" font-weight="700" fill="#0f172a">${xesc(spec.options.title)}</text>` : ''
  return svgWrap(W, H, title + axisLine + bars + axis)
}

function renderLine(spec) {
  const W = 640, H = 300, padL = 40, padB = 30, padT = 24, padR = 16
  const series = spec.series || []
  const labels = spec.labels || []
  const max = spec.options?.yMax || maxOf(series)
  const plotW = W - padL - padR, plotH = H - padT - padB
  const n = labels.length || (series[0]?.data.length ?? 0)
  const stepX = plotW / Math.max(n - 1, 1)

  let paths = ''
  series.forEach((s, si) => {
    const color = safeColor(s.color, PALETTE[si % PALETTE.length])
    const pts = (s.data || []).map((v, i) => {
      const x = padL + i * stepX
      const y = padT + plotH - (Number(v) / max) * plotH
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    paths += `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" />`
    pts.forEach((p) => { const [x, y] = p.split(','); paths += `<circle cx="${x}" cy="${y}" r="3" fill="${color}" />` })
  })
  const axisLabels = labels.map((l, i) => `<text x="${(padL + i * stepX).toFixed(1)}" y="${H - padB + 16}" font-size="11" fill="#64748b" text-anchor="middle">${xesc(l)}</text>`).join('')
  const axisLine = `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="#e2e8f0" /><line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#e2e8f0" />`
  return svgWrap(W, H, axisLine + paths + axisLabels)
}

function renderPie(spec, donut) {
  const size = 260, cx = size / 2, cy = size / 2, r = size / 2 - 10
  const data = spec.series?.[0]?.data || []
  const labels = spec.labels || []
  const total = data.reduce((a, v) => a + (Number(v) || 0), 0) || 1
  let angle = -Math.PI / 2
  let slices = ''
  data.forEach((v, i) => {
    const frac = (Number(v) || 0) / total
    const next = angle + frac * Math.PI * 2
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle)
    const x2 = cx + r * Math.cos(next), y2 = cy + r * Math.sin(next)
    const large = frac > 0.5 ? 1 : 0
    const color = safeColor(spec.series[0].color, PALETTE[i % PALETTE.length])
    slices += `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${PALETTE[i % PALETTE.length]}" />`
    angle = next
  })
  const hole = donut ? `<circle cx="${cx}" cy="${cy}" r="${(r * 0.55).toFixed(1)}" fill="#ffffff" />` : ''
  const legend = labels.map((l, i) => `<text x="10" y="${20 + i * 16}" font-size="11" fill="#334155">● ${xesc(l)}</text>`).join('')
  return svgWrap(size + 120, size, slices + hole + `<g transform="translate(${size},0)">${legend}</g>`)
}

export function chartSvg(spec) {
  const kind = spec?.kind || 'bar'
  if (kind === 'bar') return renderBar(spec, false)
  if (kind === 'hbar') return renderBar(spec, true)
  if (kind === 'line') return renderLine(spec)
  if (kind === 'pie') return renderPie(spec, false)
  if (kind === 'donut') return renderPie(spec, true)
  throw new Error(`Unsupported chart kind "${kind}"`)
}

// Not used anywhere in this app (no Gantt views) — kept for import compatibility.
export function ganttSvg() { return '' }
export function ganttDomain() { return { start: null, end: null } }
