import type { PdfImport } from '../pdf-import/types'

const columns = ['PDF name', 'Ward', 'Booth', 'Area', 'Division', 'Status', 'Voters saved', 'Uploaded by', 'Uploaded date']

function rows(records: PdfImport[]) {
  return records.map((item) => [item.originalFileName, item.wardId, item.boothId, item.area, item.division, item.status, String(item.rowCount ?? 0), item.uploadedByName, formatDate(item.uploadedAt ?? item.createdAt)])
}

export function downloadLibraryCsv(records: PdfImport[]) {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
  const content = [columns, ...rows(records)].map((row) => row.map(escape).join(',')).join('\n')
  download(new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' }), 'voter-space-pdf-library.csv')
}

export async function downloadLibraryExcel(records: PdfImport[]) {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.aoa_to_sheet([columns, ...rows(records)])
  sheet['!cols'] = columns.map((column) => ({ wch: Math.max(12, column.length + 5) }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'PDF Library')
  XLSX.writeFile(workbook, 'voter-space-pdf-library.xlsx')
}

export async function downloadLibraryPdf(records: PdfImport[]) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  document.setFontSize(14)
  document.text('Voter Space — PDF Library Report', 36, 34)
  autoTable(document, { head: [columns], body: rows(records), startY: 48, styles: { fontSize: 6, cellPadding: 3 }, headStyles: { fillColor: [20, 122, 76] } })
  document.save('voter-space-pdf-library.pdf')
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function formatDate(value?: string) { return value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value)) : '' }
