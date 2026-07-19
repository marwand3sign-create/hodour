/**
 * Replacement for the Whacka `docs` SDK stub — client-side PDF/XLSX
 * generation, no backend involved. Used only by Reports.jsx for payroll
 * exports.
 *
 * docs.xlsx uses `exceljs`, which renders Arabic/RTL text natively — no
 * special handling needed.
 *
 * docs.pdf deliberately does NOT use jsPDF's native text drawing for the
 * report body: jsPDF has no Arabic shaping/bidi support, so Arabic text
 * drawn directly comes out reversed/disconnected. Instead it renders the
 * report as off-screen, RTL-styled HTML and rasterizes it with
 * `html2canvas` (which uses the browser's own Arabic text engine, so the
 * glyphs are correct), then slices that image into A4-sized jsPDF pages.
 * Page numbers (plain digits, no shaping needed) are drawn natively.
 */
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import ExcelJS from 'exceljs'

// ---------------- PDF ----------------

function el(tag, style, children) {
  const node = document.createElement(tag)
  if (style) Object.assign(node.style, style)
  for (const c of [].concat(children || [])) {
    if (c == null) continue
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
  }
  return node
}

function buildTable(section, theme) {
  const table = el('table', { width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: '4px' })
  const thead = el('thead')
  const headRow = el('tr')
  for (const col of section.columns) {
    headRow.appendChild(el('th', {
      textAlign: col.align || 'right', padding: '6px 8px', background: theme.primary,
      color: '#ffffff', fontWeight: '700', fontSize: '11px',
    }, col.header))
  }
  thead.appendChild(headRow)
  table.appendChild(thead)

  const tbody = el('tbody')
  section.rows.forEach((row, i) => {
    const tr = el('tr', { background: i % 2 ? '#f8fafc' : '#ffffff' })
    for (const col of section.columns) {
      tr.appendChild(el('td', {
        textAlign: col.align || 'right', padding: '5px 8px', borderBottom: '1px solid #e2e8f0', color: '#1e293b',
      }, String(row[col.key] ?? '')))
    }
    tbody.appendChild(tr)
  })
  table.appendChild(tbody)

  if (section.totals) {
    const tr = el('tr', { background: '#eef2f7', fontWeight: '700' })
    for (const col of section.columns) {
      tr.appendChild(el('td', {
        textAlign: col.align || 'right', padding: '6px 8px', borderTop: `2px solid ${theme.primary}`, color: '#0f172a',
      }, String(section.totals[col.key] ?? '')))
    }
    table.appendChild(el('tfoot', null, tr))
  }
  return table
}

function buildSection(section, theme) {
  switch (section.type) {
    case 'heading': {
      const sizes = { 1: '22px', 2: '18px', 3: '15px' }
      return el('div', {
        fontSize: sizes[section.level] || '15px', fontWeight: '800', color: '#0f172a',
        margin: section.level === 1 ? '0 0 6px' : '14px 0 4px',
      }, section.text)
    }
    case 'paragraph': {
      const p = el('div', { fontSize: '13px', margin: '2px 0' })
      for (const run of section.text) {
        p.appendChild(el('span', { fontWeight: run.bold ? '700' : '400', color: run.color || '#334155' }, run.text))
      }
      return p
    }
    case 'spacer':
      return el('div', { height: '10px' })
    case 'divider':
      return el('div', { borderTop: '1px solid #e2e8f0', margin: '10px 0' })
    case 'kpiCards': {
      const wrap = el('div', { display: 'flex', gap: '8px', flexWrap: 'wrap' })
      for (const card of section.cards) {
        wrap.appendChild(el('div', {
          flex: '1', minWidth: '90px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', textAlign: 'center',
        }, [
          el('div', { fontSize: '18px', fontWeight: '800', color: card.color || theme.primary }, card.value),
          el('div', { fontSize: '10px', color: '#64748b', marginTop: '2px' }, card.label),
        ]))
      }
      return wrap
    }
    case 'table':
      return buildTable(section, theme)
    default:
      return el('div')
  }
}

async function renderSpecToCanvas(spec) {
  const theme = spec.theme || { primary: '#0ea5e9' }
  const container = el('div', {
    position: 'fixed', top: '0', left: '-99999px', width: '780px', padding: '28px',
    background: '#ffffff', fontFamily: 'Tahoma, Arial, sans-serif',
  })
  container.dir = 'rtl'

  if (spec.header) {
    container.appendChild(el('div', {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      paddingBottom: '10px', marginBottom: '10px',
      borderBottom: spec.header.line ? `2px solid ${theme.primary}` : 'none',
      fontSize: '13px', fontWeight: '700', color: '#0f172a',
    }, [
      el('span', null, spec.header.right || ''),
      el('span', { color: theme.primary }, spec.header.left || ''),
    ]))
  }

  for (const page of spec.pages || []) {
    for (const section of page.sections || []) {
      container.appendChild(buildSection(section, theme))
    }
  }

  if (spec.footer) {
    container.appendChild(el('div', {
      marginTop: '14px', paddingTop: '8px',
      borderTop: spec.footer.line ? '1px solid #e2e8f0' : 'none',
      fontSize: '11px', color: '#64748b', textAlign: 'center',
    }, spec.footer.center || ''))
  }

  document.body.appendChild(container)
  try {
    return await html2canvas(container, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
  } finally {
    document.body.removeChild(container)
  }
}

function sliceCanvas(canvas, sliceHeightPx) {
  const slices = []
  let y = 0
  while (y < canvas.height) {
    const h = Math.min(sliceHeightPx, canvas.height - y)
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = h
    pageCanvas.getContext('2d').drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h)
    slices.push({ dataUrl: pageCanvas.toDataURL('image/jpeg', 0.92), heightPx: h })
    y += h
  }
  return slices
}

export const docs = {
  pdf: async (spec) => {
    const canvas = await renderSpecToCanvas(spec)
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageWidthMm = pdf.internal.pageSize.getWidth()
    const pageHeightMm = pdf.internal.pageSize.getHeight()
    const pxPerMm = canvas.width / pageWidthMm
    const sliceHeightPx = Math.floor(pageHeightMm * pxPerMm)
    const slices = sliceCanvas(canvas, sliceHeightPx)

    slices.forEach((slice, i) => {
      if (i > 0) pdf.addPage()
      const heightMm = slice.heightPx / pxPerMm
      pdf.addImage(slice.dataUrl, 'JPEG', 0, 0, pageWidthMm, heightMm)
      if (spec.footer?.pageNumbers) {
        pdf.setFontSize(9)
        pdf.setTextColor(120, 120, 120)
        pdf.text(`${i + 1} / ${slices.length}`, pageWidthMm / 2, pageHeightMm - 5, { align: 'center' })
      }
    })

    return pdf.output('blob')
  },

  // ---------------- XLSX ----------------
  xlsx: async (spec) => {
    const workbook = new ExcelJS.Workbook()
    for (const sheetSpec of spec.sheets) {
      const sheet = workbook.addWorksheet(sheetSpec.name || 'Sheet', { views: [{ rightToLeft: true }] })
      sheet.columns = sheetSpec.columns.map((c) => ({
        header: c.header, key: c.key, width: 18,
        style: { numFmt: c.numFmt, alignment: { horizontal: c.align || 'right' } },
      }))
      const headerRow = sheet.getRow(1)
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: 'FF' + (sheetSpec.headerColor || '#0ea5e9').replace('#', '').toUpperCase() },
      }
      for (const row of sheetSpec.rows || []) sheet.addRow(row)
      if (sheetSpec.totals) {
        const totalsRow = sheet.addRow(sheetSpec.totals)
        totalsRow.font = { bold: true }
      }
    }
    const buffer = await workbook.xlsx.writeBuffer()
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  },
}
