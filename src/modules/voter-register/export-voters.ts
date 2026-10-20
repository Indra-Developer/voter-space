import type { VoterRecord } from './types'

const columns = ['S.No', 'Door No & Number of Voters', 'Area', 'Name', 'Voter ID', 'Ward Serial', 'Mobile Number']

function rows(records: VoterRecord[], startIndex = 0) {
  const doorCounts = records.reduce((counts, record) => {
    const doorNumber = record.doorNumber || '—'
    counts.set(doorNumber, (counts.get(doorNumber) ?? 0) + 1)
    return counts
  }, new Map<string, number>())

  return records.map((record, index) => {
    const doorNumber = record.doorNumber || '—'
    return [
      String(startIndex + index + 1),
      `${doorNumber}\nVoters: ${doorCounts.get(doorNumber) ?? 0}`,
      record.area || record.division || '—',
      record.fullName || '—',
      record.voterId || record.alternateIdentifier || '—',
      record.serialNumber || '—',
      record.mobile || '—',
    ]
  })
}

export function downloadCsv(records: VoterRecord[], filename = 'voter-register.csv') {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
  const content = [columns, ...rows(records)].map((row) => row.map(escape).join(',')).join('\n')
  download(new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' }), safeExportName(filename, 'csv'))
}

export async function downloadExcel(records: VoterRecord[], filename = 'voter-register.xlsx') {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.aoa_to_sheet([columns, ...rows(records)])
  sheet['!cols'] = columns.map((column) => ({ wch: Math.max(13, column.length + 4) }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Voters')
  XLSX.writeFile(workbook, safeExportName(filename, 'xlsx'))
}

export async function downloadPdf(records: VoterRecord[], filename = 'voter-register.pdf') {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')])
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true })
  const pages = chunk(records, 18)

  await document.fonts.ready
  for (const [pageIndex, pageRecords] of pages.entries()) {
    const pdfTable = createPdfTable(pageRecords, pageIndex * 18, records.length, pageIndex + 1, pages.length)
    document.body.appendChild(pdfTable)
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
      const canvas = await html2canvas(pdfTable, { backgroundColor: '#ffffff', scale: 1.5, useCORS: true, logging: false })
      if (pageIndex > 0) pdf.addPage('a4', 'landscape')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 22
      const scale = Math.min((pageWidth - margin * 2) / canvas.width, (pageHeight - margin * 2) / canvas.height)
      const imageWidth = canvas.width * scale
      const imageHeight = canvas.height * scale
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', margin, margin, imageWidth, imageHeight, undefined, 'FAST')
    } finally {
      pdfTable.remove()
    }
  }
  pdf.save(safeExportName(filename, 'pdf'))
}

function createPdfTable(records: VoterRecord[], startIndex: number, totalRecords: number, pageNumber: number, pageCount: number) {
  const container = document.createElement('div')
  container.dataset.voterPdfExport = 'true'
  container.style.cssText = 'position:fixed;left:-20000px;top:0;width:1100px;padding:12px;background:#fff;color:#173b3a;font-family:"Nirmala UI","Noto Sans Telugu","Gautami",Arial,sans-serif;font-size:13px;line-height:1.4;pointer-events:none;'

  const title = document.createElement('h1')
  title.textContent = 'Voter Space — Voter Register / ఓటర్ రిజిస్టర్'
  title.style.cssText = 'margin:0 0 8px;font-size:20px;color:#123c7a;'
  container.appendChild(title)

  const summary = document.createElement('p')
  summary.textContent = `${startIndex + 1}-${startIndex + records.length} / ${totalRecords} · Page ${pageNumber} / ${pageCount}`
  summary.style.cssText = 'margin:0 0 10px;color:#526c69;font-size:11px;'
  container.appendChild(summary)

  const table = document.createElement('table')
  table.style.cssText = 'width:100%;border-collapse:collapse;table-layout:fixed;'
  const columnWidths = ['6%', '18%', '19%', '23%', '14%', '10%', '10%']
  const head = document.createElement('thead')
  const headRow = document.createElement('tr')
  columns.forEach((column, index) => {
    const cell = document.createElement('th')
    cell.textContent = column
    cell.style.cssText = `width:${columnWidths[index]};padding:8px 7px;border:1px solid #b7cbc8;background:#123f3b;color:#fff;text-align:left;font-weight:700;`
    headRow.appendChild(cell)
  })
  head.appendChild(headRow)
  table.appendChild(head)

  const body = document.createElement('tbody')
  rows(records, startIndex).forEach((row) => {
    const tableRow = document.createElement('tr')
    row.forEach((value) => {
      const cell = document.createElement('td')
      cell.textContent = value
      cell.style.cssText = 'padding:7px;border:1px solid #cbd9d7;vertical-align:top;white-space:pre-line;overflow-wrap:anywhere;color:#173b3a;background:#fff;'
      tableRow.appendChild(cell)
    })
    body.appendChild(tableRow)
  })
  table.appendChild(body)
  container.appendChild(table)
  return container
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function chunk<T>(values: T[], size: number) {
  if (values.length === 0) return [[]]
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

function safeExportName(filename: string, extension: string) {
  const withoutExtension = filename.replace(/\.[^.]+$/, '')
  const safeBase = withoutExtension.replace(/[<>:"/\\|?*\p{Cc}]+/gu, '-').trim().slice(0, 120) || 'voter-register'
  return `${safeBase}.${extension}`
}
