export type AppLanguage = 'te' | 'en'

export type AppTheme = 'green' | 'sky' | 'dark'

export type UserRole = 'superAdmin' | 'admin' | 'subMember'

export type NavigationKey =
  | 'dashboard'
  | 'register'
  | 'upload'
  | 'library'
  | 'users'
  | 'audit'
  | 'settings'

export type ShellProfile = {
  name?: string
  role?: UserRole
  photoUrl?: string
  bannerUrl?: string
}
