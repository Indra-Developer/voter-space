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

export type AuditLogFilter = 'all' | 'user' | 'pdf' | 'permission'
export type AuditLogPage = { entries: AuditEntry[]; nextCursor?: string; hasMore: boolean; ownActivityOnly: boolean }

export async function loadAuditLogs(options: { cursor?: string; filter?: AuditLogFilter; force?: boolean } = {}) {
  const filter = options.filter ?? 'all'
  const key = `audit-logs:${auth?.currentUser?.uid ?? 'signed-out'}:${filter}:${options.cursor ?? 'first'}`
  return cachedRequest(key, async () => {
    if (!functions) throw new Error('Firebase is not configured.')
    const call = httpsCallable<{ cursor?: string; filter: AuditLogFilter; pageSize: number }, AuditLogPage>(functions, 'listAuditLogs')
    return (await call({ filter, pageSize: 25, ...(options.cursor ? { cursor: options.cursor } : {}) })).data
  }, { ttlMs: 20_000, force: options.force })
}

export function invalidateAuditLogCache() {
  invalidateRequestCache('audit-logs:')
}
