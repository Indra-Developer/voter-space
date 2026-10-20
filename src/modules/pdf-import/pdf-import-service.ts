import { httpsCallable } from 'firebase/functions'
import { ref, uploadBytesResumable, type UploadTask } from 'firebase/storage'
import { functions, storage } from '../../lib/firebase'
import type { ImportRow, PdfImport, PdfImportDetails } from './types'

function requireFunctions() {
  if (!functions) throw new Error('Firebase is not configured.')
  return functions
}

function requireStorage() {
  if (!storage) throw new Error('Firebase Storage is not configured.')
  return storage
}

export async function createPdfImport(file: File, details: PdfImportDetails) {
  const call = httpsCallable<PdfImportDetails & { originalFileName: string }, { id: string; storagePath: string }>(requireFunctions(), 'createPdfImport')
  const result = await call({ ...details, originalFileName: file.name })
  return result.data
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

export async function listPdfImports() {
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
}

function pdfImportTime(item: PdfImport) {
  const value = item.updatedAt ?? item.uploadedAt ?? item.createdAt
  const time = value ? new Date(value).getTime() : 0
  return Number.isNaN(time) ? 0 : time
}

export async function cancelPdfImport(sourcePdfId: string) {
  const call = httpsCallable<{ sourcePdfId: string }, { status: string }>(requireFunctions(), 'cancelPdfImport')
  await call({ sourcePdfId })
}

export async function deletePdfImport(sourcePdfId: string) {
  const call = httpsCallable<{ sourcePdfId: string }, { sourcePdfId: string }>(requireFunctions(), 'deletePdfImport')
  await call({ sourcePdfId })
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
}

export async function approvePdfImport(sourcePdfId: string) {
  const call = httpsCallable<{ sourcePdfId: string }, { status: string }>(requireFunctions(), 'approvePdfImport')
  await call({ sourcePdfId })
}

export async function retryPdfImport(sourcePdfId: string) {
  const call = httpsCallable<{ sourcePdfId: string }, { status: string }>(requireFunctions(), 'retryPdfImport')
  await call({ sourcePdfId })
}

export type UploadTaskHandle = UploadTask
