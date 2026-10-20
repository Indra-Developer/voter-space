import { httpsCallable } from 'firebase/functions'
import { functions } from '../../lib/firebase'

export type DashboardSummary = {
  voterCount: number
  wardCount: number
  boothCount: number
  areaCount: number
  divisionCount: number
  sourcePdfCount: number
  sourceStatusCounts: Record<string, number>
}

export async function loadDashboardSummary() {
  if (!functions) throw new Error('Firebase is not configured.')
  const call = httpsCallable<Record<string, never>, DashboardSummary>(functions, 'getDashboardSummary')
  return (await call({})).data
}
