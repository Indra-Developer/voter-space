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

export const dashboardMetricNames = [
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
] as const

export type DashboardMetric = typeof dashboardMetricNames[number]
export type DashboardMetricValue = number | Record<string, number> | DashboardRecentUpload[]
export type DashboardMetricResult = { metric: DashboardMetric; value: DashboardMetricValue }

export async function loadDashboardSummary(options: { force?: boolean } = {}) {
  const key = `dashboard-summary:${auth?.currentUser?.uid ?? 'signed-out'}`
  return cachedRequest(key, async () => {
    if (!functions) throw new Error('Firebase is not configured.')
    const call = httpsCallable<Record<string, never>, DashboardSummary>(functions, 'getDashboardSummary')
    return (await call({})).data
  }, { ttlMs: 30_000, force: options.force })
}

export async function loadDashboardMetric(metric: DashboardMetric, options: { force?: boolean } = {}) {
  const key = `dashboard-metric:${auth?.currentUser?.uid ?? 'signed-out'}:${metric}`
  return cachedRequest(key, async () => {
    if (!functions) throw new Error('Firebase is not configured.')
    const call = httpsCallable<{ metric: DashboardMetric }, DashboardMetricResult>(functions, 'getDashboardMetric')
    try {
      return (await call({ metric })).data
    } catch (error) {
      // Keep an older deployment usable while the new per-metric function is
      // being deployed. The summary call is cached and is only a temporary
      // compatibility path.
      if (!isMissingDashboardMetricFunction(error)) throw error
      const summary = await loadDashboardSummary(options)
      if (metric === 'attentionCount') {
        const reviewCount = countStatuses(summary.sourceStatusCounts, ['review', 'awaitingApproval', 'completedWithReview'])
        const failedCount = countStatuses(summary.sourceStatusCounts, ['failed'])
        return { metric, value: reviewCount + failedCount }
      }
      return { metric, value: summary[metric] }
    }
  }, { ttlMs: 30_000, force: options.force })
}

function countStatuses(counts: Record<string, number>, statuses: string[]) {
  return statuses.reduce((total, status) => total + (counts[status] ?? 0), 0)
}

function isMissingDashboardMetricFunction(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String(error.code) : ''
  return code === 'functions/not-found' || code === 'not-found' || code.includes('not-found')
}

export function invalidateDashboardSummaryCache() {
  invalidateRequestCache('dashboard-summary:')
  invalidateRequestCache('dashboard-metric:')
}
