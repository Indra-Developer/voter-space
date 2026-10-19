import { httpsCallable } from 'firebase/functions'
import { functions } from '../../lib/firebase'

export type AuditEntry = {
  id: string
  action: string
  actorName: string
  targetName: string
  details: Record<string, unknown>
  createdAt?: string
}

export async function loadAuditLogs() {
  if (!functions) throw new Error('Firebase is not configured.')
  const call = httpsCallable<Record<string, never>, { entries: AuditEntry[]; ownActivityOnly: boolean }>(functions, 'listAuditLogs')
  return (await call({})).data
}
