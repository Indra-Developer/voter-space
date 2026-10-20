import type { VoterRecord } from './types'

const columns = ['S.No', 'Door No & Number of Voters', 'Area', 'Name', 'Voter ID', 'Ward Serial', 'Mobile Number']

function rows(records: VoterRecord[]) {
  const doorCounts = records.reduce((counts, record) => {
    const doorNumber = record.doorNumber || '—'
    counts.set(doorNumber, (counts.get(doorNumber) ?? 0) + 1)
    return counts
  }, new Map<string, number>())

  return records.map((record, index) => {
    const doorNumber = record.doorNumber || '—'
    return [
      String(index + 1),
      `${doorNumber}\nVoters: ${doorCounts.get(doorNumber) ?? 0}`,
      record.area || record.division || '—',
      record.fullName || '—',
      record.voterId || record.alternateIdentifier || '—',
      record.serialNumber || '—',
      record.mobile || '—',
    ]
  })
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
  const { jsPDF } = await import('jspdf')
  const pdfTable = createPdfTable(records)
  document.body.appendChild(pdfTable)

  try {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
    await new Promise<void>((resolve, reject) => {
      pdf.html(pdfTable, {
        autoPaging: 'text',
        callback: (completedPdf) => {
          completedPdf.save('voter-register.pdf')
          resolve()
        },
        html2canvas: { backgroundColor: '#ffffff', scale: 1, useCORS: true },
        margin: [24, 24, 24, 24],
        windowWidth: 1100,
        x: 24,
        y: 24,
        width: 744,
      }).catch(reject)
    })
  } finally {
    pdfTable.remove()
  }
}

function createPdfTable(records: VoterRecord[]) {
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-100000px;top:0;width:1100px;background:#fff;color:#173b3a;font-family:"Nirmala UI","Noto Sans Telugu",Arial,sans-serif;font-size:12px;line-height:1.35;'

  const title = document.createElement('h1')
  title.textContent = 'Voter Space — Voter Register / ఓటర్ రిజిస్టర్'
  title.style.cssText = 'margin:0 0 8px;font-size:20px;color:#123c7a;'
  container.appendChild(title)

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
  rows(records).forEach((row) => {
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
  link.click()
  URL.revokeObjectURL(url)
}
