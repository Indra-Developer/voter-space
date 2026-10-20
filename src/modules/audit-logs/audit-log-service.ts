import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '../../lib/firebase'
import { cachedRequest, invalidateRequestCache } from '../../lib/request-cache'

export type AuditEntry = {
  id: string
  action: string
  actorName: string
  targetName: string
  details: Record<string, unknown>
  createdAt?: string
}

export async function loadAuditLogs(options: { force?: boolean } = {}) {
  const key = `audit-logs:${auth?.currentUser?.uid ?? 'signed-out'}`
  return cachedRequest(key, async () => {
    if (!functions) throw new Error('Firebase is not configured.')
    const call = httpsCallable<Record<string, never>, { entries: AuditEntry[]; ownActivityOnly: boolean }>(functions, 'listAuditLogs')
    return (await call({})).data
  }, { ttlMs: 20_000, force: options.force })
}

export function invalidateAuditLogCache() {
  invalidateRequestCache('audit-logs:')
}
