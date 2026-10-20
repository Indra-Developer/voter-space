import type { NavigationKey } from './types'

export const navigationPaths: Record<NavigationKey, string> = {
  dashboard: '/dashboard',
  register: '/voter-register',
  upload: '/pdf-upload',
  library: '/pdf-library',
  users: '/user-management',
  directory: '/user-directory',
  audit: '/audit-logs',
  settings: '/settings',
}

export function pathForNavigation(key: NavigationKey) {
  return navigationPaths[key]
}

export function navigationForPath(pathname: string): NavigationKey | undefined {
  return (Object.entries(navigationPaths) as Array<[NavigationKey, string]>)
    .find(([, path]) => pathname === path || pathname.startsWith(`${path}/`))?.[0]
}
