import {
  Activity,
  BookOpen,
  FileText,
  Files,
  LayoutDashboard,
  Settings,
  Upload,
  Users,
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
  { key: 'library', icon: Files },
  { key: 'users', icon: Users },
  { key: 'audit', icon: Activity },
  { key: 'settings', icon: Settings },
]

export const mobileNavigationKeys = ['dashboard', 'register', 'upload', 'library', 'settings'] as const satisfies readonly NavigationKey[]

export const pdfIcon = FileText
