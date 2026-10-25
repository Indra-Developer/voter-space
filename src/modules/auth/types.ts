import type { UserRole } from '../app-shell/types'

export type AccountStatus = 'active' | 'disabled'

export type UserPermissions = {
  upload: boolean
  edit: boolean
  download: boolean
  audit: boolean
  reports: boolean
}

export type AccessScope = {
  wardIds: string[]
  boothIds: string[]
}

export type UserProfile = {
  fullName: string
  email: string
  mobile: string
  role: UserRole
  status: AccountStatus
  scope: AccessScope
  permissions: UserPermissions
  parentAdminId?: string
  profilePhotoPath?: string
  bannerPath?: string
  deviceLimit?: number
  createdBy: string
  createdAt?: unknown
  updatedAt?: unknown
}

export type AppSession = {
  uid: string
  profile: UserProfile
  profilePhotoUrl?: string
  bannerUrl?: string
}

export type LoginRole = UserRole

export type AccountFormValues = {
  uid?: string
  fullName: string
  email: string
  mobile: string
  role: 'admin' | 'subMember'
  status: AccountStatus
  parentAdminId?: string
  scope: AccessScope
  permissions: UserPermissions
  profilePhotoPath?: string
  bannerPath?: string
  deviceLimit: number
}

export const emptyPermissions: UserPermissions = { upload: false, edit: false, download: true, audit: false, reports: false }
