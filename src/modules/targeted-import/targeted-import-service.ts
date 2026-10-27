import { httpsCallable } from 'firebase/functions'
import { ref, uploadBytesResumable, type UploadTask } from 'firebase/storage'
import { auth, functions, storage } from '../../lib/firebase'
import type { VoterRecord } from '../voter-register/types'

export type TargetedImportStatus = 'queued' | 'processing' | 'review' | 'ready' | 'merging' | 'merged' | 'failed'
export type TargetedImportJob = {
  id: string
  wantedFileName: string
  sourceFiles: string[]
  wantedStoragePath: string
  sourceStoragePaths: string[]
  doorNumbers: string[]
  status: TargetedImportStatus
  stage: string
  progress: number
  matchedCount: number
  extractedCount: number
  pageCount: number
  mergedCount: number
  wardId: string
  boothId: string
  area: string
  division: string
  errorMessage?: string
}
export type TargetedVoterRecord = VoterRecord & { sourceFileName: string }

function requireFunctions() {
  if (!functions) throw new Error('Firebase is not configured.')
  return functions
}

function requireStorage() {
  if (!storage) throw new Error('Firebase Storage is not configured.')
  return storage
}

export async function createTargetedImportJob(wantedFile: File, sourceFiles: File[]) {
  const call = httpsCallable<{ wantedFileName: string; sourceFileNames: string[] }, TargetedImportJob>(requireFunctions(), 'createTargetedImportJob')
  return (await call({ wantedFileName: wantedFile.name, sourceFileNames: sourceFiles.map((file) => file.name) })).data
}

export function uploadTargetedFile(file: File, storagePath: string, onProgress: (progress: number) => void) {
  const task = uploadBytesResumable(ref(requireStorage(), storagePath), file, { contentType: file.type || guessContentType(file.name) })
  const completion = new Promise<void>((resolve, reject) => {
    task.on('state_changed', (snapshot) => onProgress(snapshot.totalBytes ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0), reject, resolve)
  })
  return { task, completion }
}

export async function prepareTargetedImportJob(jobId: string) {
  const call = httpsCallable<{ jobId: string }, TargetedImportJob>(requireFunctions(), 'prepareTargetedImportJob')
  return (await call({ jobId })).data
}

export async function startTargetedImportJob(jobId: string, doorNumbers: string[]) {
  const call = httpsCallable<{ jobId: string; doorNumbers: string[] }, TargetedImportJob>(requireFunctions(), 'startTargetedImportJob')
  return (await call({ jobId, doorNumbers })).data
}

export async function loadTargetedImportJob(jobId: string) {
  const call = httpsCallable<{ jobId: string }, TargetedImportJob>(requireFunctions(), 'getTargetedImportJob')
  return (await call({ jobId })).data
}

export async function loadTargetedRecords(jobId: string, cursor?: string) {
  const call = httpsCallable<{ jobId: string; cursor?: string; pageSize: number }, { records: TargetedVoterRecord[]; nextCursor?: string; hasMore: boolean }>(requireFunctions(), 'listTargetedImportRecords')
  return (await call({ jobId, pageSize: 50, ...(cursor ? { cursor } : {}) })).data
}

export async function mergeTargetedImportJob(payload: { jobId: string; wardId: string; boothId: string; area: string; division: string }) {
  const call = httpsCallable<typeof payload, TargetedImportJob>(requireFunctions(), 'mergeTargetedImportJob')
  return (await call(payload)).data
}

export function targetImportUploadLabel(file: File) {
  return `${file.name} · ${Math.max(1, Math.round(file.size / 1024 / 1024))} MB`
}

function guessContentType(fileName: string) {
  const lower = fileName.toLocaleLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  return 'image/jpeg'
}

export function currentUserId() {
  return auth?.currentUser?.uid ?? ''
}

export type TargetedUploadTask = UploadTask
