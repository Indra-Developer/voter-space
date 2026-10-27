import { createCanvas, DOMMatrix, ImageData, Path2D, loadImage } from '@napi-rs/canvas'
import { ImageAnnotatorClient } from '@google-cloud/vision'
import { getStorage } from 'firebase-admin/storage'

type CardRect = { x: number; y: number; w: number; h: number }
type ScopeDefaults = { wardId: string; boothId: string; area: string; division: string }
type VisionWord = { x: number; y: number; w: number; h: number; text: string; confidence: number }
type RecognizedCardText = { text: string; confidence: number; annotation?: any }

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
  startPage = 1,
  allowEmpty = false,
  persistCardImages = true,
  onPageComplete,
  onProgress,
}: {
  pdfBytes: Buffer
  sourcePdfId: string
  scope: ScopeDefaults
  startPage?: number
  allowEmpty?: boolean
  persistCardImages?: boolean
  onPageComplete?: (pageNumber: number, rows: ExtractedVoterCard[]) => Promise<void>
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

    const firstPage = Math.max(1, Math.min(Math.floor(startPage), pdf.numPages || 1))
    for (let pageNumber = firstPage; pageNumber <= pdf.numPages; pageNumber += 1) {
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
        await onPageComplete?.(pageNumber, [])
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
        const thumbnailWidth = 240
        const thumbnailHeight = Math.max(1, Math.round(thumbnailWidth * outputHeight / outputWidth))
        const thumbnailCanvas = createCanvas(thumbnailWidth, thumbnailHeight)
        const thumbnailContext = thumbnailCanvas.getContext('2d')
        thumbnailContext.fillStyle = '#fff'
        thumbnailContext.fillRect(0, 0, thumbnailWidth, thumbnailHeight)
        thumbnailContext.drawImage(card, 0, 0, thumbnailWidth, thumbnailHeight)
        const thumbnailBuffer = thumbnailCanvas.toBuffer('image/jpeg', 72)
        thumbnailCanvas.width = 1
        thumbnailCanvas.height = 1
        card.width = 1
        card.height = 1
        return { buffer, thumbnailBuffer, cardPosition: index + 1 }
      })

      large.width = 1
      large.height = 1
      page.cleanup()

      const texts = await recognizeCards(cards.map((card) => card.buffer), vision)
      const parsedRows = cards.map((card, index) => parseVoterCard(texts[index]?.text ?? '', texts[index]?.confidence ?? 0, scope, coverRows, '', pageNumber, card.cardPosition, texts[index]?.annotation))
      const retryIndexes = parsedRows.flatMap((row, index) => isValidVoterName(row.fullName) && isValidDoorNumberValue(row.doorNumber) ? [] : [index])
      const retryValues = retryIndexes.length ? await retryCardFields(cards, retryIndexes, vision) : new Map<number, { fullName?: string; doorNumber?: string }>()
      const pageRows = await Promise.all(cards.map(async (card, index) => {
        const imagePath = `voter-cards/${sourcePdfId}/p${String(pageNumber).padStart(4, '0')}-c${String(card.cardPosition).padStart(3, '0')}.png`
        const thumbnailPath = `voter-card-thumbnails/${sourcePdfId}/p${String(pageNumber).padStart(4, '0')}-c${String(card.cardPosition).padStart(3, '0')}.jpg`
        if (persistCardImages) {
          await Promise.all([
            bucket.file(imagePath).save(card.buffer, {
              resumable: false,
              contentType: 'image/png',
              metadata: {
                cacheControl: 'private, max-age=3600',
                metadata: { sourcePdfId, pageNumber: String(pageNumber), cardPosition: String(card.cardPosition) },
              },
            }),
            bucket.file(thumbnailPath).save(card.thumbnailBuffer, {
              resumable: false,
              contentType: 'image/jpeg',
              metadata: {
                cacheControl: 'private, max-age=86400',
                metadata: { sourcePdfId, pageNumber: String(pageNumber), cardPosition: String(card.cardPosition) },
              },
            }),
          ])
        }
        const parsed = parsedRows[index]
        const retry = retryValues.get(index)
        return { ...parsed, fullName: retry?.fullName || parsed.fullName, doorNumber: retry?.doorNumber || parsed.doorNumber, voterCardImagePath: persistCardImages ? imagePath : '' }
      }))
      rows.push(...pageRows)
      await onPageComplete?.(pageNumber, pageRows)
      await onProgress?.(pageNumber, pdf.numPages, rows.length)
    }
  } finally {
    await loadingTask.destroy()
    await vision.close().catch(() => undefined)
  }

  if (!rows.length && !allowEmpty) {
    throw new Error('No voter cards were detected. Use a voter-list PDF with clear black card borders like the original Ward Desk PDF.')
  }
  return { rows, pageCount: pdf.numPages, coverRows }
}

/**
 * OCR a user-supplied image or a rendered PDF page without creating voter
 * records. Targeted extraction uses this for the requested door-number list.
 */
export async function extractTextFromImageBuffer(buffer: Buffer) {
  const vision = new ImageAnnotatorClient()
  try {
    const result = await recognizeImages([buffer], vision, ['te', 'en'])
    return result[0]?.text ?? ''
  } finally {
    await vision.close().catch(() => undefined)
  }
}

export async function extractTextFromPdf(pdfBytes: Buffer, onProgress?: (pageNumber: number, pageCount: number) => Promise<void>) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
    disableFontFace: true,
    useSystemFonts: true,
  })
  const pdf = await loadingTask.promise
  const vision = new ImageAnnotatorClient()
  const texts: string[] = []
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 2.5 })
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
      const context = canvas.getContext('2d')
      await page.render({ canvas: canvas as never, canvasContext: context as never, viewport }).promise
      const buffer = canvas.toBuffer('image/png')
      canvas.width = 1
      canvas.height = 1
      page.cleanup()
      const result = await recognizeImages([buffer], vision, ['te', 'en'])
      if (result[0]?.text) texts.push(result[0].text)
      await onProgress?.(pageNumber, pdf.numPages)
    }
  } finally {
    await loadingTask.destroy()
    await vision.close().catch(() => undefined)
  }
  return texts.join('\n')
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
  const strictCards = selected
    .filter(isLikelyVoterCardRect)
    .sort((first, second) => Math.abs(first.y - second.y) < 5 ? first.x - second.x : first.y - second.y)
  // The two official voter-list PDFs use the same three-column grid but one
  // uses lighter, thinner borders. Keep the precise detector first, then use
  // a tolerant border detector when a PDF has been rasterised differently.
  const tolerantCards = detectLightBorderCardRects(imageData, width, height).filter(isLikelyVoterCardRect)
  const gridCards = detectGridCardRects(imageData, width, height).filter(isLikelyVoterCardRect)
  // Some photo-card PDFs lose one or more horizontal borders during
  // rasterisation. In that case border detection can return only a handful
  // of cards even though the page still has a complete, regular 3-column
  // grid. Reconstruct the missing grid cells from the long border
  // projections before OCR so a voter is never silently skipped.
  const projectedCards = detectProjectedGridCardRects(imageData, width, height)
  if (projectedCards.length > Math.max(strictCards.length, tolerantCards.length, gridCards.length)) return projectedCards
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

function detectProjectedGridCardRects(imageData: { data: Uint8ClampedArray }, width: number, height: number): CardRect[] {
  const pixels = imageData.data
  const dark = (x: number, y: number) => {
    const safeX = Math.max(0, Math.min(width - 1, x))
    const safeY = Math.max(0, Math.min(height - 1, y))
    const offset = (safeY * width + safeX) * 4
    return pixels[offset] < 220 && pixels[offset + 1] < 220 && pixels[offset + 2] < 220
  }

  const horizontalScores = Array.from({ length: height }, (_, y) => {
    let score = 0
    for (let x = 0; x < width; x += 1) if (dark(x, y)) score += 1
    return score
  })
  const verticalScores = Array.from({ length: width }, (_, x) => {
    let score = 0
    for (let y = 0; y < height; y += 1) if (dark(x, y)) score += 1
    return score
  })
  const horizontalLines = projectionLines(horizontalScores, width * 0.45, 10)
  const verticalLines = projectionLines(verticalScores, height * 0.45, 6)
  if (verticalLines.length < 3 || verticalLines.length > 6) return []

  const widths = verticalLines.slice(1).map((line, index) => line - verticalLines[index])
  const cardWidth = median(widths)
  if (!cardWidth) return []
  const expectedRowStep = cardWidth * 0.43
  const rowLines = regularGridLines(horizontalLines, expectedRowStep)
  if (rowLines.length < 3 || rowLines.length > 16) return []

  const rowHeights = rowLines.slice(1).map((line, index) => line - rowLines[index])
  const cardHeight = median(rowHeights)
  if (!cardHeight || cardHeight / cardWidth < 0.32 || cardHeight / cardWidth > 0.7) return []

  const cards: CardRect[] = []
  for (let row = 0; row < rowLines.length - 1; row += 1) {
    for (let column = 0; column < verticalLines.length - 1; column += 1) {
      const x = verticalLines[column]
      const y = rowLines[row]
      const w = verticalLines[column + 1] - x
      const h = rowLines[row + 1] - y
      if (w > cardWidth * 0.6 && h > cardHeight * 0.6) cards.push({ x, y, w, h })
    }
  }
  return removeOverlappingCards(cards)
}

function isLikelyVoterCardRect(rect: CardRect) {
  const ratio = rect.h / rect.w
  return ratio >= 0.32 && ratio <= 0.7
}

function projectionLines(scores: number[], threshold: number, mergeDistance: number) {
  const lines: number[] = []
  let runStart = -1
  let bestIndex = -1
  let bestScore = -1
  const flush = (end: number) => {
    if (runStart < 0) return
    lines.push(bestIndex >= 0 ? bestIndex : Math.round((runStart + end) / 2))
    runStart = -1
    bestIndex = -1
    bestScore = -1
  }
  scores.forEach((score, index) => {
    if (score >= threshold) {
      if (runStart < 0) runStart = index
      if (score > bestScore) {
        bestScore = score
        bestIndex = index
      }
    } else if (runStart >= 0) {
      flush(index - 1)
    }
  })
  flush(scores.length - 1)
  const merged: number[] = []
  for (const line of lines) {
    const previous = merged.at(-1)
    if (previous !== undefined && line - previous <= mergeDistance) merged[merged.length - 1] = Math.round((previous + line) / 2)
    else merged.push(line)
  }
  return merged
}

function regularGridLines(lines: number[], expectedStep: number) {
  if (!lines.length || expectedStep <= 0) return []
  let best: number[] = []
  for (let start = 0; start < lines.length - 1; start += 1) {
    const candidate = [lines[start]]
    let current = start
    while (current < lines.length - 1) {
      const next = lines[current + 1]
      const distance = next - lines[current]
      const multiple = Math.round(distance / expectedStep)
      if (distance < expectedStep * 0.75 || multiple < 1 || multiple > 3 || distance > expectedStep * 2.7) break
      for (let step = 1; step < multiple; step += 1) candidate.push(Math.round(lines[current] + expectedStep * step))
      candidate.push(next)
      current += 1
    }
    if (candidate.length > best.length) best = candidate
  }
  return best
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((first, second) => first - second)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

async function recognizeCards(buffers: Buffer[], vision: ImageAnnotatorClient) {
  return recognizeImages(buffers, vision, ['te', 'en'])
}

async function recognizeImages(buffers: Buffer[], vision: ImageAnnotatorClient, languageHints: string[]): Promise<RecognizedCardText[]> {
  const output: RecognizedCardText[] = []
  for (let start = 0; start < buffers.length; start += 16) {
    const chunk = buffers.slice(start, start + 16)
    const [result] = await vision.batchAnnotateImages({
      requests: chunk.map((buffer) => ({
        image: { content: buffer },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' as const }],
        imageContext: { languageHints },
      })),
    })
    for (const response of result.responses ?? []) {
      if (response.error?.message) throw new Error(`Card OCR failed: ${response.error.message}`)
      const annotation = response.fullTextAnnotation
      output.push({ text: annotation?.text?.trim() ?? '', confidence: annotationConfidence(annotation), annotation })
    }
  }
  while (output.length < buffers.length) output.push({ text: '', confidence: 0 })
  return output
}

async function retryCardFields(cards: Array<{ buffer: Buffer; cardPosition: number }>, indexes: number[], vision: ImageAnnotatorClient) {
  const crops = await Promise.all(indexes.map((index) => createFieldCrops(cards[index].buffer)))
  const names = await recognizeImages(crops.map((crop) => crop.name), vision, ['te', 'en'])
  const doors = await recognizeImages(crops.map((crop) => crop.door), vision, ['en', 'te'])
  const output = new Map<number, { fullName?: string; doorNumber?: string }>()
  indexes.forEach((index, retryIndex) => {
    const name = parseFieldText(names[retryIndex], 'name')
    const doorNumber = parseFieldText(doors[retryIndex], 'door')
    if (name || doorNumber) output.set(index, { fullName: name || undefined, doorNumber: doorNumber || undefined })
  })
  return output
}

async function createFieldCrops(buffer: Buffer) {
  const image = await loadImage(buffer)
  const crop = (topRatio: number, bottomRatio: number) => {
    const x = Math.round(image.width * 0.02)
    const y = Math.round(image.height * topRatio)
    const width = Math.round(image.width * 0.78)
    const height = Math.max(1, Math.round(image.height * (bottomRatio - topRatio)))
    const outputWidth = 1400
    const outputHeight = Math.max(180, Math.round(outputWidth * height / width))
    const canvas = createCanvas(outputWidth, outputHeight)
    const context = canvas.getContext('2d')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, outputWidth, outputHeight)
    context.drawImage(image, x, y, width, height, 0, 0, outputWidth, outputHeight)
    const result = canvas.toBuffer('image/png')
    canvas.width = 1
    canvas.height = 1
    return result
  }
  const result = { name: crop(0.14, 0.40), door: crop(0.56, 0.83) }
  const closableImage = image as unknown as { close?: () => void }
  closableImage.close?.()
  return result
}

function parseFieldText(result: RecognizedCardText | undefined, field: 'name' | 'door') {
  if (!result?.text) return ''
  const lines = result.text.split(/\r?\n/).map(cleanOcrLine).filter(Boolean)
  if (field === 'name') {
    return firstValidValue([
      annotationFieldValue(result.annotation, 'name'),
      labelledValue(lines, voterNameLabels, isValidVoterName),
      findUnlabelledName(lines),
    ], isValidVoterName)
  }
  return normalizeDoor(firstValidValue([
    annotationFieldValue(result.annotation, 'door'),
    labelledValue(lines, doorLabels, isValidDoorCandidate),
  ], isValidDoorCandidate))
}

export function parseVoterCard(text: string, confidence: number, scope: ScopeDefaults, coverRows: CoverAreaRow[], imagePath: string, pageNumber: number, cardPosition: number, annotation?: any): ExtractedVoterCard {
  const lines = text.split(/\r?\n/).map(cleanOcrLine).filter(Boolean)
  const composite = text.match(/(?:^|\D)(\d{1,3})\s*[-–—]\s*(\d{1,4})\s*[-–—]\s*(\d{1,6})(?:\D|$)/m)
  // Division numbers are numeric codes. Treat 1 and 01 as the same value so
  // cover-page area mapping does not fail because of OCR zero padding.
  const division = normalizeDivision(composite?.[2] ?? scope.division)
  const assemblySerial = composite?.[3] ?? ''
  const serialNumber = findSerial(lines, composite?.[0] ?? '')
  const annotatedName = annotationFieldValue(annotation, 'name')
  const annotatedDoor = annotationFieldValue(annotation, 'door')
  const fullName = firstValidValue([annotatedName, labelledValue(lines, voterNameLabels, isValidVoterName), findUnlabelledName(lines)], isValidVoterName)
  const relationship = findRelationship(lines, annotation)
  const doorNumber = normalizeDoor(firstValidValue([annotatedDoor, labelledValue(lines, doorLabels, isValidDoorCandidate)], isValidDoorCandidate))
  const voterId = text.match(/\b([A-Z]{3})\s*[- ]?\s*(\d{7})\b/i)?.slice(1).join('').toLocaleUpperCase() ?? ''
  const age = text.match(/(?:వయస్సు|age)\s*[:.;|]?\s*(\d{1,3})/i)?.[1] ?? ''
  const genderRaw = labelledValue(lines, [/లింగ(?:ము|ం)?/i, /gender/i])
  const gender = normalizeGender(genderRaw || text)
  const mobile = text.match(/(?:\+91[-\s]?)?([6-9]\d{4}[-\s]?\d{5})\b/)?.[1]?.replace(/\D/g, '') ?? ''
  const matchingAreas = coverRows.filter((row) => normalizeDivision(row.division) === division && row.area)
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

const voterNameLabels = [
  /(?:ఓటరు|ఓటర్|వోటరు|వోటర్)\s*పేరు/i,
  /^\s*పేరు\s*[:：]?/i,
  /\bvoter(?:'s)?\s+name\b/i,
  /\bname\s+of\s+(?:the\s+)?voter\b/i,
  /^\s*name\s*[:：]?/i,
]

const doorLabels = [
  /ఇంటి\s*(?:సంఖ్య|నంబరు|నం)/i,
  /\b(?:house|door)\s*(?:no\.?|number)\b/i,
]

function firstValidValue(values: string[], validate: (value: string) => boolean) {
  return values.map(cleanFieldValue).find((value) => validate(value)) ?? ''
}

function findUnlabelledName(lines: string[]) {
  for (const line of lines) {
    const value = cleanFieldValue(line)
    if (looksLikeLabel(value) || isIdentityNoise(value) || /[:：]/.test(value)) continue
    if (isValidVoterName(value)) return value
  }
  return ''
}

function isValidVoterName(value: string) {
  const cleaned = cleanFieldValue(value).replace(/\s+/g, ' ').trim()
  if (!cleaned || cleaned.length < 2 || looksLikeLabel(cleaned) || isIdentityNoise(cleaned)) return false
  if (/\b(?:photo|available|voter|card|identity|number|house|door|age|gender)\b/i.test(cleaned)) return false
  if (!/[\u0C00-\u0C7F]|[A-Za-z]/.test(cleaned) || /\d{3,}/.test(cleaned)) return false
  return true
}

function isValidDoorCandidate(value: string) {
  const cleaned = cleanFieldValue(value).replace(/\s+/g, '')
  return Boolean(cleaned && /\d/.test(cleaned) && !isIdentityNoise(cleaned))
}

function isValidDoorNumberValue(value: string) {
  const cleaned = normalizeDoor(value)
  return Boolean(cleaned && /\d/.test(cleaned) && !/^[A-Z]{3}\d{7}$/i.test(cleaned))
}

function isIdentityNoise(value: string) {
  const cleaned = value.replace(/[\s:;|.,·-]/g, '').toLocaleLowerCase()
  return /(?:voterid|votercard|epic|idcard|cardno|cardnumber|ఓటరుఐడి|ఓటరుకార్డు|ఐడికార్డు|కార్డునం|గుర్తింపుకార్డు)/i.test(cleaned)
    || /\b[A-Z]{3}\s*[- ]?\d{7}\b/i.test(value)
}

function annotationFieldValue(annotation: any, field: 'name' | 'door') {
  if (!annotation) return ''
  const rows = annotationRows(annotationWords(annotation))
  for (const row of rows) {
    const compact = row.text.replace(/\s/g, '')
    const labelPattern = field === 'name'
      ? /(?:ఓటరుపేరు|ఓటర్పేరు|వోటరుపేరు|వోటర్పేరు)|^పేరు|votername|nameofthevoter|^name/i
      : /ఇంటిసంఖ్య|ఇంటినంబరు|ఇంటినం|houseno|housenumber|doorno|doornumber/i
    if (!labelPattern.test(compact)) continue
    const labelIndex = [...row.words].reverse().findIndex((word) => field === 'name' ? /పేరు|name/i.test(word.text) : /సంఖ్య|నంబ|నం|house|door|no|number/i.test(word.text))
    if (labelIndex < 0) continue
    const actualIndex = row.words.length - labelIndex - 1
    const labelRight = row.words[actualIndex].x + row.words[actualIndex].w
    const value = joinWords(row.words.filter((word, index) => index > actualIndex && word.x >= labelRight - 2))
    if (field === 'name' && isValidVoterName(value)) return value
    if (field === 'door' && isValidDoorCandidate(value)) return value
  }
  return ''
}

function annotationRows(words: VisionWord[]) {
  const rows: Array<{ y: number; words: VisionWord[]; text: string }> = []
  for (const word of words.filter((item) => item.text.trim()).sort((first, second) => first.y - second.y || first.x - second.x)) {
    const center = word.y + word.h / 2
    const row = rows.find((item) => Math.abs(item.y - center) <= Math.max(8, word.h * 0.65))
    if (row) {
      row.words.push(word)
      row.y = (row.y + center) / 2
      row.text = joinWords(row.words)
    } else rows.push({ y: center, words: [word], text: word.text })
  }
  return rows.map((row) => ({ ...row, words: row.words.sort((first, second) => first.x - second.x), text: joinWords(row.words) }))
}

function labelledValue(lines: string[], labels: RegExp[], validate: (value: string) => boolean = () => true) {
  for (let index = 0; index < lines.length; index += 1) {
    for (const label of labels) {
      const match = lines[index].match(label)
      if (!match || match.index === undefined) continue
      for (let offset = 0; offset <= 2; offset += 1) {
        const candidate = cleanFieldValue(offset === 0 ? lines[index].slice(match.index + match[0].length) : lines[index + offset] ?? '')
        if (!candidate || isOcrPlaceholder(candidate)) continue
        if (offset > 0 && looksLikeLabel(candidate)) break
        if (!looksLikeLabel(candidate) && validate(candidate)) return candidate
      }
    }
  }
  return ''
}

function findRelationship(lines: string[], annotation?: any) {
  // Vision sometimes returns a different line grouping in the full-text
  // response and the word-level annotation. Search both representations so
  // a wrapped label such as "Fathers Name" followed by the value is not lost.
  const annotationLines = annotation ? annotationRows(annotationWords(annotation)).map((row) => row.text) : []
  const searchLines = [...lines, ...annotationLines]
  const choices: Array<{ type: string; labels: RegExp[] }> = [
    { type: 'husband', labels: [/భర్త\s*పేరు/i, /husband(?:['’]?s)?\s*name/i] },
    { type: 'father', labels: [/తండ్రి\s*పేరు/i, /father(?:['’]?s)?\s*name/i] },
    { type: 'mother', labels: [/తల్లి\s*పేరు/i, /mother(?:['’]?s)?\s*name/i] },
    { type: 'guardian', labels: [/సంరక్షక(?:ుని|ుడు)?\s*పేరు/i, /guardian(?:['’]?s)?\s*name/i] },
  ]
  for (const choice of choices) {
    const name = labelledValue(searchLines, choice.labels, isValidRelativeName)
    if (name) return { type: choice.type, name }
  }
  return { type: '', name: '' }
}

function isValidRelativeName(value: string) {
  return isValidVoterName(value)
}

function findSerial(lines: string[], compositeText: string) {
  const composite = compositeText.trim()
  const withoutComposite = (line: string) => composite ? line.replace(composite, ' ') : line
  const serialLabel = /serial\s*(?:number|no\.?)?|sl\.?\s*no\.?|సీరియల్|సంఖ్య|సం(?:\s*నం)?/i

  for (const line of lines) {
    const candidateLine = withoutComposite(line)
    if (/(?:ఇంటి|house|door)\s*(?:సంఖ్య|నంబరు|నం|number|no\.?)/i.test(candidateLine) || !serialLabel.test(candidateLine)) continue
    const values = candidateLine.match(/\d{1,6}/g)
    if (values?.length) return values.at(-1) ?? ''
  }

  // Some English cards put the card serial on its own first line without a
  // label (for example: "393"), while the assembly/part serial is presented
  // separately in a three-part code. Prefer that standalone card serial.
  for (const line of lines.slice(0, 4)) {
    const candidate = withoutComposite(line).match(/^\D*(\d{1,6})\D*$/)?.[1]
    if (candidate) return candidate
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
  return /^(?:ఓటరు|ఓటర్|వోటరు|వోటర్|భర్త|తండ్రి|తల్లి|వయస్సు|లింగ|ఇంటి|వార్డు|పేరు|సంఖ్య|వోటర్|ఐడి|ఐడీ|కార్డు|కార్డ్|నం|నంబర్|voter|name|husband|father|mother|age|gender|house|door|ward|serial|sl\.?\s*no|id|epic|card|number|photo|available)/i.test(value)
}

function isOcrPlaceholder(value: string) {
  const normalized = value.replace(/[\s:;|.,·-]/g, '').toLocaleLowerCase()
  return ['ఓటరు', 'ఓటర్', 'వోటరు', 'వోటర్', 'పేరు', 'voter', 'name', 'votername', 'ఐడి', 'కార్డు', 'కార్డునం'].includes(normalized)
}

function normalizeDoor(value: string) {
  const cleaned = cleanFieldValue(value)
    .replace(/\b(?:NOT\s+AVAILABLE|AVAILABLE|N\/A)\b/gi, ' ')
    .replace(/(?:PHOTO|PH0T0|PHTO)(?:\s*AVAILABLE)?\s*$/i, ' ')
    .replace(/^(?:సంఖ్య|నంబరు|నం|no\.?|number)\s*[:.;|-]?\s*/i, '')
    .replace(/\s+/g, '')
    .replace(/[.,;|]+$/, '')
    .toLocaleUpperCase()
  if (!cleaned || isIdentityNoise(cleaned) || /^[A-Z]{3}\d{7}$/i.test(cleaned)) return ''
  const match = cleaned.match(/\d[A-Z0-9]*(?:[-/]\s*[A-Z0-9]+)*/i)
  return (match?.[0] ?? '').replace(/\s+/g, '').slice(0, 40)
}

function normalizeDivision(value: string) {
  const cleaned = cleanFieldValue(value).replace(/\s+/g, '')
  if (/^\d+$/.test(cleaned)) return String(Number(cleaned))
  return cleaned.toLocaleUpperCase()
}

function normalizeGender(value: string) {
  const compact = value.replace(/\s+/g, '')
  if (/స్త్రీ|మహిళ|female/i.test(compact) || /(?:^|[^A-Za-z])F(?:[^A-Za-z]|$)/i.test(value)) return 'female'
  if (/పురుష|male/i.test(compact) || /(?:^|[^A-Za-z])పు(?:[^A-Za-z]|$)/i.test(value) || /(?:^|[^A-Za-z])M(?:[^A-Za-z]|$)/i.test(value)) return 'male'
  if (/ఇతర|other|third/i.test(compact)) return 'other'
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
