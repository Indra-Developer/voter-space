export type PdfImportStatus = 'readyForUpload' | 'queued' | 'processing' | 'review' | 'awaitingApproval' | 'approvalQueued' | 'applying' | 'completed' | 'completedWithReview' | 'failed' | 'cancelled'
export type DuplicateState = 'new' | 'updatesExisting' | 'missingIdentity'

export type PdfImport = {
  id: string
  originalFileName: string
  storagePath: string
  ownerUid: string
  uploadedByName: string
  wardId: string
  boothId: string
  area: string
  division: string
  areas?: string[]
  divisions?: string[]
  status: PdfImportStatus
  stage: string
  progress: number
  fileSize?: number
  rowCount?: number
  readyCount?: number
  duplicateCount?: number
  needsReviewCount?: number
  errorMessage?: string
  createdAt?: string
  uploadedAt?: string
  updatedAt?: string
}

export type ImportRow = {
  id: string
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
  duplicateState: DuplicateState
  reviewStatus: 'pending' | 'reviewed' | 'needsReview'
  needsReview: boolean
  confidence: number
  rawText: string
  voterCardImagePath?: string
  pageNumber?: number
  cardPosition?: number
  updatedAt?: string
  updatedByName?: string
}

export type PdfImportDetails = Pick<PdfImport, 'wardId' | 'boothId' | 'area' | 'division'>

export type UploadQueueStatus = 'draft' | 'preparing' | 'uploading' | 'paused' | 'uploaded' | 'failed' | 'cancelled'

export type UploadQueueItem = PdfImportDetails & {
  localId: string
  file: File
  sourcePdfId?: string
  storagePath?: string
  status: UploadQueueStatus
  progress: number
  error?: string
}
