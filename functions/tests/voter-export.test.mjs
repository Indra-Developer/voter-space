import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import * as XLSX from 'xlsx'
import { buildVoterExport } from '../lib/voter-export.js'

const records = [
  { fullName: 'సునీత యాదవ్', doorNumber: '1/173', area: 'మాల్కాపురం', voterId: 'XB01245233', serialNumber: '14', mobile: '9876543210' },
  { fullName: 'BORRA KODANDARAO', doorNumber: '1-65', area: 'Pallivooru street', voterId: 'UEJ0486845', serialNumber: '393', mobile: '' },
]

test('CSV export preserves Telugu and produces one physical line per voter', async () => {
  const buffer = await buildVoterExport('csv', records)
  const csv = buffer.toString('utf8')
  assert.equal(csv.charCodeAt(0), 0xFEFF)
  assert.match(csv, /సునీత యాదవ్/)
  assert.match(csv, /మాల్కాపురం/)
  assert.equal(csv.split('\n').length, records.length + 1)
})

test('Excel export preserves identifiers and Telugu text', async () => {
  const buffer = await buildVoterExport('excel', records)
  const workbook = XLSX.read(buffer, { type: 'buffer', cellStyles: true })
  const sheet = workbook.Sheets.Voters
  assert.ok(sheet)
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false })
  const teluguRow = rows.find((row) => row[4] === 'XB01245233')
  const englishRow = rows.find((row) => row[4] === 'UEJ0486845')
  assert.equal(teluguRow?.[3], 'సునీత యాదవ్')
  assert.equal(teluguRow?.[2], 'మాల్కాపురం')
  assert.equal(englishRow?.[1], '1-65 (Voters: 1)')
  assert.ok((sheet['!cols']?.[3]?.wch ?? 0) >= 30)
})

test('PDF export opens successfully and contains a printable page', async () => {
  const buffer = await buildVoterExport('pdf', records)
  assert.equal(buffer.subarray(0, 4).toString(), '%PDF')
  const loadingTask = getDocument({ data: new Uint8Array(buffer) })
  const document = await loadingTask.promise
  assert.equal(document.numPages, 1)
  const page = await document.getPage(1)
  const viewport = page.getViewport({ scale: 1 })
  assert.ok(viewport.width > viewport.height)
  await loadingTask.destroy()
})
