import type { VoterRecord } from './types'

export const missingOfficialVoterId = 'Missing / Verification required'

export function displayOfficialVoterId(record: Pick<VoterRecord, 'voterId'>) {
  const value = record.voterId.trim()
  return value && !/^(?:auto:|internal:)/i.test(value) ? value : missingOfficialVoterId
}
