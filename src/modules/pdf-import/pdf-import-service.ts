import { httpsCallable } from 'firebase/functions'
import { ref, uploadBytesResumable, type UploadTask } from 'firebase/storage'
import { auth, functions, storage } from '../../lib/firebase'
import { cachedRequest, invalidateRequestCache } from '../../lib/request-cache'
import type { ImportRow, PdfImport, PdfImportDetails } from './types'

export type PdfImportListFilters = {
  search?: string
  wardId?: string
  boothId?: string
  area?: string
  status?: PdfImport['status'] | ''
}

export type PdfImportPage = {
  imports: PdfImport[]
  nextCursor?: string
  hasMore: boolean
}

function requireFunctions() {
  if (!functions) throw new Error('Firebase is not configured.')
  return functions
}

function requireStorage() {
  if (!storage) throw new Error('Firebase Storage is not configured.')
  return storage
}

export async function createPdfImport(file: File, details: PdfImportDetails, uploadHash: string) {
  const call = httpsCallable<PdfImportDetails & { originalFileName: string; uploadHash: string }, { id: string; storagePath: string; duplicate?: boolean; status?: string }>(requireFunctions(), 'createPdfImport')
  const result = await call({ ...details, originalFileName: file.name, uploadHash })
  invalidatePdfImportCache()
  invalidateRequestCache('voter-filter-options:')
  invalidateRequestCache('dashboard-summary:')
  invalidateRequestCache('dashboard-metric:')
  invalidateRequestCache('audit-logs:')
  return result.data
}

/**
 * Hash the exact PDF bytes before uploading. The server uses this value to
 * converge repeated uploads of the same file into one OCR source.
 */
export async function hashPdfFile(file: File) {
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot safely check duplicate PDF files.')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

export function uploadPdfFile({ file, sourcePdfId, storagePath, onProgress }: { file: File; sourcePdfId: string; storagePath: string; onProgress: (progress: number) => void }) {
  const task = uploadBytesResumable(ref(requireStorage(), storagePath), file, {
    contentType: 'application/pdf',
    customMetadata: { sourcePdfId },
  })
  const completion = new Promise<void>((resolve, reject) => {
    task.on('state_changed', (snapshot) => onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)), reject, () => resolve())
  })
  return { task, completion }
}

export async function listPdfImports(options: { force?: boolean } = {}) {
  const key = `pdf-imports:${auth?.currentUser?.uid ?? 'signed-out'}`
  return cachedRequest(key, async () => {
    const call = httpsCallable<{ cursor?: string; pageSize: number }, { imports: PdfImport[]; nextCursor?: string; hasMore: boolean }>(requireFunctions(), 'listPdfImports')
    const imports: PdfImport[] = []
    let cursor: string | undefined
    let hasMore = true
    while (hasMore) {
      const result = (await call({ cursor, pageSize: 200 })).data
      imports.push(...result.imports)
      cursor = result.nextCursor
      hasMore = result.hasMore && Boolean(cursor)
    }
    return imports.sort((first, second) => pdfImportTime(second) - pdfImportTime(first))
  }, { ttlMs: 20_000, force: options.force })
}

/** Load one small, server-filtered page for the Upload screen. */
export async function loadPdfImportPage(cursor?: string, options: { filters?: PdfImportListFilters; force?: boolean } = {}) {
  const filters = options.filters ?? {}
  const key = `pdf-import-page:${auth?.currentUser?.uid ?? 'signed-out'}:${cursor ?? 'first'}:${JSON.stringify(filters)}`
  return cachedRequest(key, async () => {
    const call = httpsCallable<PdfImportListFilters & { cursor?: string; pageSize: number }, PdfImportPage>(requireFunctions(), 'listPdfImports')
    return (await call({ ...filters, ...(cursor ? { cursor } : {}), pageSize: 10 })).data
  }, { ttlMs: 20_000, force: options.force })
}

export function invalidatePdfImportCache() {
  invalidateRequestCache('pdf-imports:')
  invalidateRequestCache('pdf-import-page:')
}

function pdfImportTime(item: PdfImport) {
  const value = item.updatedAt ?? item.uploadedAt ?? item.createdAt
  const time = value ? new Date(value).getTime() : 0
  return Number.isNaN(time) ? 0 : time
}

export async function cancelPdfImport(sourcePdfId: string) {
  const call = httpsCallable<{ sourcePdfId: string }, { status: string }>(requireFunctions(), 'cancelPdfImport')
  await call({ sourcePdfId })
  invalidatePdfImportCache()
  invalidateRequestCache('dashboard-summary:')
  invalidateRequestCache('dashboard-metric:')
  invalidateRequestCache('audit-logs:')
}

export async function deletePdfImport(sourcePdfId: string) {
  const call = httpsCallable<{ sourcePdfId: string }, { sourcePdfId: string }>(requireFunctions(), 'deletePdfImport')
  await call({ sourcePdfId })
  invalidatePdfImportCache()
  invalidateRequestCache('dashboard-summary:')
  invalidateRequestCache('dashboard-metric:')
  invalidateRequestCache('audit-logs:')
}

export async function listPdfImportRows(sourcePdfId: string, cursor?: string) {
  const call = httpsCallable<{ sourcePdfId: string; cursor?: string }, { rows: ImportRow[]; nextCursor?: string }>(requireFunctions(), 'listPdfImportRows')
  return (await call({ sourcePdfId, cursor })).data
}

export async function savePdfImportRow(row: ImportRow, sourcePdfId: string) {
  const call = httpsCallable<ImportRow & { sourcePdfId: string; rowId: string }, { id: string }>(requireFunctions(), 'savePdfImportRow')
  await call({ ...row, sourcePdfId, rowId: row.id })
}

export async function loadImportCardImage(sourcePdfId: string, rowId: string) {
  const call = httpsCallable<{ sourcePdfId: string; rowId: string }, { url: string; expiresAt: string }>(requireFunctions(), 'getImportRowCardImageUrl')
  return (await call({ sourcePdfId, rowId })).data.url
}

export async function requestPdfImportApproval(sourcePdfId: string) {
  const call = httpsCallable<{ sourcePdfId: string }, { status: string }>(requireFunctions(), 'requestPdfImportApproval')
  await call({ sourcePdfId })
  invalidatePdfImportCache()
  invalidateRequestCache('dashboard-summary:')
  invalidateRequestCache('dashboard-metric:')
  invalidateRequestCache('audit-logs:')
}

export async function approvePdfImport(sourcePdfId: string) {
  const call = httpsCallable<{ sourcePdfId: string }, { status: string }>(requireFunctions(), 'approvePdfImport')
  await call({ sourcePdfId })
  invalidatePdfImportCache()
  invalidateRequestCache('dashboard-summary:')
  invalidateRequestCache('dashboard-metric:')
  invalidateRequestCache('audit-logs:')
}

export async function retryPdfImport(sourcePdfId: string) {
  const call = httpsCallable<{ sourcePdfId: string }, { status: string }>(requireFunctions(), 'retryPdfImport')
  await call({ sourcePdfId })
  invalidatePdfImportCache()
  invalidateRequestCache('dashboard-summary:')
  invalidateRequestCache('dashboard-metric:')
  invalidateRequestCache('audit-logs:')
}

export async function updatePdfImportMetadata(sourcePdfId: string, metadata: PdfImportDetails) {
  const call = httpsCallable<PdfImportDetails & { sourcePdfId: string }, { sourcePdfId: string }>(requireFunctions(), 'updatePdfImportMetadata')
  const result = await call({ sourcePdfId, ...metadata })
  invalidatePdfImportCache()
  invalidateRequestCache('voter-page:')
  invalidateRequestCache('voter-count:')
  invalidateRequestCache('voter-all:')
  invalidateRequestCache('voter-filter-options:')
  invalidateRequestCache('dashboard-summary:')
  invalidateRequestCache('dashboard-metric:')
  invalidateRequestCache('audit-logs:')
  return result.data
}

export type UploadTaskHandle = UploadTask
