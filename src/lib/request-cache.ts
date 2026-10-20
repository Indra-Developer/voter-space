type CacheEntry = {
  value: unknown
  expiresAt: number
}

const values = new Map<string, CacheEntry>()
const pending = new Map<string, Promise<unknown>>()
const versions = new Map<string, number>()
let sessionGeneration = 0

/**
 * Reuses a recent request during the current browser session and joins
 * duplicate requests that start at the same time. This keeps page changes
 * fast without persisting sensitive voter data in localStorage.
 */
export function cachedRequest<T>(
  key: string,
  loader: () => Promise<T>,
  options: { ttlMs?: number; force?: boolean } = {},
) {
  const pendingRequest = pending.get(key)
  if (pendingRequest) return pendingRequest as Promise<T>

  const now = Date.now()
  const entry = values.get(key)
  if (!options.force && entry && entry.expiresAt > now) return Promise.resolve(entry.value as T)
  if (entry) values.delete(key)
  const generation = sessionGeneration
  const version = versions.get(key) ?? 0

  const request = loader().then((value) => {
    if (generation === sessionGeneration && version === (versions.get(key) ?? 0)) values.set(key, { value, expiresAt: Date.now() + (options.ttlMs ?? 30_000) })
    return value
  }).finally(() => {
    pending.delete(key)
  })

  pending.set(key, request)
  return request
}

export function invalidateRequestCache(prefix: string) {
  const keys = new Set([...values.keys(), ...pending.keys(), ...versions.keys()])
  for (const key of keys) {
    if (!key.startsWith(prefix)) continue
    values.delete(key)
    versions.set(key, (versions.get(key) ?? 0) + 1)
  }
}

export function clearRequestCache() {
  sessionGeneration += 1
  values.clear()
}
