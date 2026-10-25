export type VoterRecord = {
  id: string
  fullName: string
  relativeName: string
  relationshipType: string
  age: string
  gender: string
  doorNumber: string
  doorNumberStatus?: 'available' | 'missing' | 'verificationRequired'
  doorNumberCandidate?: string
  voterId: string
  alternateIdentifier: string
  mobile: string
  serialNumber: string
  assemblySerial: string
  wardId: string
  boothId: string
  area: string
  division: string
  sourcePdfId: string
  sourcePdfName: string
  voterCardImagePath: string
  rawText: string
  pageNumber?: number
  cardPosition?: number
  uploadedAt?: string
  uploadedBy: string
  reviewStatus?: 'pending' | 'reviewed' | 'needsReview'
  needsReview?: boolean
  surveyStatus?: 'ok' | 'pending' | 'noNeed'
  surveyReason?: string
  surveyDate?: string
  surveyUpdatedAt?: string
  surveyUpdatedBy?: string
}

export type VoterFilters = {
  search: string
  sourcePdfId?: string
  name: string
  doorNumber: string
  voterId: string
  alternateIdentifier: string
  mobile: string
  serialNumber: string
  wardId: string
  boothId: string
  area: string
  division: string
  sourcePdf: string
  uploadedFrom: string
  uploadedTo: string
  uploadedBy: string
  reviewStatus?: '' | 'pending' | 'reviewed' | 'needsReview'
  needsReview?: '' | 'yes' | 'no'
  surveyStatus?: '' | 'ok' | 'pending' | 'noNeed'
  surveyDate?: string
  houseMemberCount?: string
}

export const emptyVoterFilters: VoterFilters = {
  search: '', name: '', doorNumber: '', voterId: '', alternateIdentifier: '', mobile: '', serialNumber: '', wardId: '', boothId: '', area: '', division: '', sourcePdf: '', uploadedFrom: '', uploadedTo: '', uploadedBy: '', reviewStatus: '', needsReview: '', surveyStatus: '', houseMemberCount: '',
}

export type VoterFilterOptions = {
  wards: string[]
  booths: string[]
  boothsByWard?: Record<string, string[]>
  areas: string[]
  divisions: string[]
  sourcePdfs: string[]
  uploaders: string[]
}
