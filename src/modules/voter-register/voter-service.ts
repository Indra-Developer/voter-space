import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '../../lib/firebase'
import { cachedRequest, invalidateRequestCache } from '../../lib/request-cache'
import type { VoterFilterOptions, VoterFilters, VoterRecord } from './types'

export type VoterLoadOptions = {
  filters?: VoterFilters
  sourcePdfId?: string
  force?: boolean
}

export type VoterExportFormat = 'excel' | 'pdf' | 'csv'
export type VoterExportJob = {
  id: string
  fileName: string
  format: VoterExportFormat
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
  stage: string
  progress: number
  processedCount: number
  totalCount: number
  errorMessage?: string
}
export class ServerExportCancelledError extends Error {
  constructor() {
    super('Export cancelled.')
    this.name = 'ServerExportCancelledError'
  }
}

export const VOTER_PAGE_SIZE = 100
const CARD_IMAGE_CACHE_TTL_MS = 15 * 60 * 1000
const CARD_IMAGE_CACHE_LIMIT = 48
type CardImageResult = { url: string; pageNumber?: number; cardPosition?: number }
type CachedCardImage = { value: CardImageResult; cachedAt: number }

const cardImageCache = new Map<string, CachedCardImage>()
const cardThumbnailCache = new Map<string, CachedCardImage>()
const cardImageRequests = new Map<string, Promise<CardImageResult>>()
const cardThumbnailRequests = new Map<string, Promise<CardImageResult>>()

function requireFunctions() {
  if (!functions) throw new Error('Firebase is not configured.')
  return functions
}

export async function loadVoters(cursor?: string, options: VoterLoadOptions = {}) {
  const key = `voter-page:${auth?.currentUser?.uid ?? 'signed-out'}:${cursor ?? 'first'}:${JSON.stringify({ filters: options.filters ?? {}, sourcePdfId: options.sourcePdfId ?? '' })}`
  return cachedRequest(key, async () => {
    const listVoters = httpsCallable<{ cursor?: string; pageSize: number; sourcePdfId?: string } & Partial<VoterFilters>, { records: VoterRecord[]; nextCursor?: string; hasMore: boolean }>(requireFunctions(), 'listVoters')
    const result = await listVoters({ cursor, pageSize: VOTER_PAGE_SIZE, sourcePdfId: options.sourcePdfId, ...(options.filters ?? {}) })
    return result.data
  }, { ttlMs: 30_000, force: options.force })
}

export async function countVoters(filters: VoterFilters, options: { force?: boolean } = {}) {
  const key = `voter-count:${auth?.currentUser?.uid ?? 'signed-out'}:${JSON.stringify(filters)}`
  return cachedRequest(key, async () => {
    const call = httpsCallable<Partial<VoterFilters>, { totalCount: number }>(requireFunctions(), 'countVoters')
    return (await call(filters)).data
  }, { ttlMs: 30_000, force: options.force })
}

export async function runVoterExport(options: {
  format: VoterExportFormat
  filters: VoterFilters
  fileName: string
  signal?: AbortSignal
  onJob?: (job: VoterExportJob) => void
}) {
  const create = httpsCallable<{ format: VoterExportFormat; filters: VoterFilters; fileName: string }, VoterExportJob>(requireFunctions(), 'createVoterExport')
  const getJob = httpsCallable<{ exportJobId: string }, VoterExportJob>(requireFunctions(), 'getVoterExportJob')
  const cancel = httpsCallable<{ exportJobId: string }, { status: string }>(requireFunctions(), 'cancelVoterExport')
  const getDownloadUrl = httpsCallable<{ exportJobId: string }, { url: string }>(requireFunctions(), 'getVoterExportDownloadUrl')
  const created = (await create({ format: options.format, filters: options.filters, fileName: options.fileName })).data
  options.onJob?.(created)
  const startedAt = Date.now()
  let current = created

  while (true) {
    if (options.signal?.aborted) {
      await cancel({ exportJobId: created.id }).catch(() => undefined)
      throw new ServerExportCancelledError()
    }
    if (current.status === 'completed') {
      const download = await getDownloadUrl({ exportJobId: created.id })
      const link = document.createElement('a')
      link.href = download.data.url
      link.download = current.fileName
      link.click()
      return current
    }
    if (current.status === 'failed') throw new Error(current.errorMessage || 'The export could not be completed.')
    if (current.status === 'cancelled') throw new ServerExportCancelledError()
    if (Date.now() - startedAt > 30 * 60 * 1000) {
      await cancel({ exportJobId: created.id }).catch(() => undefined)
      throw new Error('The export took too long. Please retry it.')
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 1000))
    current = (await getJob({ exportJobId: created.id })).data
    options.onJob?.(current)
  }
}

export async function loadAllVoters(options: VoterLoadOptions = {}) {
  const key = `voter-all:${auth?.currentUser?.uid ?? 'signed-out'}:${JSON.stringify(options)}`
  return cachedRequest(key, async () => {
    const records: VoterRecord[] = []
    let cursor: string | undefined
    let hasMore = true
    while (hasMore) {
      const result = await loadVoters(cursor, options)
      records.push(...result.records)
      cursor = result.nextCursor
      hasMore = result.hasMore && Boolean(cursor)
    }
    return [...new Map(records.map((record) => [record.id, record])).values()]
  }, { ttlMs: 60_000 })
}

export async function loadVoterFilterOptions(options: { force?: boolean } = {}) {
  const key = `voter-filter-options:${auth?.currentUser?.uid ?? 'signed-out'}`
  return cachedRequest(key, async () => {
    const getVoterFilterOptions = httpsCallable<Record<string, never>, VoterFilterOptions>(requireFunctions(), 'getVoterFilterOptions')
    return (await getVoterFilterOptions({})).data
  }, { ttlMs: 60_000, force: options.force })
}

export function invalidateVoterDataCache() {
  invalidateRequestCache('voter-page:')
  invalidateRequestCache('voter-count:')
  invalidateRequestCache('voter-all:')
  invalidateRequestCache('voter-filter-options:')
  invalidateRequestCache('dashboard-summary:')
  invalidateRequestCache('audit-logs:')
}

export async function deleteVotersByWard(wardId: string) {
  const call = httpsCallable<{ wardId: string; confirmation: string }, { wardId: string; deletedVoters: number; deletedSourcePdfs: number }>(requireFunctions(), 'deleteVotersByWard')
  const result = (await call({ wardId, confirmation: wardId })).data
  invalidateVoterDataCache()
  return result
}

export async function saveVoter(record: VoterRecord) {
  const updateVoterRecord = httpsCallable<VoterRecord, { id: string }>(requireFunctions(), 'updateVoterRecord')
  await updateVoterRecord(record)
  invalidateVoterDataCache()
}

export async function deleteVoter(voterRecordId: string) {
  const deleteVoterRecord = httpsCallable<{ voterRecordId: string }, { id: string; deletedImportRows: number; deletedStoragePaths: number }>(requireFunctions(), 'deleteVoterRecord')
  const result = (await deleteVoterRecord({ voterRecordId })).data
  invalidateVoterDataCache()
  return result
}

function cachedCardImage(cache: Map<string, CachedCardImage>, voterRecordId: string) {
  const entry = cache.get(voterRecordId)
  if (!entry) return undefined
  if (Date.now() - entry.cachedAt > CARD_IMAGE_CACHE_TTL_MS) {
    cache.delete(voterRecordId)
    return undefined
  }
  // Refresh the insertion order so frequently opened cards stay cached.
  cache.delete(voterRecordId)
  cache.set(voterRecordId, entry)
  return entry.value
}

function cacheCardImage(cache: Map<string, CachedCardImage>, voterRecordId: string, value: CardImageResult) {
  cache.delete(voterRecordId)
  cache.set(voterRecordId, { value, cachedAt: Date.now() })
  while (cache.size > CARD_IMAGE_CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
}

async function loadCardImage(voterRecordId: string, kind: 'full' | 'thumbnail') {
  const cache = kind === 'full' ? cardImageCache : cardThumbnailCache
  const requests = kind === 'full' ? cardImageRequests : cardThumbnailRequests
  const cached = cachedCardImage(cache, voterRecordId)
  if (cached) return cached
  const pending = requests.get(voterRecordId)
  if (pending) return pending

  const functionName = kind === 'full' ? 'getVoterCardImageUrl' : 'getVoterCardThumbnailUrl'
  const call = httpsCallable<{ voterRecordId: string }, CardImageResult>(requireFunctions(), functionName)
  const request = call({ voterRecordId }).then((result) => {
    cacheCardImage(cache, voterRecordId, result.data)
    return result.data
  }).finally(() => {
    requests.delete(voterRecordId)
  })
  requests.set(voterRecordId, request)
  return request
}

export async function loadVoterCardImage(voterRecordId: string) {
  return loadCardImage(voterRecordId, 'full')
}

export async function loadVoterCardThumbnail(voterRecordId: string) {
  return loadCardImage(voterRecordId, 'thumbnail')
}
