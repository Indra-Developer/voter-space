import { createHash, randomUUID } from 'node:crypto'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFunctions } from 'firebase-admin/functions'
import { FieldPath, FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import { onObjectFinalized } from 'firebase-functions/v2/storage'
import { onTaskDispatched } from 'firebase-functions/v2/tasks'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as logger from 'firebase-functions/logger'
import { extractVoterCardsFromPdf, type CoverAreaRow, type ExtractedVoterCard } from './pdf-card-importer.js'
import { buildVoterExport, type ExportFormat, type ExportVoterRecord } from './voter-export.js'

if (!getApps().length) initializeApp()

const auth = getAuth()
const db = getFirestore()

type Role = 'superAdmin' | 'admin' | 'subMember'
type Status = 'active' | 'disabled'
type Scope = { wardIds: string[]; boothIds: string[] }
type Permissions = { upload: boolean; edit: boolean; download: boolean; audit: boolean }
type DoorNumberStatus = 'available' | 'missing' | 'verificationRequired'
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
  deviceLimit?: number
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
  deviceLimit?: unknown
}
type VoterRecord = {
  id: string
  fullName: string
  relativeName: string
  relationshipType: string
  age: string
  gender: string
  doorNumber: string
  doorNumberStatus: DoorNumberStatus
  doorNumberCandidate?: string
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
  rawText: string
  pageNumber?: number
  cardPosition?: number
  reviewStatus: 'pending' | 'reviewed' | 'needsReview'
  needsReview: boolean
  uploadedAt?: string
  uploadedBy: string
}
type VoterFilters = {
  search?: unknown
  sourcePdfId?: unknown
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
type ExportJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
type ExportJobRecord = {
  ownerUid: string
  format: ExportFormat
  filters: VoterFilters
  fileName: string
  storagePath: string
  status: ExportJobStatus
  progress: number
  processedCount: number
  totalCount: number
  stage?: string
  cancelRequested?: boolean
  errorMessage?: string
  createdAt?: unknown
  updatedAt?: unknown
  expiresAt?: unknown
  completedAt?: unknown
}
type DashboardScopeCount = {
  voterCount: number
  wardIds: string[]
  boothIds: string[]
  areaIds: string[]
  divisionIds: string[]
  sourcePdfIds: string[]
}
type DashboardRecentUpload = {
  id: string
  originalFileName: string
  wardId: string
  boothId: string
  status: PdfImportStatus
  createdAt?: string
  uploadedAt?: string
  updatedAt?: string
}
type DashboardStats = {
  voterCount: number
  wardCount: number
  boothCount: number
  areaCount: number
  divisionCount: number
  sourcePdfCount: number
  completedPdfCount: number
  processingPdfCount: number
  sourceStatusCounts: Record<string, number>
  sourceStatusById: Record<string, string>
  lastUploadAt?: unknown
  recentUploads: DashboardRecentUpload[]
  updatedAt?: unknown
}
type DashboardMetricName = 'voterCount' | 'wardCount' | 'boothCount' | 'areaCount' | 'divisionCount' | 'sourcePdfCount' | 'completedPdfCount' | 'processingPdfCount' | 'attentionCount' | 'sourceStatusCounts' | 'recentUploads'
type DashboardStatsDocument = {
  counts: Record<string, DashboardScopeCount>
  updatedAt?: unknown
}
type PdfImportStatus = 'readyForUpload' | 'uploaded' | 'queued' | 'processing' | 'review' | 'awaitingApproval' | 'approvalQueued' | 'applying' | 'completed' | 'completedWithReview' | 'failed' | 'cancelled'
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
  processedPage?: number
  failedPage?: number
  uploadHash?: string
  fileSize?: number
  rowCount?: number
  readyCount?: number
  duplicateCount?: number
  needsReviewCount?: number
  errorMessage?: string
  cancelRequested?: boolean
  ocrOutputPrefix?: string
  ocrLockId?: string
  ocrStartedAt?: unknown
  applyLockId?: string
  applyStartedAt?: unknown
  createdAt?: unknown
  uploadedAt?: unknown
  updatedAt?: unknown
}
type VoterFilterBucket = {
  areas: string[]
  divisions: string[]
  sourcePdfs: string[]
  uploaders: string[]
}
type VoterFilterMetadata = {
  byWard: Record<string, Record<string, VoterFilterBucket>>
  needsRebuild?: boolean
  updatedAt?: unknown
}
type ImportRowRecord = {
  fullName: string
  relativeName: string
  relationshipType: string
  age: string
  gender: string
  doorNumber: string
  doorNumberStatus?: DoorNumberStatus
  doorNumberCandidate?: string
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
  identityKey?: string
  voterCardImagePath?: string
  pageNumber?: number
  cardPosition?: number
  updatedAt?: unknown
  updatedByName?: string
}
type CreatePdfImportInput = { originalFileName?: unknown; wardId?: unknown; boothId?: unknown; area?: unknown; division?: unknown; uploadHash?: unknown }
type PdfRowUpdateInput = Partial<ImportRowRecord> & { sourcePdfId?: unknown; rowId?: unknown }
type PdfMetadataUpdateInput = { sourcePdfId?: unknown; wardId?: unknown; boothId?: unknown; area?: unknown }

const region = 'asia-south1'
// Storage event functions must run in the same location as their bucket.
// The Voter Space default bucket is in asia-south1.
const storageEventRegion = region
const deviceSessionTimeoutMs = 15 * 60 * 1000
const taskLeaseTimeoutMs = 45 * 60 * 1000
const slowOperationThresholdMs = 10 * 1000
// Keep one PDF per worker so native PDF rendering and Vision requests stay
// isolated, while allowing several different PDFs to progress together. These
// are deliberately bounded instead of unlimited: Cloud Vision, Firestore,
// Storage and the Cloud Functions project all enforce quotas.
const pdfOcrMaxConcurrent = 6
const pdfApplyMaxConcurrent = 4

function startPerformanceTimer(functionName: string, context: Record<string, unknown> = {}) {
  const startedAt = Date.now()
  return () => {
    const durationMs = Date.now() - startedAt
    if (durationMs >= slowOperationThresholdMs) {
      logger.warn('Slow Cloud Function execution', {
        functionName,
        durationMs,
        thresholdMs: slowOperationThresholdMs,
        ...context,
      })
    }
    return durationMs
  }
}

function taskLeaseExpired(value: unknown) {
  const updatedAt = dateValueForStats(value)
  return updatedAt === 0 || Date.now() - updatedAt >= taskLeaseTimeoutMs
}

export const claimDeviceSession = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  if (caller.record.role === 'superAdmin') return { sessionToken: '', deviceLimit: 0, activeDevices: 0 }
  const input = request.data && typeof request.data === 'object' ? request.data as { deviceId?: unknown; deviceLabel?: unknown; force?: unknown } : {}
  const deviceId = readDeviceId(input.deviceId)
  const deviceLabel = plainString(input.deviceLabel).slice(0, 80) || 'Unknown device'
  const force = input.force === true
  const deviceLimit = readDeviceLimit(caller.record.deviceLimit)
  const controlRef = db.doc(`users/${caller.uid}/private/sessionControl`)
  const now = Timestamp.now()
  const sessionToken = randomUUID()
  let activeDevices = 0

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(controlRef)
    let sessions = activeDeviceSessions(snapshot.data()?.sessions, now.toMillis())
    const existing = sessions[deviceId]
    if (!existing && Object.keys(sessions).length >= deviceLimit && !force) {
      throw new HttpsError('resource-exhausted', 'This account is already logged in on another device.', { reason: 'device-limit', deviceLimit })
    }
    if (force) sessions = {}
    sessions[deviceId] = {
      token: sessionToken,
      label: deviceLabel,
      createdAt: existing?.createdAt ?? now,
      lastSeenAt: now,
    }
    activeDevices = Object.keys(sessions).length
    transaction.set(controlRef, { sessions, updatedAt: now }, { merge: true })
  })

  if (force) await writeAudit(caller, 'device_sessions_replaced', caller.uid, caller.record.fullName, { deviceLabel, deviceLimit })
  return { sessionToken, deviceLimit, activeDevices }
})

export const heartbeatDeviceSession = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  if (caller.record.role === 'superAdmin') return { active: true }
  const input = request.data && typeof request.data === 'object' ? request.data as { deviceId?: unknown; sessionToken?: unknown } : {}
  const deviceId = readDeviceId(input.deviceId)
  const sessionToken = requiredString(input.sessionToken, 'Session token')
  const controlRef = db.doc(`users/${caller.uid}/private/sessionControl`)
  const now = Timestamp.now()

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(controlRef)
    const sessions = activeDeviceSessions(snapshot.data()?.sessions, now.toMillis())
    const current = sessions[deviceId]
    if (!current || current.token !== sessionToken) {
      throw new HttpsError('failed-precondition', 'This device session is no longer active.', { reason: 'device-session-ended' })
    }
    sessions[deviceId] = { ...current, lastSeenAt: now }
    transaction.set(controlRef, { sessions, updatedAt: now }, { merge: true })
  })
  return { active: true }
})

export const releaseDeviceSession = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  if (caller.record.role === 'superAdmin') return { released: true }
  const input = request.data && typeof request.data === 'object' ? request.data as { deviceId?: unknown; sessionToken?: unknown } : {}
  const deviceId = readDeviceId(input.deviceId)
  const sessionToken = requiredString(input.sessionToken, 'Session token')
  const controlRef = db.doc(`users/${caller.uid}/private/sessionControl`)

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(controlRef)
    const sessions = activeDeviceSessions(snapshot.data()?.sessions, Date.now())
    if (sessions[deviceId]?.token === sessionToken) delete sessions[deviceId]
    transaction.set(controlRef, { sessions, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  })
  return { released: true }
})

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
  if (account.status === 'disabled' || readDeviceLimit(target.deviceLimit) !== account.deviceLimit) {
    await db.doc(`users/${input.uid}/private/sessionControl`).delete().catch((error) => {
      logger.warn('Device sessions could not be cleared after an account access change.', { uid: input.uid, error })
    })
  }
  const changes = accountChanges(target, account)
  if (password) changes.password = true
  await writeAudit(caller, 'account_updated', input.uid, account.fullName, { changes })
  return { uid: input.uid }
})

export const updateOwnProfileMedia = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  if (caller.record.role !== 'superAdmin') throw new HttpsError('permission-denied', 'Only Super Admins can change their profile images.')

  const input = request.data && typeof request.data === 'object' ? request.data as { profilePhotoPath?: unknown; bannerPath?: unknown } : {}
  const profilePhotoPath = imagePath(input.profilePhotoPath, caller.uid, caller.record.profilePhotoPath)
  const bannerPath = imagePath(input.bannerPath, caller.uid, caller.record.bannerPath)
  if (!profilePhotoPath && !bannerPath) throw new HttpsError('invalid-argument', 'Choose a profile photo or banner first.')

  await db.doc(`users/${caller.uid}`).update({
    ...cleanUndefined({ profilePhotoPath, bannerPath }),
    updatedAt: FieldValue.serverTimestamp(),
  })
  await writeAudit(caller, 'account_updated', caller.uid, caller.record.fullName, {
    profilePhoto: Boolean(profilePhotoPath && profilePhotoPath !== caller.record.profilePhotoPath),
    banner: Boolean(bannerPath && bannerPath !== caller.record.bannerPath),
  })
  return { uid: caller.uid }
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
  const input = request.data as { cursor?: unknown; pageSize?: unknown; sourcePdfId?: unknown }
  const pageSize = Math.min(optionalInteger(input?.pageSize) ?? 100, 100)
  const cursorId = plainString(input?.cursor)
  const sourcePdfId = plainString(input?.sourcePdfId)

  if (sourcePdfId) {
    const source = await getPdfImport(sourcePdfId)
    if (!canViewPdfImport(caller.record, source)) {
      throw new HttpsError('permission-denied', 'This PDF is outside your allowed ward or booth scope.')
    }

    const sourceFilters = { ...filters, sourcePdfId: undefined }
    const rows = db.collection(`sourcePdfs/${sourcePdfId}/rows`)
    let scanCursor = cursorId ? await rows.doc(cursorId).get() : undefined
    let hasMore = true
    let lastScannedId: string | undefined
    const records: VoterRecord[] = []
    const seenRecordIds = new Set<string>()

    // A page can contain many rows that are outside the selected filters. Keep
    // scanning source rows until the requested page is full or the source ends.
    // The cursor always points to the last row scanned, so the next request
    // cannot skip matching rows.
    while (records.length < pageSize && hasMore) {
      const query = rows.orderBy(FieldPath.documentId())
      const snapshot = await (scanCursor?.exists ? query.startAfter(scanCursor).limit(pageSize) : query.limit(pageSize)).get()
      if (!snapshot.size) {
        hasMore = false
        break
      }
      lastScannedId = snapshot.docs[snapshot.docs.length - 1]?.id
      hasMore = snapshot.size === pageSize

      const refsByPath = new Map<string, FirebaseFirestore.DocumentReference>()
      snapshot.docs.forEach((item) => {
        const identity = voterIdentity(item.data() as ImportRowRecord)
        if (!identity) return
        const ref = db.doc(`voters/v_${stableHash(identity)}`)
        refsByPath.set(ref.path, ref)
      })

      const voterRefs = [...refsByPath.values()]
      const voterSnapshots = voterRefs.length ? await db.getAll(...voterRefs) : []
      voterSnapshots
        .filter((item) => item.exists)
        .map((item) => voterFromFirestore(item.id, item.data() ?? {}))
        .filter((record) => canViewVoter(caller.record, record))
        .filter((record) => matchesFilters(record, sourceFilters))
        .forEach((record) => {
          if (seenRecordIds.has(record.id)) return
          seenRecordIds.add(record.id)
          records.push(record)
        })
      scanCursor = snapshot.docs[snapshot.docs.length - 1]
    }

    records.sort((first, second) => first.doorNumber.localeCompare(second.doorNumber, 'en', { numeric: true }) || first.serialNumber.localeCompare(second.serialNumber, 'en', { numeric: true }))
    return { records: records.slice(0, pageSize), nextCursor: hasMore ? lastScannedId : undefined, hasMore }
  }

  const directQuery = buildDirectVoterQuery(caller.record, filters)
  if (directQuery?.empty) return { records: [], hasMore: false }
  if (directQuery?.query) return listVotersFromQuery(directQuery.query, cursorId, pageSize, caller, filters)

  const query = db.collection('voters').orderBy(FieldPath.documentId())
  let scanCursor = cursorId ? await db.doc(`voters/${cursorId}`).get() : undefined
  let hasMore = true
  let lastScannedId: string | undefined
  const records: VoterRecord[] = []

  // Apply authorization and all filters before deciding whether the page is
  // complete. This prevents Ward 8 from being mixed with Ward 80 and keeps
  // filtered pagination reliable even when matching records are sparse.
  while (records.length < pageSize && hasMore) {
    const snapshot = await (scanCursor?.exists ? query.startAfter(scanCursor).limit(pageSize) : query.limit(pageSize)).get()
    if (!snapshot.size) {
      hasMore = false
      break
    }
    lastScannedId = snapshot.docs[snapshot.docs.length - 1]?.id
    hasMore = snapshot.size === pageSize
    records.push(...snapshot.docs
      .map((item) => voterFromFirestore(item.id, item.data()))
      .filter((record) => canViewVoter(caller.record, record))
      .filter((record) => matchesFilters(record, filters)))
    scanCursor = snapshot.docs[snapshot.docs.length - 1]
  }

  records.sort((first, second) => first.doorNumber.localeCompare(second.doorNumber, 'en', { numeric: true }) || first.serialNumber.localeCompare(second.serialNumber, 'en', { numeric: true }))
  return { records: records.slice(0, pageSize), nextCursor: hasMore ? lastScannedId : undefined, hasMore }
})

type DirectQueryPlan = { query?: FirebaseFirestore.Query; empty?: boolean }

function buildDirectVoterQuery(user: UserRecord, filters: VoterFilters): DirectQueryPlan | undefined {
  let query: FirebaseFirestore.Query = db.collection('voters')
  let hasDirectFilter = false
  let hasScopeInFilter = false

  const requestedWard = plainString(filters.wardId)
  const requestedBooth = plainString(filters.boothId)
  const requestedArea = plainString(filters.area)
  const requestedDivision = normalizeDivision(filters.division)
  const requestedSourcePdfId = plainString(filters.sourcePdfId)
  const requestedSourcePdf = plainString(filters.sourcePdf)

  if (user.role !== 'superAdmin') {
    if (requestedWard && !user.scope.wardIds.includes(requestedWard)) return { empty: true }
    if (requestedBooth && user.scope.boothIds.length > 0 && !user.scope.boothIds.includes(requestedBooth)) return { empty: true }
  }

  const addWhere = (field: string, operator: FirebaseFirestore.WhereFilterOp, value: unknown) => {
    query = query.where(field, operator, value)
    hasDirectFilter = true
  }

  if (requestedSourcePdfId) addWhere('sourcePdfId', '==', requestedSourcePdfId)
  if (requestedWard) addWhere('wardId', '==', requestedWard)
  else if (user.role !== 'superAdmin' && user.scope.wardIds.length === 1) addWhere('wardId', '==', user.scope.wardIds[0])
  else if (user.role !== 'superAdmin' && user.scope.wardIds.length > 1 && user.scope.wardIds.length <= 30) {
    addWhere('wardId', 'in', user.scope.wardIds)
    hasScopeInFilter = true
  }

  if (requestedBooth) addWhere('boothId', '==', requestedBooth)
  else if (user.role !== 'superAdmin' && user.scope.boothIds.length === 1) addWhere('boothId', '==', user.scope.boothIds[0])
  else if (user.role !== 'superAdmin' && user.scope.boothIds.length > 1 && user.scope.boothIds.length <= 30 && !hasScopeInFilter) {
    addWhere('boothId', 'in', user.scope.boothIds)
  }

  // These filters are selected from database options, so equality is both
  // safe and much faster than scanning every voter for a substring. Once a
  // Ward/Booth/Source-PDF scope is already selected, keep that as the primary
  // query and apply the remaining filters in the same server request. This
  // keeps the number of required composite indexes small and predictable.
  const hasPrimaryScope = hasDirectFilter
  if (!hasPrimaryScope) {
    if (requestedArea) addWhere('area', '==', requestedArea)
    else if (requestedDivision) addWhere('division', '==', requestedDivision)
    else if (requestedSourcePdf && requestedSourcePdf.toLocaleLowerCase().endsWith('.pdf')) addWhere('sourcePdfName', '==', requestedSourcePdf)
    else if (plainString(filters.uploadedBy)) addWhere('uploadedByName', '==', plainString(filters.uploadedBy))
  }

  const uploadedFrom = queryDate(plainString(filters.uploadedFrom))
  const uploadedTo = queryDate(plainString(filters.uploadedTo))
  if (uploadedFrom) addWhere('uploadedAt', '>=', Timestamp.fromDate(uploadedFrom))
  if (uploadedTo) {
    const nextDay = new Date(uploadedTo)
    nextDay.setUTCDate(nextDay.getUTCDate() + 1)
    addWhere('uploadedAt', '<', Timestamp.fromDate(nextDay))
  }

  if (!hasDirectFilter) return undefined
  if (uploadedFrom || uploadedTo) {
    // The document snapshot itself is used as the cursor. Keeping one
    // explicit order field avoids an unnecessary document-id composite index.
    query = query.orderBy('uploadedAt', 'asc')
  }
  return { query }
}

function canUseDirectVoterCount(filters: VoterFilters) {
  const containsFields = ['search', 'name', 'doorNumber', 'voterId', 'alternateIdentifier', 'mobile', 'serialNumber'] as const
  if (containsFields.some((field) => plainString(filters[field]))) return false
  // These fields can be applied after a Ward/Booth/Source-PDF query. Do not
  // use a partial Firestore count in that case, because it would count the
  // broader query and ignore the remaining filter.
  const postFilterFields = ['area', 'division', 'sourcePdf', 'uploadedBy'] as const
  if (postFilterFields.some((field) => plainString(filters[field]))) return false
  if (plainString(filters.sourcePdf) && !plainString(filters.sourcePdf).toLocaleLowerCase().endsWith('.pdf')) return false
  if (plainString(filters.reviewStatus) || plainString(filters.needsReview)) return false
  if (plainString(filters.uploadedFrom) && !queryDate(plainString(filters.uploadedFrom))) return false
  if (plainString(filters.uploadedTo) && !queryDate(plainString(filters.uploadedTo))) return false
  return true
}

async function listVotersFromQuery(query: FirebaseFirestore.Query, cursorId: string, pageSize: number, caller: Awaited<ReturnType<typeof requireCaller>>, filters: VoterFilters) {
  let scanCursor = cursorId ? await db.doc(`voters/${cursorId}`).get() : undefined
  let hasMore = true
  let lastScannedId: string | undefined
  const records: VoterRecord[] = []

  while (records.length < pageSize && hasMore) {
    const snapshot = await (scanCursor?.exists ? query.startAfter(scanCursor).limit(pageSize) : query.limit(pageSize)).get()
    if (!snapshot.size) {
      hasMore = false
      break
    }
    lastScannedId = snapshot.docs[snapshot.docs.length - 1]?.id
    hasMore = snapshot.size === pageSize
    records.push(...snapshot.docs
      .map((item) => voterFromFirestore(item.id, item.data()))
      .filter((record) => canViewVoter(caller.record, record))
      .filter((record) => matchesFilters(record, filters)))
    scanCursor = snapshot.docs[snapshot.docs.length - 1]
  }

  records.sort((first, second) => first.doorNumber.localeCompare(second.doorNumber, 'en', { numeric: true }) || first.serialNumber.localeCompare(second.serialNumber, 'en', { numeric: true }))
  return { records: records.slice(0, pageSize), nextCursor: hasMore ? lastScannedId : undefined, hasMore }
}

// Counts the complete filtered result set without sending all records to the
// browser. The register uses this separately from pagination so the user can
// see the real total while only the current page is loaded.
export const countVoters = onCall({ region, timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const filters = readVoterFilters(request.data)
  const directQuery = buildDirectVoterQuery(caller.record, filters)
  if (directQuery?.empty) return { totalCount: 0 }
  if (directQuery?.query && canUseDirectVoterCount(filters)) {
    const result = await directQuery.query.count().get()
    return { totalCount: result.data().count }
  }

  const pageSize = 500
  const query = db.collection('voters').orderBy(FieldPath.documentId())
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined
  let totalCount = 0

  while (true) {
    const snapshot = await (cursor ? query.startAfter(cursor).limit(pageSize) : query.limit(pageSize)).get()
    if (!snapshot.size) break
    totalCount += snapshot.docs
      .map((item) => voterFromFirestore(item.id, item.data()))
      .filter((record) => canViewVoter(caller.record, record))
      .filter((record) => matchesFilters(record, filters)).length
    if (snapshot.size < pageSize) break
    cursor = snapshot.docs[snapshot.docs.length - 1]
  }

  return { totalCount }
})

export const createVoterExport = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  if (!canDownloadSourcePdf(caller.record)) throw new HttpsError('permission-denied', 'You do not have export permission.')
  const input = request.data && typeof request.data === 'object' ? request.data as { format?: unknown; filters?: unknown; fileName?: unknown } : {}
  const format = readExportFormat(input.format)
  const filters = readVoterFilters(input.filters)
  const fileName = safeExportFileName(plainString(input.fileName), format)
  const jobRef = db.collection('exportJobs').doc()
  const expiresAt = Timestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000)
  const job: ExportJobRecord = {
    ownerUid: caller.uid,
    format,
    filters,
    fileName,
    storagePath: `temporary-exports/${caller.uid}/${jobRef.id}/${fileName}`,
    status: 'queued',
    progress: 0,
    processedCount: 0,
    totalCount: 0,
    cancelRequested: false,
    expiresAt,
  }
  await jobRef.set({ ...job, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  await enqueueExportTask(jobRef.id)
  return exportJobForClient(jobRef.id, job)
})

export const getVoterExportJob = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const exportJobId = requiredString((request.data as { exportJobId?: unknown })?.exportJobId, 'Export job id')
  const snapshot = await db.doc(`exportJobs/${exportJobId}`).get()
  if (!snapshot.exists) throw new HttpsError('not-found', 'Export job not found.')
  const job = snapshot.data() as ExportJobRecord
  if (job.ownerUid !== caller.uid) throw new HttpsError('permission-denied', 'This export does not belong to your account.')
  return exportJobForClient(exportJobId, job)
})

export const cancelVoterExport = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const exportJobId = requiredString((request.data as { exportJobId?: unknown })?.exportJobId, 'Export job id')
  const ref = db.doc(`exportJobs/${exportJobId}`)
  const snapshot = await ref.get()
  if (!snapshot.exists) throw new HttpsError('not-found', 'Export job not found.')
  const job = snapshot.data() as ExportJobRecord
  if (job.ownerUid !== caller.uid) throw new HttpsError('permission-denied', 'This export does not belong to your account.')
  if (!['queued', 'processing'].includes(job.status)) return { status: job.status }
  await ref.update({ status: 'cancelled', cancelRequested: true, progress: 0, updatedAt: FieldValue.serverTimestamp() })
  return { status: 'cancelled' }
})

export const retryVoterExport = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  if (!canDownloadSourcePdf(caller.record)) throw new HttpsError('permission-denied', 'You do not have export permission.')
  const exportJobId = requiredString((request.data as { exportJobId?: unknown })?.exportJobId, 'Export job id')
  const ref = db.doc(`exportJobs/${exportJobId}`)
  const snapshot = await ref.get()
  if (!snapshot.exists) throw new HttpsError('not-found', 'Export job not found.')
  const job = snapshot.data() as ExportJobRecord
  if (job.ownerUid !== caller.uid) throw new HttpsError('permission-denied', 'This export does not belong to your account.')
  if (!['failed', 'cancelled'].includes(job.status)) throw new HttpsError('failed-precondition', 'This export is not ready for retry.')
  await ref.update({ status: 'queued', cancelRequested: false, progress: 0, processedCount: 0, totalCount: 0, errorMessage: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })
  await enqueueExportTask(exportJobId)
  return { status: 'queued' }
})

export const getVoterExportDownloadUrl = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  if (!canDownloadSourcePdf(caller.record)) throw new HttpsError('permission-denied', 'You do not have export permission.')
  const exportJobId = requiredString((request.data as { exportJobId?: unknown })?.exportJobId, 'Export job id')
  const snapshot = await db.doc(`exportJobs/${exportJobId}`).get()
  if (!snapshot.exists) throw new HttpsError('not-found', 'Export job not found.')
  const job = snapshot.data() as ExportJobRecord
  if (job.ownerUid !== caller.uid) throw new HttpsError('permission-denied', 'This export does not belong to your account.')
  if (job.status !== 'completed') throw new HttpsError('failed-precondition', 'The export is not ready yet.')
  const file = getStorage().bucket().file(job.storagePath)
  const [exists] = await file.exists()
  if (!exists) throw new HttpsError('not-found', 'The temporary export file has expired.')
  const expiresAt = Date.now() + 10 * 60 * 1000
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: expiresAt,
    responseDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(job.fileName)}`,
  })
  return { url, expiresAt: new Date(expiresAt).toISOString() }
})

export const processVoterExport = onTaskDispatched<{ exportJobId: string }>({
  region,
  memory: '1GiB',
  concurrency: 1,
  maxInstances: 2,
  timeoutSeconds: 1800,
  // Export jobs claim their Firestore document before doing work, so retrying
  // a transient failure is safe and cannot create a second export job.
  retryConfig: { maxAttempts: 3, minBackoffSeconds: 60 },
  rateLimits: { maxConcurrentDispatches: 2 },
}, async (request) => {
  const exportJobId = requiredString(request.data?.exportJobId, 'Export job id')
  const jobRef = db.doc(`exportJobs/${exportJobId}`)
  const job = await claimExportJob(jobRef)
  if (!job) return
  const finishPerformanceTimer = startPerformanceTimer('processVoterExport', { exportJobId })
  try {
    const caller = await requireCaller(job.ownerUid)
    if (!canDownloadSourcePdf(caller.record)) throw new Error('Export permission was removed before processing started.')
    const totalCount = await countExportMatches(caller.record, job.filters)
    await jobRef.update({ totalCount, progress: totalCount ? 8 : 100, updatedAt: FieldValue.serverTimestamp() })
    if (await exportWasCancelled(jobRef)) return
    const records = await collectExportMatches(caller.record, job.filters, async (processedCount) => {
      const progress = totalCount ? Math.min(82, 8 + Math.round((processedCount / totalCount) * 74)) : 82
      await jobRef.update({ processedCount, totalCount, progress, updatedAt: FieldValue.serverTimestamp() })
      return exportWasCancelled(jobRef)
    })
    if (await exportWasCancelled(jobRef)) return
    if (!records.length) throw new Error('No voter records match the selected filters.')
    await jobRef.update({ stage: 'Building the export file', progress: 86, processedCount: records.length, totalCount: records.length, updatedAt: FieldValue.serverTimestamp() })
    const buffer = await buildVoterExport(job.format, records, async (progress) => {
      await jobRef.update({ progress: Math.min(98, progress), updatedAt: FieldValue.serverTimestamp() })
    })
    if (await exportWasCancelled(jobRef)) return
    await getStorage().bucket().file(job.storagePath).save(buffer, { resumable: false, contentType: exportContentType(job.format), metadata: { cacheControl: 'private, max-age=600', metadata: { exportJobId } } })
    await jobRef.update({ status: 'completed', progress: 100, processedCount: records.length, totalCount: records.length, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  } catch (error) {
    if (error instanceof Error && error.message === 'EXPORT_CANCELLED') return
    logger.error('Voter export failed', { exportJobId, error })
    await jobRef.update({ status: 'failed', progress: 0, errorMessage: userSafeError(error), updatedAt: FieldValue.serverTimestamp() })
    throw error
  } finally {
    finishPerformanceTimer()
  }
})

export const cleanupVoterExports = onSchedule({ region, memory: '256MiB', timeoutSeconds: 120, maxInstances: 1, schedule: 'every 1 hours', timeZone: 'Asia/Kolkata' }, async () => {
  const finishPerformanceTimer = startPerformanceTimer('cleanupVoterExports')
  try {
    const snapshot = await db.collection('exportJobs').where('expiresAt', '<', Timestamp.now()).limit(100).get()
    await Promise.all(snapshot.docs.map(async (item) => {
      const job = item.data() as ExportJobRecord
      try { await deleteStoragePaths([job.storagePath]) } catch (error) { logger.warn('Temporary export file cleanup failed', { exportJobId: item.id, error }) }
      await item.ref.delete()
    }))
  } finally {
    finishPerformanceTimer()
  }
})

export const getVoterFilterOptions = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const metadataRef = db.doc(voterFilterMetadataPath)
  const snapshot = await metadataRef.get()
  let metadata = readVoterFilterMetadata(snapshot.data())
  const storedData = snapshot.data()
  if (!snapshot.exists || metadata.needsRebuild || !storedData || typeof storedData.byWard !== 'object') {
    metadata = await rebuildVoterFilterMetadata(metadataRef)
  }
  return filterOptionsForCaller(metadata, caller.record)
})

const voterFilterMetadataPath = 'metadata/voterFilterOptions'
const unknownFilterScope = '__unknown__'

function emptyVoterFilterBucket(): VoterFilterBucket {
  return { areas: [], divisions: [], sourcePdfs: [], uploaders: [] }
}

function readVoterFilterBucket(value: unknown): VoterFilterBucket {
  if (!value || typeof value !== 'object') return emptyVoterFilterBucket()
  const input = value as Record<string, unknown>
  const readList = (key: keyof VoterFilterBucket) => Array.isArray(input[key]) ? uniqueSorted(input[key].map((item) => plainString(item))) : []
  return {
    areas: readList('areas'),
    divisions: readList('divisions'),
    sourcePdfs: readList('sourcePdfs'),
    uploaders: readList('uploaders'),
  }
}

function readVoterFilterMetadata(value: unknown): VoterFilterMetadata {
  const metadata: VoterFilterMetadata = { byWard: {}, needsRebuild: false }
  if (!value || typeof value !== 'object') return metadata
  const input = value as Record<string, unknown>
  const rawByWard = input.byWard
  if (rawByWard && typeof rawByWard === 'object') {
    Object.entries(rawByWard as Record<string, unknown>).forEach(([wardId, rawBooths]) => {
      if (!rawBooths || typeof rawBooths !== 'object') return
      const booths: Record<string, VoterFilterBucket> = {}
      Object.entries(rawBooths as Record<string, unknown>).forEach(([boothId, rawBucket]) => {
        booths[boothId] = readVoterFilterBucket(rawBucket)
      })
      metadata.byWard[wardId] = booths
    })
  }
  metadata.needsRebuild = input.needsRebuild === true
  metadata.updatedAt = input.updatedAt
  return metadata
}

function mergeVoterFilterBucket(target: VoterFilterBucket, additions: VoterFilterBucket) {
  return {
    areas: uniqueSorted([...target.areas, ...additions.areas]),
    divisions: uniqueSorted([...target.divisions, ...additions.divisions]),
    sourcePdfs: uniqueSorted([...target.sourcePdfs, ...additions.sourcePdfs]),
    uploaders: uniqueSorted([...target.uploaders, ...additions.uploaders]),
  }
}

function filterBucketFromVoter(record: Pick<VoterRecord, 'area' | 'division' | 'sourcePdfName' | 'sourcePdfId' | 'uploadedBy'>): VoterFilterBucket {
  return {
    areas: uniqueSorted([record.area]),
    divisions: uniqueSorted([record.division]),
    sourcePdfs: uniqueSorted([record.sourcePdfName || record.sourcePdfId]),
    uploaders: uniqueSorted([record.uploadedBy]),
  }
}

function filterBucketFromSource(source: SourcePdfRecord): VoterFilterBucket {
  return {
    areas: uniqueSorted([...(source.areas ?? []), source.area]),
    divisions: uniqueSorted([...(source.divisions ?? []), source.division]),
    sourcePdfs: uniqueSorted([source.originalFileName]),
    uploaders: uniqueSorted([source.uploadedByName]),
  }
}

async function mergeVoterFilterMetadata(wardId: string, boothId: string, additions: VoterFilterBucket) {
  if (!wardId || !boothId) return
  const metadataRef = db.doc(voterFilterMetadataPath)
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(metadataRef)
    const metadata = readVoterFilterMetadata(snapshot.data())
    const ward = metadata.byWard[wardId] ?? {}
    const current = ward[boothId] ?? emptyVoterFilterBucket()
    ward[boothId] = mergeVoterFilterBucket(current, additions)
    metadata.byWard[wardId] = ward
    transaction.set(metadataRef, {
      byWard: metadata.byWard,
      // A delete or manual scope edit may have marked the document dirty.
      // Keep that flag so the next read performs a complete rebuild instead
      // of accidentally returning stale values.
      needsRebuild: metadata.needsRebuild === true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  })
}

async function mergeVoterFilterMetadataForSource(source: SourcePdfRecord) {
  await mergeVoterFilterMetadata(source.wardId, source.boothId, filterBucketFromSource(source))
}

async function markVoterFilterMetadataDirty() {
  await db.doc(voterFilterMetadataPath).set({ needsRebuild: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
}

async function rebuildVoterFilterMetadata(metadataRef: FirebaseFirestore.DocumentReference) {
  const [voterSnapshot, sourceSnapshot] = await Promise.all([
    db.collection('voters').select('wardId', 'boothId', 'area', 'division', 'sourcePdfName', 'sourcePdfId', 'uploadedByName', 'uploadedBy').get(),
    db.collection('sourcePdfs').select('wardId', 'boothId', 'area', 'areas', 'division', 'divisions', 'originalFileName', 'uploadedByName').get(),
  ])
  const metadata: VoterFilterMetadata = { byWard: {}, needsRebuild: false }
  voterSnapshot.docs.forEach((item) => {
    const record = voterFromFirestore(item.id, item.data())
    if (!record.wardId || !record.boothId) return
    const ward = metadata.byWard[record.wardId] ?? {}
    ward[record.boothId] = mergeVoterFilterBucket(ward[record.boothId] ?? emptyVoterFilterBucket(), filterBucketFromVoter(record))
    metadata.byWard[record.wardId] = ward
  })
  sourceSnapshot.docs.forEach((item) => {
    const source = item.data() as SourcePdfRecord
    if (!source.wardId || !source.boothId) return
    const ward = metadata.byWard[source.wardId] ?? {}
    ward[source.boothId] = mergeVoterFilterBucket(ward[source.boothId] ?? emptyVoterFilterBucket(), filterBucketFromSource(source))
    metadata.byWard[source.wardId] = ward
  })
  await metadataRef.set({ byWard: metadata.byWard, needsRebuild: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  return metadata
}

function filterOptionsForCaller(metadata: VoterFilterMetadata, user: UserRecord) {
  const wards: string[] = []
  const booths: string[] = []
  const boothsByWard: Record<string, string[]> = {}
  const areas: string[] = []
  const divisions: string[] = []
  const sourcePdfs: string[] = []
  const uploaders: string[] = []

  Object.entries(metadata.byWard).forEach(([wardId, rawBooths]) => {
    if (!wardId || wardId === unknownFilterScope) return
    if (user.role !== 'superAdmin' && !user.scope.wardIds.includes(wardId)) return
    const visibleBooths: string[] = []
    Object.entries(rawBooths).forEach(([boothId, bucket]) => {
      if (!boothId || boothId === unknownFilterScope) return
      if (user.role !== 'superAdmin' && user.scope.boothIds.length > 0 && !user.scope.boothIds.includes(boothId)) return
      wards.push(wardId)
      booths.push(boothId)
      visibleBooths.push(boothId)
      areas.push(...bucket.areas)
      divisions.push(...bucket.divisions)
      sourcePdfs.push(...bucket.sourcePdfs)
      uploaders.push(...bucket.uploaders)
    })
    boothsByWard[wardId] = uniqueSorted(visibleBooths)
  })

  return {
    wards: uniqueSorted(wards),
    booths: uniqueSorted(booths),
    boothsByWard,
    areas: uniqueSorted(areas),
    divisions: uniqueSorted(divisions),
    sourcePdfs: uniqueSorted(sourcePdfs),
    uploaders: uniqueSorted(uploaders),
  }
}

function emptyDashboardScopeCount(): DashboardScopeCount {
  return { voterCount: 0, wardIds: [], boothIds: [], areaIds: [], divisionIds: [], sourcePdfIds: [] }
}

function dashboardScopeCount(map: Record<string, DashboardScopeCount>, key: string) {
  if (!key) return undefined
  map[key] ??= emptyDashboardScopeCount()
  return map[key]
}

function addDashboardValue(values: string[], value: string) {
  if (value && !values.includes(value)) values.push(value)
}

function dateValueForStats(value: unknown) {
  const iso = dateAsIso(value)
  if (!iso) return 0
  const time = new Date(iso).getTime()
  return Number.isNaN(time) ? 0 : time
}

function addDashboardVoter(wardCounts: Record<string, DashboardScopeCount>, boothCounts: Record<string, DashboardScopeCount>, record: VoterRecord) {
  const ward = dashboardScopeCount(wardCounts, record.wardId)
  const booth = dashboardScopeCount(boothCounts, record.boothId)
  if (!ward || !booth) return
  ward.voterCount += 1
  booth.voterCount += 1
  addDashboardValue(ward.wardIds, record.wardId)
  addDashboardValue(ward.boothIds, record.boothId)
  addDashboardValue(ward.areaIds, record.area)
  addDashboardValue(ward.divisionIds, record.division)
  addDashboardValue(ward.sourcePdfIds, record.sourcePdfId)
  addDashboardValue(booth.wardIds, record.wardId)
  addDashboardValue(booth.boothIds, record.boothId)
  addDashboardValue(booth.areaIds, record.area)
  addDashboardValue(booth.divisionIds, record.division)
  addDashboardValue(booth.sourcePdfIds, record.sourcePdfId)
}

function addDashboardSource(wardCounts: Record<string, DashboardScopeCount>, boothCounts: Record<string, DashboardScopeCount>, source: SourcePdfRecord & { id: string }) {
  const ward = dashboardScopeCount(wardCounts, source.wardId)
  const booth = dashboardScopeCount(boothCounts, source.boothId)
  if (!ward || !booth) return
  addDashboardValue(ward.wardIds, source.wardId)
  addDashboardValue(ward.boothIds, source.boothId)
  addDashboardValue(ward.areaIds, source.area)
  addDashboardValue(ward.divisionIds, source.division)
  addDashboardValue(ward.sourcePdfIds, source.id)
  addDashboardValue(booth.wardIds, source.wardId)
  addDashboardValue(booth.boothIds, source.boothId)
  addDashboardValue(booth.areaIds, source.area)
  addDashboardValue(booth.divisionIds, source.division)
  addDashboardValue(booth.sourcePdfIds, source.id)
}

async function rebuildDashboardStats() {
  const [voterSnapshot, sourceSnapshot] = await Promise.all([
    db.collection('voters').select('wardId', 'boothId', 'area', 'division', 'sourcePdfId', 'sourcePdfName', 'uploadedByName', 'uploadedBy').get(),
    db.collection('sourcePdfs').get(),
  ])
  const wardCounts: Record<string, DashboardScopeCount> = {}
  const boothCounts: Record<string, DashboardScopeCount> = {}
  const metadata: VoterFilterMetadata = { byWard: {}, needsRebuild: false }
  const voters = voterSnapshot.docs.map((item) => voterFromFirestore(item.id, item.data()))
  voters.forEach((record) => {
    addDashboardVoter(wardCounts, boothCounts, record)
    if (!record.wardId || !record.boothId) return
    const ward = metadata.byWard[record.wardId] ?? {}
    ward[record.boothId] = mergeVoterFilterBucket(ward[record.boothId] ?? emptyVoterFilterBucket(), filterBucketFromVoter(record))
    metadata.byWard[record.wardId] = ward
  })

  const sources = sourceSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() as SourcePdfRecord) }))
  const sourceStatusCounts: Record<string, number> = {}
  const sourceStatusById: Record<string, string> = {}
  let latestUploadTime = 0
  let latestUploadAt: unknown
  sources.forEach((source) => {
    addDashboardSource(wardCounts, boothCounts, source)
    sourceStatusCounts[source.status] = (sourceStatusCounts[source.status] ?? 0) + 1
    sourceStatusById[source.id] = source.status
    const ward = metadata.byWard[source.wardId] ?? {}
    ward[source.boothId] = mergeVoterFilterBucket(ward[source.boothId] ?? emptyVoterFilterBucket(), filterBucketFromSource(source))
    metadata.byWard[source.wardId] = ward
    const uploadTime = dateValueForStats(source.uploadedAt ?? source.createdAt ?? source.updatedAt)
    if (uploadTime > latestUploadTime) {
      latestUploadTime = uploadTime
      latestUploadAt = source.uploadedAt ?? source.createdAt ?? source.updatedAt
    }
  })

  const recentUploads = sources
    .sort((first, second) => dateValueForStats(second.createdAt ?? second.uploadedAt ?? second.updatedAt) - dateValueForStats(first.createdAt ?? first.uploadedAt ?? first.updatedAt))
    .slice(0, 10)
    .map((source) => ({
      id: source.id,
      originalFileName: source.originalFileName,
      wardId: source.wardId,
      boothId: source.boothId,
      status: source.status,
      createdAt: dateAsIso(source.createdAt),
      uploadedAt: dateAsIso(source.uploadedAt),
      updatedAt: dateAsIso(source.updatedAt),
    }))
  const areaIds = uniqueSorted(Object.values(wardCounts).flatMap((item) => item.areaIds))
  const divisionIds = uniqueSorted(Object.values(wardCounts).flatMap((item) => item.divisionIds))
  const completedPdfCount = countStatuses(sourceStatusCounts, ['completed', 'completedWithReview'])
  const processingPdfCount = countStatuses(sourceStatusCounts, ['readyForUpload', 'uploaded', 'queued', 'processing', 'approvalQueued', 'applying'])
  const summary: DashboardStats = {
    voterCount: voters.length,
    wardCount: Object.values(wardCounts).filter((item) => item.voterCount > 0).length,
    boothCount: Object.values(boothCounts).filter((item) => item.voterCount > 0).length,
    areaCount: areaIds.length,
    divisionCount: divisionIds.length,
    sourcePdfCount: sources.length,
    completedPdfCount,
    processingPdfCount,
    sourceStatusCounts,
    sourceStatusById,
    lastUploadAt: latestUploadAt ?? null,
    recentUploads,
  }

  await Promise.all([
    db.doc('stats/summary').set({ ...summary, updatedAt: FieldValue.serverTimestamp() }),
    db.doc('stats/wardCounts').set({ counts: wardCounts, updatedAt: FieldValue.serverTimestamp() }),
    db.doc('stats/boothCounts').set({ counts: boothCounts, updatedAt: FieldValue.serverTimestamp() }),
    db.doc(voterFilterMetadataPath).set({ byWard: metadata.byWard, needsRebuild: false, updatedAt: FieldValue.serverTimestamp() }),
  ])
  return summary
}

function summaryForCaller(summary: DashboardStats, wardStats: DashboardStatsDocument, boothStats: DashboardStatsDocument, user: UserRecord) {
  if (user.role === 'superAdmin') {
    return publicDashboardSummary(summary, summary.sourceStatusCounts, summary.recentUploads, dateAsIso(summary.lastUploadAt))
  }
  const selected: DashboardScopeCount[] = []
  const sourceIds = new Set<string>()
  const areas = new Set<string>()
  const divisions = new Set<string>()
  const wards = new Set<string>()
  const booths = new Set<string>()
  const addSelected = (entry: DashboardScopeCount | undefined) => {
    // Keep a scope when it contains a source PDF that is still processing,
    // even if that PDF has not produced voter rows yet.
    if (!entry || (entry.voterCount <= 0 && entry.sourcePdfIds.length === 0)) return
    selected.push(entry)
    entry.wardIds.forEach((value) => wards.add(value))
    entry.boothIds.forEach((value) => booths.add(value))
    entry.areaIds.forEach((value) => areas.add(value))
    entry.divisionIds.forEach((value) => divisions.add(value))
    entry.sourcePdfIds.forEach((value) => sourceIds.add(value))
  }
  if (user.scope.boothIds.length) {
    user.scope.boothIds.forEach((boothId) => {
      const entry = boothStats.counts[boothId]
      if (entry?.wardIds.some((wardId) => user.scope.wardIds.includes(wardId))) addSelected(entry)
    })
  } else {
    user.scope.wardIds.forEach((wardId) => addSelected(wardStats.counts[wardId]))
  }
  const sourceStatusCounts: Record<string, number> = {}
  sourceIds.forEach((sourceId) => {
    const status = summary.sourceStatusById[sourceId]
    if (status) sourceStatusCounts[status] = (sourceStatusCounts[status] ?? 0) + 1
  })
  const recentUploads = summary.recentUploads.filter((item) => sourceIds.has(item.id))
  return publicDashboardSummary(summary, sourceStatusCounts, recentUploads, recentUploads[0]?.uploadedAt ?? recentUploads[0]?.createdAt ?? dateAsIso(summary.lastUploadAt), {
    voterCount: selected.reduce((total, item) => total + item.voterCount, 0),
    wardCount: wards.size,
    boothCount: booths.size,
    areaCount: areas.size,
    divisionCount: divisions.size,
    sourcePdfCount: sourceIds.size,
    completedPdfCount: countStatuses(sourceStatusCounts, ['completed', 'completedWithReview']),
    processingPdfCount: countStatuses(sourceStatusCounts, ['readyForUpload', 'uploaded', 'queued', 'processing', 'approvalQueued', 'applying']),
  })
}

function publicDashboardSummary(summary: DashboardStats, sourceStatusCounts: Record<string, number>, recentUploads: DashboardRecentUpload[], lastUploadAt: string | undefined, overrides: Partial<Pick<DashboardStats, 'voterCount' | 'wardCount' | 'boothCount' | 'areaCount' | 'divisionCount' | 'sourcePdfCount' | 'completedPdfCount' | 'processingPdfCount'>> = {}) {
  return {
    voterCount: overrides.voterCount ?? summary.voterCount,
    wardCount: overrides.wardCount ?? summary.wardCount,
    boothCount: overrides.boothCount ?? summary.boothCount,
    areaCount: overrides.areaCount ?? summary.areaCount,
    divisionCount: overrides.divisionCount ?? summary.divisionCount,
    sourcePdfCount: overrides.sourcePdfCount ?? summary.sourcePdfCount,
    completedPdfCount: overrides.completedPdfCount ?? countStatuses(sourceStatusCounts, ['completed', 'completedWithReview']),
    processingPdfCount: overrides.processingPdfCount ?? countStatuses(sourceStatusCounts, ['readyForUpload', 'uploaded', 'queued', 'processing', 'approvalQueued', 'applying']),
    sourceStatusCounts,
    lastUploadAt,
    recentUploads,
  }
}

const dashboardMetricNames: DashboardMetricName[] = [
  'voterCount',
  'wardCount',
  'boothCount',
  'areaCount',
  'divisionCount',
  'sourcePdfCount',
  'completedPdfCount',
  'processingPdfCount',
  'attentionCount',
  'sourceStatusCounts',
  'recentUploads',
]

async function readDashboardSummaryForCaller(user: UserRecord) {
  let summarySnapshot = await db.doc('stats/summary').get()
  if (!summarySnapshot.exists || !summarySnapshot.data()?.sourceStatusById) {
    await rebuildDashboardStats()
    summarySnapshot = await db.doc('stats/summary').get()
  }
  const summary = summarySnapshot.data() as DashboardStats
  const [wardSnapshot, boothSnapshot] = await Promise.all([db.doc('stats/wardCounts').get(), db.doc('stats/boothCounts').get()])
  return summaryForCaller(summary, (wardSnapshot.data() ?? { counts: {} }) as DashboardStatsDocument, (boothSnapshot.data() ?? { counts: {} }) as DashboardStatsDocument, user)
}

export const refreshDashboardStats = onTaskDispatched<{ reason?: string }>({
  region,
  memory: '512MiB',
  concurrency: 1,
  maxInstances: 1,
  timeoutSeconds: 900,
  retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
  rateLimits: { maxConcurrentDispatches: 1 },
}, async (request) => {
  const finishPerformanceTimer = startPerformanceTimer('refreshDashboardStats', { reason: request.data?.reason ?? 'scheduled' })
  try {
    await rebuildDashboardStats()
  } finally {
    finishPerformanceTimer()
  }
})

// The dashboard reads these documents instead of scanning every voter on each
// page open. The first call after deployment builds them for existing data.
export const getDashboardSummary = onCall({ region, timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  return readDashboardSummaryForCaller(caller.record)
})

// Each dashboard card can request only the value it needs. The values come
// from the small pre-calculated stats documents, so the browser never scans
// the voters collection just to render the dashboard.
export const getDashboardMetric = onCall({ region, timeoutSeconds: 60, memory: '256MiB' }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const metric = (request.data as { metric?: unknown })?.metric
  if (typeof metric !== 'string' || !dashboardMetricNames.includes(metric as DashboardMetricName)) {
    throw new HttpsError('invalid-argument', 'Unknown dashboard metric.')
  }

  const summary = await readDashboardSummaryForCaller(caller.record)
  const metricName = metric as DashboardMetricName
  if (metricName === 'attentionCount') {
    const reviewCount = countStatuses(summary.sourceStatusCounts, ['review', 'awaitingApproval', 'completedWithReview'])
    const failedCount = countStatuses(summary.sourceStatusCounts, ['failed'])
    return { metric: metricName, value: reviewCount + failedCount }
  }
  return { metric: metricName, value: summary[metricName] }
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
  if (existing.doorNumber !== input.doorNumber && !(await sourceSupportsDoorNumber(input))) {
    throw new HttpsError('failed-precondition', 'The new house number must be checked against the original PDF card before it can replace the existing value.')
  }

  await snapshot.ref.update({
    fullName: input.fullName,
    relativeName: input.relativeName,
    relationshipType: input.relationshipType,
    age: input.age,
    gender: input.gender,
    doorNumber: input.doorNumber,
    doorNumberStatus: input.doorNumberStatus,
    doorNumberCandidate: FieldValue.delete(),
    voterId: input.voterId,
    alternateIdentifier: input.alternateIdentifier,
    mobile: input.mobile,
    serialNumber: input.serialNumber,
    assemblySerial: input.assemblySerial,
    wardId: input.wardId,
    boothId: input.boothId,
    area: input.area,
    division: input.division,
    ...voterNormalizedFields(input),
    reviewStatus: input.reviewStatus,
    needsReview: input.needsReview,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: caller.uid,
    updatedByName: caller.record.fullName,
  })
  // A manual edit can change the ward, booth, area, division, or uploader
  // visible in the filter controls. Rebuild the small metadata document on
  // the next options request so removed values do not remain in the UI.
  await markVoterFilterMetadataDirty()
  await writeAudit(caller, 'voter_record_updated', input.id, input.fullName, { voterId: input.voterId, doorNumber: input.doorNumber, sourcePdfId: input.sourcePdfId, pageNumber: input.pageNumber })
  await scheduleDashboardStatsRefresh('voter-updated')
  return { id: input.id }
})

export const deleteVoterRecord = onCall({ region, timeoutSeconds: 120 }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  if (caller.record.role === 'subMember' || (caller.record.role === 'admin' && !caller.record.permissions.edit)) {
    throw new HttpsError('permission-denied', 'You do not have permission to delete voter records.')
  }
  const voterRecordId = requiredString((request.data as { voterRecordId?: unknown })?.voterRecordId, 'Voter record id')
  const voterRef = db.doc(`voters/${voterRecordId}`)
  const snapshot = await voterRef.get()
  if (!snapshot.exists) throw new HttpsError('not-found', 'Voter record not found.')
  const voter = voterFromFirestore(snapshot.id, snapshot.data() ?? {})
  if (!canViewVoter(caller.record, voter)) throw new HttpsError('permission-denied', 'This record is outside your allowed ward or booth scope.')

  const sourceLinks = await voterRef.collection('sourcePdfs').get()
  const sourcePdfIds = [...new Set([voter.sourcePdfId, ...sourceLinks.docs.map((item) => item.id)].filter(Boolean))]
  const importCleanup = await deleteImportRowsForVoter(sourcePdfIds, voter)
  const deletedImportRows = importCleanup.deletedCount
  await deleteVoterRecordTree(voterRef)
  await deleteStoragePaths([voter.voterCardImagePath, cardThumbnailPath(voter.voterCardImagePath)])
  await markVoterFilterMetadataDirty()
  try {
    await writeAudit(caller, 'voter_record_deleted', voterRecordId, voter.fullName, { voterId: voter.voterId, wardId: voter.wardId, boothId: voter.boothId, deletedImportRows })
  } catch (error) {
    logger.error('Voter data was deleted, but the audit entry could not be written', { voterRecordId, error })
  }
  await scheduleDashboardStatsRefresh('voter-deleted')
  return { id: voterRecordId, deletedImportRows, deletedStoragePaths: importCleanup.deletedStoragePaths + (voter.voterCardImagePath ? 1 : 0) }
})

export const createPdfImport = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const input = readPdfImportRequest(request.data)
  assertCanUploadPdf(caller.record, input.wardId, input.boothId)

  const originalFileName = safePdfFileName(input.originalFileName)
  const uploadHash = input.uploadHash
  if (uploadHash) {
    // Older source records may have a random document id. Check them first so
    // uploading the same bytes again still returns the original import.
    const existingSnapshot = await db.collection('sourcePdfs').where('uploadHash', '==', uploadHash).limit(10).get()
    const existing = existingSnapshot.docs
      .map((item) => ({ id: item.id, ...(item.data() as SourcePdfRecord) }))
      .find((item) => item.wardId === input.wardId && item.boothId === input.boothId && item.status !== 'cancelled')
    if (existing) return { id: existing.id, storagePath: existing.storagePath, duplicate: true, status: existing.status }
  }

  // A deterministic id makes two simultaneous uploads of the same file and
  // scope converge on one source document instead of creating two OCR jobs.
  const sourceRef = uploadHash
    ? db.doc(`sourcePdfs/hash_${stableHash(`${uploadHash}|${input.wardId}|${input.boothId}`).slice(0, 40)}`)
    : db.collection('sourcePdfs').doc()
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
    uploadHash: uploadHash || undefined,
    cancelRequested: false,
  }
  let duplicate = false
  let existingSource: SourcePdfRecord | undefined
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(sourceRef)
    if (current.exists) {
      const currentSource = current.data() as SourcePdfRecord
      if (uploadHash && currentSource.uploadHash === uploadHash && currentSource.status !== 'cancelled') {
        duplicate = true
        existingSource = currentSource
        return
      }
      if (uploadHash && currentSource.uploadHash === uploadHash && currentSource.status === 'cancelled') {
        // A cancelled source can be safely reused. The first OCR step removes
        // its old rows and card files before starting again.
        transaction.set(sourceRef, { ...cleanUndefined(source), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
        return
      }
      throw new HttpsError('already-exists', 'A source PDF with this upload identity already exists.')
    }
    transaction.set(sourceRef, { ...cleanUndefined(source), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  })
  if (duplicate && existingSource) return { id: sourceRef.id, storagePath: existingSource.storagePath, duplicate: true, status: existingSource.status }
  await mergeVoterFilterMetadataForSource(source)
  await writeAudit(caller, 'pdf_import_created', sourceRef.id, originalFileName, { wardId: input.wardId, boothId: input.boothId })
  await scheduleDashboardStatsRefresh('pdf-created')
  return { id: sourceRef.id, storagePath, duplicate: false, status: source.status }
})

export const listPdfImports = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const input = request.data as { cursor?: unknown; pageSize?: unknown }
  const pageSize = Math.min(optionalInteger(input?.pageSize) ?? 200, 250)
  const cursorId = plainString(input?.cursor)
  const cursor = cursorId ? await db.doc(`sourcePdfs/${cursorId}`).get() : undefined
  const sourceQuery = db.collection('sourcePdfs').orderBy(FieldPath.documentId())
  const snapshot = await (cursor?.exists ? sourceQuery.startAfter(cursor).limit(pageSize) : sourceQuery.limit(pageSize)).get()
  const imports = snapshot.docs
    .map((item) => ({ id: item.id, ...(item.data() as SourcePdfRecord) }))
    .filter((source) => canViewPdfImport(caller.record, source))
    .map(sourceForClient)
  return { imports, nextCursor: snapshot.size === pageSize ? snapshot.docs[snapshot.docs.length - 1]?.id : undefined, hasMore: snapshot.size === pageSize }
})

export const updatePdfImportMetadata = onCall({ region, timeoutSeconds: 120 }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const input = readPdfImportMetadataUpdate(request.data)
  const source = await getPdfImport(input.sourcePdfId)
  assertCanManagePdfImport(caller.record, source)
  if (['uploaded', 'queued', 'processing', 'approvalQueued', 'applying'].includes(source.status)) {
    throw new HttpsError('failed-precondition', 'Wait until PDF processing finishes before changing its scope.')
  }
  if (caller.record.role !== 'superAdmin' && !isInsideVoterScope(caller.record, input.wardId, input.boothId)) {
    throw new HttpsError('permission-denied', 'The new ward or booth is outside your allowed scope.')
  }

  const sourceRef = db.doc(`sourcePdfs/${input.sourcePdfId}`)
  const sourceUpdate: Record<string, unknown> = {
    wardId: input.wardId,
    boothId: input.boothId,
    area: input.area,
    areas: input.area ? [input.area] : [],
    updatedAt: FieldValue.serverTimestamp(),
  }
  if (source.coverRows) sourceUpdate.coverRows = source.coverRows.map((row) => ({ ...row, area: input.area || row.area }))
  await sourceRef.update(sourceUpdate)

  const rowSnapshot = await sourceRef.collection('rows').get()
  for (const group of splitInto(rowSnapshot.docs, 350)) {
    const batch = db.batch()
    group.forEach((row) => batch.update(row.ref, {
      wardId: input.wardId,
      boothId: input.boothId,
      area: input.area,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByName: caller.record.fullName,
    }))
    await batch.commit()
  }

  const voterSnapshot = await db.collection('voters').where('sourcePdfId', '==', input.sourcePdfId).get()
  for (const group of splitInto(voterSnapshot.docs, 250)) {
    const batch = db.batch()
    group.forEach((voterSnapshotItem) => {
      const voter = voterFromFirestore(voterSnapshotItem.id, voterSnapshotItem.data())
      batch.update(voterSnapshotItem.ref, {
        wardId: input.wardId,
        boothId: input.boothId,
        area: input.area,
        ...voterNormalizedFields({ doorNumber: voter.doorNumber, voterId: voter.voterId, area: input.area, division: voter.division }),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: caller.uid,
        updatedByName: caller.record.fullName,
      })
      batch.set(voterSnapshotItem.ref.collection('sourcePdfs').doc(input.sourcePdfId), { sourcePdfId: input.sourcePdfId, wardId: input.wardId, boothId: input.boothId }, { merge: true })
    })
    await batch.commit()
  }

  await markVoterFilterMetadataDirty()
  await writeAudit(caller, 'pdf_import_metadata_updated', input.sourcePdfId, source.originalFileName, { previousWardId: source.wardId, previousBoothId: source.boothId, wardId: input.wardId, boothId: input.boothId, area: input.area })
  await scheduleDashboardStatsRefresh('pdf-metadata-updated')
  return { sourcePdfId: input.sourcePdfId }
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
  await scheduleDashboardStatsRefresh('pdf-cancelled')
  return { status: 'cancelled' }
})

export const deletePdfImport = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const sourcePdfId = requiredString((request.data as { sourcePdfId?: unknown })?.sourcePdfId, 'Source PDF id')
  const source = await getPdfImport(sourcePdfId)
  assertCanManagePdfImport(caller.record, source)
  await deleteSourcePdfRecord(sourcePdfId, source, true)
  await markVoterFilterMetadataDirty()
  await writeAudit(caller, 'pdf_import_deleted', sourcePdfId, source.originalFileName, { wardId: source.wardId, boothId: source.boothId })
  await scheduleDashboardStatsRefresh('pdf-deleted')
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
  const voterPaths = voterSnapshot.docs
    .map((item) => plainString(item.data().voterCardImagePath))
    .flatMap((path) => [path, cardThumbnailPath(path)])
    .filter(Boolean)
  const sources = sourceSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() as SourcePdfRecord) }))
  const sourceIdsToDelete = new Set(sources.map((source) => source.id))
  const changedSourceIds = new Set<string>()
  let deletedImportRows = 0
  let deletedHistoricalCardImages = 0

  for (const group of splitInto(voterSnapshot.docs, 10)) {
    const results = await Promise.all(group.map(async (voterSnapshotItem) => {
      const voter = voterFromFirestore(voterSnapshotItem.id, voterSnapshotItem.data())
      const sourceLinks = await voterSnapshotItem.ref.collection('sourcePdfs').get()
      const sourcePdfIds = [...new Set([voter.sourcePdfId, ...sourceLinks.docs.map((item) => item.id)].filter(Boolean))]
        .filter((sourcePdfId) => !sourceIdsToDelete.has(sourcePdfId))
      const cleanup = await deleteImportRowsForVoter(sourcePdfIds, voter, false)
      await deleteVoterRecordTree(voterSnapshotItem.ref)
      return cleanup
    }))
    results.forEach((result) => {
      deletedImportRows += result.deletedCount
      deletedHistoricalCardImages += result.deletedStoragePaths
      result.changedSourceIds.forEach((sourcePdfId) => changedSourceIds.add(sourcePdfId))
    })
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
    if (!knownSourceIds.has(sourcePdfId)) {
      await deleteStoragePrefix(`voter-cards/${sourcePdfId}/`)
      await deleteStoragePrefix(`voter-card-thumbnails/${sourcePdfId}/`)
    }
  }
  await Promise.all([...changedSourceIds].filter((sourcePdfId) => !sourceIdsToDelete.has(sourcePdfId)).map((sourcePdfId) => refreshSourcePdfRowCounts(sourcePdfId)))
  await markVoterFilterMetadataDirty()
  try {
    await writeAudit(caller, 'ward_voter_data_deleted', wardId, `Ward ${wardId}`, { voters: voterSnapshot.size, sourcePdfs: sources.length, deletedImportRows, deletedHistoricalCardImages })
  } catch (error) {
    logger.error('Ward data was deleted, but the audit entry could not be written', { wardId, error })
  }
  await scheduleDashboardStatsRefresh('ward-deleted')
  return { wardId, deletedVoters: voterSnapshot.size, deletedSourcePdfs: sources.length, deletedImportRows, deletedHistoricalCardImages }
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

// Stream the private PDF through an authenticated endpoint. This avoids V4
// signed URLs, which fail with a 500 response when the Cloud Functions service
// account does not have the IAM signBlob permission.
export const downloadSourcePdf = onRequest({ region, cors: true, timeoutSeconds: 540, memory: '512MiB' }, async (request, response) => {
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Only GET requests are allowed.' })
    return
  }

  try {
    const authorization = request.get('authorization') ?? ''
    const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
    if (!idToken) throw new HttpsError('unauthenticated', 'Please sign in again before downloading this PDF.')

    const decodedToken = await auth.verifyIdToken(idToken)
    const caller = await requireCaller(decodedToken.uid)
    const sourcePdfId = requiredString(request.query.sourcePdfId, 'Source PDF id')
    const source = await getPdfImport(sourcePdfId)
    if (!canViewPdfImport(caller.record, source) || !canDownloadSourcePdf(caller.record)) {
      throw new HttpsError('permission-denied', 'You do not have permission to download this PDF.')
    }

    const file = getStorage().bucket().file(source.storagePath)
    const [exists] = await file.exists()
    if (!exists) throw new HttpsError('not-found', 'The original PDF file is no longer available.')
    const [metadata] = await file.getMetadata()
    const fallbackName = source.originalFileName.replace(/[^a-zA-Z0-9._()-]+/g, '_') || 'voter-list.pdf'

    try {
      await writeAudit(caller, 'pdf_downloaded', sourcePdfId, source.originalFileName, { wardId: source.wardId, boothId: source.boothId })
    } catch (error) {
      logger.warn('PDF download audit could not be written.', { sourcePdfId, error })
    }

    response.status(200)
    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader('Content-Disposition', `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(source.originalFileName)}`)
    response.setHeader('Cache-Control', 'private, no-store, max-age=0')
    if (metadata.size) response.setHeader('Content-Length', String(metadata.size))

    await new Promise<void>((resolve, reject) => {
      const stream = file.createReadStream()
      stream.on('error', reject)
      response.on('finish', resolve)
      response.on('close', resolve)
      stream.pipe(response)
    })
  } catch (error) {
    logger.error('Original PDF download failed.', { error, sourcePdfId: request.query.sourcePdfId })
    if (response.headersSent) {
      response.end()
      return
    }
    const status = httpStatusForDownloadError(error)
    const message = error instanceof Error ? error.message : 'The original PDF could not be downloaded.'
    response.status(status).json({ error: message })
  }
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

function cardThumbnailPath(path: string) {
  if (!path.startsWith('voter-cards/')) return ''
  return path.replace(/^voter-cards\//, 'voter-card-thumbnails/').replace(/\.png$/i, '.jpg')
}

async function privateCardThumbnailDataUrl(path: string) {
  const thumbnailPath = cardThumbnailPath(path)
  if (thumbnailPath) {
    const thumbnailFile = getStorage().bucket().file(thumbnailPath)
    const [thumbnailExists] = await thumbnailFile.exists()
    if (thumbnailExists) {
      const [thumbnailBytes] = await thumbnailFile.download()
      return `data:image/jpeg;base64,${thumbnailBytes.toString('base64')}`
    }
  }

  // Older imports have only the original PNG. Resize it in the function so
  // list cards never receive the full-size image.
  const file = getStorage().bucket().file(path)
  const [exists] = await file.exists()
  if (!exists) throw new HttpsError('not-found', 'The voter card thumbnail is not available.')
  const [bytes] = await file.download()
  const image = await loadImage(bytes)
  const width = 240
  const height = Math.max(1, Math.round(width * image.height / image.width))
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  const thumbnail = canvas.toBuffer('image/jpeg', 72)
  canvas.width = 1
  canvas.height = 1
  return `data:image/jpeg;base64,${thumbnail.toString('base64')}`
}

async function resolveVoterCardImage(voter: VoterRecord) {
  const sourcePdfId = plainString(voter.sourcePdfId)
  const rowsRef = sourcePdfId ? db.collection(`sourcePdfs/${sourcePdfId}/rows`) : undefined

  const existingPath = async (path: string, row?: Record<string, unknown>) => {
    if (!path.startsWith('voter-cards/') || (sourcePdfId && !path.startsWith(`voter-cards/${sourcePdfId}/`))) return undefined
    const [exists] = await getStorage().bucket().file(path).exists()
    if (!exists) return undefined
    return {
      path,
      pageNumber: optionalInteger(row?.pageNumber) ?? voter.pageNumber,
      cardPosition: optionalInteger(row?.cardPosition) ?? voter.cardPosition,
    }
  }

  // Page and card position identify the physical card in the source PDF.
  // Prefer this reference over a stale path saved on an older voter record.
  if (rowsRef && Number.isInteger(voter.pageNumber) && Number.isInteger(voter.cardPosition)) {
    const pageRows = await rowsRef.where('pageNumber', '==', voter.pageNumber).limit(250).get()
    const matchingRow = pageRows.docs.find((row) => optionalInteger(row.data().cardPosition) === voter.cardPosition)
    const pageCard = matchingRow ? await existingPath(plainString(matchingRow.data().voterCardImagePath), matchingRow.data()) : undefined
    if (pageCard) return pageCard
  }

  // Older records may not have page metadata. Use the official identifier
  // or real alternate identifier to find the matching source row.
  if (rowsRef && voter.voterId) {
    const idRows = await rowsRef.where('voterId', '==', voter.voterId).limit(5).get()
    for (const row of idRows.docs) {
      const match = await existingPath(plainString(row.data().voterCardImagePath), row.data())
      if (match) return match
    }
  }
  if (rowsRef && voter.alternateIdentifier) {
    const alternateRows = await rowsRef.where('alternateIdentifier', '==', voter.alternateIdentifier).limit(5).get()
    for (const row of alternateRows.docs) {
      const match = await existingPath(plainString(row.data().voterCardImagePath), row.data())
      if (match) return match
    }
  }

  const savedPath = await existingPath(plainString(voter.voterCardImagePath))
  return savedPath
}

export const getVoterCardImageUrl = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const voterRecordId = requiredString((request.data as { voterRecordId?: unknown })?.voterRecordId, 'Voter record id')
  const snapshot = await db.doc(`voters/${voterRecordId}`).get()
  if (!snapshot.exists) throw new HttpsError('not-found', 'Voter record not found.')
  const voter = voterFromFirestore(snapshot.id, snapshot.data() ?? {})
  if (!canViewVoter(caller.record, voter)) throw new HttpsError('permission-denied', 'This voter is outside your allowed ward or booth.')
  const card = await resolveVoterCardImage(voter)
  if (!card) throw new HttpsError('not-found', 'The original voter card image is not available for this source PDF card.')

  const url = await privateCardImageDataUrl(card.path)
  return { url, pageNumber: card.pageNumber, cardPosition: card.cardPosition }
})

export const getVoterCardThumbnailUrl = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const voterRecordId = requiredString((request.data as { voterRecordId?: unknown })?.voterRecordId, 'Voter record id')
  const snapshot = await db.doc(`voters/${voterRecordId}`).get()
  if (!snapshot.exists) throw new HttpsError('not-found', 'Voter record not found.')
  const voter = voterFromFirestore(snapshot.id, snapshot.data() ?? {})
  if (!canViewVoter(caller.record, voter)) throw new HttpsError('permission-denied', 'This voter is outside your allowed ward or booth.')
  const card = await resolveVoterCardImage(voter)
  if (!card) throw new HttpsError('not-found', 'The voter card thumbnail is not available for this record.')

  const url = await privateCardThumbnailDataUrl(card.path)
  return { url, pageNumber: card.pageNumber, cardPosition: card.cardPosition }
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
  await rowRef.update({ ...cleanUndefined(next), doorNumberCandidate: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(), updatedByName: caller.record.fullName })
  const sourceRef = db.collection('sourcePdfs').doc(input.sourcePdfId)
  const nextStatus: PdfImportStatus = caller.record.role === 'superAdmin' ? 'review' : 'awaitingApproval'
  await sourceRef.update({ status: nextStatus, stage: caller.record.role === 'superAdmin' ? 'Review updated' : 'Waiting for Super Admin approval', updatedAt: FieldValue.serverTimestamp() })
  await writeAudit(caller, 'pdf_import_row_updated', `${input.sourcePdfId}/${input.rowId}`, next.fullName || 'Voter row', { sourcePdfId: input.sourcePdfId })
  await scheduleDashboardStatsRefresh('pdf-row-updated')
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
  await scheduleDashboardStatsRefresh('pdf-approval-requested')
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
  await scheduleDashboardStatsRefresh('pdf-approved')
  return { status: 'approvalQueued' }
})

export const retryPdfImport = onCall({ region }, async (request) => {
  const caller = await requireCaller(request.auth?.uid)
  const sourcePdfId = requiredString((request.data as { sourcePdfId?: unknown })?.sourcePdfId, 'Source PDF id')
  const source = await getPdfImport(sourcePdfId)
  assertCanManagePdfImport(caller.record, source)
  if (source.status === 'readyForUpload') throw new HttpsError('failed-precondition', 'Upload the PDF before starting OCR.')
  const retryPage = Math.max(1, Number(source.failedPage) || 1)
  await db.doc(`sourcePdfs/${sourcePdfId}`).update({ status: 'uploaded', cancelRequested: false, stage: retryPage > 1 ? `OCR retry queued from page ${retryPage}` : 'OCR retry queued', progress: 8, processedPage: retryPage - 1, failedPage: retryPage > 1 ? retryPage : FieldValue.delete(), pageCount: FieldValue.delete(), errorMessage: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })
  await enqueueImportTask('processPdfImport', { sourcePdfId })
  await writeAudit(caller, 'pdf_import_retry_requested', sourcePdfId, source.originalFileName, {})
  await scheduleDashboardStatsRefresh('pdf-retry-requested')
  return { status: 'uploaded' }
})

export const onSourcePdfUploaded = onObjectFinalized({
  region: storageEventRegion,
  memory: '512MiB',
  concurrency: 1,
  maxInstances: 10,
  timeoutSeconds: 300,
  // The transaction below makes duplicate Storage delivery safe.
  retry: true,
}, async (event) => {
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
  let shouldEnqueue = false
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(sourceRef)
    if (!current.exists) return
    const currentSource = current.data() as SourcePdfRecord
    if (currentSource.ownerUid !== ownerUid || currentSource.storagePath !== file.name) return
    // Storage finalization can be delivered more than once. Only the first
    // delivery is allowed to move the source into the uploaded state.
    if (!['readyForUpload', 'failed'].includes(currentSource.status)) return
    transaction.update(sourceRef, {
      status: 'uploaded',
      stage: 'PDF uploaded - waiting for OCR',
      progress: 6,
      processedPage: 0,
      failedPage: FieldValue.delete(),
      fileSize: Number(file.size),
      uploadedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    shouldEnqueue = true
  })
  if (shouldEnqueue) {
    await enqueueImportTask('processPdfImport', { sourcePdfId })
    await scheduleDashboardStatsRefresh('pdf-uploaded')
  }
})

export const processPdfImport = onTaskDispatched<{ sourcePdfId: string }>({
  region,
  memory: '2GiB',
  concurrency: 1,
  maxInstances: pdfOcrMaxConcurrent,
  timeoutSeconds: 1800,
  // OCR claims the source with a lease and rewrites only the retryable pages,
  // so a transient retry cannot create a second OCR run or duplicate rows.
  retryConfig: { maxAttempts: 3, minBackoffSeconds: 60 },
  rateLimits: { maxConcurrentDispatches: pdfOcrMaxConcurrent },
}, async (request) => {
  const sourcePdfId = requiredString(request.data?.sourcePdfId, 'Source PDF id')
  const sourceRef = db.doc(`sourcePdfs/${sourcePdfId}`)
  const source = await claimPdfProcessing(sourceRef)
  if (!source) return
  const finishPerformanceTimer = startPerformanceTimer('processPdfImport', { sourcePdfId })

  try {
    const bucket = getStorage().bucket()
    const [pdfBytes] = await bucket.file(source.storagePath).download()
    const retryFromPage = Math.max(1, Number(source.failedPage) || 1)
    const preservedRowCount = await prepareImportRetry(sourcePdfId, retryFromPage)
    let storedRowCount = preservedRowCount
    await sourceRef.update({ processedPage: retryFromPage - 1, rowCount: storedRowCount, updatedAt: FieldValue.serverTimestamp() })
    let lastProgress = 12
    const extraction = await extractVoterCardsFromPdf({
      pdfBytes,
      sourcePdfId,
      scope: { wardId: source.wardId, boothId: source.boothId, area: source.area, division: source.division },
      startPage: retryFromPage,
      allowEmpty: retryFromPage > 1,
      onPageComplete: async (pageNumber, pageRows) => {
        const current = await sourceRef.get()
        if (current.data()?.cancelRequested === true) throw new Error('PDF_IMPORT_CANCELLED')
        const pageCandidates = await addDuplicateState(separateDuplicateCardIdentities(pageRows.map(makeCardImportRow)))
        await storeImportPageRows(sourcePdfId, pageCandidates)
        storedRowCount += pageCandidates.length
        await sourceRef.update({ rowCount: storedRowCount, processedPage: pageNumber, updatedAt: FieldValue.serverTimestamp() })
      },
      onProgress: async (pageNumber, pageCount, _cardCount) => {
        const current = await sourceRef.get()
        if (current.data()?.cancelRequested === true) throw new Error('PDF_IMPORT_CANCELLED')
        const progress = Math.min(72, 12 + Math.round((pageNumber / pageCount) * 60))
        if (progress < lastProgress + 2 && pageNumber !== pageCount) return
        lastProgress = progress
        await sourceRef.update({
          stage: `Reading page ${pageNumber} of ${pageCount} · ${storedRowCount} cards found`,
          progress,
          processedPage: pageNumber,
          pageCount,
          rowCount: storedRowCount,
          updatedAt: FieldValue.serverTimestamp(),
        })
      },
    })
    const afterExtraction = await sourceRef.get()
    if (afterExtraction.data()?.cancelRequested === true) {
      await sourceRef.update({ status: 'cancelled', stage: 'Cancelled by user', progress: 0, ocrLockId: FieldValue.delete(), ocrStartedAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })
      await scheduleDashboardStatsRefresh('pdf-processing-cancelled')
      return
    }
    await sourceRef.update({ stage: 'Checking voter IDs and existing voters', progress: 76, updatedAt: FieldValue.serverTimestamp() })
    const candidateSnapshot = await sourceRef.collection('rows').orderBy('createdAt', 'asc').get()
    const candidates = candidateSnapshot.docs.map((item) => item.data() as ImportRowRecord)
    if (!candidates.length) throw new Error('No voter cards were detected. Use a voter-list PDF with clear black card borders like the original Ward Desk PDF.')
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
      processedPage: extraction.pageCount,
      failedPage: FieldValue.delete(),
      uploadedByRole: uploadedByRole ?? 'admin',
      area: areas.length === 1 ? areas[0] : source.area,
      division: divisions.length === 1 ? divisions[0] : source.division,
      ocrLockId: FieldValue.delete(),
      ocrStartedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    await enqueueImportTask('applyPdfImport', { sourcePdfId })
  } catch (error) {
    if (error instanceof Error && error.message === 'PDF_IMPORT_CANCELLED') {
      await sourceRef.update({ status: 'cancelled', stage: 'Cancelled by user', progress: 0, ocrLockId: FieldValue.delete(), ocrStartedAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })
      await scheduleDashboardStatsRefresh('pdf-processing-cancelled')
      return
    }
    logger.error('PDF OCR failed', { sourcePdfId, error })
    const failedSnapshot = await sourceRef.get()
    const failedPage = Number(failedSnapshot.data()?.processedPage) || undefined
    await sourceRef.update({ status: 'failed', stage: failedPage ? `OCR failed near page ${failedPage} - retry is available` : 'OCR failed - retry is available', errorMessage: userSafeError(error), progress: 0, failedPage: failedPage ?? FieldValue.delete(), ocrLockId: FieldValue.delete(), ocrStartedAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })
    await scheduleDashboardStatsRefresh('pdf-processing-failed')
    throw error
  } finally {
    finishPerformanceTimer()
  }
})

export const applyPdfImport = onTaskDispatched<{ sourcePdfId: string }>({
  region,
  memory: '2GiB',
  concurrency: 1,
  maxInstances: pdfApplyMaxConcurrent,
  timeoutSeconds: 1800,
  // Voter upserts use a stable voter document ID and this task also claims an
  // apply lease, so retrying a transient failure is idempotent.
  retryConfig: { maxAttempts: 3, minBackoffSeconds: 60 },
  rateLimits: { maxConcurrentDispatches: pdfApplyMaxConcurrent },
}, async (request) => {
  const sourcePdfId = requiredString(request.data?.sourcePdfId, 'Source PDF id')
  const sourceRef = db.doc(`sourcePdfs/${sourcePdfId}`)
  const claim = await claimPdfApply(sourceRef)
  if (!claim) return
  const { source, lockId } = claim
  const finishPerformanceTimer = startPerformanceTimer('applyPdfImport', { sourcePdfId })
  try {
    const rows = await sourceRef.collection('rows').orderBy('createdAt', 'asc').get()
    const results = await mapWithConcurrency(rows.docs, 8, async (row) => {
      try {
        return await upsertVoterFromImport(row.id, row.data() as ImportRowRecord, source, sourcePdfId)
      } catch (error) {
        logger.error('A voter card could not be saved', { sourcePdfId, rowId: row.id, error })
        throw error
      }
    })
    const afterApply = await sourceRef.get()
    if (afterApply.data()?.cancelRequested === true) {
      await sourceRef.update({ status: 'cancelled', stage: 'Cancelled by user', progress: 0, applyLockId: FieldValue.delete(), applyStartedAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })
      await scheduleDashboardStatsRefresh('pdf-apply-cancelled')
      return
    }
    const duplicateCount = results.filter((result) => result === 'updated').length
    await sourceRef.update({
      status: 'completed',
      stage: 'All voter cards saved',
      progress: 100,
      duplicateCount,
      needsReviewCount: 0,
      applyLockId: FieldValue.delete(),
      applyStartedAt: FieldValue.delete(),
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    await mergeVoterFilterMetadataForSource(source)
    await scheduleDashboardStatsRefresh('pdf-voters-applied')
  } catch (error) {
    logger.error('PDF voter apply failed', { sourcePdfId, lockId, error })
    await sourceRef.update({
      status: 'approvalQueued',
      stage: 'Saving voters failed - retry is available',
      progress: 82,
      errorMessage: userSafeError(error),
      applyLockId: FieldValue.delete(),
      applyStartedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    await scheduleDashboardStatsRefresh('pdf-apply-failed')
    throw error
  } finally {
    finishPerformanceTimer()
  }
})

async function deleteSourcePdfRecord(sourcePdfId: string, source: SourcePdfRecord, removeCardImages: boolean) {
  const sourceRef = db.doc(`sourcePdfs/${sourcePdfId}`)
  await deleteDocumentChildren(sourceRef, 'rows')
  await sourceRef.delete()
  await deleteStoragePaths([source.storagePath])
  if (removeCardImages) {
    await deleteStoragePrefix(`voter-cards/${sourcePdfId}/`)
    await deleteStoragePrefix(`voter-card-thumbnails/${sourcePdfId}/`)
  }
}

async function deleteVoterRecordTree(voterRef: FirebaseFirestore.DocumentReference) {
  await deleteDocumentChildren(voterRef, 'sourcePdfs')
  await voterRef.delete()
}

async function deleteImportRowsForVoter(sourcePdfIds: string[], voter: VoterRecord, refreshCounts = true) {
  const rowRefs = new Map<string, FirebaseFirestore.DocumentReference>()
  const changedSourceIds = new Set<string>()
  const storagePaths = new Set<string>()
  for (const sourcePdfId of sourcePdfIds) {
    const rows = db.collection(`sourcePdfs/${sourcePdfId}/rows`)
    const queries = [
      voter.voterId ? rows.where('voterId', '==', voter.voterId).get() : undefined,
      voter.alternateIdentifier ? rows.where('alternateIdentifier', '==', voter.alternateIdentifier).get() : undefined,
      voter.voterCardImagePath ? rows.where('voterCardImagePath', '==', voter.voterCardImagePath).get() : undefined,
    ].filter(Boolean) as Array<Promise<FirebaseFirestore.QuerySnapshot>>
    const snapshots = await Promise.all(queries)
    snapshots.forEach((result) => result.docs.forEach((row) => {
      rowRefs.set(row.ref.path, row.ref)
      changedSourceIds.add(sourcePdfId)
      const imagePath = plainString(row.data().voterCardImagePath)
      if (imagePath) {
        storagePaths.add(imagePath)
        storagePaths.add(cardThumbnailPath(imagePath))
      }
    }))
  }
  const refs = [...rowRefs.values()]
  for (const group of splitInto(refs, 350)) {
    const batch = db.batch()
    group.forEach((rowRef) => batch.delete(rowRef))
    await batch.commit()
  }
  await deleteStoragePaths([...storagePaths])
  if (refreshCounts) await Promise.all([...changedSourceIds].map((sourcePdfId) => refreshSourcePdfRowCounts(sourcePdfId)))
  return { deletedCount: refs.length, deletedStoragePaths: storagePaths.size, changedSourceIds: [...changedSourceIds] }
}

async function refreshSourcePdfRowCounts(sourcePdfId: string) {
  const sourceRef = db.doc(`sourcePdfs/${sourcePdfId}`)
  const source = await sourceRef.get()
  if (!source.exists) return
  const rows = await sourceRef.collection('rows').select('needsReview', 'duplicateState').get()
  const needsReviewCount = rows.docs.filter((row) => row.data().needsReview === true).length
  const duplicateCount = rows.docs.filter((row) => ['duplicate', 'updated', 'updatesExisting'].includes(plainString(row.data().duplicateState))).length
  await sourceRef.update({
    rowCount: rows.size,
    readyCount: Math.max(0, rows.size - needsReviewCount),
    duplicateCount,
    needsReviewCount,
    updatedAt: FieldValue.serverTimestamp(),
  })
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

async function deleteCardArtifactsFromPage(sourcePdfId: string, startPage: number) {
  const bucket = getStorage().bucket()
  const [cardFiles, thumbnailFiles] = await Promise.all([
    bucket.getFiles({ prefix: `voter-cards/${sourcePdfId}/` }),
    bucket.getFiles({ prefix: `voter-card-thumbnails/${sourcePdfId}/` }),
  ])
  const paths = [...cardFiles[0], ...thumbnailFiles[0]]
    .filter((file) => Number(file.name.match(/\/p(\d+)-c/)?.[1] ?? 0) >= startPage)
    .map((file) => file.name)
  await deleteStoragePaths(paths)
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
  const deviceLimit = readDeviceLimit(input.deviceLimit ?? existingAccount?.deviceLimit)

  if (role === 'admin' && scope.wardIds.length === 0) {
    throw new HttpsError('invalid-argument', 'An Admin needs at least one allowed ward.')
  }

  if (role === 'subMember' && (scope.wardIds.length === 0 || scope.boothIds.length === 0)) {
    throw new HttpsError('invalid-argument', 'A Sub-member needs at least one assigned ward and one assigned booth.')
  }

  const parent = role === 'subMember' ? await db.doc(`users/${parentAdminId}`).get() : undefined
  if (role === 'subMember' && (!parent?.exists || (parent.data() as UserRecord).role !== 'admin')) {
    throw new HttpsError('invalid-argument', 'Choose a valid parent Admin.')
  }
  const allowedScope = parentScope ?? (parent?.data() as UserRecord | undefined)
  if (role === 'subMember' && allowedScope && !isInsideScope(scope, allowedScope.scope)) {
    throw new HttpsError('permission-denied', 'Ward or booth is outside the Admin access scope.')
  }

  return { fullName, email, mobile, role, status, scope, permissions, parentAdminId, profilePhotoPath, bannerPath, deviceLimit }
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

function readDeviceLimit(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) return 1
  return parsed
}

function readDeviceId(value: unknown) {
  const deviceId = requiredString(value, 'Device id')
  if (!/^[a-zA-Z0-9-]{12,100}$/.test(deviceId)) throw new HttpsError('invalid-argument', 'Device id is not valid.')
  return deviceId
}

function httpStatusForDownloadError(error: unknown) {
  if (!(error instanceof HttpsError)) return 500
  if (error.code === 'unauthenticated') return 401
  if (error.code === 'permission-denied') return 403
  if (error.code === 'not-found') return 404
  if (error.code === 'invalid-argument') return 400
  return 500
}

function activeDeviceSessions(value: unknown, nowMs: number) {
  if (!value || typeof value !== 'object') return {} as Record<string, { token: string; label: string; createdAt: Timestamp; lastSeenAt: Timestamp }>
  const output: Record<string, { token: string; label: string; createdAt: Timestamp; lastSeenAt: Timestamp }> = {}
  Object.entries(value as Record<string, unknown>).forEach(([deviceId, rawEntry]) => {
    if (!/^[a-zA-Z0-9-]{12,100}$/.test(deviceId) || !rawEntry || typeof rawEntry !== 'object') return
    const entry = rawEntry as { token?: unknown; label?: unknown; createdAt?: unknown; lastSeenAt?: unknown }
    const token = plainString(entry.token)
    const lastSeenAt = entry.lastSeenAt instanceof Timestamp ? entry.lastSeenAt : undefined
    if (!token || !lastSeenAt || nowMs - lastSeenAt.toMillis() > deviceSessionTimeoutMs) return
    output[deviceId] = {
      token,
      label: plainString(entry.label).slice(0, 80) || 'Unknown device',
      createdAt: entry.createdAt instanceof Timestamp ? entry.createdAt : lastSeenAt,
      lastSeenAt,
    }
  })
  return output
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
  const wardsInside = child.wardIds.every((wardId) => parent.wardIds.includes(wardId))
  const boothsInside = parent.boothIds.length === 0 || child.boothIds.every((boothId) => parent.boothIds.includes(boothId))
  return wardsInside && boothsInside
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
  if (readDeviceLimit(previous.deviceLimit) !== next.deviceLimit) changes.deviceLimit = next.deviceLimit
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
    division: normalizeDivision(input.division),
    uploadHash: normalizeUploadHash(input.uploadHash),
  }
}

function normalizeUploadHash(value: unknown) {
  const hash = plainString(value).toLocaleLowerCase()
  return /^[a-f0-9]{64}$/.test(hash) ? hash : ''
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

async function enqueueExportTask(exportJobId: string) {
  const queue = getFunctions().taskQueue<{ exportJobId: string }>(`locations/${region}/functions/processVoterExport`)
  await queue.enqueue({ exportJobId })
}

async function scheduleDashboardStatsRefresh(reason: string) {
  try {
    const queue = getFunctions().taskQueue<{ reason: string }>(`locations/${region}/functions/refreshDashboardStats`)
    await queue.enqueue({ reason })
  } catch (error) {
    logger.warn('Dashboard statistics refresh could not be queued.', { reason, error })
  }
}

function readExportFormat(value: unknown): ExportFormat {
  if (value === 'excel' || value === 'pdf' || value === 'csv') return value
  throw new HttpsError('invalid-argument', 'Choose Excel, PDF, or CSV.')
}

function safeExportFileName(value: string, format: ExportFormat) {
  const extension = format === 'excel' ? 'xlsx' : format
  const withoutExtension = value.replace(/\.(xlsx|xls|pdf|csv)$/i, '')
  const stem = withoutExtension.replace(/[^a-zA-Z0-9._()-]+/g, '_').slice(0, 120) || 'voter-export'
  return `${stem}.${extension}`
}

function exportContentType(format: ExportFormat) {
  if (format === 'excel') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (format === 'pdf') return 'application/pdf'
  return 'text/csv; charset=utf-8'
}

function exportJobForClient(id: string, job: ExportJobRecord) {
  return {
    id,
    ownerUid: job.ownerUid,
    format: job.format,
    fileName: job.fileName,
    status: job.status,
    stage: job.stage ?? '',
    progress: job.progress ?? 0,
    processedCount: job.processedCount ?? 0,
    totalCount: job.totalCount ?? 0,
    cancelRequested: job.cancelRequested === true,
    errorMessage: job.errorMessage ?? '',
    createdAt: dateAsIso(job.createdAt),
    updatedAt: dateAsIso(job.updatedAt),
    completedAt: dateAsIso(job.completedAt),
    expiresAt: dateAsIso(job.expiresAt),
  }
}

async function claimExportJob(jobRef: FirebaseFirestore.DocumentReference) {
  let claimedJob: ExportJobRecord | undefined
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef)
    if (!snapshot.exists) return
    const job = snapshot.data() as ExportJobRecord
    const staleProcessing = job.status === 'processing' && taskLeaseExpired(job.updatedAt)
    if ((!['queued', 'failed'].includes(job.status) && !staleProcessing) || job.cancelRequested) return
    claimedJob = job
    transaction.update(jobRef, {
      status: 'processing',
      stage: 'Finding matching voter records',
      progress: 3,
      processedCount: 0,
      errorMessage: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  })
  return claimedJob
}

async function exportWasCancelled(jobRef: FirebaseFirestore.DocumentReference) {
  const snapshot = await jobRef.get()
  if (!snapshot.exists) return true
  const job = snapshot.data() as ExportJobRecord
  if (job.cancelRequested !== true && job.status !== 'cancelled') return false
  if (job.status !== 'cancelled') {
    await jobRef.update({ status: 'cancelled', progress: 0, updatedAt: FieldValue.serverTimestamp() }).catch(() => undefined)
  }
  return true
}

async function countExportMatches(user: UserRecord, filters: VoterFilters) {
  const directQuery = buildDirectVoterQuery(user, filters)
  if (directQuery?.empty) return 0
  if (directQuery?.query && canUseDirectVoterCount(filters)) {
    const result = await directQuery.query.count().get()
    return result.data().count
  }

  let count = 0
  await scanExportVoters(user, filters, async (records) => {
    count += records.length
  })
  return count
}

async function collectExportMatches(user: UserRecord, filters: VoterFilters, onBatch?: (processedCount: number) => Promise<boolean>) {
  const records: ExportVoterRecord[] = []
  await scanExportVoters(user, filters, async (batch) => {
    records.push(...batch.map((record) => ({
      fullName: record.fullName,
      doorNumber: record.doorNumber,
      area: record.area || record.division,
      voterId: record.voterId,
      serialNumber: record.serialNumber,
      mobile: record.mobile,
    })))
    if (await onBatch?.(records.length)) throw new Error('EXPORT_CANCELLED')
  })
  return records
}

async function scanExportVoters(user: UserRecord, filters: VoterFilters, onBatch: (records: VoterRecord[]) => Promise<void>) {
  const directQuery = buildDirectVoterQuery(user, filters)
  if (directQuery?.empty) return
  const query = directQuery?.query ?? db.collection('voters').orderBy(FieldPath.documentId())
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined

  while (true) {
    const snapshot = await (cursor ? query.startAfter(cursor).limit(500) : query.limit(500)).get()
    if (!snapshot.size) return
    const records = snapshot.docs
      .map((item) => voterFromFirestore(item.id, item.data()))
      .filter((record) => canViewVoter(user, record))
      .filter((record) => matchesFilters(record, filters))
    await onBatch(records)
    if (snapshot.size < 500) return
    cursor = snapshot.docs[snapshot.docs.length - 1]
  }
}

async function claimPdfProcessing(sourceRef: FirebaseFirestore.DocumentReference) {
  let claimedSource: SourcePdfRecord | undefined
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(sourceRef)
    if (!snapshot.exists) return
    const source = snapshot.data() as SourcePdfRecord
    const staleProcessing = source.status === 'processing' && taskLeaseExpired(source.ocrStartedAt ?? source.updatedAt)
    if ((!['uploaded', 'queued', 'failed'].includes(source.status) && !staleProcessing) || source.cancelRequested) return
    claimedSource = source
    transaction.update(sourceRef, {
      status: 'processing',
      stage: 'Finding voter cards in the PDF',
      progress: 12,
      processedPage: 0,
      errorMessage: FieldValue.delete(),
      ocrLockId: randomUUID(),
      ocrStartedAt: Timestamp.now(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  })
  return claimedSource
}

async function claimPdfApply(sourceRef: FirebaseFirestore.DocumentReference) {
  let claimedSource: SourcePdfRecord | undefined
  let lockId = ''
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(sourceRef)
    if (!snapshot.exists) return
    const source = snapshot.data() as SourcePdfRecord
    const staleApplying = source.status === 'applying' && taskLeaseExpired(source.applyStartedAt ?? source.updatedAt)
    const activeApplying = source.status === 'applying' && source.applyLockId && !staleApplying
    if ((!['approvalQueued', 'applying'].includes(source.status) && !staleApplying) || source.cancelRequested || activeApplying) return
    lockId = randomUUID()
    claimedSource = source
    transaction.update(sourceRef, {
      status: 'applying',
      stage: 'Saving every voter to the register',
      progress: 86,
      errorMessage: FieldValue.delete(),
      applyLockId: lockId,
      applyStartedAt: Timestamp.now(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  })
  return claimedSource ? { source: claimedSource, lockId } : undefined
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

function readPdfImportMetadataUpdate(value: unknown) {
  if (!value || typeof value !== 'object') throw new HttpsError('invalid-argument', 'Invalid PDF metadata.')
  const input = value as PdfMetadataUpdateInput
  return {
    sourcePdfId: requiredString(input.sourcePdfId, 'Source PDF id'),
    wardId: requiredString(input.wardId, 'Ward'),
    boothId: requiredString(input.boothId, 'Booth'),
    area: plainString(input.area),
  }
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
    doorNumber: normalizeDoorNumber(input.doorNumber),
    doorNumberStatus: readDoorNumberStatus(undefined, normalizeDoorNumber(input.doorNumber)),
    voterId: normalizeOfficialVoterId(input.voterId),
    alternateIdentifier: normalizeAlternateIdentifier(input.alternateIdentifier),
    mobile: normalizeMobile(plainString(input.mobile)),
    serialNumber: plainString(input.serialNumber),
    assemblySerial: plainString(input.assemblySerial),
    wardId: plainString(input.wardId),
    boothId: plainString(input.boothId),
    area: plainString(input.area),
    division: normalizeDivision(input.division),
  }
}

function buildEditedImportRow(current: ImportRowRecord, input: ReturnType<typeof readPdfRowUpdate>): ImportRowRecord {
  const next = {
    ...current,
    fullName: safeImportedName(input.fullName),
    relativeName: input.relativeName,
    relationshipType: input.relationshipType,
    age: input.age,
    gender: input.gender,
    doorNumber: input.doorNumber,
    doorNumberStatus: input.doorNumberStatus,
    doorNumberCandidate: undefined,
    voterId: input.voterId,
    alternateIdentifier: input.alternateIdentifier,
    mobile: input.mobile,
    serialNumber: input.serialNumber,
    assemblySerial: input.assemblySerial,
    wardId: input.wardId,
    boothId: input.boothId,
    area: input.area,
    division: normalizeDivision(input.division),
  }
  const needsReview = !voterIdentity(next) || !next.fullName || !isValidDoorNumber(next.doorNumber)
  return {
    ...next,
    duplicateState: voterIdentity(next) ? current.duplicateState : 'missingIdentity',
    needsReview,
    reviewStatus: needsReview ? 'needsReview' : 'pending',
  }
}

function safeImportedName(value: unknown) {
  const name = plainString(value).replace(/\s+/g, ' ').trim()
  if (!name || /^voter(?:\s+card)?(?:\s+\d+)?$/i.test(name)) return ''
  if (/\b(?:available|voter\s*id|voter\s*card|card\s*(?:no|number)|house\s*(?:no|number)|door\s*(?:no|number))\b/i.test(name)) return ''
  return name
}

function readDoorNumberStatus(value: unknown, doorNumber: string): DoorNumberStatus {
  if (value === 'verificationRequired') return 'verificationRequired'
  return doorNumber && isValidDoorNumber(doorNumber) ? 'available' : 'missing'
}

function normalizeDivision(value: unknown) {
  const cleaned = plainString(value).replace(/\s+/g, '')
  if (/^\d+$/.test(cleaned)) return String(Number(cleaned))
  return cleaned.toLocaleUpperCase().slice(0, 80)
}

function makeCardImportRow(card: ExtractedVoterCard): ImportRowRecord {
  const doorNumber = normalizeDoorNumber(card.doorNumber)
  const voterId = normalizeOfficialVoterId(card.voterId)
  const alternateIdentifier = normalizeAlternateIdentifier(card.alternateIdentifier)
  const initial = {
    fullName: safeImportedName(card.fullName),
    relativeName: plainString(card.relativeName),
    relationshipType: plainString(card.relationshipType),
    age: plainString(card.age),
    gender: plainString(card.gender),
    doorNumber,
    doorNumberStatus: readDoorNumberStatus(undefined, doorNumber),
    voterId,
    // The alternate identifier is a real source identifier only. The fallback
    // identity is stored separately and is never shown as an official ID.
    alternateIdentifier,
    mobile: normalizeMobile(card.mobile),
    serialNumber: plainString(card.serialNumber),
    assemblySerial: plainString(card.assemblySerial),
    wardId: plainString(card.wardId),
    boothId: plainString(card.boothId),
    area: plainString(card.area),
    division: normalizeDivision(card.division),
  }
  return {
    ...initial,
    identityKey: voterId || alternateIdentifier ? undefined : fallbackCardIdentity(card),
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

function normalizeOfficialVoterId(value: unknown) {
  const cleaned = plainString(value).replace(/[\s-]+/g, '').toLocaleUpperCase()
  return /^(?:AUTO:|INTERNAL:)/i.test(cleaned) ? '' : cleaned.slice(0, 40)
}

function normalizeAlternateIdentifier(value: unknown) {
  const cleaned = plainString(value).replace(/\s+/g, '').slice(0, 80)
  return /^(?:AUTO:|INTERNAL:)/i.test(cleaned) ? '' : cleaned
}

function voterNormalizedFields(input: Pick<VoterRecord, 'doorNumber' | 'voterId' | 'area' | 'division'>) {
  return {
    areaId: normalizeSearchText(input.area),
    divisionId: normalizeSearchText(normalizeDivision(input.division)),
    voterIdNormalized: normalizeSearchText(input.voterId),
    doorNumberNormalized: normalizeSearchText(input.doorNumber),
  }
}

function normalizeDoorNumber(value: unknown) {
  const cleaned = plainString(value)
    .replace(/[–—]/g, '-')
    .replace(/\b(?:NOT\s+AVAILABLE|AVAILABLE|N\/A)\b/gi, ' ')
    .replace(/(?:PHOTO|PH0T0|PHTO)(?:\s*AVAILABLE)?\s*$/i, ' ')
    .replace(/\s+/g, '')
    .toLocaleUpperCase()
  if (!cleaned || /^[A-Z]{3}\d{7}$/i.test(cleaned)) return ''
  const match = cleaned.match(/\d[A-Z0-9]*(?:[-/]\s*[A-Z0-9]+)*/i)
  return (match?.[0] ?? '').replace(/\s+/g, '').slice(0, 40)
}

function fallbackCardIdentity(card: ExtractedVoterCard) {
  // A card with an unreadable identity must still remain a distinct row. The
  // page/card coordinates are the only stable identity available in that
  // situation; without them, two blank OCR results collapse into one voter.
  const parts = [card.fullName, card.relativeName, normalizeDoorNumber(card.doorNumber), card.age, card.gender, card.pageNumber, card.cardPosition]
    .map((part) => plainString(part).replace(/\s+/g, '').toLocaleLowerCase())
  return `auto:${stableHash(parts.join('|')).slice(0, 24)}`
}

function isValidDoorNumber(value: string) {
  return /\d/.test(value) && /^[A-Z0-9][A-Z0-9/-]{0,39}$/i.test(value)
}

function voterIdentity(row: Pick<ImportRowRecord, 'voterId' | 'alternateIdentifier' | 'identityKey'>) {
  const voterId = normalizeOfficialVoterId(row.voterId)
  if (voterId) return `voter:${voterId}`
  const rawAlternate = plainString(row.alternateIdentifier)
  const alternate = normalizeAlternateIdentifier(rawAlternate).replace(/\s+/g, '').toLocaleLowerCase()
  if (alternate) return `alternate:${alternate}`
  const internal = plainString(row.identityKey) || (/^auto:/i.test(rawAlternate) ? rawAlternate : '')
  return internal ? `alternate:${internal.replace(/\s+/g, '').toLocaleLowerCase()}` : ''
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

async function prepareImportRetry(sourcePdfId: string, startPage: number) {
  const sourceRef = db.doc(`sourcePdfs/${sourcePdfId}`)
  const previousRows = await sourceRef.collection('rows').get()
  const rowsToDelete = previousRows.docs.filter((row) => startPage <= 1 || Number((row.data() as ImportRowRecord).pageNumber) >= startPage)
  for (const group of splitInto(rowsToDelete, 400)) {
    const batch = db.batch()
    group.forEach((row) => batch.delete(row.ref))
    await batch.commit()
  }
  await deleteCardArtifactsFromPage(sourcePdfId, startPage)
  return previousRows.size - rowsToDelete.length
}

async function storeImportPageRows(sourcePdfId: string, rows: ImportRowRecord[]) {
  if (!rows.length) return
  const sourceRef = db.doc(`sourcePdfs/${sourcePdfId}`)
  for (const group of splitInto(rows, 350)) {
    const batch = db.batch()
    group.forEach((row) => {
      const page = String(row.pageNumber ?? 0).padStart(4, '0')
      const card = String(row.cardPosition ?? 0).padStart(3, '0')
      const rowId = `row-p${page}-c${card}-${stableHash(voterIdentity(row) || row.rawText).slice(0, 8)}`
      batch.set(sourceRef.collection('rows').doc(rowId), { ...cleanUndefined(row), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    })
    await batch.commit()
  }
}

function separateDuplicateCardIdentities(rows: ImportRowRecord[]) {
  const identities = new Set<string>()
  return rows.map((row) => {
    const identity = voterIdentity(row)
    if (!identity || !identities.has(identity)) {
      if (identity) identities.add(identity)
      return row
    }

    // Two cards on the same page should never overwrite one another because
    // OCR accidentally read the same voter ID twice. Keep the card as its
    // own reviewable record until its identity is corrected.
    const fallback = `auto:${stableHash([identity, row.pageNumber, row.cardPosition].join('|')).slice(0, 24)}`
    return {
      ...row,
      voterId: '',
      alternateIdentifier: '',
      identityKey: fallback,
      duplicateState: 'missingIdentity' as const,
      needsReview: true,
      reviewStatus: 'needsReview' as const,
    }
  })
}

async function upsertVoterFromImport(rowId: string, row: ImportRowRecord, source: SourcePdfRecord, sourcePdfId: string): Promise<'created' | 'updated'> {
  const identity = voterIdentity(row)
  if (!identity) throw new Error('The imported voter card has no stable identifier.')
  const voterRef = db.doc(`voters/v_${stableHash(identity)}`)
  const result = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(voterRef)
    const previous = existing.exists ? existing.data() ?? {} : {}
    const previousDoorNumber = normalizeDoorNumber(previous.doorNumber)
    const incomingDoorNumber = normalizeDoorNumber(row.doorNumber)
    const doorDecision = chooseImportedDoorNumber(incomingDoorNumber, previousDoorNumber, row, sourcePdfId, identity)
    const fullName = safeImportedName(row.fullName) || safeImportedName(previous.fullName)
    const previousAlternate = normalizeAlternateIdentifier(previous.alternateIdentifier)
    const alternateIdentifier = normalizeAlternateIdentifier(row.alternateIdentifier) || previousAlternate
    const voterId = normalizeOfficialVoterId(row.voterId) || normalizeOfficialVoterId(previous.voterId)
    transaction.set(voterRef, {
      identityKey: identity,
      fullName,
      relativeName: row.relativeName || plainString(previous.relativeName),
      relationshipType: row.relationshipType || plainString(previous.relationshipType),
      age: row.age || plainString(previous.age),
      gender: row.gender || plainString(previous.gender),
      doorNumber: doorDecision.doorNumber,
      doorNumberStatus: doorDecision.status,
      doorNumberCandidate: doorDecision.candidate || FieldValue.delete(),
      voterId,
      alternateIdentifier,
      // A blank mobile number never removes an already verified mobile number.
      mobile: row.mobile || plainString(previous.mobile),
      serialNumber: row.serialNumber || plainString(previous.serialNumber),
      assemblySerial: row.assemblySerial || plainString(previous.assemblySerial),
      // Ward and booth values intentionally update: they can change in a new electoral roll.
      wardId: row.wardId || plainString(previous.wardId),
      boothId: row.boothId || plainString(previous.boothId),
      area: row.area || plainString(previous.area),
      division: normalizeDivision(row.division || previous.division),
      ...voterNormalizedFields({
        doorNumber: doorDecision.doorNumber,
        voterId,
        area: row.area || plainString(previous.area),
        division: normalizeDivision(row.division || previous.division),
      }),
      sourcePdfId,
      sourcePdfName: source.originalFileName,
      voterCardImagePath: row.voterCardImagePath || plainString(previous.voterCardImagePath),
      pageNumber: row.pageNumber ?? previous.pageNumber ?? null,
      cardPosition: row.cardPosition ?? previous.cardPosition ?? null,
      rawText: row.rawText || plainString(previous.rawText),
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

function chooseImportedDoorNumber(incoming: string, previous: string, row: ImportRowRecord, sourcePdfId: string, identity: string) {
  if (!incoming) return { doorNumber: previous, status: readDoorNumberStatus(undefined, previous) as DoorNumberStatus, candidate: '' }
  if (!previous || incoming === previous) return { doorNumber: incoming, status: 'available' as DoorNumberStatus, candidate: '' }

  // A changed house number is accepted only when the same source card and a
  // stable source identity support the change. Internal fallback identities
  // are deliberately not strong enough to replace an existing value.
  const stableSourceIdentity = identity.startsWith('voter:') || (identity.startsWith('alternate:') && !identity.includes('auto:'))
  if (stableSourceIdentity && isSourceBackedImport(row, sourcePdfId) && isValidDoorNumber(incoming)) {
    return { doorNumber: incoming, status: 'available' as DoorNumberStatus, candidate: '' }
  }
  return { doorNumber: previous, status: 'verificationRequired' as DoorNumberStatus, candidate: incoming }
}

function isSourceBackedImport(row: Pick<ImportRowRecord, 'rawText' | 'voterCardImagePath' | 'pageNumber' | 'cardPosition'>, sourcePdfId: string) {
  return Boolean(
    plainString(row.rawText) &&
    plainString(row.voterCardImagePath).startsWith(`voter-cards/${sourcePdfId}/`) &&
    optionalInteger(row.pageNumber) &&
    optionalInteger(row.cardPosition),
  )
}

async function sourceSupportsDoorNumber(input: VoterRecord) {
  const sourcePdfId = plainString(input.sourcePdfId)
  const imagePath = plainString(input.voterCardImagePath)
  const requestedDoor = normalizeDoorNumber(input.doorNumber)
  if (!sourcePdfId || !requestedDoor || !isValidDoorNumber(requestedDoor) || !imagePath.startsWith(`voter-cards/${sourcePdfId}/`)) return false
  const sourceSnapshot = await db.doc(`sourcePdfs/${sourcePdfId}`).get()
  if (!sourceSnapshot.exists) return false
  const rows = await sourceSnapshot.ref.collection('rows').where('voterCardImagePath', '==', imagePath).limit(1).get()
  return rows.docs.some((row) => isSourceBackedImport(row.data() as ImportRowRecord, sourcePdfId))
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
  const doorNumber = normalizeDoorNumber(value.doorNumber)
  return {
    id,
    fullName: plainString(value.fullName),
    relativeName: plainString(value.relativeName),
    relationshipType: plainString(value.relationshipType),
    age: plainString(value.age),
    gender: plainString(value.gender),
    doorNumber,
    doorNumberStatus: readDoorNumberStatus(value.doorNumberStatus, doorNumber),
    doorNumberCandidate: normalizeDoorNumber(value.doorNumberCandidate),
    voterId: normalizeOfficialVoterId(value.voterId),
    alternateIdentifier: normalizeAlternateIdentifier(value.alternateIdentifier),
    mobile: plainString(value.mobile),
    serialNumber: plainString(value.serialNumber),
    assemblySerial: plainString(value.assemblySerial),
    wardId: plainString(value.wardId),
    boothId: plainString(value.boothId),
    area: plainString(value.area),
    division: normalizeDivision(value.division),
    sourcePdfId: plainString(value.sourcePdfId),
    sourcePdfName: plainString(value.sourcePdfName),
    voterCardImagePath: plainString(value.voterCardImagePath),
    rawText: plainString(value.rawText),
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
  const voterId = normalizeOfficialVoterId(input.voterId)
  const alternateIdentifier = normalizeAlternateIdentifier(input.alternateIdentifier)
  const doorNumber = normalizeDoorNumber(input.doorNumber)
  if (doorNumber && !isValidDoorNumber(doorNumber)) throw new HttpsError('invalid-argument', 'Enter a valid house number confirmed from the original voter card.')
  return {
    id: input.id,
    fullName: requiredString(input.fullName, 'Voter name'),
    relativeName: plainString(input.relativeName),
    relationshipType: plainString(input.relationshipType),
    age: plainString(input.age),
    gender: plainString(input.gender),
    doorNumber,
    doorNumberStatus: doorNumber ? 'available' : 'missing',
    doorNumberCandidate: undefined,
    voterId,
    alternateIdentifier,
    mobile: normalizeMobile(plainString(input.mobile)),
    serialNumber: requiredString(input.serialNumber, 'Serial number'),
    assemblySerial: plainString(input.assemblySerial),
    wardId: requiredString(input.wardId, 'Ward'),
    boothId: requiredString(input.boothId, 'Booth'),
    area: plainString(input.area),
    division: normalizeDivision(input.division),
    sourcePdfId: plainString(input.sourcePdfId),
    sourcePdfName: plainString(input.sourcePdfName),
    voterCardImagePath: plainString(input.voterCardImagePath),
    rawText: plainString(input.rawText),
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
  return true
}

const teluguIndependentVowels: Record<string, string> = {
  అ: 'a', ఆ: 'aa', ఇ: 'i', ఈ: 'ii', ఉ: 'u', ఊ: 'uu', ఋ: 'ru', ఎ: 'e', ఏ: 'ee', ఐ: 'ai', ఒ: 'o', ఓ: 'oo', ఔ: 'au',
}

const teluguConsonants: Record<string, string> = {
  క: 'k', ఖ: 'kh', గ: 'g', ఘ: 'gh', ఙ: 'ng', చ: 'ch', ఛ: 'chh', జ: 'j', ఝ: 'jh', ఞ: 'ny', ట: 't', ఠ: 'th', డ: 'd', ఢ: 'dh', ణ: 'n', త: 't', థ: 'th', ద: 'd', ధ: 'dh', న: 'n', ప: 'p', ఫ: 'ph', బ: 'b', భ: 'bh', మ: 'm', య: 'y', ర: 'r', ల: 'l', వ: 'v', శ: 'sh', ష: 'sh', స: 's', హ: 'h', ళ: 'l', ఱ: 'r',
}

const teluguVowelSigns: Record<string, string> = {
  'ా': 'aa', 'ి': 'i', 'ీ': 'ii', 'ు': 'u', 'ూ': 'uu', 'ృ': 'ru', 'ె': 'e', 'ే': 'ee', 'ై': 'ai', 'ొ': 'o', 'ో': 'oo', 'ౌ': 'au',
}

function normalizeSearchText(value: string) {
  return value.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '')
}

function romanizeTelugu(value: string) {
  const characters = Array.from(value)
  let output = ''
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]
    const consonant = teluguConsonants[character]
    if (consonant) {
      const next = characters[index + 1]
      if (next === '్') {
        output += consonant
        index += 1
      } else if (next && teluguVowelSigns[next]) {
        output += consonant + teluguVowelSigns[next]
        index += 1
      } else {
        output += consonant + 'a'
      }
      continue
    }
    if (teluguIndependentVowels[character]) output += teluguIndependentVowels[character]
    else if (character === 'ం') output += 'm'
    else if (character === 'ః') output += 'h'
    else if (character !== '్' && !teluguVowelSigns[character]) output += character
  }
  return output
}

function canonicalRoman(value: string) {
  return normalizeSearchText(value)
    .replace(/aa/g, 'a')
    .replace(/ee/g, 'e')
    .replace(/ii/g, 'i')
    .replace(/oo/g, 'o')
    .replace(/uu/g, 'u')
}

function consonantSignature(value: string) {
  return canonicalRoman(value).replace(/[aeiou]/g, '')
}

function matchesSearch(record: VoterRecord, query: unknown) {
  const rawQuery = plainString(query)
  const cleanQuery = normalizeSearchText(rawQuery)
  if (!cleanQuery) return true

  const exact = (value: string) => normalizeSearchText(value) === cleanQuery
  const compactQuery = rawQuery.replace(/[\s-]+/g, '').toLocaleUpperCase()
  const looksLikeVoterId = /^[A-Z]{2,4}\d{5,12}$/.test(compactQuery)
  const looksLikeMobile = /^\d{10,12}$/.test(compactQuery)
  const looksLikeDoor = /[-/]/.test(rawQuery) || /^\d+[A-Z]+$/i.test(rawQuery.replace(/\s+/g, ''))

  // Numeric and structured identifiers are exact searches. This prevents a
  // door number such as 1-12 from also returning records containing 1 or 12
  // in a serial, age, ward, or unrelated text field.
  if (looksLikeVoterId) return exact(record.voterId) || exact(record.alternateIdentifier)
  if (looksLikeMobile) {
    const digits = compactQuery.startsWith('91') && compactQuery.length === 12 ? compactQuery.slice(2) : compactQuery
    return record.mobile.replace(/\D/g, '') === digits
  }
  if (looksLikeDoor) {
    const normalizedDoorQuery = normalizeDoorNumber(rawQuery)
    return Boolean(normalizedDoorQuery) && normalizeSearchText(record.doorNumber) === normalizeSearchText(normalizedDoorQuery)
  }
  if (/^\d+$/.test(compactQuery)) {
    return [record.doorNumber, record.serialNumber, record.assemblySerial, record.wardId, record.boothId].some(exact)
  }

  const romanQuery = canonicalRoman(plainString(query))
  const romanizedNames = [record.fullName, record.relativeName].map((value) => canonicalRoman(romanizeTelugu(value)))
  if (romanQuery.length >= 2) {
    if (romanizedNames.some((value) => value.includes(romanQuery))) return true
    const queryConsonants = consonantSignature(romanQuery)
    if (queryConsonants.length >= 3 && romanizedNames.some((value) => consonantSignature(value).includes(queryConsonants))) return true
  }

  // Text searches cover names and descriptive metadata only. Identity and
  // numeric fields are intentionally excluded here so a name/area search
  // cannot accidentally produce identifier matches.
  return [record.fullName, record.relativeName, record.area, record.division, record.sourcePdfName, record.sourcePdfId, record.uploadedBy]
    .some((value) => normalizeSearchText(value).includes(cleanQuery))
}

function matchesFilters(record: VoterRecord, filters: VoterFilters) {
  const matches = (value: string, query: unknown) => !plainString(query) || value.toLocaleLowerCase().includes(plainString(query).toLocaleLowerCase())
  const exact = (value: string, query: unknown) => !plainString(query) || value.trim().toLocaleLowerCase() === plainString(query).toLocaleLowerCase()
  const uploadedDate = record.uploadedAt?.slice(0, 10) ?? ''
  const needsReview = filters.needsReview === 'yes' ? true : filters.needsReview === 'no' ? false : undefined
  return matchesSearch(record, filters.search) &&
    matches(record.fullName, filters.name) &&
    matches(record.sourcePdfId, filters.sourcePdfId) &&
    matches(record.doorNumber, filters.doorNumber) &&
    matches(record.voterId, filters.voterId) &&
    matches(record.alternateIdentifier, filters.alternateIdentifier) &&
    matches(record.mobile, filters.mobile) &&
    matches(record.serialNumber, filters.serialNumber) &&
    exact(record.wardId, filters.wardId) &&
    exact(record.boothId, filters.boothId) &&
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

function countStatuses(counts: Record<string, number>, statuses: string[]) {
  return statuses.reduce((total, status) => total + (counts[status] ?? 0), 0)
}

function plainString(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 160) : typeof value === 'number' ? String(value) : ''
}

function queryDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
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
