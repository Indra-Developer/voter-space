import { httpsCallable } from 'firebase/functions'
import { functions } from '../../lib/firebase'
import type { VoterFilterOptions, VoterRecord } from './types'

function requireFunctions() {
  if (!functions) throw new Error('Firebase is not configured.')
  return functions
}

export async function loadVoters() {
  const listVoters = httpsCallable<Record<string, never>, { records: VoterRecord[]; truncated: boolean }>(requireFunctions(), 'listVoters')
  const result = await listVoters({})
  return result.data
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

export async function loadVoterCardImage(voterRecordId: string) {
  const getVoterCardImageUrl = httpsCallable<{ voterRecordId: string }, { url: string; expiresAt: string }>(requireFunctions(), 'getVoterCardImageUrl')
  return (await getVoterCardImageUrl({ voterRecordId })).data.url
}
