import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas'
import { ImageAnnotatorClient } from '@google-cloud/vision'
import { getStorage } from 'firebase-admin/storage'

type CardRect = { x: number; y: number; w: number; h: number }
type ScopeDefaults = { wardId: string; boothId: string; area: string; division: string }
type VisionWord = { x: number; y: number; w: number; h: number; text: string; confidence: number }

export type CoverAreaRow = {
  order: number
  division: string
  area: string
  doorFrom: string
  doorTo: string
  male?: number
  female?: number
  other?: number
  total?: number
  confidence: number
  sourcePage: number
}

export type ExtractedVoterCard = {
  fullName: string
  relativeName: string
  relationshipType: string
  age: string
  gender: string
  doorNumber: string
  voterId: string
  alternateIdentifier: string
  mobile: string
  serialNumber: string
  assemblySerial: string
  wardId: string
  boothId: string
  area: string
  division: string
  confidence: number
  rawText: string
  voterCardImagePath: string
  pageNumber: number
  cardPosition: number
}

export type PdfCardExtractionResult = {
  rows: ExtractedVoterCard[]
  pageCount: number
  coverRows: CoverAreaRow[]
}

// PDF.js expects these browser geometry classes. @napi-rs/canvas supplies
// native Node.js equivalents that work inside a 2nd generation Cloud Function.
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D })

export async function extractVoterCardsFromPdf({
  pdfBytes,
  sourcePdfId,
  scope,
  onProgress,
}: {
  pdfBytes: Buffer
  sourcePdfId: string
  scope: ScopeDefaults
  onProgress?: (pageNumber: number, pageCount: number, cardCount: number) => Promise<void>
}): Promise<PdfCardExtractionResult> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
    disableFontFace: true,
    useSystemFonts: true,
  })
  const pdf = await loadingTask.promise
  const vision = new ImageAnnotatorClient()
  const bucket = getStorage().bucket()
  const rows: ExtractedVoterCard[] = []
  let coverRows: CoverAreaRow[] = []

  try {
    if (pdf.numPages > 0) {
      const coverPage = await pdf.getPage(1)
      coverRows = await readCoverRows(coverPage, vision)
      coverPage.cleanup()
    }

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const smallViewport = page.getViewport({ scale: 2 })
      const small = createCanvas(Math.ceil(smallViewport.width), Math.ceil(smallViewport.height))
      const smallContext = small.getContext('2d')
      await page.render({ canvas: small as never, canvasContext: smallContext as never, viewport: smallViewport }).promise
      const rects = detectCardRects(smallContext.getImageData(0, 0, small.width, small.height), small.width, small.height)
      small.width = 1
      small.height = 1

      if (!rects.length) {
        page.cleanup()
        await onProgress?.(pageNumber, pdf.numPages, rows.length)
        continue
      }

      const largeViewport = page.getViewport({ scale: 5 })
      const large = createCanvas(Math.ceil(largeViewport.width), Math.ceil(largeViewport.height))
      const largeContext = large.getContext('2d')
      await page.render({ canvas: large as never, canvasContext: largeContext as never, viewport: largeViewport }).promise

      const cards = rects.map((rect, index) => {
        const scale = 2.5
        const x = Math.round(rect.x * scale)
        const y = Math.round(rect.y * scale)
        const width = Math.round(rect.w * scale)
        const height = Math.round(rect.h * scale)
        const outputWidth = 900
        const outputHeight = Math.round(outputWidth * height / width)
        const card = createCanvas(outputWidth, outputHeight)
        const context = card.getContext('2d')
        context.fillStyle = '#fff'
        context.fillRect(0, 0, outputWidth, outputHeight)
        context.drawImage(large, x, y, width, height, 0, 0, outputWidth, outputHeight)
        const buffer = card.toBuffer('image/png')
        card.width = 1
        card.height = 1
        return { buffer, cardPosition: index + 1 }
      })

      large.width = 1
      large.height = 1
      page.cleanup()

      const texts = await recognizeCards(cards.map((card) => card.buffer), vision)
      const pageRows = await Promise.all(cards.map(async (card, index) => {
        const imagePath = `voter-cards/${sourcePdfId}/p${String(pageNumber).padStart(4, '0')}-c${String(card.cardPosition).padStart(3, '0')}.png`
        await bucket.file(imagePath).save(card.buffer, {
          resumable: false,
          contentType: 'image/png',
          metadata: {
            cacheControl: 'private, max-age=3600',
            metadata: { sourcePdfId, pageNumber: String(pageNumber), cardPosition: String(card.cardPosition) },
          },
        })
        return parseVoterCard(texts[index]?.text ?? '', texts[index]?.confidence ?? 0, scope, coverRows, imagePath, pageNumber, card.cardPosition)
      }))
      rows.push(...pageRows)
      await onProgress?.(pageNumber, pdf.numPages, rows.length)
    }
  } finally {
    await loadingTask.destroy()
    await vision.close().catch(() => undefined)
  }

  if (!rows.length) {
    throw new Error('No voter cards were detected. Use a voter-list PDF with clear black card borders like the original Ward Desk PDF.')
  }
  return { rows, pageCount: pdf.numPages, coverRows }
}

export function detectCardRects(imageData: { data: Uint8ClampedArray }, width: number, height: number): CardRect[] {
  const pixels = imageData.data
  const minimum = width * 0.18
  const maximum = width * 0.28
  const lines: Array<{ x: number; y: number; w: number }> = []
  const dark = (x: number, y: number) => {
    const safeX = Math.max(0, Math.min(width - 1, x))
    const safeY = Math.max(0, Math.min(height - 1, y))
    const offset = (safeY * width + safeX) * 4
    return pixels[offset] < 160 && pixels[offset + 1] < 160 && pixels[offset + 2] < 160
  }

  for (let y = 15; y < height - 10; y += 1) {
    let start = -1
    let gap = 0
    for (let x = 5; x < width; x += 1) {
      if (dark(x, y)) {
        if (start < 0) start = x
        gap = 0
      } else if (start >= 0) {
        gap += 1
        if (gap > 1 || x === width - 1) {
          const end = x - gap
          const length = end - start + 1
          if (length >= minimum && length <= maximum) lines.push({ x: start, y, w: length })
          start = -1
          gap = 0
        }
      }
    }
  }

  const unique: Array<{ x: number; y: number; w: number }> = []
  for (const line of lines) {
    if (!unique.some((existing) => Math.abs(existing.x - line.x) < 3 && Math.abs(existing.y - line.y) < 2 && Math.abs(existing.w - line.w) < 4)) unique.push(line)
  }

  const rects: CardRect[] = []
  for (const top of unique) {
    const bottoms = unique
      .filter((line) => Math.abs(line.x - top.x) < 5 && Math.abs(line.w - top.w) < 6 && line.y - top.y > top.w * 0.28 && line.y - top.y < top.w * 0.72)
      .sort((first, second) => first.y - second.y)
    for (const bottom of bottoms) {
      let good = 0
      let total = 0
      for (let y = top.y + 1; y < bottom.y; y += 2) {
        total += 1
        const left = [-1, 0, 1, 2].some((offset) => dark(top.x + offset, y))
        const right = [-2, -1, 0, 1, 2].some((offset) => dark(top.x + top.w - 1 + offset, y))
        if (left && right) good += 1
      }
      // PDF renderers can break a thin side border at a few pixels. The
      // top and bottom card borders are still the strongest signal, so do
      // not reject an otherwise valid card because of a tiny side gap.
      if (total && good / total > 0.72) {
        const rect = { x: top.x, y: top.y, w: top.w, h: bottom.y - top.y }
        if (!rects.some((existing) => Math.abs(existing.x - rect.x) < 3 && Math.abs(existing.y - rect.y) < 2)) rects.push(rect)
        break
      }
    }
  }

  const selected: CardRect[] = []
  for (const rect of rects.sort((first, second) => Math.abs(first.h / first.w - 0.4285) - Math.abs(second.h / second.w - 0.4285))) {
    const overlaps = selected.some((existing) => {
      const overlapWidth = Math.max(0, Math.min(existing.x + existing.w, rect.x + rect.w) - Math.max(existing.x, rect.x))
      const overlapHeight = Math.max(0, Math.min(existing.y + existing.h, rect.y + rect.h) - Math.max(existing.y, rect.y))
      return overlapWidth * overlapHeight / Math.min(existing.w * existing.h, rect.w * rect.h) > 0.8
    })
    if (!overlaps) selected.push(rect)
  }
  const strictCards = selected.sort((first, second) => Math.abs(first.y - second.y) < 5 ? first.x - second.x : first.y - second.y)
  // The two official voter-list PDFs use the same three-column grid but one
  // uses lighter, thinner borders. Keep the precise detector first, then use
  // a tolerant border detector when a PDF has been rasterised differently.
  const tolerantCards = detectLightBorderCardRects(imageData, width, height)
  const gridCards = detectGridCardRects(imageData, width, height)
  if (gridCards.length > Math.max(strictCards.length, tolerantCards.length)) return gridCards
  return tolerantCards.length > strictCards.length ? tolerantCards : strictCards
}

// Some voter-list PDFs have thin borders that are not continuous on every
// scan line. Their card boxes are still arranged in a very regular grid. This
// fallback detects repeated horizontal borders, joins borders that are only a
// few pixels apart, and then pairs neighbouring rows. It is deliberately
// limited to card-sized lines, so normal text is not treated as a voter card.
function detectGridCardRects(imageData: { data: Uint8ClampedArray }, width: number, height: number): CardRect[] {
  const pixels = imageData.data
  const minimum = width * 0.16
  const maximum = width * 0.36
  const isDark = (x: number, y: number) => {
    const safeX = Math.max(0, Math.min(width - 1, x))
    const safeY = Math.max(0, Math.min(height - 1, y))
    const offset = (safeY * width + safeX) * 4
    return pixels[offset] < 160 && pixels[offset + 1] < 160 && pixels[offset + 2] < 160
  }

  const rawLines: Array<{ x: number; y: number; w: number }> = []
  for (let y = 12; y < height - 10; y += 1) {
    let start = -1
    let gap = 0
    for (let x = 4; x < width - 4; x += 1) {
      if (isDark(x, y)) {
        if (start < 0) start = x
        gap = 0
      } else if (start >= 0) {
        gap += 1
        if (gap > 1 || x === width - 5) {
          const end = x - gap
          const lineWidth = end - start + 1
          if (lineWidth >= minimum && lineWidth <= maximum) rawLines.push({ x: start, y, w: lineWidth })
          start = -1
          gap = 0
        }
      }
    }
  }

  const levels: Array<{ y: number; lines: Array<{ x: number; y: number; w: number }> }> = []
  for (const line of rawLines) {
    const level = levels.find((item) => Math.abs(item.y - line.y) <= 6)
    if (level) level.lines.push(line)
    else levels.push({ y: line.y, lines: [line] })
  }

  const mergedLevels = levels
    .map((level) => ({
      y: Math.round(level.lines.reduce((sum, line) => sum + line.y, 0) / level.lines.length),
      lines: mergeGridLines(level.lines),
    }))
    .filter((level) => level.lines.length >= 2)
    .sort((first, second) => first.y - second.y)

  const cards: CardRect[] = []
  for (let index = 0; index < mergedLevels.length - 1; index += 1) {
    const top = mergedLevels[index]
    const bottom = mergedLevels[index + 1]
    for (const topLine of top.lines) {
      const bottomLine = bottom.lines
        .filter((line) => Math.abs(line.x - topLine.x) <= 18 && Math.abs(line.w - topLine.w) <= 30)
        .sort((first, second) => Math.abs(first.x - topLine.x) - Math.abs(second.x - topLine.x))[0]
      if (!bottomLine) continue
      const cardHeight = bottom.y - top.y
      if (cardHeight <= topLine.w * 0.25 || cardHeight >= topLine.w * 0.9) continue
      cards.push({ x: topLine.x, y: top.y, w: topLine.w, h: cardHeight })
    }
  }
  return removeOverlappingCards(cards)
}

function mergeGridLines(lines: Array<{ x: number; y: number; w: number }>) {
  const merged: Array<{ x: number; y: number; w: number }> = []
  for (const line of lines.sort((first, second) => first.x - second.x)) {
    const current = merged.at(-1)
    if (current && Math.abs(current.x - line.x) <= 12 && Math.abs(current.w - line.w) <= 30) {
      if (line.w > current.w) merged[merged.length - 1] = line
      continue
    }
    merged.push(line)
  }
  return merged
}

function detectLightBorderCardRects(imageData: { data: Uint8ClampedArray }, width: number, height: number): CardRect[] {
  const pixels = imageData.data
  const minimum = width * 0.16
  const maximum = width * 0.36
  const lightBorder = (x: number, y: number) => {
    const safeX = Math.max(0, Math.min(width - 1, x))
    const safeY = Math.max(0, Math.min(height - 1, y))
    const offset = (safeY * width + safeX) * 4
    return pixels[offset] < 230 && pixels[offset + 1] < 230 && pixels[offset + 2] < 230
  }
  const lines: Array<{ x: number; y: number; w: number }> = []

  for (let y = 12; y < height - 10; y += 1) {
    let start = -1
    let gap = 0
    for (let x = 4; x < width - 4; x += 1) {
      if (lightBorder(x, y)) {
        if (start < 0) start = x
        gap = 0
      } else if (start >= 0) {
        gap += 1
        // Adjacent three-column cards share a very small gap. A larger gap
        // would merge all three top borders into one long line.
        if (gap > 1 || x === width - 5) {
          const end = x - gap
          const length = end - start + 1
          if (length >= minimum && length <= maximum) lines.push({ x: start, y, w: length })
          start = -1
          gap = 0
        }
      }
    }
  }

  const unique: Array<{ x: number; y: number; w: number }> = []
  for (const line of lines) {
    if (!unique.some((existing) => Math.abs(existing.x - line.x) < 8 && Math.abs(existing.y - line.y) < 4 && Math.abs(existing.w - line.w) < 14)) unique.push(line)
  }

  const cards: CardRect[] = []
  for (const top of unique) {
    const bottoms = unique
      .filter((line) => {
        const cardHeight = line.y - top.y
        return Math.abs(line.x - top.x) < 18 && Math.abs(line.w - top.w) < 30 && cardHeight > top.w * 0.25 && cardHeight < top.w * 0.9
      })
      .sort((first, second) => first.y - second.y)
    for (const bottom of bottoms) {
      const leftCoverage = borderCoverage(lightBorder, top.x, top.y, bottom.y)
      const rightCoverage = borderCoverage(lightBorder, top.x + top.w - 1, top.y, bottom.y)
      if (Math.min(leftCoverage, rightCoverage) < 0.35) continue
      const card = { x: top.x, y: top.y, w: top.w, h: bottom.y - top.y }
      if (!cards.some((existing) => sameCard(existing, card))) cards.push(card)
      break
    }
  }
  return removeOverlappingCards(cards)
}

function borderCoverage(isBorder: (x: number, y: number) => boolean, x: number, top: number, bottom: number) {
  let good = 0
  let total = 0
  for (let y = top + 2; y < bottom - 2; y += 2) {
    total += 1
    if ([-2, -1, 0, 1, 2].some((offset) => isBorder(x + offset, y))) good += 1
  }
  return total ? good / total : 0
}

function sameCard(first: CardRect, second: CardRect) {
  return Math.abs(first.x - second.x) < 7 && Math.abs(first.y - second.y) < 5 && Math.abs(first.w - second.w) < 14 && Math.abs(first.h - second.h) < 14
}

function removeOverlappingCards(cards: CardRect[]) {
  const selected: CardRect[] = []
  for (const card of cards.sort((first, second) => first.y - second.y || first.x - second.x)) {
    const overlaps = selected.some((existing) => {
      const overlapWidth = Math.max(0, Math.min(existing.x + existing.w, card.x + card.w) - Math.max(existing.x, card.x))
      const overlapHeight = Math.max(0, Math.min(existing.y + existing.h, card.y + card.h) - Math.max(existing.y, card.y))
      return overlapWidth * overlapHeight / Math.min(existing.w * existing.h, card.w * card.h) > 0.8
    })
    if (!overlaps) selected.push(card)
  }
  return selected
}

async function recognizeCards(buffers: Buffer[], vision: ImageAnnotatorClient) {
  const output: Array<{ text: string; confidence: number }> = []
  for (let start = 0; start < buffers.length; start += 16) {
    const chunk = buffers.slice(start, start + 16)
    const [result] = await vision.batchAnnotateImages({
      requests: chunk.map((buffer) => ({
        image: { content: buffer },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' as const }],
        imageContext: { languageHints: ['te', 'en'] },
      })),
    })
    for (const response of result.responses ?? []) {
      if (response.error?.message) throw new Error(`Card OCR failed: ${response.error.message}`)
      const annotation = response.fullTextAnnotation
      output.push({ text: annotation?.text?.trim() ?? '', confidence: annotationConfidence(annotation) })
    }
  }
  while (output.length < buffers.length) output.push({ text: '', confidence: 0 })
  return output
}

export function parseVoterCard(text: string, confidence: number, scope: ScopeDefaults, coverRows: CoverAreaRow[], imagePath: string, pageNumber: number, cardPosition: number): ExtractedVoterCard {
  const lines = text.split(/\r?\n/).map(cleanOcrLine).filter(Boolean)
  const composite = text.match(/(?:^|\D)(\d{1,3})\s*[-–—]\s*(\d{1,4})\s*[-–—]\s*(\d{1,6})(?:\D|$)/m)
  const division = composite?.[2] ?? scope.division
  const assemblySerial = composite?.[3] ?? ''
  const serialNumber = findSerial(lines, composite?.[0] ?? '')
  const fullName = labelledValue(lines, [/(?:ఓటరు|ఓటర్|వోటరు|వోటర్)\s*పేరు/i, /voter\s*(?:name)?/i])
  const relationship = findRelationship(lines)
  const doorNumber = normalizeDoor(labelledValue(lines, [/ఇంటి\s*సంఖ్య/i, /(?:house|door)\s*(?:no\.?|number)?/i]))
  const voterId = text.match(/\b([A-Z]{3})\s*[- ]?\s*(\d{7})\b/i)?.slice(1).join('').toLocaleUpperCase() ?? ''
  const age = text.match(/(?:వయస్సు|age)\s*[:.;|]?\s*(\d{1,3})/i)?.[1] ?? ''
  const genderRaw = labelledValue(lines, [/లింగ(?:ము|ం)?/i, /gender/i])
  const gender = normalizeGender(genderRaw || text)
  const mobile = text.match(/(?:\+91[-\s]?)?([6-9]\d{4}[-\s]?\d{5})\b/)?.[1]?.replace(/\D/g, '') ?? ''
  const matchingAreas = coverRows.filter((row) => row.division === division && row.area)
  const area = matchingAreas.length === 1 ? matchingAreas[0].area : scope.area

  return {
    fullName,
    relativeName: relationship.name,
    relationshipType: relationship.type,
    age,
    gender,
    doorNumber,
    voterId,
    alternateIdentifier: '',
    mobile,
    serialNumber,
    assemblySerial,
    wardId: scope.wardId,
    boothId: scope.boothId,
    area,
    division,
    confidence: Math.max(0, Math.min(1, confidence)),
    rawText: text.slice(0, 1600),
    voterCardImagePath: imagePath,
    pageNumber,
    cardPosition,
  }
}

function labelledValue(lines: string[], labels: RegExp[]) {
  for (let index = 0; index < lines.length; index += 1) {
    for (const label of labels) {
      const match = lines[index].match(label)
      if (!match || match.index === undefined) continue
      for (let offset = 0; offset <= 2; offset += 1) {
        const candidate = cleanFieldValue(offset === 0 ? lines[index].slice(match.index + match[0].length) : lines[index + offset] ?? '')
        if (!candidate || isOcrPlaceholder(candidate)) continue
        if (offset > 0 && looksLikeLabel(candidate)) break
        if (!looksLikeLabel(candidate)) return candidate
      }
    }
  }
  return ''
}

function findRelationship(lines: string[]) {
  const choices: Array<{ type: string; labels: RegExp[] }> = [
    { type: 'husband', labels: [/భర్త\s*పేరు/i, /husband(?:'s)?\s*name/i] },
    { type: 'father', labels: [/తండ్రి\s*పేరు/i, /father(?:'s)?\s*name/i] },
    { type: 'mother', labels: [/తల్లి\s*పేరు/i, /mother(?:'s)?\s*name/i] },
    { type: 'guardian', labels: [/సంరక్షక(?:ుని)?\s*పేరు/i, /guardian(?:'s)?\s*name/i] },
  ]
  for (const choice of choices) {
    const name = labelledValue(lines, choice.labels)
    if (name) return { type: choice.type, name }
  }
  return { type: '', name: '' }
}

function findSerial(lines: string[], compositeText: string) {
  for (const line of lines) {
    if (!/(?:వార్డు|ward)/i.test(line) || !/(?:సం|serial|sl\.?\s*no)/i.test(line)) continue
    const withoutComposite = compositeText ? line.replace(compositeText.trim(), ' ') : line
    const values = withoutComposite.match(/\d{1,6}/g)
    if (values?.length) return values.at(-1) ?? ''
  }
  return ''
}

function cleanOcrLine(value: string) {
  return value.replace(/[\t\u00a0]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function cleanFieldValue(value: string) {
  return cleanOcrLine(value).replace(/^[\s:;|.,·-]+/, '').replace(/[|]+$/, '').trim().slice(0, 160)
}

function looksLikeLabel(value: string) {
  return /^(?:ఓటరు|ఓటర్|వోటరు|వోటర్|భర్త|తండ్రి|తల్లి|వయస్సు|లింగ|ఇంటి|వార్డు|పేరు|సంఖ్య|వోటర్|voter|name|husband|father|mother|age|gender|house|door|ward|serial|sl\.?\s*no)/i.test(value)
}

function isOcrPlaceholder(value: string) {
  const normalized = value.replace(/[\s:;|.,·-]/g, '').toLocaleLowerCase()
  return ['ఓటరు', 'ఓటర్', 'వోటరు', 'వోటర్', 'పేరు', 'voter', 'name', 'votername'].includes(normalized)
}

function normalizeDoor(value: string) {
  return value.replace(/^సంఖ్య\s*[:.;|-]?\s*/i, '').replace(/\s+/g, '').replace(/[.,;|]+$/, '').toLocaleUpperCase().slice(0, 40)
}

function normalizeGender(value: string) {
  if (/స్త్రీ|మహిళ|female|\bF\b/i.test(value)) return 'female'
  if (/పురుష|\bపు\b|male|\bM\b/i.test(value)) return 'male'
  if (/ఇతర|other|third/i.test(value)) return 'other'
  return ''
}

async function readCoverRows(page: any, vision: ImageAnnotatorClient): Promise<CoverAreaRow[]> {
  const viewport = page.getViewport({ scale: 3.5 })
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
  const context = canvas.getContext('2d')
  await page.render({ canvas: canvas as never, canvasContext: context as never, viewport }).promise
  const grid = detectCoverGrid(context.getImageData(0, 0, canvas.width, canvas.height), canvas.width, canvas.height)
  if (!grid.length) {
    canvas.width = 1
    canvas.height = 1
    return []
  }
  const buffer = canvas.toBuffer('image/png')
  canvas.width = 1
  canvas.height = 1
  const [response] = await vision.documentTextDetection({ image: { content: buffer }, imageContext: { languageHints: ['te', 'en'] } })
  const words = annotationWords(response.fullTextAnnotation)
  return parseCoverRows(words, grid)
}

function detectCoverGrid(imageData: { data: Uint8ClampedArray }, width: number, height: number) {
  const pixels = imageData.data
  const dark = (x: number, y: number) => {
    const offset = (y * width + x) * 4
    return pixels[offset] < 150 && pixels[offset + 1] < 150 && pixels[offset + 2] < 150
  }
  const horizontal: Array<{ y: number; x: number; right: number }> = []
  for (let y = 8; y < height - 8; y += 1) {
    let start = -1
    let gap = 0
    for (let x = 5; x < width - 5; x += 1) {
      if (dark(x, y)) {
        if (start < 0) start = x
        gap = 0
      } else if (start >= 0 && ++gap > 2) {
        if (x - gap - start > width * 0.4) horizontal.push({ y, x: start, right: x - gap })
        start = -1
        gap = 0
      }
    }
  }
  const lines: Array<{ y: number; x: number; right: number }> = []
  for (const line of horizontal) {
    const previous = lines.at(-1)
    if (previous && line.y - previous.y < 4 && Math.abs(line.x - previous.x) < 8) {
      previous.y = line.y
      previous.right = Math.max(previous.right, line.right)
    } else lines.push({ ...line })
  }
  const rows: Array<{ top: number; bottom: number; xs: number[] }> = []
  for (let index = 0; index < lines.length - 1; index += 1) {
    const top = lines[index]
    const bottom = lines[index + 1]
    const rowHeight = bottom.y - top.y
    if (rowHeight < height * 0.012 || rowHeight > height * 0.13 || Math.abs(top.x - bottom.x) > 8 || Math.abs(top.right - bottom.right) > 8) continue
    const vertical: number[] = []
    for (let x = top.x - 2; x <= top.right + 2; x += 1) {
      let good = 0
      let total = 0
      for (let y = top.y + 4; y < bottom.y - 3; y += 2) {
        total += 1
        if (x >= 0 && x < width && dark(x, y)) good += 1
      }
      if (total && good / total > 0.83) vertical.push(x)
    }
    const xs = cluster(vertical, 3)
    if (xs.length === 10) rows.push({ top: top.y, bottom: bottom.y, xs })
  }
  return rows
}

function parseCoverRows(words: VisionWord[], grid: Array<{ top: number; bottom: number; xs: number[] }>): CoverAreaRow[] {
  const output: CoverAreaRow[] = []
  for (const [rowIndex, row] of grid.entries()) {
    const cells: VisionWord[][] = Array.from({ length: 9 }, () => [])
    for (const word of words) {
      const x = word.x + word.w / 2
      const y = word.y + word.h / 2
      if (y <= row.top || y >= row.bottom) continue
      for (let cell = 0; cell < 9; cell += 1) {
        if (x > row.xs[cell] && x < row.xs[cell + 1]) {
          cells[cell].push(word)
          break
        }
      }
    }
    const raw = cells.map(joinWords)
    const division = digitsOnly(raw[1])
    const area = raw[2].replace(/^[|,;\s]+|[|\s]+$/g, '')
    if (!division || !area) continue
    const confidenceValues = cells[2].map((word) => word.confidence).filter((value) => value > 0)
    output.push({
      order: Number(digitsOnly(raw[0])) || rowIndex + 1,
      division,
      area,
      doorFrom: raw[3],
      doorTo: raw[4],
      male: optionalNumber(raw[5]),
      female: optionalNumber(raw[6]),
      other: optionalNumber(raw[7]),
      total: optionalNumber(raw[8]),
      confidence: confidenceValues.length ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length : 0,
      sourcePage: 1,
    })
  }
  return output
}

function annotationWords(annotation: any): VisionWord[] {
  const output: VisionWord[] = []
  for (const page of annotation?.pages ?? []) for (const block of page.blocks ?? []) for (const paragraph of block.paragraphs ?? []) for (const word of paragraph.words ?? []) {
    const vertices = word.boundingBox?.vertices ?? []
    const xs = vertices.map((vertex: { x?: number }) => vertex.x ?? 0)
    const ys = vertices.map((vertex: { y?: number }) => vertex.y ?? 0)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    output.push({
      x,
      y,
      w: Math.max(...xs) - x,
      h: Math.max(...ys) - y,
      text: (word.symbols ?? []).map((symbol: { text?: string }) => symbol.text ?? '').join(''),
      confidence: Number(word.confidence ?? 0),
    })
  }
  return output
}

function annotationConfidence(annotation: any) {
  const values: number[] = []
  for (const page of annotation?.pages ?? []) for (const block of page.blocks ?? []) {
    const confidence = Number(block.confidence ?? 0)
    if (confidence > 0) values.push(confidence)
  }
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function joinWords(words: VisionWord[]) {
  return words
    .sort((first, second) => Math.abs(first.y - second.y) > Math.min(first.h, second.h) * 0.55 ? first.y - second.y : first.x - second.x)
    .map((word) => word.text)
    .join(' ')
    .replace(/\s+([,;])/g, '$1')
    .trim()
}

function cluster(values: number[], tolerance = 3) {
  const groups: number[][] = []
  for (const value of values) {
    const group = groups.at(-1)
    if (group && value - (group.at(-1) ?? value) <= tolerance) group.push(value)
    else groups.push([value])
  }
  return groups.map((group) => Math.round(group.reduce((sum, value) => sum + value, 0) / group.length))
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

function optionalNumber(value: string) {
  const digits = digitsOnly(value)
  return digits ? Number(digits) : undefined
}
