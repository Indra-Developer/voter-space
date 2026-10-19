import type { VoterRecord } from './types'

const columns = ['Voter name', 'Relative name', 'Relationship', 'Age', 'Gender', 'House / Door No.', 'Voter ID card No.', 'Alternate ID', 'Mobile No.', 'Ward roll serial', 'Assembly serial', 'Ward', 'Booth', 'Area', 'Division', 'Source PDF', 'PDF page', 'Card position', 'Uploaded by', 'Uploaded date']

function rows(records: VoterRecord[]) {
  return records.map((record) => [record.fullName, record.relativeName, record.relationshipType, record.age, record.gender, record.doorNumber, record.voterId, record.alternateIdentifier, record.mobile, record.serialNumber, record.assemblySerial, record.wardId, record.boothId, record.area, record.division, record.sourcePdfName, String(record.pageNumber ?? ''), String(record.cardPosition ?? ''), record.uploadedBy, formatDate(record.uploadedAt)])
}

export function downloadCsv(records: VoterRecord[]) {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
  const content = [columns, ...rows(records)].map((row) => row.map(escape).join(',')).join('\n')
  download(new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' }), 'voter-register.csv')
}

export async function downloadExcel(records: VoterRecord[]) {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.aoa_to_sheet([columns, ...rows(records)])
  sheet['!cols'] = columns.map((column) => ({ wch: Math.max(13, column.length + 4) }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Voters')
  XLSX.writeFile(workbook, 'voter-register.xlsx')
}

export async function downloadPdf(records: VoterRecord[]) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  document.setFontSize(14)
  document.text('Voter Space — Voter Register', 36, 34)
  autoTable(document, { head: [columns], body: rows(records), startY: 48, styles: { fontSize: 6, cellPadding: 3 }, headStyles: { fillColor: [20, 122, 76] } })
  document.save('voter-register.pdf')
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function formatDate(value?: string) {
  return value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value)) : ''
}
