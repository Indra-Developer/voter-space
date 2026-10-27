import { ArrowLeft, ChevronDown, ChevronRight, CircleUserRound, Menu, Palette, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import logoAsset from '../../assets/voter-space-logo.jpg'
import './app-shell.css'
import { copy } from './copy'
import { mobileNavigationKeys, navigationItems } from './navigation'
import type { AppLanguage, AppTheme, NavigationKey, ShellProfile } from './types'
import type { UserPermissions } from '../auth/types'
import { joinClasses, uiClasses } from './ui'

type AppShellProps = {
  activeNavigation: NavigationKey
  children: React.ReactNode
  language: AppLanguage
  onLanguageChange: (language: AppLanguage) => void
  onNavigate: (key: NavigationKey) => void
  onBack: () => void
  showBackButton: boolean
  onSignOut?: () => void
  onThemeChange: (theme: AppTheme) => void
  permissions?: UserPermissions
  profile?: ShellProfile
  theme: AppTheme
}

export function AppShell({
  activeNavigation,
  children,
  language,
  onLanguageChange,
  onNavigate,
  onBack,
  showBackButton,
  onSignOut,
  onThemeChange,
  permissions,
  profile,
  theme,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const t = copy[language]
  const isRegisterPage = activeNavigation === 'register'
  const visibleNavigation = navigationItems.filter(({ key }) => isNavigationAllowed(key, profile?.role, permissions))
  const visibleMobileNavigation = mobileNavigationKeys.filter((key) => visibleNavigation.some((item) => item.key === key))

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.shell-popover-wrap')) return
      setProfileOpen(false)
      setThemeOpen(false)
    }
    document.addEventListener('click', onDocumentClick)
    return () => document.removeEventListener('click', onDocumentClick)
  }, [])

  const chooseNavigation = (key: NavigationKey) => {
    onNavigate(key)
    setMobileMenuOpen(false)
  }

  const renderNavigation = (mobile = false) => (
    <nav className={mobile ? 'shell-navigation shell-navigation-mobile' : 'shell-navigation'} aria-label="Main navigation">
      {visibleNavigation.map(({ key, icon: Icon }) => {
        const isActive = activeNavigation === key
        return (
          <button
            className={joinClasses('shell-nav-item', uiClasses.menuItem, isActive && 'is-active')}
            key={key}
            onClick={() => chooseNavigation(key)}
            type="button"
          >
            <Icon size={18} strokeWidth={2} />
            <span>{t.nav[key]}</span>
            {isActive && <ChevronRight className="shell-nav-arrow" size={16} />}
          </button>
        )
      })}
    </nav>
  )

  return (
    <div className="app-shell min-h-svh bg-page font-sans text-copy">
      <aside className="shell-sidebar shell-sidebar-desktop bg-surface">
        <Brand language={language} />
        {renderNavigation()}
        <ProfileSummary language={language} profile={profile} />
      </aside>

      {mobileMenuOpen ? (
        <>
          <button
            aria-label={t.actions.closeMenu}
            className="shell-backdrop bg-black/45"
            onClick={() => setMobileMenuOpen(false)}
            type="button"
          />
          <aside className="shell-sidebar shell-sidebar-mobile bg-surface shadow-float">
            <div className="shell-mobile-drawer-heading">
              <Brand language={language} compact />
              <button className={joinClasses('icon-button', uiClasses.iconButton)} aria-label={t.actions.closeMenu} onClick={() => setMobileMenuOpen(false)} type="button">
                <X size={20} />
              </button>
            </div>
            {renderNavigation(true)}
            <ProfileSummary language={language} profile={profile} />
          </aside>
        </>
      ) : null}

      <main className="shell-main">
        <header className={joinClasses('shell-header sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur-md', isRegisterPage && 'max-[639px]:!shadow-[0_4px_18px_color-mix(in_srgb,var(--primary)_8%,transparent)]')}>
          <div className={joinClasses('shell-header-inner', isRegisterPage && 'max-[639px]:!min-h-[4.25rem] max-[639px]:!gap-2 max-[639px]:!px-3')}>
            {showBackButton ? <button aria-label={t.actions.back} className={joinClasses('icon-button shell-back-button', uiClasses.iconButton)} onClick={onBack} type="button"><ArrowLeft className="shell-back-icon" size={19} /><span className="shell-back-label">{t.actions.back}</span></button> : null}
            <button className={joinClasses('icon-button shell-menu-button', uiClasses.iconButton, isRegisterPage && 'max-[639px]:!size-10 max-[639px]:!rounded-xl')} aria-label={t.actions.openMenu} onClick={() => setMobileMenuOpen(true)} type="button">
              <Menu size={21} />
            </button>
            <div className={joinClasses('shell-header-title', isRegisterPage && 'min-w-0 flex-1 max-[639px]:[&>p]:!text-[0.58rem] max-[639px]:[&>h1]:!text-[1rem] max-[639px]:[&>h1]:!font-extrabold')}>
              <p>{t.page.section}</p>
              <h1>{t.nav[activeNavigation]}</h1>
            </div>

            <div className="shell-header-actions">
              <label className="language-select">
                <span className="sr-only">{t.actions.language}</span>
                <select className={uiClasses.select} value={language} onChange={(event) => onLanguageChange(event.target.value as AppLanguage)}>
                  <option value="te">తెలుగు</option>
                  <option value="en">English</option>
                </select>
              </label>

              <div className="shell-popover-wrap">
                <button
                  aria-expanded={themeOpen}
                  aria-label={t.actions.theme}
                  className={joinClasses('icon-button', uiClasses.iconButton)}
                  onClick={() => {
                    setThemeOpen((open) => !open)
                    setProfileOpen(false)
                  }}
                  type="button"
                >
                  <Palette size={19} />
                </button>
                {themeOpen ? (
                  <div className={joinClasses('shell-popover theme-picker', uiClasses.menu)} role="menu">
                    {(Object.keys(t.themes) as AppTheme[]).map((option) => (
                      <button
                        className={joinClasses('theme-option', uiClasses.menuItem, theme === option && 'is-selected')}
                        key={option}
                        onClick={() => {
                          onThemeChange(option)
                          setThemeOpen(false)
                        }}
                        role="menuitem"
                        type="button"
                      >
                        <span className={`theme-swatch theme-swatch-${option}`} aria-hidden="true" />
                        {t.themes[option]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="shell-popover-wrap">
                <button
                  aria-expanded={profileOpen}
                  aria-label={t.actions.profile}
                  className={joinClasses('profile-trigger', uiClasses.button, 'min-h-9 px-1.5')}
                  onClick={() => {
                    setProfileOpen((open) => !open)
                    setThemeOpen(false)
                  }}
                  type="button"
                >
                  <Avatar language={language} profile={profile} />
                  <ChevronDown className="profile-trigger-arrow" size={14} />
                </button>
                {profileOpen ? <ProfileCard language={language} onSignOut={onSignOut} profile={profile} /> : null}
              </div>
            </div>
          </div>
        </header>

        <div className="shell-page mx-auto w-full max-w-[92rem] px-page-mobile py-4 tablet:px-page tablet:py-6">{children}</div>
      </main>

      <nav className="mobile-bottom-navigation fixed inset-x-0 bottom-0 z-20 grid border-t border-border bg-surface/95 backdrop-blur-md" aria-label="Mobile navigation" style={{ gridTemplateColumns: `repeat(${visibleMobileNavigation.length}, minmax(0, 1fr))` }}>
        {visibleMobileNavigation.map((key) => {
          const item = visibleNavigation.find((navigationItem) => navigationItem.key === key)
          if (!item) return null
          const Icon = item.icon
          return (
            <button className={joinClasses(uiClasses.mobileNavigationItem, activeNavigation === key && 'is-active')} key={key} onClick={() => chooseNavigation(key)} type="button">
              <Icon size={18} />
              <span>{t.mobile[key]}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

function Brand({ language, compact = false }: { language: AppLanguage; compact?: boolean }) {
  const t = copy[language]
  return (
    <div className="brand">
      <img alt="" className="brand-mark brand-logo-mark" src={logoAsset} />
      {!compact || <div className="brand-copy">{t.appName}</div>}
      {compact ? null : (
        <div className="brand-copy">
          <strong>{t.appName}</strong>
          <span>{t.appNameEnglish}</span>
        </div>
      )}
    </div>
  )
}

function Avatar({ language, profile }: { language: AppLanguage; profile?: ShellProfile }) {
  const t = copy[language]
  if (profile?.photoUrl) {
    return <img alt={profile.name ?? t.profile.photo} className="profile-avatar" src={profile.photoUrl} />
  }
  return (
    <span className="profile-avatar profile-avatar-placeholder" aria-label={t.profile.photo}>
      <CircleUserRound size={22} />
    </span>
  )
}

function ProfileSummary({ language, profile }: { language: AppLanguage; profile?: ShellProfile }) {
  const t = copy[language]
  return (
    <div className="sidebar-profile">
      <Avatar language={language} profile={profile} />
      <div>
        <strong>{profile?.name ?? t.actions.profile}</strong>
        <span>{profile?.role ? t.roles[profile.role] : t.profile.unavailable}</span>
      </div>
    </div>
  )
}

function ProfileCard({ language, onSignOut, profile }: { language: AppLanguage; onSignOut?: () => void; profile?: ShellProfile }) {
  const t = copy[language]
  const bannerStyle = profile?.bannerUrl ? { backgroundImage: `url(${profile.bannerUrl})` } : undefined
  return (
    <div className="shell-popover profile-card">
      <div className="profile-card-banner" style={bannerStyle} aria-label={t.profile.banner} />
      <div className="profile-card-body">
        <Avatar language={language} profile={profile} />
        <div>
          <strong>{profile?.name ?? t.actions.profile}</strong>
          {profile?.role ? <span>{t.roles[profile.role]}</span> : <p>{t.profile.unavailable}</p>}
        </div>
      </div>
      {onSignOut ? <button className={joinClasses('profile-sign-out', uiClasses.button, uiClasses.secondaryButton, 'w-[calc(100%-1.5rem)]')} onClick={onSignOut} type="button">{t.actions.signOut}</button> : null}
    </div>
  )
}

function isNavigationAllowed(key: NavigationKey, role: ShellProfile['role'], permissions?: UserPermissions) {
  if (!role || role === 'superAdmin') return true
  if (role === 'admin') {
    if (key === 'targeted') return false
    if (key === 'directory') return false
    if (key === 'audit') return permissions?.audit ?? false
    if (key === 'upload') return permissions?.upload ?? false
    if (key === 'reports') return permissions?.reports ?? false
    return true
  }
  return ['dashboard', 'register', 'settings'].includes(key) || (key === 'reports' && (permissions?.reports ?? false))
}
