import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from './modules/app-shell/AppShell'
import { copy } from './modules/app-shell/copy'
import { PageState } from './modules/app-shell/PageState'
import { navigationForPath, pathForNavigation } from './modules/app-shell/routes'
import type { AppLanguage, AppTheme, NavigationKey } from './modules/app-shell/types'
import { LoginPage } from './modules/auth/LoginPage'
import { ProfilePage } from './modules/auth/ProfilePage'
import { signOutUser } from './modules/auth/firebase-auth'
import { useSession } from './modules/auth/use-session'
import { UserManagementPage } from './modules/user-management/UserManagementPage'
import { AuditLogPage } from './modules/audit-logs/AuditLogPage'
import { DashboardPage } from './modules/dashboard/DashboardPage'

const VoterRegisterPage = lazy(() => import('./modules/voter-register/VoterRegisterPage').then((module) => ({ default: module.VoterRegisterPage })))
const PdfImportPage = lazy(() => import('./modules/pdf-import/PdfImportPage').then((module) => ({ default: module.PdfImportPage })))
const PdfLibraryPage = lazy(() => import('./modules/pdf-library/PdfLibraryPage').then((module) => ({ default: module.PdfLibraryPage })))

const languageStorageKey = 'voter-space-language'
const themeStorageKey = 'voter-space-theme'

function getStoredLanguage(): AppLanguage {
  const saved = localStorage.getItem(languageStorageKey)
  return saved === 'en' ? 'en' : 'te'
}

function getStoredTheme(): AppTheme {
  const saved = localStorage.getItem(themeStorageKey)
  if (saved === 'sky' || saved === 'dark' || saved === 'green') return saved
  return 'green'
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [language, setLanguage] = useState<AppLanguage>(getStoredLanguage)
  const [theme, setTheme] = useState<AppTheme>(getStoredTheme)
  const sessionState = useSession()
  const t = copy[language]
  const activeNavigation = navigationForPath(location.pathname) ?? 'dashboard'
  const isDashboard = activeNavigation === 'dashboard'

  useEffect(() => {
    if (sessionState.status === 'signedOut' && location.pathname !== '/login') {
      navigate('/login', { replace: true })
    }
  }, [location.pathname, navigate, sessionState.status])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(themeStorageKey, theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem(languageStorageKey, language)
    document.documentElement.lang = language === 'te' ? 'te' : 'en'
  }, [language])

  if (sessionState.status === 'loading') {
    return <main className="auth-page"><PageState kind="loading" title={t.states.loading.title} description={t.states.loading.description} /></main>
  }

  if (sessionState.status === 'signedOut') {
    return <LoginPage language={language} message={sessionState.message} onLanguageChange={setLanguage} />
  }

  if (location.pathname === '/login') return <Navigate replace to={pathForNavigation('dashboard')} />
  if (!navigationForPath(location.pathname)) return <Navigate replace to={pathForNavigation('dashboard')} />

  const session = sessionState.session
  const isUserManagement = activeNavigation === 'users'
  const isProfile = activeNavigation === 'settings'
  const isAudit = activeNavigation === 'audit'
  const isVoterRegister = activeNavigation === 'register'
  const isPdfUpload = activeNavigation === 'upload'
  const isPdfLibrary = activeNavigation === 'library'
  const navigateTo = (key: NavigationKey) => {
    const target = pathForNavigation(key)
    if (location.pathname !== target || location.search) navigate(target)
  }
  const goBack = () => {
    if (location.key !== 'default' && window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate(pathForNavigation('dashboard'), { replace: true })
  }

  return (
    <AppShell
      activeNavigation={activeNavigation}
      language={language}
      onLanguageChange={setLanguage}
      onBack={goBack}
      onNavigate={navigateTo}
      onSignOut={() => void signOutUser()}
      onThemeChange={setTheme}
      showBackButton={activeNavigation !== 'dashboard'}
      permissions={session.profile.permissions}
      profile={{
        name: session.profile.fullName,
        role: session.profile.role,
        photoUrl: session.profilePhotoUrl,
        bannerUrl: session.bannerUrl,
      }}
      theme={theme}
    >
      {isUserManagement ? <UserManagementPage language={language} session={session} /> : isProfile ? <ProfilePage language={language} session={session} /> : isAudit ? <AuditLogPage language={language} session={session} /> : isVoterRegister ? <Suspense fallback={<PageState kind="loading" title={t.states.loading.title} description={t.states.loading.description} />}><VoterRegisterPage language={language} session={session} /></Suspense> : isPdfUpload ? <Suspense fallback={<PageState kind="loading" title={t.states.loading.title} description={t.states.loading.description} />}><PdfImportPage language={language} session={session} /></Suspense> : isPdfLibrary ? <Suspense fallback={<PageState kind="loading" title={t.states.loading.title} description={t.states.loading.description} />}><PdfLibraryPage language={language} session={session} /></Suspense> : isDashboard ? <DashboardPage language={language} onNavigate={navigateTo} session={session} /> : <>
        <section className="page-intro">
          <p>{t.page.section}</p>
          <h2>{isDashboard ? t.page.dashboardTitle : t.nav[activeNavigation]}</h2>
          <span>{isDashboard ? t.page.dashboardDescription : t.page.moduleDescription}</span>
        </section>
        <PageState description={isDashboard ? t.states.empty.description : t.page.moduleDescription} kind="empty" title={isDashboard ? t.states.empty.title : t.page.moduleTitle} />
      </>}
    </AppShell>
  )
}

export default App
