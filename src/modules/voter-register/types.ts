export type VoterRecord = {
  id: string
  fullName: string
  relativeName: string
  relationshipType: string
  age: string
  gender: string
  doorNumber: string
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
  pageNumber?: number
  cardPosition?: number
  uploadedAt?: string
  uploadedBy: string
}

export type VoterFilters = {
  search: string
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
}

export const emptyVoterFilters: VoterFilters = {
  search: '', name: '', doorNumber: '', voterId: '', alternateIdentifier: '', mobile: '', serialNumber: '', wardId: '', boothId: '', area: '', division: '', sourcePdf: '', uploadedFrom: '', uploadedTo: '', uploadedBy: '',
}

export type VoterFilterOptions = {
  wards: string[]
  booths: string[]
  areas: string[]
  divisions: string[]
  sourcePdfs: string[]
  uploaders: string[]
}
