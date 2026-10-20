import { ArrowLeft, ChevronDown, ChevronRight, CircleUserRound, Menu, Palette, X } from 'lucide-react'
import { useState } from 'react'
import logoAsset from '../../assets/voter-space-logo.jpg'
import { copy } from './copy'
import { mobileNavigationKeys, navigationItems } from './navigation'
import type { AppLanguage, AppTheme, NavigationKey, ShellProfile } from './types'
import type { UserPermissions } from '../auth/types'

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
  const visibleNavigation = navigationItems.filter(({ key }) => isNavigationAllowed(key, profile?.role, permissions))

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
            className={`shell-nav-item ${isActive ? 'is-active' : ''}`}
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
    <div className="app-shell">
      <aside className="shell-sidebar shell-sidebar-desktop">
        <Brand language={language} />
        {renderNavigation()}
        <ProfileSummary language={language} profile={profile} />
      </aside>

      {mobileMenuOpen ? (
        <>
          <button
            aria-label={t.actions.closeMenu}
            className="shell-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            type="button"
          />
          <aside className="shell-sidebar shell-sidebar-mobile">
            <div className="shell-mobile-drawer-heading">
              <Brand language={language} compact />
              <button className="icon-button" aria-label={t.actions.closeMenu} onClick={() => setMobileMenuOpen(false)} type="button">
                <X size={20} />
              </button>
            </div>
            {renderNavigation(true)}
            <ProfileSummary language={language} profile={profile} />
          </aside>
        </>
      ) : null}

      <main className="shell-main">
        <header className="shell-header">
          <div className="shell-header-inner">
            {showBackButton ? <button aria-label={t.actions.back} className="icon-button shell-back-button" onClick={onBack} type="button"><ArrowLeft size={19} /></button> : null}
            <button className="icon-button shell-menu-button" aria-label={t.actions.openMenu} onClick={() => setMobileMenuOpen(true)} type="button">
              <Menu size={21} />
            </button>
            <div className="shell-header-title">
              <p>{t.page.section}</p>
              <h1>{t.nav[activeNavigation]}</h1>
            </div>

            <div className="shell-header-actions">
              <label className="language-select">
                <span className="sr-only">{t.actions.language}</span>
                <select value={language} onChange={(event) => onLanguageChange(event.target.value as AppLanguage)}>
                  <option value="te">తెలుగు</option>
                  <option value="en">English</option>
                </select>
              </label>

              <div className="shell-popover-wrap">
                <button
                  aria-expanded={themeOpen}
                  aria-label={t.actions.theme}
                  className="icon-button"
                  onClick={() => {
                    setThemeOpen((open) => !open)
                    setProfileOpen(false)
                  }}
                  type="button"
                >
                  <Palette size={19} />
                </button>
                {themeOpen ? (
                  <div className="shell-popover theme-picker" role="menu">
                    {(Object.keys(t.themes) as AppTheme[]).map((option) => (
                      <button
                        className={`theme-option ${theme === option ? 'is-selected' : ''}`}
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
                  className="profile-trigger"
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

        <div className="shell-page">{children}</div>
      </main>

      <nav className="mobile-bottom-navigation" aria-label="Mobile navigation">
        {mobileNavigationKeys.map((key) => {
          const item = visibleNavigation.find((navigationItem) => navigationItem.key === key)
          if (!item) return null
          const Icon = item.icon
          return (
            <button className={activeNavigation === key ? 'is-active' : ''} key={key} onClick={() => chooseNavigation(key)} type="button">
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
      {onSignOut ? <button className="profile-sign-out" onClick={onSignOut} type="button">{t.actions.signOut}</button> : null}
    </div>
  )
}

function isNavigationAllowed(key: NavigationKey, role: ShellProfile['role'], permissions?: UserPermissions) {
  if (!role || role === 'superAdmin') return true
  if (role === 'admin') {
    if (key === 'audit') return permissions?.audit ?? false
    if (key === 'upload') return permissions?.upload ?? false
    return true
  }
  return ['dashboard', 'register', 'library', 'settings'].includes(key)
}
