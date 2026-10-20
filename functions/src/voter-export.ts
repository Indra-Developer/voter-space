import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas'
import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'

export type ExportFormat = 'excel' | 'pdf' | 'csv'

export type ExportVoterRecord = {
  fullName: string
  doorNumber: string
  area: string
  voterId: string
  serialNumber: string
  mobile: string
}

const columns = ['S.No', 'Door No & Number of Voters', 'Area', 'Name', 'Voter ID', 'Ward Serial', 'Mobile Number']

export async function buildVoterExport(format: ExportFormat, records: ExportVoterRecord[], onProgress?: (progress: number) => Promise<void>) {
  const ordered = sortVoters(records)
  if (format === 'csv') return Buffer.from(buildCsv(ordered), 'utf8')
  if (format === 'excel') return buildExcel(ordered)
  return buildPdf(ordered, onProgress)
}

function buildCsv(records: ExportVoterRecord[]) {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
  const doorCounts = createDoorCounts(records)
  const output = [columns.map(escape).join(',')]
  records.forEach((record, index) => output.push(exportRow(record, index, doorCounts).map(escape).join(',')))
  return `\uFEFF${output.join('\n')}`
}

function buildExcel(records: ExportVoterRecord[]) {
  const doorCounts = createDoorCounts(records)
  const sheetRows = [columns, ...records.map((record, index) => exportRow(record, index, doorCounts))]
  const sheet = XLSX.utils.aoa_to_sheet(sheetRows)
  sheet['!cols'] = columns.map((column) => ({ wch: Math.max(14, column.length + 5) }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Voters')
  return Buffer.from(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer', compression: true }))
}

async function buildPdf(records: ExportVoterRecord[], onProgress?: (progress: number) => Promise<void>) {
  registerTeluguFont()
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true })
  const pages = chunk(records, 17)
  const doorCounts = createDoorCounts(records)
  for (const [pageIndex, pageRecords] of pages.entries()) {
    const jpeg = renderPdfPage(pageRecords, pageIndex * 17, records.length, pageIndex + 1, pages.length, doorCounts)
    if (pageIndex > 0) pdf.addPage('a4', 'landscape')
    const width = pdf.internal.pageSize.getWidth()
    const height = pdf.internal.pageSize.getHeight()
    pdf.addImage(jpeg, 'JPEG', 0, 0, width, height, undefined, 'FAST')
    await onProgress?.(18 + Math.round(((pageIndex + 1) / pages.length) * 78))
  }
  return Buffer.from(pdf.output('arraybuffer'))
}

function renderPdfPage(records: ExportVoterRecord[], startIndex: number, total: number, pageNumber: number, pageCount: number, doorCounts: Map<string, number>) {
  const width = 1400
  const height = 990
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.textBaseline = 'middle'
  context.font = '700 28px "Noto Sans Telugu", Arial, sans-serif'
  context.fillStyle = '#123f3b'
  context.fillText('Voter Space / ఓటర్ రిజిస్టర్', 24, 28)
  context.font = '18px "Noto Sans Telugu", Arial, sans-serif'
  context.fillStyle = '#526c69'
  context.fillText(`${startIndex + 1}-${startIndex + records.length} / ${total} · Page ${pageNumber} / ${pageCount}`, width - 400, 28)

  const top = 62
  const headerHeight = 42
  const rowHeight = 50
  const columnWidths = [84, 250, 265, 335, 195, 126, 145]
  let x = 0
  context.font = '700 18px Arial, "Noto Sans Telugu", sans-serif'
  columns.forEach((column, index) => {
    context.fillStyle = '#123f3b'
    context.fillRect(x, top, columnWidths[index], headerHeight)
    context.fillStyle = '#ffffff'
    drawWrappedText(context, column, x + 8, top + headerHeight / 2, columnWidths[index] - 16, 17, 2)
    x += columnWidths[index]
  })

  context.font = '18px "Noto Sans Telugu", Arial, sans-serif'
  records.forEach((record, rowIndex) => {
    const values = exportRow(record, startIndex + rowIndex, doorCounts)
    let cellX = 0
    values.forEach((value, cellIndex) => {
      context.fillStyle = cellIndex === 4 ? '#fff5c9' : '#ffffff'
      context.fillRect(cellX, top + headerHeight + rowIndex * rowHeight, columnWidths[cellIndex], rowHeight)
      context.strokeStyle = '#bfd0cd'
      context.lineWidth = 1
      context.strokeRect(cellX, top + headerHeight + rowIndex * rowHeight, columnWidths[cellIndex], rowHeight)
      context.fillStyle = '#173b3a'
      drawWrappedText(context, value, cellX + 8, top + headerHeight + rowIndex * rowHeight + rowHeight / 2, columnWidths[cellIndex] - 16, 17, 2)
      cellX += columnWidths[cellIndex]
    })
  })
  return canvas.toBuffer('image/jpeg', 86)
}

function registerTeluguFont() {
  const fontPath = join(__dirname, '../node_modules/@fontsource/noto-sans-telugu/files/noto-sans-telugu-telugu-400-normal.woff')
  if (existsSync(fontPath) && !GlobalFonts.has('Noto Sans Telugu')) GlobalFonts.registerFromPath(fontPath, 'Noto Sans Telugu')
}

function drawWrappedText(context: SKRSContext2D, value: string, x: number, centerY: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const words = value.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word
    if (context.measureText(candidate).width <= maxWidth) current = candidate
    else if (current) { lines.push(current); current = word }
    else {
      let partial = ''
      for (const character of Array.from(word)) {
        if (context.measureText(partial + character).width > maxWidth && partial) { lines.push(partial); partial = character }
        else partial += character
      }
      current = partial
    }
  })
  if (current) lines.push(current)
  const visible = lines.slice(0, maxLines)
  if (lines.length > maxLines && visible.length) visible[visible.length - 1] = `${visible[visible.length - 1].slice(0, -1)}…`
  const firstY = centerY - ((visible.length - 1) * lineHeight) / 2
  visible.forEach((line, index) => context.fillText(line, x, firstY + index * lineHeight))
}

function exportRow(record: ExportVoterRecord, index: number, doorCounts: Map<string, number>) {
  const door = record.doorNumber || '—'
  return [String(index + 1), `${door}\nVoters: ${doorCounts.get(door) ?? 0}`, record.area || '—', record.fullName || '—', record.voterId || 'Missing / Verification required', record.serialNumber || '—', record.mobile || '—']
}

function createDoorCounts(records: ExportVoterRecord[]) {
  return records.reduce((counts, record) => {
    const door = record.doorNumber || '—'
    counts.set(door, (counts.get(door) ?? 0) + 1)
    return counts
  }, new Map<string, number>())
}

function sortVoters(records: ExportVoterRecord[]) {
  return [...records].sort((first, second) => naturalCompare(first.doorNumber || '—', second.doorNumber || '—') || naturalCompare(first.serialNumber, second.serialNumber) || first.fullName.localeCompare(second.fullName, 'te'))
}

function naturalCompare(first: string, second: string) {
  if (first === '—') return second === '—' ? 0 : 1
  if (second === '—') return -1
  const left = first.toLocaleUpperCase().match(/\d+|\D+/g) ?? []
  const right = second.toLocaleUpperCase().match(/\d+|\D+/g) ?? []
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const firstPart = left[index] ?? ''
    const secondPart = right[index] ?? ''
    if (firstPart === secondPart) continue
    if (/^\d+$/.test(firstPart) && /^\d+$/.test(secondPart)) return Number(firstPart) - Number(secondPart)
    return firstPart.localeCompare(secondPart, 'en')
  }
  return 0
}

function chunk<T>(values: T[], size: number) {
  if (!values.length) return [[] as T[]]
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}
