import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '../../lib/firebase'
import { cachedRequest, invalidateRequestCache } from '../../lib/request-cache'
import type { PdfImportStatus } from '../pdf-import/types'

export type DashboardRecentUpload = {
  id: string
  originalFileName: string
  wardId: string
  boothId: string
  status: PdfImportStatus
  createdAt?: string
  uploadedAt?: string
  updatedAt?: string
}

export type DashboardSummary = {
  voterCount: number
  wardCount: number
  boothCount: number
  areaCount: number
  divisionCount: number
  sourcePdfCount: number
  completedPdfCount: number
  processingPdfCount: number
  lastUploadAt?: string
  sourceStatusCounts: Record<string, number>
  recentUploads: DashboardRecentUpload[]
}

export async function loadDashboardSummary(options: { force?: boolean } = {}) {
  const key = `dashboard-summary:${auth?.currentUser?.uid ?? 'signed-out'}`
  return cachedRequest(key, async () => {
    if (!functions) throw new Error('Firebase is not configured.')
    const call = httpsCallable<Record<string, never>, DashboardSummary>(functions, 'getDashboardSummary')
    return (await call({})).data
  }, { ttlMs: 30_000, force: options.force })
}

export function invalidateDashboardSummaryCache() {
  invalidateRequestCache('dashboard-summary:')
}
