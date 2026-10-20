import { createHash } from 'node:crypto'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFunctions } from 'firebase-admin/functions'
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onObjectFinalized } from 'firebase-functions/v2/storage'
import { onTaskDispatched } from 'firebase-functions/v2/tasks'
import * as logger from 'firebase-functions/logger'
import { extractVoterCardsFromPdf, type CoverAreaRow, type ExtractedVoterCard } from './pdf-card-importer.js'

if (!getApps().length) initializeApp()

const auth = getAuth()
const db = getFirestore()

type Role = 'superAdmin' | 'admin' | 'subMember'
type Status = 'active' | 'disabled'
type Scope = { wardIds: string[]; boothIds: string[] }
type Permissions = { upload: boolean; edit: boolean; download: boolean; audit: boolean }
type UserRecord = {
  fullName: string
  email: string
  mobile: string
  role: Role
  status: Status
  scope: Scope
  permissions: Permissions
  parentAdminId?: string
  profilePhotoPath?: string
  bannerPath?: string
}
type AccountInput = {
  uid?: string
  fullName?: unknown
  email?: unknown
  mobile?: unknown
  role?: unknown
  status?: unknown
  parentAdminId?: unknown
  scope?: unknown
  permissions?: unknown
  profilePhotoPath?: unknown
  bannerPath?: unknown
  password?: unknown
}
type VoterRecord = {
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
  sourcePdfId: string
  sourcePdfName: string
  voterCardImagePath: string
  pageNumber?: number
  cardPosition?: number
  reviewStatus: 'pending' | 'reviewed' | 'needsReview'
  needsReview: boolean
  uploadedAt?: string
  uploadedBy: string
}
type VoterFilters = {
  name?: unknown
  doorNumber?: unknown
  voterId?: unknown
  alternateIdentifier?: unknown
  mobile?: unknown
  serialNumber?: unknown
  wardId?: unknown
  boothId?: unknown
  area?: unknown
  division?: unknown
  sourcePdf?: unknown
  reviewStatus?: unknown
  needsReview?: unknown
  uploadedFrom?: unknown
  uploadedTo?: unknown
  uploadedBy?: unknown
}
type VoterUpdateInput = VoterRecord & { id?: unknown }
type PdfImportStatus = 'readyForUpload' | 'queued' | 'processing' | 'review' | 'awaitingApproval' | 'approvalQueued' | 'applying' | 'completed' | 'completedWithReview' | 'failed' | 'cancelled'
type DuplicateState = 'new' | 'updatesExisting' | 'missingIdentity'
type SourcePdfRecord = {
  originalFileName: string
  storagePath: string
  ownerUid: string
  uploadedByName: string
  uploadedByRole?: Role
  wardId: string
  boothId: string
  area: string
  division: string
  areas?: string[]
  divisions?: string[]
  coverRows?: CoverAreaRow[]
  status: PdfImportStatus
  stage: string
  progress: number
  pageCount?: number
  fileSize?: number
  rowCount?: number
  readyCount?: number
  duplicateCount?: number
  needsReviewCount?: number
  errorMessage?: string
  cancelRequested?: boolean
  ocrOutputPrefix?: string
  createdAt?: unknown
  uploadedAt?: unknown
  updatedAt?: unknown
}
type ImportRowRecord = {
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
  updatedAt?: unknown
  updatedByName?: string
}
type CreatePdfImportInput = { originalFileName?: unknown; wardId?: unknown; boothId?: unknown; area?: unknown; division?: unknown }
type PdfRowUpdateInput = Partial<ImportRowRecord> & { sourcePdfId?: unknown; rowId?: unknown }

const region = 'asia-south1'
// Storage event functions must run in the same location as their bucket.
// The Voter Space default bucket is in asia-south1.
const storageEventRegion = 'asia-south1'

export const createUserAccount = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const input = readAccountInput(request.data)
  const account = await authorizeNewAccount(caller, input)
  const password = readAccountPassword(input.password, true)

  let authUser: { uid: string } | undefined
  let createdAuthUser = false
  try {
    try {
      const existingAuthUser = await auth.getUserByEmail(account.email)
      const existingProfile = await db.doc(`users/${existingAuthUser.uid}`).get()
      if (existingProfile.exists) throw new HttpsError('already-exists', 'An account already exists with this email.')
      // Repair a previous half-created account: Auth exists, but its Firestore profile does not.
      authUser = await auth.updateUser(existingAuthUser.uid, {
        displayName: account.fullName,
        disabled: account.status === 'disabled',
        password,
      })
      logger.warn('Repairing an Auth account that has no Voter Space profile.', { uid: existingAuthUser.uid })
    } catch (error) {
      if (error instanceof HttpsError) throw error
      if (getErrorCode(error) !== 'auth/user-not-found') throw error
      authUser = await auth.createUser({
        email: account.email,
        displayName: account.fullName,
        disabled: account.status === 'disabled',
        password,
      })
      createdAuthUser = true
    }

    await auth.setCustomUserClaims(authUser.uid, { role: account.role })
    const batch = db.batch()
    batch.set(db.doc(`users/${authUser.uid}`), {
      ...cleanUndefined({ ...account }),
      createdBy: caller.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    batch.set(db.collection('auditLogs').doc(), {
      actorUid: caller.uid,
      actorName: caller.record.fullName,
      action: 'account_created',
      targetUid: authUser.uid,
      targetName: account.fullName,
      details: { role: account.role, passwordSet: true },
      createdAt: FieldValue.serverTimestamp(),
    })
    await batch.commit()
    return { uid: authUser.uid }
  } catch (error) {
    logger.error('User account creation failed', { error, email: account.email, createdAuthUser })
    if (createdAuthUser && authUser) {
      await auth.deleteUser(authUser.uid).catch((rollbackError) => logger.error('Auth rollback failed', { rollbackError, uid: authUser?.uid }))
    }
    if (error instanceof HttpsError) throw error
    throw new HttpsError('internal', 'The account could not be created. Please try again.')
  }
})

export const updateUserAccount = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const input = readAccountInput(request.data)
  if (!input.uid || typeof input.uid !== 'string') throw new HttpsError('invalid-argument', 'A user id is required.')

  const targetSnapshot = await db.doc(`users/${input.uid}`).get()
  if (!targetSnapshot.exists) throw new HttpsError('not-found', 'User account not found.')
  const target = targetSnapshot.data() as UserRecord
  const account = await authorizeUpdate(caller, target, input)
  const password = readAccountPassword(input.password, false)

  const authUpdate: { displayName: string; disabled: boolean; email?: string; password?: string } = {
    displayName: account.fullName,
    disabled: account.status === 'disabled',
  }
  if (caller.record.role === 'superAdmin' && account.email !== target.email) authUpdate.email = account.email
  if (password) authUpdate.password = password
  await auth.updateUser(input.uid, authUpdate)

  await targetSnapshot.ref.update({ ...cleanUndefined({ ...account }), updatedAt: FieldValue.serverTimestamp() })
  const changes = accountChanges(target, account)
  if (password) changes.password = true
  await writeAudit(caller, 'account_updated', input.uid, account.fullName, { changes })
  return { uid: input.uid }
})

export const logPasswordResetRequest = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  if (caller.record.role !== 'superAdmin') throw new HttpsError('permission-denied', 'Only Super Admins can reset passwords.')
  const userId = requiredString((request.data as { userId?: unknown })?.userId, 'User id')
  const target = await db.doc(`users/${userId}`).get()
  if (!target.exists) throw new HttpsError('not-found', 'User account not found.')
  const targetRecord = target.data() as UserRecord
  await writeAudit(caller, 'password_reset_requested', userId, targetRecord.fullName, {})
  return { userId }
})

export const listVoters = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const filters = readVoterFilters(request.data)
  const input = request.data as { cursor?: unknown; pageSize?: unknown }
  const pageSize = Math.min(optionalInteger(input?.pageSize) ?? 200, 250)
  const cursorId = plainString(input?.cursor)
  const cursor = cursorId ? await db.doc(`voters/${cursorId}`).get() : undefined
  const query = db.collection('voters').orderBy(FieldPath.documentId())
  const snapshot = await (cursor?.exists ? query.startAfter(cursor).limit(pageSize) : query.limit(pageSize)).get()
  const records = snapshot.docs
    .map((item) => voterFromFirestore(item.id, item.data()))
    .filter((record) => canViewVoter(caller.record, record))
    .filter((record) => matchesFilters(record, filters))
    .sort((first, second) => first.doorNumber.localeCompare(second.doorNumber, 'en', { numeric: true }) || first.serialNumber.localeCompare(second.serialNumber, 'en', { numeric: true }))

  return { records, nextCursor: snapshot.size === pageSize ? snapshot.docs[snapshot.docs.length - 1]?.id : undefined, hasMore: snapshot.size === pageSize }
})

export const getVoterFilterOptions = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const snapshot = await db.collection('voters').select('wardId', 'boothId', 'area', 'division', 'sourcePdfName', 'sourcePdfId', 'uploadedByName', 'uploadedBy').get()
  const visible = snapshot.docs
    .map((item) => voterFromFirestore(item.id, item.data()))
    .filter((record) => canViewVoter(caller.record, record))
  return {
    wards: uniqueSorted(visible.map((record) => record.wardId)),
    booths: uniqueSorted(visible.map((record) => record.boothId)),
    areas: uniqueSorted(visible.map((record) => record.area)),
    divisions: uniqueSorted(visible.map((record) => record.division)),
    sourcePdfs: uniqueSorted(visible.map((record) => record.sourcePdfName || record.sourcePdfId)),
    uploaders: uniqueSorted(visible.map((record) => record.uploadedBy)),
  }
})

export const updateVoterRecord = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  if (caller.record.role === 'subMember' || (caller.record.role === 'admin' && !caller.record.permissions.edit)) {
    throw new HttpsError('permission-denied', 'You do not have permission to edit voter records.')
  }
  const input = readVoterUpdate(request.data)
  const snapshot = await db.doc(`voters/${input.id}`).get()
  if (!snapshot.exists) throw new HttpsError('not-found', 'Voter record not found.')
  const existing = voterFromFirestore(snapshot.id, snapshot.data() ?? {})
  if (!canViewVoter(caller.record, existing) || !canViewVoter(caller.record, input)) {
    throw new HttpsError('permission-denied', 'This record is outside your allowed ward or booth scope.')
  }

  await snapshot.ref.update({
    fullName: input.fullName,
    relativeName: input.relativeName,
    relationshipType: input.relationshipType,
    age: input.age,
    gender: input.gender,
    doorNumber: input.doorNumber,
    voterId: input.voterId,
    alternateIdentifier: input.alternateIdentifier,
    mobile: input.mobile,
    serialNumber: input.serialNumber,
    assemblySerial: input.assemblySerial,
    wardId: input.wardId,
    boothId: input.boothId,
    area: input.area,
    division: input.division,
    reviewStatus: input.reviewStatus,
    needsReview: input.needsReview,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: caller.uid,
    updatedByName: caller.record.fullName,
  })
  await writeAudit(caller, 'voter_record_updated', input.id, input.fullName, { voterId: input.voterId })
  return { id: input.id }
})

export const createPdfImport = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const input = readPdfImportRequest(request.data)
  assertCanUploadPdf(caller.record, input.wardId, input.boothId)

  const sourceRef = db.collection('sourcePdfs').doc()
  const originalFileName = safePdfFileName(input.originalFileName)
  const storagePath = `source-pdfs/${caller.uid}/${sourceRef.id}/${originalFileName}`
  const source: SourcePdfRecord = {
    originalFileName,
    storagePath,
    ownerUid: caller.uid,
    uploadedByName: caller.record.fullName,
    uploadedByRole: caller.record.role,
    wardId: input.wardId,
    boothId: input.boothId,
    area: input.area,
    division: input.division,
    status: 'readyForUpload',
    stage: 'Ready to upload',
    progress: 0,
    cancelRequested: false,
  }
  await sourceRef.set({ ...source, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  await writeAudit(caller, 'pdf_import_created', sourceRef.id, originalFileName, { wardId: input.wardId, boothId: input.boothId })
  return { id: sourceRef.id, storagePath }
})

export const listPdfImports = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const snapshot = await db.collection('sourcePdfs').orderBy('createdAt', 'desc').limit(250).get()
  const imports = snapshot.docs
    .map((item) => ({ id: item.id, ...(item.data() as SourcePdfRecord) }))
    .filter((source) => canViewPdfImport(caller.record, source))
    .map(sourceForClient)
  return { imports }
})

export const cancelPdfImport = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const sourcePdfId = requiredString((request.data as { sourcePdfId?: unknown })?.sourcePdfId, 'Source PDF id')
  const source = await getPdfImport(sourcePdfId)
  assertCanManagePdfImport(caller.record, source)
  if (['completed', 'completedWithReview', 'cancelled'].includes(source.status)) {
    throw new HttpsError('failed-precondition', 'This PDF is not currently running.')
  }
  await db.doc(`sourcePdfs/${sourcePdfId}`).update({
    status: 'cancelled',
    cancelRequested: true,
    stage: 'Cancelled by user',
    progress: 0,
    updatedAt: FieldValue.serverTimestamp(),
  })
  await writeAudit(caller, 'pdf_import_cancelled', sourcePdfId, source.originalFileName, {})
  return { status: 'cancelled' }
})

export const deletePdfImport = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const sourcePdfId = requiredString((request.data as { sourcePdfId?: unknown })?.sourcePdfId, 'Source PDF id')
  const source = await getPdfImport(sourcePdfId)
  assertCanManagePdfImport(caller.record, source)
  await deleteSourcePdfRecord(sourcePdfId, source, true)
  await writeAudit(caller, 'pdf_import_deleted', sourcePdfId, source.originalFileName, { wardId: source.wardId, boothId: source.boothId })
  return { sourcePdfId }
})

export const deleteVotersByWard = onCall({ region, timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  if (caller.record.role !== 'superAdmin') throw new HttpsError('permission-denied', 'Only the Super Admin can delete a complete ward.')
  const input = request.data as { wardId?: unknown; confirmation?: unknown }
  const wardId = requiredString(input?.wardId, 'Ward id')
  if (plainString(input?.confirmation) !== wardId) throw new HttpsError('failed-precondition', 'The ward confirmation does not match.')

  const voterSnapshot = await db.collection('voters').where('wardId', '==', wardId).get()
  const sourceSnapshot = await db.collection('sourcePdfs').where('wardId', '==', wardId).get()
  const voterPaths = voterSnapshot.docs.map((item) => plainString(item.data().voterCardImagePath)).filter(Boolean)
  const sources = sourceSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() as SourcePdfRecord) }))

  for (const group of splitInto(voterSnapshot.docs, 50)) {
    await Promise.all(group.map((voter) => deleteVoterRecordTree(voter.ref)))
  }
  for (const group of splitInto(sources, 10)) {
    await Promise.all(group.map((source) => deleteSourcePdfRecord(source.id, source, true)))
  }
  await deleteStoragePaths(voterPaths)
  const sourceIdsFromCardPaths = voterPaths.flatMap((path) => {
    const match = path.match(/^voter-cards\/([^/]+)\//)
    return match ? [match[1]] : []
  })
  const knownSourceIds = new Set(sources.map((source) => source.id))
  for (const sourcePdfId of new Set(sourceIdsFromCardPaths)) {
    if (!knownSourceIds.has(sourcePdfId)) await deleteStoragePrefix(`voter-cards/${sourcePdfId}/`)
  }
  try {
    await writeAudit(caller, 'ward_voter_data_deleted', wardId, `Ward ${wardId}`, { voters: voterSnapshot.size, sourcePdfs: sources.length })
  } catch (error) {
    logger.error('Ward data was deleted, but the audit entry could not be written', { wardId, error })
  }
  return { wardId, deletedVoters: voterSnapshot.size, deletedSourcePdfs: sources.length }
})

// Storage rules keep source PDFs private. This callable checks the caller's
// ward/booth access before issuing a short-lived, download-only link.
export const getSourcePdfDownloadUrl = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const sourcePdfId = requiredString((request.data as { sourcePdfId?: unknown })?.sourcePdfId, 'Source PDF id')
  const source = await getPdfImport(sourcePdfId)
  if (!canViewPdfImport(caller.record, source) || !canDownloadSourcePdf(caller.record)) {
    throw new HttpsError('permission-denied', 'You do not have permission to download this PDF.')
  }

  const file = getStorage().bucket().file(source.storagePath)
  const [exists] = await file.exists()
  if (!exists) throw new HttpsError('not-found', 'The original PDF file is no longer available.')
  const expiresAt = Date.now() + 10 * 60 * 1000
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: expiresAt,
    responseType: 'application/pdf',
    responseDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(source.originalFileName)}`,
  })
  await writeAudit(caller, 'pdf_downloaded', sourcePdfId, source.originalFileName, { wardId: source.wardId, boothId: source.boothId })
  return { url, expiresAt: new Date(expiresAt).toISOString() }
})

// Card crops are private. A user receives the image bytes only after their
// ward and booth access has been checked against the voter record. Returning
// the private bytes avoids depending on the Cloud Function service account's
// IAM signBlob permission, which is not enabled in every Firebase project.
async function privateCardImageDataUrl(path: string) {
  const file = getStorage().bucket().file(path)
  const [exists] = await file.exists()
  if (!exists) throw new HttpsError('not-found', 'The original voter card image is not available.')
  const [bytes] = await file.download()
  return `data:image/png;base64,${bytes.toString('base64')}`
}

export const getVoterCardImageUrl = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const voterRecordId = requiredString((request.data as { voterRecordId?: unknown })?.voterRecordId, 'Voter record id')
  const snapshot = await db.doc(`voters/${voterRecordId}`).get()
  if (!snapshot.exists) throw new HttpsError('not-found', 'Voter record not found.')
  const voter = voterFromFirestore(snapshot.id, snapshot.data() ?? {})
  if (!canViewVoter(caller.record, voter)) throw new HttpsError('permission-denied', 'This voter is outside your allowed ward or booth.')
  if (!voter.voterCardImagePath.startsWith('voter-cards/')) throw new HttpsError('not-found', 'The original voter card image is not available.')

  const url = await privateCardImageDataUrl(voter.voterCardImagePath)
  return { url }
})

export const listAuditLogs = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const canSeeAll = caller.record.role === 'superAdmin'
  const canSeeOwn = caller.record.role === 'admin' && caller.record.permissions.audit
  if (!canSeeAll && !canSeeOwn) throw new HttpsError('permission-denied', 'You do not have permission to view audit activity.')

  const snapshot = canSeeAll
    ? await db.collection('auditLogs').orderBy('createdAt', 'desc').limit(200).get()
    : await db.collection('auditLogs').where('actorUid', '==', caller.uid).orderBy('createdAt', 'desc').limit(200).get()
  const entries = snapshot.docs.map((item) => ({ id: item.id, ...auditForClient(item.data()) }))
  return { entries, ownActivityOnly: !canSeeAll }
})

export const listPdfImportRows = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const input = request.data as { sourcePdfId?: unknown; cursor?: unknown }
  const sourcePdfId = requiredString(input?.sourcePdfId, 'Source PDF id')
  const source = await getPdfImport(sourcePdfId)
  if (!canViewPdfImport(caller.record, source)) throw new HttpsError('permission-denied', 'You cannot view this PDF import.')
  const rowsRef = db.collection('sourcePdfs').doc(sourcePdfId).collection('rows')
  const cursorId = plainString(input?.cursor)
  const cursor = cursorId ? await rowsRef.doc(cursorId).get() : undefined
  const rows = await (cursor?.exists ? rowsRef.orderBy(FieldPath.documentId()).startAfter(cursor).limit(250) : rowsRef.orderBy(FieldPath.documentId()).limit(250)).get()
  return {
    rows: rows.docs.map((item) => importRowForClient(item.id, item.data() as ImportRowRecord)),
    nextCursor: rows.size === 250 ? rows.docs.at(-1)?.id : undefined,
  }
})

export const getImportRowCardImageUrl = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const input = request.data as { sourcePdfId?: unknown; rowId?: unknown }
  const sourcePdfId = requiredString(input?.sourcePdfId, 'Source PDF id')
  const rowId = requiredString(input?.rowId, 'Import row id')
  const source = await getPdfImport(sourcePdfId)
  if (!canViewPdfImport(caller.record, source)) throw new HttpsError('permission-denied', 'You cannot view this PDF import.')
  const rowSnapshot = await db.doc(`sourcePdfs/${sourcePdfId}/rows/${rowId}`).get()
  if (!rowSnapshot.exists) throw new HttpsError('not-found', 'Import row not found.')
  const imagePath = plainString((rowSnapshot.data() as ImportRowRecord).voterCardImagePath)
  if (!imagePath.startsWith(`voter-cards/${sourcePdfId}/`)) throw new HttpsError('not-found', 'The original voter card image is not available.')
  const url = await privateCardImageDataUrl(imagePath)
  return { url }
})

export const savePdfImportRow = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const input = readPdfRowUpdate(request.data)
  const source = await getPdfImport(input.sourcePdfId)
  assertCanManagePdfImport(caller.record, source)
  const rowRef = db.collection('sourcePdfs').doc(input.sourcePdfId).collection('rows').doc(input.rowId)
  const snapshot = await rowRef.get()
  if (!snapshot.exists) throw new HttpsError('not-found', 'Import row not found.')

  const current = snapshot.data() as ImportRowRecord
  const next = buildEditedImportRow(current, input)
  await rowRef.update({ ...cleanUndefined(next), updatedAt: FieldValue.serverTimestamp(), updatedByName: caller.record.fullName })
  const sourceRef = db.collection('sourcePdfs').doc(input.sourcePdfId)
  const nextStatus: PdfImportStatus = caller.record.role === 'superAdmin' ? 'review' : 'awaitingApproval'
  await sourceRef.update({ status: nextStatus, stage: caller.record.role === 'superAdmin' ? 'Review updated' : 'Waiting for Super Admin approval', updatedAt: FieldValue.serverTimestamp() })
  await writeAudit(caller, 'pdf_import_row_updated', `${input.sourcePdfId}/${input.rowId}`, next.fullName || 'Voter row', { sourcePdfId: input.sourcePdfId })
  return { id: input.rowId, status: nextStatus }
})

export const requestPdfImportApproval = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const sourcePdfId = requiredString((request.data as { sourcePdfId?: unknown })?.sourcePdfId, 'Source PDF id')
  const source = await getPdfImport(sourcePdfId)
  assertCanManagePdfImport(caller.record, source)
  if (caller.record.role === 'superAdmin') throw new HttpsError('failed-precondition', 'A Super Admin can approve the import directly.')
  await db.doc(`sourcePdfs/${sourcePdfId}`).update({ status: 'awaitingApproval', stage: 'Waiting for Super Admin approval', updatedAt: FieldValue.serverTimestamp() })
  await writeAudit(caller, 'pdf_import_approval_requested', sourcePdfId, source.originalFileName, {})
  return { status: 'awaitingApproval' }
})

export const approvePdfImport = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  if (caller.record.role !== 'superAdmin') throw new HttpsError('permission-denied', 'Only a Super Admin can approve an import.')
  const sourcePdfId = requiredString((request.data as { sourcePdfId?: unknown })?.sourcePdfId, 'Source PDF id')
  const source = await getPdfImport(sourcePdfId)
  if (!['review', 'awaitingApproval', 'completedWithReview'].includes(source.status)) {
    throw new HttpsError('failed-precondition', 'This PDF is not ready for approval.')
  }
  await db.doc(`sourcePdfs/${sourcePdfId}`).update({ status: 'approvalQueued', stage: 'Approved - importing voter records', progress: 82, errorMessage: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })
  await enqueueImportTask('applyPdfImport', { sourcePdfId })
  await writeAudit(caller, 'pdf_import_approved', sourcePdfId, source.originalFileName, {})
  return { status: 'approvalQueued' }
})

export const retryPdfImport = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const sourcePdfId = requiredString((request.data as { sourcePdfId?: unknown })?.sourcePdfId, 'Source PDF id')
  const source = await getPdfImport(sourcePdfId)
  assertCanManagePdfImport(caller.record, source)
  if (source.status === 'readyForUpload') throw new HttpsError('failed-precondition', 'Upload the PDF before starting OCR.')
  await db.doc(`sourcePdfs/${sourcePdfId}`).update({ status: 'queued', cancelRequested: false, stage: 'OCR retry queued', progress: 8, errorMessage: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })
  await enqueueImportTask('processPdfImport', { sourcePdfId })
  await writeAudit(caller, 'pdf_import_retry_requested', sourcePdfId, source.originalFileName, {})
  return { status: 'queued' }
})

export const onSourcePdfUploaded = onObjectFinalized({ region: storageEventRegion, timeoutSeconds: 300, retry: true }, async (event) => {
  const file = event.data
  const pathParts = file.name?.split('/') ?? []
  if (pathParts.length < 4 || pathParts[0] !== 'source-pdfs') return
  const [_, ownerUid, sourcePdfId] = pathParts
  if (!sourcePdfId || !ownerUid || file.contentType !== 'application/pdf') return

  const sourceRef = db.doc(`sourcePdfs/${sourcePdfId}`)
  const snapshot = await sourceRef.get()
  if (!snapshot.exists) return
  const source = snapshot.data() as SourcePdfRecord
  if (source.ownerUid !== ownerUid || source.storagePath !== file.name) return
  if (!['readyForUpload', 'failed', 'queued'].includes(source.status)) return

  await sourceRef.update({ status: 'queued', stage: 'PDF uploaded - waiting for OCR', progress: 6, fileSize: Number(file.size), uploadedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  await enqueueImportTask('processPdfImport', { sourcePdfId })
})

export const processPdfImport = onTaskDispatched<{ sourcePdfId: string }>({
  region,
  memory: '2GiB',
  timeoutSeconds: 1800,
  retryConfig: { maxAttempts: 5, minBackoffSeconds: 60 },
  rateLimits: { maxConcurrentDispatches: 2 },
}, async (request) => {
  const sourcePdfId = requiredString(request.data?.sourcePdfId, 'Source PDF id')
  const sourceRef = db.doc(`sourcePdfs/${sourcePdfId}`)
  const snapshot = await sourceRef.get()
  if (!snapshot.exists) return
  const source = snapshot.data() as SourcePdfRecord
  if (!['queued', 'failed'].includes(source.status) || source.cancelRequested) return

  try {
    await sourceRef.update({ status: 'processing', stage: 'Finding voter cards in the PDF', progress: 12, errorMessage: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })
    const bucket = getStorage().bucket()
    const [pdfBytes] = await bucket.file(source.storagePath).download()
    let lastProgress = 12
    const extraction = await extractVoterCardsFromPdf({
      pdfBytes,
      sourcePdfId,
      scope: { wardId: source.wardId, boothId: source.boothId, area: source.area, division: source.division },
      onProgress: async (pageNumber, pageCount, cardCount) => {
        const current = await sourceRef.get()
        if (current.data()?.cancelRequested === true) throw new Error('PDF_IMPORT_CANCELLED')
        const progress = Math.min(72, 12 + Math.round((pageNumber / pageCount) * 60))
        if (progress < lastProgress + 2 && pageNumber !== pageCount) return
        lastProgress = progress
        await sourceRef.update({
          stage: `Reading page ${pageNumber} of ${pageCount} · ${cardCount} cards found`,
          progress,
          pageCount,
          rowCount: cardCount,
          updatedAt: FieldValue.serverTimestamp(),
        })
      },
    })
    const afterExtraction = await sourceRef.get()
    if (afterExtraction.data()?.cancelRequested === true) {
      await sourceRef.update({ status: 'cancelled', stage: 'Cancelled by user', progress: 0, updatedAt: FieldValue.serverTimestamp() })
      return
    }
    await sourceRef.update({ stage: 'Checking voter IDs and existing voters', progress: 76, updatedAt: FieldValue.serverTimestamp() })
    const candidates = await addDuplicateState(extraction.rows.map(makeCardImportRow))
    await storeImportRows(sourcePdfId, candidates)
    const duplicateCount = candidates.filter((item) => item.duplicateState === 'updatesExisting').length
    const areas = uniqueSorted(candidates.map((item) => item.area))
    const divisions = uniqueSorted(candidates.map((item) => item.division))
    const uploader = source.uploadedByRole ? undefined : await db.doc(`users/${source.ownerUid}`).get()
    const uploadedByRole = source.uploadedByRole ?? (uploader?.data() as UserRecord | undefined)?.role
    await sourceRef.update({
      // Every detected voter is saved automatically. Any value can later be
      // corrected from the Voter Register; there is no separate review step.
      status: 'applying',
      stage: 'Cards read - saving every voter to the register',
      progress: 82,
      rowCount: candidates.length,
      readyCount: candidates.length,
      duplicateCount,
      needsReviewCount: 0,
      areas,
      divisions,
      coverRows: extraction.coverRows.map((row) => cleanUndefined(row)),
      pageCount: extraction.pageCount,
      uploadedByRole: uploadedByRole ?? 'admin',
      area: areas.length === 1 ? areas[0] : source.area,
      division: divisions.length === 1 ? divisions[0] : source.division,
      updatedAt: FieldValue.serverTimestamp(),
    })
    await enqueueImportTask('applyPdfImport', { sourcePdfId })
  } catch (error) {
    if (error instanceof Error && error.message === 'PDF_IMPORT_CANCELLED') {
      await sourceRef.update({ status: 'cancelled', stage: 'Cancelled by user', progress: 0, updatedAt: FieldValue.serverTimestamp() })
      return
    }
    logger.error('PDF OCR failed', { sourcePdfId, error })
    await sourceRef.update({ status: 'failed', stage: 'OCR failed - retry is available', errorMessage: userSafeError(error), progress: 0, updatedAt: FieldValue.serverTimestamp() })
    throw error
  }
})

export const applyPdfImport = onTaskDispatched<{ sourcePdfId: string }>({
  region,
  memory: '2GiB',
  timeoutSeconds: 1800,
  retryConfig: { maxAttempts: 5, minBackoffSeconds: 60 },
  rateLimits: { maxConcurrentDispatches: 2 },
}, async (request) => {
  const sourcePdfId = requiredString(request.data?.sourcePdfId, 'Source PDF id')
  const sourceRef = db.doc(`sourcePdfs/${sourcePdfId}`)
  const snapshot = await sourceRef.get()
  if (!snapshot.exists) return
  const source = snapshot.data() as SourcePdfRecord
  if (!['approvalQueued', 'applying'].includes(source.status) || source.cancelRequested) return
  await sourceRef.update({ status: 'applying', stage: 'Saving every voter to the register', progress: 86, updatedAt: FieldValue.serverTimestamp() })
  const rows = await sourceRef.collection('rows').orderBy('createdAt', 'asc').get()
  const results = await mapWithConcurrency(rows.docs, 16, async (row) => {
    try {
      return await upsertVoterFromImport(row.id, row.data() as ImportRowRecord, source, sourcePdfId)
    } catch (error) {
      logger.error('A voter card could not be saved', { sourcePdfId, rowId: row.id, error })
      throw error
    }
  })
  const afterApply = await sourceRef.get()
  if (afterApply.data()?.cancelRequested === true) {
    await sourceRef.update({ status: 'cancelled', stage: 'Cancelled by user', progress: 0, updatedAt: FieldValue.serverTimestamp() })
    return
  }
  const duplicateCount = results.filter((result) => result === 'updated').length
  await sourceRef.update({
    status: 'completed',
    stage: 'All voter cards saved',
    progress: 100,
    duplicateCount,
    needsReviewCount: 0,
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
})

async function deleteSourcePdfRecord(sourcePdfId: string, source: SourcePdfRecord, removeCardImages: boolean) {
  const sourceRef = db.doc(`sourcePdfs/${sourcePdfId}`)
  await deleteDocumentChildren(sourceRef, 'rows')
  await sourceRef.delete()
  await deleteStoragePaths([source.storagePath])
  if (removeCardImages) await deleteStoragePrefix(`voter-cards/${sourcePdfId}/`)
}

async function deleteVoterRecordTree(voterRef: FirebaseFirestore.DocumentReference) {
  await deleteDocumentChildren(voterRef, 'sourcePdfs')
  await voterRef.delete()
}

async function deleteDocumentChildren(parentRef: FirebaseFirestore.DocumentReference, collectionName: string) {
  const children = await parentRef.collection(collectionName).get()
  for (const group of splitInto(children.docs, 350)) {
    const batch = db.batch()
    group.forEach((child) => batch.delete(child.ref))
    await batch.commit()
  }
}

async function deleteStoragePaths(paths: string[]) {
  const uniquePaths = [...new Set(paths.filter(Boolean))]
  for (const group of splitInto(uniquePaths, 100)) {
    await Promise.all(group.map(async (path) => {
      try {
        await getStorage().bucket().file(path).delete()
      } catch (error) {
        const code = String((error as { code?: unknown })?.code ?? '')
        if (code !== '404' && code !== 'storage/object-not-found') throw error
      }
    }))
  }
}

async function deleteStoragePrefix(prefix: string) {
  const [files] = await getStorage().bucket().getFiles({ prefix })
  for (const group of splitInto(files, 100)) {
    await Promise.all(group.map((file) => deleteStoragePaths([file.name])))
  }
}

async function requireCaller(uid?: string) {
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in first.')
  const snapshot = await db.doc(`users/${uid}`).get()
  if (!snapshot.exists) throw new HttpsError('permission-denied', 'This login has no Voter Space profile.')
  const record = snapshot.data() as UserRecord
  if (record.status !== 'active') throw new HttpsError('permission-denied', 'This account is disabled.')
  return { uid, record }
}

async function authorizeNewAccount(caller: Awaited<ReturnType<typeof requireCaller>>, input: AccountInput) {
  const role = validNewRole(input.role)
  if (caller.record.role === 'superAdmin') return buildAccount(input, role, caller.uid)
  if (caller.record.role !== 'admin' || role !== 'subMember') {
    throw new HttpsError('permission-denied', 'Only Super Admins can create Admin accounts.')
  }
  return buildAccount({ ...input, parentAdminId: caller.uid, status: 'active' }, role, caller.uid, caller.record)
}

async function authorizeUpdate(caller: Awaited<ReturnType<typeof requireCaller>>, target: UserRecord, input: AccountInput) {
  if (target.role === 'superAdmin') throw new HttpsError('permission-denied', 'Super Admin accounts cannot be edited here.')
  if (caller.record.role === 'superAdmin') {
    return buildAccount({ ...input, parentAdminId: target.role === 'admin' ? undefined : input.parentAdminId ?? target.parentAdminId }, target.role, caller.uid, undefined, target)
  }
  if (caller.record.role !== 'admin' || target.role !== 'subMember' || target.parentAdminId !== caller.uid) {
    throw new HttpsError('permission-denied', 'You can manage only your own Sub-members.')
  }
  return buildAccount({
    ...input,
    email: target.email,
    parentAdminId: caller.uid,
    status: target.status,
    permissions: target.permissions,
    bannerPath: undefined,
  }, 'subMember', caller.uid, caller.record, target)
}

async function buildAccount(input: AccountInput, role: 'admin' | 'subMember', uploaderUid: string, parentScope?: UserRecord, existingAccount?: UserRecord): Promise<UserRecord> {
  const fullName = requiredString(input.fullName, 'Full name')
  const email = requiredString(input.email, 'Email').toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpsError('invalid-argument', 'Enter a valid email address.')
  const mobile = requiredString(input.mobile, 'Mobile number')
  const scope = readScope(input.scope)
  const status = input.status === 'disabled' ? 'disabled' : 'active'
  const parentAdminId = role === 'subMember' ? requiredString(input.parentAdminId, 'Parent Admin') : undefined
  const permissions = role === 'admin' ? readPermissions(input.permissions) : { upload: false, edit: false, download: true, audit: false }
  const profilePhotoPath = imagePath(input.profilePhotoPath, uploaderUid, existingAccount?.profilePhotoPath)
  const bannerPath = role === 'admin' ? imagePath(input.bannerPath, uploaderUid, existingAccount?.bannerPath) : undefined

  if (role === 'admin' && scope.wardIds.length === 0) {
    throw new HttpsError('invalid-argument', 'An Admin needs at least one allowed ward.')
  }

  if (role === 'subMember' && (scope.wardIds.length !== 1 || scope.boothIds.length !== 1)) {
    throw new HttpsError('invalid-argument', 'A Sub-member needs exactly one assigned ward and one assigned booth.')
  }

  const parent = role === 'subMember' ? await db.doc(`users/${parentAdminId}`).get() : undefined
  if (role === 'subMember' && (!parent?.exists || (parent.data() as UserRecord).role !== 'admin')) {
    throw new HttpsError('invalid-argument', 'Choose a valid parent Admin.')
  }
  const allowedScope = parentScope ?? (parent?.data() as UserRecord | undefined)
  if (role === 'subMember' && allowedScope && !isInsideScope(scope, allowedScope.scope)) {
    throw new HttpsError('permission-denied', 'Ward or booth is outside the Admin access scope.')
  }

  return { fullName, email, mobile, role, status, scope, permissions, parentAdminId, profilePhotoPath, bannerPath }
}

function validNewRole(value: unknown): 'admin' | 'subMember' {
  if (value === 'admin' || value === 'subMember') return value
  throw new HttpsError('invalid-argument', 'Choose Admin or Sub-member.')
}

function readAccountInput(value: unknown): AccountInput {
  if (!value || typeof value !== 'object') throw new HttpsError('invalid-argument', 'Invalid account data.')
  return value as AccountInput
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpsError('invalid-argument', `${field} is required.`)
  return value.trim().slice(0, 160)
}

function readAccountPassword(value: unknown, required: boolean) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpsError('invalid-argument', 'A password is required when creating an account.')
    return undefined
  }
  if (typeof value !== 'string' || value.length < 8) throw new HttpsError('invalid-argument', 'Password must contain at least 8 characters.')
  if (value.length > 128) throw new HttpsError('invalid-argument', 'Password must contain 128 characters or fewer.')
  return value
}

function readScope(value: unknown): Scope {
  if (!value || typeof value !== 'object') return { wardIds: [], boothIds: [] }
  const input = value as { wardIds?: unknown; boothIds?: unknown }
  return { wardIds: stringList(input.wardIds), boothIds: stringList(input.boothIds) }
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 250))]
}

function readPermissions(value: unknown): Permissions {
  const input = value && typeof value === 'object' ? value as Partial<Permissions> : {}
  return { upload: input.upload === true, edit: input.edit === true, download: input.download === true, audit: input.audit === true }
}

function imagePath(value: unknown, uploaderUid: string, existingPath?: string) {
  if (value === undefined || value === null || value === '') return undefined
  if (value === existingPath) return existingPath
  if (typeof value !== 'string' || !value.startsWith(`user-media/${uploaderUid}/`)) {
    throw new HttpsError('permission-denied', 'Image path is not valid for this account.')
  }
  return value
}

function isInsideScope(child: Scope, parent: Scope) {
  return child.wardIds.every((wardId) => parent.wardIds.includes(wardId)) && child.boothIds.every((boothId) => parent.boothIds.includes(boothId))
}

async function writeAudit(actor: Awaited<ReturnType<typeof requireCaller>>, action: string, targetUid: string, targetName: string, details: Record<string, unknown>) {
  await db.collection('auditLogs').add({
    actorUid: actor.uid,
    actorName: actor.record.fullName,
    action,
    targetUid,
    targetName,
    details,
    createdAt: FieldValue.serverTimestamp(),
  })
}

function accountChanges(previous: UserRecord, next: UserRecord) {
  const changes: Record<string, unknown> = {}
  if (previous.fullName !== next.fullName) changes.fullName = next.fullName
  if (previous.email !== next.email) changes.email = next.email
  if (previous.mobile !== next.mobile) changes.mobile = next.mobile
  if (previous.status !== next.status) changes.status = next.status
  if (!sameStringList(previous.scope.wardIds, next.scope.wardIds)) changes.wardIds = next.scope.wardIds
  if (!sameStringList(previous.scope.boothIds, next.scope.boothIds)) changes.boothIds = next.scope.boothIds
  const permissionChanges = (Object.keys(next.permissions) as Array<keyof Permissions>).filter((key) => previous.permissions[key] !== next.permissions[key])
  if (permissionChanges.length) changes.permissions = Object.fromEntries(permissionChanges.map((key) => [key, next.permissions[key]]))
  if (previous.profilePhotoPath !== next.profilePhotoPath) changes.profilePhoto = true
  if (previous.bannerPath !== next.bannerPath) changes.banner = true
  return changes
}

function sameStringList(first: string[], second: string[]) {
  return first.length === second.length && first.every((value, index) => value === second[index])
}

function auditForClient(value: Record<string, unknown>) {
  return {
    action: plainString(value.action),
    actorName: plainString(value.actorName),
    targetName: plainString(value.targetName),
    details: value.details && typeof value.details === 'object' ? value.details : {},
    createdAt: dateAsIso(value.createdAt),
  }
}

function readPdfImportRequest(value: unknown) {
  if (!value || typeof value !== 'object') throw new HttpsError('invalid-argument', 'Invalid PDF import data.')
  const input = value as CreatePdfImportInput
  return {
    originalFileName: requiredString(input.originalFileName, 'PDF file name'),
    wardId: requiredString(input.wardId, 'Ward'),
    boothId: requiredString(input.boothId, 'Booth'),
    area: plainString(input.area),
    division: plainString(input.division),
  }
}

function safePdfFileName(value: string) {
  if (!value.toLocaleLowerCase().endsWith('.pdf')) throw new HttpsError('invalid-argument', 'Only PDF files can be uploaded.')
  const stem = value.slice(0, -4).replace(/[^a-zA-Z0-9._()-]+/g, '_').slice(0, 120) || 'voter-list'
  return `${stem}.pdf`
}

function assertCanUploadPdf(user: UserRecord, wardId: string, boothId: string) {
  if (user.role === 'superAdmin') return
  if (user.role === 'admin' && user.permissions.upload && isInsideVoterScope(user, wardId, boothId)) return
  throw new HttpsError('permission-denied', 'You do not have permission to upload a PDF for this ward or booth.')
}

function assertCanManagePdfImport(user: UserRecord, source: SourcePdfRecord) {
  if (user.role === 'superAdmin') return
  if (user.role === 'admin' && user.permissions.upload && isInsideVoterScope(user, source.wardId, source.boothId)) return
  throw new HttpsError('permission-denied', 'You do not have permission to manage this PDF import.')
}

function canViewPdfImport(user: UserRecord, source: SourcePdfRecord) {
  return isInsideVoterScope(user, source.wardId, source.boothId)
}

function canDownloadSourcePdf(user: UserRecord) {
  return user.role === 'superAdmin' || user.permissions.download
}

function isInsideVoterScope(user: UserRecord, wardId: string, boothId: string) {
  if (user.role === 'superAdmin') return true
  return user.scope.wardIds.includes(wardId) && (user.scope.boothIds.length === 0 || user.scope.boothIds.includes(boothId))
}

async function getPdfImport(sourcePdfId: string) {
  const snapshot = await db.doc(`sourcePdfs/${sourcePdfId}`).get()
  if (!snapshot.exists) throw new HttpsError('not-found', 'Source PDF not found.')
  return snapshot.data() as SourcePdfRecord
}

async function enqueueImportTask(functionName: 'processPdfImport' | 'applyPdfImport', data: { sourcePdfId: string }) {
  const queue = getFunctions().taskQueue<{ sourcePdfId: string }>(`locations/${region}/functions/${functionName}`)
  await queue.enqueue(data)
}

function sourceForClient(source: SourcePdfRecord & { id: string }) {
  return {
    ...source,
    createdAt: dateAsIso(source.createdAt),
    uploadedAt: dateAsIso(source.uploadedAt),
    updatedAt: dateAsIso(source.updatedAt),
  }
}

function importRowForClient(id: string, row: ImportRowRecord) {
  return { id, ...row, updatedAt: dateAsIso(row.updatedAt) }
}

function readPdfRowUpdate(value: unknown) {
  if (!value || typeof value !== 'object') throw new HttpsError('invalid-argument', 'Invalid import row.')
  const input = value as PdfRowUpdateInput
  return {
    sourcePdfId: requiredString(input.sourcePdfId, 'Source PDF id'),
    rowId: requiredString(input.rowId, 'Import row id'),
    fullName: plainString(input.fullName),
    relativeName: plainString(input.relativeName),
    relationshipType: plainString(input.relationshipType),
    age: plainString(input.age),
    gender: plainString(input.gender),
    doorNumber: plainString(input.doorNumber),
    voterId: plainString(input.voterId),
    alternateIdentifier: plainString(input.alternateIdentifier),
    mobile: normalizeMobile(plainString(input.mobile)),
    serialNumber: plainString(input.serialNumber),
    assemblySerial: plainString(input.assemblySerial),
    wardId: plainString(input.wardId),
    boothId: plainString(input.boothId),
    area: plainString(input.area),
    division: plainString(input.division),
  }
}

function buildEditedImportRow(current: ImportRowRecord, input: ReturnType<typeof readPdfRowUpdate>): ImportRowRecord {
  const next = {
    ...current,
    fullName: input.fullName,
    relativeName: input.relativeName,
    relationshipType: input.relationshipType,
    age: input.age,
    gender: input.gender,
    doorNumber: input.doorNumber,
    voterId: input.voterId,
    alternateIdentifier: input.alternateIdentifier,
    mobile: input.mobile,
    serialNumber: input.serialNumber,
    assemblySerial: input.assemblySerial,
    wardId: input.wardId,
    boothId: input.boothId,
    area: input.area,
    division: input.division,
  }
  const needsReview = !voterIdentity(next) || !next.fullName || !isValidDoorNumber(next.doorNumber)
  return {
    ...next,
    duplicateState: voterIdentity(next) ? current.duplicateState : 'missingIdentity',
    needsReview,
    reviewStatus: needsReview ? 'needsReview' : 'pending',
  }
}

function makeCardImportRow(card: ExtractedVoterCard): ImportRowRecord {
  const initial = {
    fullName: plainString(card.fullName),
    relativeName: plainString(card.relativeName),
    relationshipType: plainString(card.relationshipType),
    age: plainString(card.age),
    gender: plainString(card.gender),
    doorNumber: normalizeDoorNumber(card.doorNumber),
    voterId: plainString(card.voterId).replace(/[\s-]+/g, '').toLocaleUpperCase(),
    // If OCR cannot read a Voter ID, keep the card with a repeatable fallback
    // identifier. A new PDF version can then update the same voter instead of
    // creating a new one, as long as the basic voter details are unchanged.
    alternateIdentifier: plainString(card.alternateIdentifier) || fallbackCardIdentity(card),
    mobile: normalizeMobile(card.mobile),
    serialNumber: plainString(card.serialNumber),
    assemblySerial: plainString(card.assemblySerial),
    wardId: plainString(card.wardId),
    boothId: plainString(card.boothId),
    area: plainString(card.area),
    division: plainString(card.division),
  }
  return {
    ...initial,
    duplicateState: 'new',
    reviewStatus: 'reviewed',
    needsReview: false,
    confidence: card.confidence,
    rawText: card.rawText,
    voterCardImagePath: card.voterCardImagePath,
    pageNumber: card.pageNumber,
    cardPosition: card.cardPosition,
  }
}

function normalizeMobile(value: string) {
  const digits = value.replace(/\D/g, '')
  const mobile = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits
  return /^[6-9]\d{9}$/.test(mobile) ? mobile : ''
}

function normalizeDoorNumber(value: string) {
  return plainString(value).replace(/\s+/g, '').toLocaleUpperCase().slice(0, 40)
}

function fallbackCardIdentity(card: ExtractedVoterCard) {
  const parts = [card.fullName, card.relativeName, normalizeDoorNumber(card.doorNumber), card.age, card.gender]
    .map((part) => plainString(part).replace(/\s+/g, '').toLocaleLowerCase())
  return `auto:${stableHash(parts.join('|')).slice(0, 24)}`
}

function isValidDoorNumber(value: string) {
  return /^[A-Z0-9][A-Z0-9/-]{0,39}$/i.test(value)
}

function voterIdentity(row: Pick<ImportRowRecord, 'voterId' | 'alternateIdentifier'>) {
  const voterId = row.voterId.replace(/[\s-]+/g, '').toLocaleUpperCase()
  if (voterId) return `voter:${voterId}`
  const alternate = row.alternateIdentifier.replace(/\s+/g, '').toLocaleLowerCase()
  return alternate ? `alternate:${alternate}` : ''
}

async function addDuplicateState(rows: ImportRowRecord[]) {
  const refs = rows.map((row) => voterIdentity(row) ? db.doc(`voters/v_${stableHash(voterIdentity(row))}`) : undefined)
  const existing = new Map<string, boolean>()
  for (const chunk of splitInto(refs.filter(Boolean) as FirebaseFirestore.DocumentReference[], 250)) {
    const snapshots = await db.getAll(...chunk)
    snapshots.forEach((snapshot) => existing.set(snapshot.ref.id, snapshot.exists))
  }
  return rows.map((row) => {
    const identity = voterIdentity(row)
    if (!identity) return { ...row, duplicateState: 'new' as const, needsReview: false, reviewStatus: 'reviewed' as const }
    return { ...row, duplicateState: existing.get(`v_${stableHash(identity)}`) ? 'updatesExisting' as const : 'new' as const }
  })
}

async function storeImportRows(sourcePdfId: string, rows: ImportRowRecord[]) {
  const sourceRef = db.doc(`sourcePdfs/${sourcePdfId}`)
  // A retry replaces the previous OCR review rows. This prevents stale cards
  // from a failed or older extraction from appearing beside the new result.
  const previousRows = await sourceRef.collection('rows').select().get()
  for (const group of splitInto(previousRows.docs, 400)) {
    const deleteBatch = db.batch()
    group.forEach((row) => deleteBatch.delete(row.ref))
    await deleteBatch.commit()
  }
  for (const [batchIndex, group] of splitInto(rows, 350).entries()) {
    const batch = db.batch()
    group.forEach((row, index) => {
      const rowId = `row-${String(batchIndex * 350 + index + 1).padStart(6, '0')}-${stableHash(voterIdentity(row) || row.rawText).slice(0, 8)}`
      batch.set(sourceRef.collection('rows').doc(rowId), { ...cleanUndefined(row), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    })
    await batch.commit()
  }
}

async function upsertVoterFromImport(rowId: string, row: ImportRowRecord, source: SourcePdfRecord, sourcePdfId: string): Promise<'created' | 'updated'> {
  const identity = voterIdentity(row)
  if (!identity) throw new Error('The imported voter card has no stable identifier.')
  const voterRef = db.doc(`voters/v_${stableHash(identity)}`)
  const result = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(voterRef)
    const previous = existing.exists ? existing.data() ?? {} : {}
    transaction.set(voterRef, {
      identityKey: identity,
      fullName: row.fullName || plainString(previous.fullName) || `Voter card ${row.serialNumber || row.cardPosition || ''}`.trim(),
      relativeName: row.relativeName || plainString(previous.relativeName),
      relationshipType: row.relationshipType || plainString(previous.relationshipType),
      age: row.age || plainString(previous.age),
      gender: row.gender || plainString(previous.gender),
      doorNumber: row.doorNumber || plainString(previous.doorNumber),
      voterId: row.voterId || plainString(previous.voterId),
      alternateIdentifier: row.alternateIdentifier || plainString(previous.alternateIdentifier),
      // A blank mobile number never removes an already verified mobile number.
      mobile: row.mobile || plainString(previous.mobile),
      serialNumber: row.serialNumber || plainString(previous.serialNumber),
      assemblySerial: row.assemblySerial || plainString(previous.assemblySerial),
      // Ward and booth values intentionally update: they can change in a new electoral roll.
      wardId: row.wardId || plainString(previous.wardId),
      boothId: row.boothId || plainString(previous.boothId),
      area: row.area || plainString(previous.area),
      division: row.division || plainString(previous.division),
      sourcePdfId,
      sourcePdfName: source.originalFileName,
      voterCardImagePath: row.voterCardImagePath || plainString(previous.voterCardImagePath),
      pageNumber: row.pageNumber ?? previous.pageNumber ?? null,
      cardPosition: row.cardPosition ?? previous.cardPosition ?? null,
      reviewStatus: 'reviewed',
      needsReview: false,
      uploadedBy: source.uploadedByName,
      uploadedByName: source.uploadedByName,
      uploadedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    transaction.set(voterRef.collection('sourcePdfs').doc(sourcePdfId), {
      sourcePdfId,
      sourcePdfName: source.originalFileName,
      importedAt: FieldValue.serverTimestamp(),
      wardId: row.wardId,
      boothId: row.boothId,
    }, { merge: true })
    return existing.exists ? 'updated' as const : 'created' as const
  })
  await db.doc(`sourcePdfs/${sourcePdfId}/rows/${rowId}`).update({ duplicateState: result === 'updated' ? 'updatesExisting' : 'new', appliedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  return result
}

function stableHash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function splitInto<T>(values: T[], size: number) {
  const groups: T[][] = []
  for (let index = 0; index < values.length; index += size) groups.push(values.slice(index, index + size))
  return groups
}

async function mapWithConcurrency<T, Result>(values: T[], concurrency: number, worker: (value: T) => Promise<Result>) {
  const output = new Array<Result>(values.length)
  let currentIndex = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (currentIndex < values.length) {
      const index = currentIndex++
      output[index] = await worker(values[index])
    }
  }))
  return output
}

function cleanUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

function userSafeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 400) : 'The background process stopped unexpectedly.'
}

function getErrorCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error ? (error as { code?: string }).code : undefined
}

function readVoterFilters(value: unknown): VoterFilters {
  if (!value || typeof value !== 'object') return {}
  return value as VoterFilters
}

function voterFromFirestore(id: string, value: Record<string, unknown>): VoterRecord {
  const reviewStatus = value.reviewStatus === 'reviewed' || value.reviewStatus === 'needsReview' ? value.reviewStatus : 'pending'
  return {
    id,
    fullName: plainString(value.fullName),
    relativeName: plainString(value.relativeName),
    relationshipType: plainString(value.relationshipType),
    age: plainString(value.age),
    gender: plainString(value.gender),
    doorNumber: plainString(value.doorNumber),
    voterId: plainString(value.voterId),
    alternateIdentifier: plainString(value.alternateIdentifier),
    mobile: plainString(value.mobile),
    serialNumber: plainString(value.serialNumber),
    assemblySerial: plainString(value.assemblySerial),
    wardId: plainString(value.wardId),
    boothId: plainString(value.boothId),
    area: plainString(value.area),
    division: plainString(value.division),
    sourcePdfId: plainString(value.sourcePdfId),
    sourcePdfName: plainString(value.sourcePdfName),
    voterCardImagePath: plainString(value.voterCardImagePath),
    pageNumber: optionalInteger(value.pageNumber),
    cardPosition: optionalInteger(value.cardPosition),
    reviewStatus,
    needsReview: value.needsReview === true || reviewStatus === 'needsReview',
    uploadedAt: dateAsIso(value.uploadedAt),
    uploadedBy: plainString(value.uploadedByName ?? value.uploadedBy),
  }
}

function readVoterUpdate(value: unknown): VoterRecord {
  if (!value || typeof value !== 'object') throw new HttpsError('invalid-argument', 'Invalid voter record.')
  const input = value as VoterUpdateInput
  if (typeof input.id !== 'string' || !input.id) throw new HttpsError('invalid-argument', 'Voter record id is required.')
  const reviewStatus = input.reviewStatus === 'reviewed' || input.reviewStatus === 'needsReview' ? input.reviewStatus : 'pending'
  const voterId = plainString(input.voterId)
  const alternateIdentifier = plainString(input.alternateIdentifier)
  if (!voterId && !alternateIdentifier) throw new HttpsError('invalid-argument', 'Voter ID or alternate identifier is required.')
  return {
    id: input.id,
    fullName: requiredString(input.fullName, 'Voter name'),
    relativeName: plainString(input.relativeName),
    relationshipType: plainString(input.relationshipType),
    age: plainString(input.age),
    gender: plainString(input.gender),
    doorNumber: requiredString(input.doorNumber, 'Door number'),
    voterId,
    alternateIdentifier,
    mobile: normalizeMobile(plainString(input.mobile)),
    serialNumber: requiredString(input.serialNumber, 'Serial number'),
    assemblySerial: plainString(input.assemblySerial),
    wardId: requiredString(input.wardId, 'Ward'),
    boothId: requiredString(input.boothId, 'Booth'),
    area: plainString(input.area),
    division: plainString(input.division),
    sourcePdfId: plainString(input.sourcePdfId),
    sourcePdfName: plainString(input.sourcePdfName),
    voterCardImagePath: plainString(input.voterCardImagePath),
    pageNumber: input.pageNumber,
    cardPosition: input.cardPosition,
    reviewStatus,
    needsReview: input.needsReview === true || reviewStatus === 'needsReview',
    uploadedAt: undefined,
    uploadedBy: '',
  }
}

function canViewVoter(user: UserRecord, voter: VoterRecord) {
  if (user.role === 'superAdmin') return true
  if (user.scope.wardIds.length === 0 || !user.scope.wardIds.includes(voter.wardId)) return false
  if (user.scope.boothIds.length > 0 && !user.scope.boothIds.includes(voter.boothId)) return false
  if (user.role === 'subMember') return user.scope.boothIds.length === 1 && user.scope.boothIds[0] === voter.boothId
  return true
}

function matchesFilters(record: VoterRecord, filters: VoterFilters) {
  const matches = (value: string, query: unknown) => !plainString(query) || value.toLocaleLowerCase().includes(plainString(query).toLocaleLowerCase())
  const uploadedDate = record.uploadedAt?.slice(0, 10) ?? ''
  const needsReview = filters.needsReview === 'yes' ? true : filters.needsReview === 'no' ? false : undefined
  return matches(record.fullName, filters.name) &&
    matches(record.doorNumber, filters.doorNumber) &&
    matches(record.voterId, filters.voterId) &&
    matches(record.alternateIdentifier, filters.alternateIdentifier) &&
    matches(record.mobile, filters.mobile) &&
    matches(record.serialNumber, filters.serialNumber) &&
    matches(record.wardId, filters.wardId) &&
    matches(record.boothId, filters.boothId) &&
    matches(record.area, filters.area) &&
    matches(record.division, filters.division) &&
    matches(`${record.sourcePdfName} ${record.sourcePdfId}`, filters.sourcePdf) &&
    (plainString(filters.reviewStatus) === '' || record.reviewStatus === filters.reviewStatus) &&
    (needsReview === undefined || record.needsReview === needsReview) &&
    (!plainString(filters.uploadedFrom) || uploadedDate >= plainString(filters.uploadedFrom)) &&
    (!plainString(filters.uploadedTo) || uploadedDate <= plainString(filters.uploadedTo)) &&
    matches(record.uploadedBy, filters.uploadedBy)
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.map((value) => plainString(value)).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second, 'en', { numeric: true }))
}

function plainString(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 160) : typeof value === 'number' ? String(value) : ''
}

function optionalInteger(value: unknown) {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined
  return number !== undefined && Number.isInteger(number) && number > 0 ? number : undefined
}

function dateAsIso(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return (value.toDate as () => Date)().toISOString()
  }
  return typeof value === 'string' ? value : undefined
}
