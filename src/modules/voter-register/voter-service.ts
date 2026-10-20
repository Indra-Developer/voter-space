import { httpsCallable } from 'firebase/functions'
import { functions } from '../../lib/firebase'
import type { VoterFilterOptions, VoterRecord } from './types'

function requireFunctions() {
  if (!functions) throw new Error('Firebase is not configured.')
  return functions
}

export async function loadVoters(cursor?: string, sourcePdfId?: string) {
  const listVoters = httpsCallable<{ cursor?: string; pageSize: number; sourcePdfId?: string }, { records: VoterRecord[]; nextCursor?: string; hasMore: boolean }>(requireFunctions(), 'listVoters')
  const result = await listVoters({ cursor, pageSize: 200, sourcePdfId })
  return result.data
}

export async function loadAllVoters(sourcePdfId?: string) {
  const records: VoterRecord[] = []
  let cursor: string | undefined
  let hasMore = true
  while (hasMore) {
    const result = await loadVoters(cursor, sourcePdfId)
    records.push(...result.records)
    cursor = result.nextCursor
    hasMore = result.hasMore && Boolean(cursor)
  }
  return [...new Map(records.map((record) => [record.id, record])).values()]
}

export async function loadVoterFilterOptions() {
  const getVoterFilterOptions = httpsCallable<Record<string, never>, VoterFilterOptions>(requireFunctions(), 'getVoterFilterOptions')
  return (await getVoterFilterOptions({})).data
}

export async function deleteVotersByWard(wardId: string) {
  const call = httpsCallable<{ wardId: string; confirmation: string }, { wardId: string; deletedVoters: number; deletedSourcePdfs: number }>(requireFunctions(), 'deleteVotersByWard')
  return (await call({ wardId, confirmation: wardId })).data
}

export async function saveVoter(record: VoterRecord) {
  const updateVoterRecord = httpsCallable<VoterRecord, { id: string }>(requireFunctions(), 'updateVoterRecord')
  await updateVoterRecord(record)
}

export async function deleteVoter(voterRecordId: string) {
  const deleteVoterRecord = httpsCallable<{ voterRecordId: string }, { id: string; deletedImportRows: number; deletedStoragePaths: number }>(requireFunctions(), 'deleteVoterRecord')
  return (await deleteVoterRecord({ voterRecordId })).data
}

export async function loadVoterCardImage(voterRecordId: string) {
  const getVoterCardImageUrl = httpsCallable<{ voterRecordId: string }, { url: string; expiresAt: string }>(requireFunctions(), 'getVoterCardImageUrl')
  return (await getVoterCardImageUrl({ voterRecordId })).data.url
}
