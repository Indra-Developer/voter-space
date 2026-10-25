import {
  Activity,
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  Settings,
  Upload,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import type { NavigationKey } from './types'

export type NavigationItem = {
  key: NavigationKey
  icon: LucideIcon
}

export const navigationItems: NavigationItem[] = [
  { key: 'dashboard', icon: LayoutDashboard },
  { key: 'register', icon: BookOpen },
  { key: 'upload', icon: Upload },
  { key: 'users', icon: Users },
  { key: 'directory', icon: UsersRound },
  { key: 'audit', icon: Activity },
  { key: 'reports', icon: ClipboardList },
  { key: 'settings', icon: Settings },
]

export const mobileNavigationKeys = ['dashboard', 'register', 'upload', 'users', 'settings'] as const satisfies readonly NavigationKey[]
