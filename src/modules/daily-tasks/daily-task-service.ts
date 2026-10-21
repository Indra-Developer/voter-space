import { httpsCallable } from 'firebase/functions'
import { functions } from '../../lib/firebase'

export type DailyTask = {
  id: string
  sourcePdfId: string
  wardId: string
  boothId: string
  area: string
  division: string
  sourcePdfName: string
  updatedAt?: string
  needsReviewCount: number
  rowCount: number
  kind: 'retryPdf' | 'reviewImport' | 'approveImport' | 'reviewVoters' | 'processing'
  priority: 'high' | 'normal'
  action: 'upload' | 'register'
}

type DailyTaskResponse = Omit<DailyTask, 'action'> & { action: 'library' | 'upload' | 'register' }

export async function loadDailyTasks() {
  if (!functions) throw new Error('Firebase is not configured.')
  const call = httpsCallable<Record<string, never>, { tasks: DailyTaskResponse[] }>(functions, 'listDailyTasks')
  return (await call({})).data.tasks.map(({ action, ...task }) => ({ ...task, action: action === 'library' ? 'upload' : action }))
}
