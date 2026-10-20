import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, Database, FileText, Gauge, Layers3, MapPinned, RefreshCcw, ShieldCheck, UploadCloud, UsersRound } from 'lucide-react'
import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { AppSession } from '../auth/types'
import type { AppLanguage, NavigationKey } from '../app-shell/types'
import { loadAuditLogs, type AuditEntry } from '../audit-logs/audit-log-service'
import './dashboard.css'
import { loadDashboardSummary, type DashboardRecentUpload, type DashboardSummary } from './dashboard-service'

type DashboardPageProps = {
  language: AppLanguage
  session: AppSession
  onNavigate: (key: NavigationKey, search?: string) => void
}

type DashboardData = {
  summary: DashboardSummary
  pdfs: DashboardRecentUpload[]
  activity: AuditEntry[]
}

const copy = {
  en: {
    label: 'Workspace overview', title: 'Dashboard', description: 'See your voter data, PDF work, coverage, and account access in one place.',
    refresh: 'Refresh', voters: 'Voter records', wards: 'Wards', booths: 'Booths', pdfs: 'Source PDFs', processing: 'PDFs in progress', attention: 'Needs attention',
    voterHint: 'Exact records in your access scope', voterLimit: 'More records load as you scroll in Voter Register', wardsHint: 'Wards in your access scope', boothsHint: 'Booths in your access scope', pdfHint: 'PDF files in your allowed scope', processingHint: 'Queued or currently processing', attentionHint: 'Failed, review, or approval work',
    coverage: 'Data coverage', coverageHint: 'The areas and divisions found in your visible voter data.', areas: 'Areas', divisions: 'Divisions', databaseReady: 'Firebase data connected', databaseHint: 'The dashboard is reading live data.',
    pdfStatus: 'PDF processing status', pdfStatusHint: 'Upload and processing progress for your allowed PDFs.', completed: 'Completed', active: 'Working', review: 'Review / approval', failed: 'Failed', openLibrary: 'Open PDF Library',
    recentUploads: 'Recent PDF uploads', noUploads: 'No PDF uploads in your visible scope.', uploadedBy: 'Uploaded by', openUpload: 'Upload PDF',
    activity: 'Recent activity', noActivity: 'No recent activity is available.', openAudit: 'Open Audit Logs',
    access: 'Your access', role: 'Role', allowedWards: 'Allowed wards', allowedBooths: 'Allowed booths', allWards: 'All wards', allBooths: 'All booths', permissions: 'Permissions', uploadPermission: 'Upload', editPermission: 'Edit', downloadPermission: 'Download', auditPermission: 'Audit', allowed: 'Allowed', notAllowed: 'Not allowed',
    quickActions: 'Quick actions', register: 'Voter Register', library: 'PDF Library', upload: 'Upload PDF', users: 'User Management', audit: 'Audit Logs', profile: 'My Profile',
    superAdmin: 'Super Admin', admin: 'Admin', subMember: 'Sub-member', loading: 'Loading dashboard…', refreshing: 'Refreshing dashboard…', partial: 'Some dashboard sections could not be loaded. Use Refresh or open the related page.',
  },
  te: {
    label: 'వర్క్‌స్పేస్ సమాచారం', title: 'డ్యాష్‌బోర్డ్', description: 'మీ ఓటర్ డేటా, PDF పని, పరిధి మరియు ఖాతా అనుమతులను ఒకే చోట చూడండి.',
    refresh: 'రిఫ్రెష్', voters: 'ఓటర్ రికార్డులు', wards: 'వార్డులు', booths: 'బూత్‌లు', pdfs: 'సోర్స్ PDFలు', processing: 'ప్రాసెస్‌లో ఉన్న PDFలు', attention: 'చర్య అవసరం',
    voterHint: 'మీ పరిధిలోని మొత్తం రికార్డులు', voterLimit: 'ఓటర్ రిజిస్టర్‌లో స్క్రోల్ చేస్తే మరిన్ని రికార్డులు లోడ్ అవుతాయి', wardsHint: 'మీ పరిధిలోని వార్డులు', boothsHint: 'మీ పరిధిలోని బూత్‌లు', pdfHint: 'మీ పరిధిలోని PDF ఫైళ్లు', processingHint: 'క్యూలో లేదా ప్రాసెస్‌లో ఉన్నవి', attentionHint: 'ఫెయిల్, రివ్యూ లేదా ఆమోదం అవసరమైనవి',
    coverage: 'డేటా పరిధి', coverageHint: 'మీకు కనిపించే ఓటర్ డేటాలో ఉన్న ప్రాంతాలు మరియు డివిజన్లు.', areas: 'ప్రాంతాలు', divisions: 'డివిజన్లు', databaseReady: 'Firebase డేటా కనెక్ట్ అయింది', databaseHint: 'డ్యాష్‌బోర్డ్ లైవ్ డేటాను చదువుతోంది.',
    pdfStatus: 'PDF ప్రాసెసింగ్ స్థితి', pdfStatusHint: 'మీ పరిధిలోని PDFల అప్‌లోడ్ మరియు ప్రాసెసింగ్ పురోగతి.', completed: 'పూర్తయినవి', active: 'పనిలో ఉన్నవి', review: 'రివ్యూ / ఆమోదం', failed: 'ఫెయిల్ అయినవి', openLibrary: 'PDF లైబ్రరీ తెరవండి',
    recentUploads: 'ఇటీవలి PDF అప్‌లోడ్‌లు', noUploads: 'మీ పరిధిలో PDF అప్‌లోడ్‌లు లేవు.', uploadedBy: 'అప్‌లోడ్ చేసినవారు', openUpload: 'PDF అప్‌లోడ్',
    activity: 'ఇటీవలి కార్యకలాపాలు', noActivity: 'ఇటీవలి కార్యకలాపాలు లేవు.', openAudit: 'ఆడిట్ లాగ్‌లు తెరవండి',
    access: 'మీ యాక్సెస్', role: 'పాత్ర', allowedWards: 'అనుమతించిన వార్డులు', allowedBooths: 'అనుమతించిన బూత్‌లు', allWards: 'అన్ని వార్డులు', allBooths: 'అన్ని బూత్‌లు', permissions: 'అనుమతులు', uploadPermission: 'అప్‌లోడ్', editPermission: 'సవరణ', downloadPermission: 'డౌన్‌లోడ్', auditPermission: 'ఆడిట్', allowed: 'అనుమతి ఉంది', notAllowed: 'అనుమతి లేదు',
    quickActions: 'త్వరిత చర్యలు', register: 'ఓటర్ రిజిస్టర్', library: 'PDF లైబ్రరీ', upload: 'PDF అప్‌లోడ్', users: 'యూజర్ మేనేజ్‌మెంట్', audit: 'ఆడిట్ లాగ్‌లు', profile: 'నా ప్రొఫైల్',
    superAdmin: 'సూపర్ అడ్మిన్', admin: 'అడ్మిన్', subMember: 'సబ్-మెంబర్', loading: 'డ్యాష్‌బోర్డ్ లోడ్ అవుతోంది…', refreshing: 'డ్యాష్‌బోర్డ్ మళ్లీ లోడ్ అవుతోంది…', partial: 'కొన్ని డ్యాష్‌బోర్డ్ విభాగాలు లోడ్ కాలేదు. రిఫ్రెష్ నొక్కండి లేదా సంబంధిత పేజీని తెరవండి.',
  },
} as const

type DashboardText = { [Key in keyof typeof copy.en]: string }

export function DashboardPage({ language, session, onNavigate }: DashboardPageProps) {
  const t = copy[language]
  const scope = { wardIds: session.profile.scope?.wardIds ?? [], boothIds: session.profile.scope?.boothIds ?? [] }
  const permissions = session.profile.permissions ?? { upload: false, edit: false, download: false, audit: false }
  const [data, setData] = useState<DashboardData>()
  const [loading, setLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setHasError(false)
    const [summary, activity] = await Promise.allSettled([
      loadDashboardSummary(),
      session.profile.role === 'superAdmin' || permissions.audit ? loadAuditLogs() : Promise.resolve({ entries: [] }),
    ])
    const summaryData = summary.status === 'fulfilled' ? summary.value : undefined
    const activityData = activity.status === 'fulfilled' ? activity.value.entries : []
    if (summaryData) setData({ summary: summaryData, pdfs: summaryData.recentUploads, activity: activityData })
    setHasError([summary, activity].some((result) => result.status === 'rejected'))
    setLoading(false)
  }, [permissions.audit, session.profile.role])

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0)
    return () => window.clearTimeout(timer)
  }, [reload])

  const roleLabel = roleName(session.profile.role, t)
  const pdfs = data?.pdfs ?? []
  const statusCounts = data?.summary.sourceStatusCounts ?? {}
  const activePdfs = data?.summary.processingPdfCount ?? countStatuses(statusCounts, ['queued', 'processing', 'approvalQueued', 'applying'])
  const reviewPdfs = countStatuses(statusCounts, ['review', 'awaitingApproval', 'completedWithReview'])
  const failedPdfs = countStatuses(statusCounts, ['failed'])
  const completedPdfs = data?.summary.completedPdfCount ?? countStatuses(statusCounts, ['completed', 'completedWithReview'])
  const needsAttention = reviewPdfs + failedPdfs
  const stats = data ? [
    { icon: <UsersRound size={19} />, value: formatCount(data.summary.voterCount), label: t.voters, hint: t.voterHint, tone: 'blue', target: 'register' as const, search: '' },
    { icon: <MapPinned size={19} />, value: data.summary.wardCount, label: t.wards, hint: t.wardsHint, tone: 'green', target: 'register' as const, search: '' },
    { icon: <Layers3 size={19} />, value: data.summary.boothCount, label: t.booths, hint: t.boothsHint, tone: 'purple', target: 'register' as const, search: '' },
    { icon: <FileText size={19} />, value: data.summary.sourcePdfCount, label: t.pdfs, hint: t.pdfHint, tone: 'orange', target: 'library' as const, search: '' },
    { icon: <Clock3 size={19} />, value: activePdfs, label: t.processing, hint: t.processingHint, tone: 'sky', target: 'library' as const, search: '?view=processing' },
    { icon: <AlertTriangle size={19} />, value: needsAttention, label: t.attention, hint: t.attentionHint, tone: 'red', target: 'library' as const, search: '?view=attention' },
  ] : []

  return <section className="dashboard-page">
    <section className="dashboard-profile-hero dashboard-clickable-panel" aria-label={t.access} onClick={() => onNavigate('settings')} onKeyDown={(event) => activateWithKeyboard(event, () => onNavigate('settings'))} role="button" tabIndex={0}>
      <div className="dashboard-profile-banner">
        {session.bannerUrl ? <img alt="" className="dashboard-profile-banner-image" onError={(event) => { event.currentTarget.style.display = 'none' }} src={session.bannerUrl} /> : null}
      </div>
      <div className="dashboard-profile-identity">
        <div className="dashboard-profile-avatar">
          <span>{initials(session.profile.fullName)}</span>
          {session.profilePhotoUrl ? <img alt={session.profile.fullName} onError={(event) => { event.currentTarget.style.display = 'none' }} src={session.profilePhotoUrl} /> : null}
        </div>
        <div><strong>{session.profile.fullName}</strong><span>{roleLabel}</span></div>
      </div>
    </section>
    <header className="page-intro dashboard-intro">
      <div><p>{t.label}</p><h2>{t.title}</h2><span>{t.description}</span></div>
      <button className="voter-secondary-button" disabled={loading} onClick={() => void reload()} type="button"><RefreshCcw className={loading ? 'animate-spin' : undefined} size={15} />{t.refresh}</button>
    </header>
    {hasError ? <p className="form-alert form-alert-error">{t.partial}</p> : null}
    {loading && !data ? <div className="dashboard-loading"><Gauge className="animate-pulse" size={21} /><span>{t.loading}</span></div> : null}
    {loading && data ? <div aria-live="polite" className="dashboard-refreshing"><Gauge className="animate-spin" size={17} /><span>{t.refreshing}</span></div> : null}
    {data ? <>
      <section className="dashboard-stat-grid">{stats.map((card) => <button className={`dashboard-stat-card dashboard-stat-${card.tone}`} key={card.label} onClick={() => onNavigate(card.target, card.search)} type="button"><span className="dashboard-stat-icon">{card.icon}</span><strong>{card.value}</strong><b>{card.label}</b><small>{card.hint}</small><ArrowUpRight className="dashboard-card-arrow" size={15} /></button>)}</section>

      <section className="dashboard-main-grid">
        <article className="dashboard-panel dashboard-coverage-panel dashboard-clickable-panel" onClick={() => onNavigate('register')} onKeyDown={(event) => activateWithKeyboard(event, () => onNavigate('register'))} role="button" tabIndex={0}>
          <header><div><p>{t.coverage}</p><h3>{data.summary.areaCount + data.summary.divisionCount}</h3></div><MapPinned size={21} /></header>
          <span>{t.coverageHint}</span>
          <div className="dashboard-coverage-list"><div><strong>{data.summary.areaCount}</strong><span>{t.areas}</span></div><div><strong>{data.summary.divisionCount}</strong><span>{t.divisions}</span></div><div><strong>{data.summary.sourcePdfCount}</strong><span>{t.pdfs}</span></div></div>
          <div className="dashboard-connected"><CheckCircle2 size={15} /><div><strong>{t.databaseReady}</strong><span>{t.databaseHint}</span></div></div>
        </article>

        <article className="dashboard-panel dashboard-pdf-status-panel dashboard-clickable-panel" onClick={() => onNavigate('library')} onKeyDown={(event) => activateWithKeyboard(event, () => onNavigate('library'))} role="button" tabIndex={0}>
          <header><div><p>{t.pdfStatus}</p><h3>{data.summary.sourcePdfCount}</h3></div><UploadCloud size={21} /></header>
          <span>{t.pdfStatusHint}</span>
          <div className="dashboard-progress-list"><StatusLine label={t.completed} value={completedPdfs} total={data.summary.sourcePdfCount} tone="success" /><StatusLine label={t.active} value={activePdfs} total={data.summary.sourcePdfCount} tone="primary" /><StatusLine label={t.review} value={reviewPdfs} total={data.summary.sourcePdfCount} tone="warning" /><StatusLine label={t.failed} value={failedPdfs} total={data.summary.sourcePdfCount} tone="danger" /></div>
          <button className="dashboard-link-button" onClick={() => onNavigate('library')} type="button">{t.openLibrary}<ArrowUpRight size={15} /></button>
        </article>
      </section>

      <section className="dashboard-content-grid">
        <article className="dashboard-panel dashboard-list-panel">
          <header><div><p>{t.recentUploads}</p><h3>{pdfs.length}</h3></div><FileText size={21} /></header>
          {pdfs.length === 0 ? <span className="dashboard-empty-line">{t.noUploads}</span> : <div className="dashboard-item-list">{sortByDate(pdfs).slice(0, 5).map((item) => <button className="dashboard-list-item" key={item.id} onClick={() => onNavigate('library', `?source=${encodeURIComponent(item.id)}`)} type="button"><span className={`dashboard-status-dot dashboard-status-${statusTone(item.status)}`} /><div><strong>{item.originalFileName}</strong><span>{t.wards}: {item.wardId || '—'} · {t.booths}: {item.boothId || '—'}</span></div><small>{formatDate(item.createdAt || item.uploadedAt || item.updatedAt, language)}</small></button>)}</div>}
          <button className="dashboard-link-button" onClick={() => onNavigate('library')} type="button">{t.openLibrary}<ArrowUpRight size={15} /></button>
        </article>

        <article className="dashboard-panel dashboard-list-panel">
          <header><div><p>{t.activity}</p><h3>{data.activity.length}</h3></div><Database size={21} /></header>
          {data.activity.length === 0 ? <span className="dashboard-empty-line">{t.noActivity}</span> : <div className="dashboard-item-list">{data.activity.slice(0, 5).map((item) => <button className="dashboard-list-item" key={item.id} onClick={() => onNavigate('audit')} type="button"><span className="dashboard-activity-icon"><ShieldCheck size={14} /></span><div><strong>{item.targetName || item.action}</strong><span>{item.actorName} · {item.action.replaceAll('_', ' ')}</span></div><small>{formatDate(item.createdAt, language)}</small></button>)}</div>}
          {(session.profile.role === 'superAdmin' || permissions.audit) ? <button className="dashboard-link-button" onClick={() => onNavigate('audit')} type="button">{t.openAudit}<ArrowUpRight size={15} /></button> : null}
        </article>
      </section>

      <section className="dashboard-bottom-grid">
        <article className="dashboard-panel dashboard-access-panel dashboard-clickable-panel" onClick={() => onNavigate('settings')} onKeyDown={(event) => activateWithKeyboard(event, () => onNavigate('settings'))} role="button" tabIndex={0}><header><div><p>{t.access}</p><h3>{roleLabel}</h3></div><ShieldCheck size={21} /></header><div className="dashboard-access-summary"><div><span>{t.allowedWards}</span><strong>{scope.wardIds.length ? scope.wardIds.join(', ') : t.allWards}</strong></div><div><span>{t.allowedBooths}</span><strong>{scope.boothIds.length ? scope.boothIds.join(', ') : t.allBooths}</strong></div></div><div className="dashboard-permission-list"><Permission label={t.uploadPermission} allowed={session.profile.role === 'superAdmin' || permissions.upload} t={t} /><Permission label={t.editPermission} allowed={session.profile.role === 'superAdmin' || permissions.edit} t={t} /><Permission label={t.downloadPermission} allowed={session.profile.role === 'superAdmin' || permissions.download} t={t} /><Permission label={t.auditPermission} allowed={session.profile.role === 'superAdmin' || permissions.audit} t={t} /></div></article>
        <article className="dashboard-panel dashboard-quick-panel"><header><div><p>{t.quickActions}</p><h3>{t.title}</h3></div><ArrowUpRight size={21} /></header><nav className="dashboard-quick-actions" aria-label={t.quickActions}><QuickAction icon={<UsersRound size={17} />} label={t.register} onClick={() => onNavigate('register')} /><QuickAction icon={<FileText size={17} />} label={t.library} onClick={() => onNavigate('library')} />{session.profile.role !== 'subMember' && (session.profile.role === 'superAdmin' || permissions.upload) ? <QuickAction icon={<UploadCloud size={17} />} label={t.upload} onClick={() => onNavigate('upload')} /> : null}{session.profile.role === 'superAdmin' || session.profile.role === 'admin' ? <QuickAction icon={<UsersRound size={17} />} label={t.users} onClick={() => onNavigate('users')} /> : null}{session.profile.role === 'superAdmin' || permissions.audit ? <QuickAction icon={<ShieldCheck size={17} />} label={t.audit} onClick={() => onNavigate('audit')} /> : null}<QuickAction icon={<Database size={17} />} label={t.profile} onClick={() => onNavigate('settings')} /></nav></article>
      </section>
    </> : null}
  </section>
}

function StatusLine({ label, value, total, tone }: { label: string; value: number; total: number; tone: 'success' | 'primary' | 'warning' | 'danger' }) {
  const width = total > 0 ? `${Math.round((value / total) * 100)}%` : '0%'
  return <div className="dashboard-status-line"><div><span>{label}</span><strong>{value}</strong></div><div className="dashboard-progress-track"><span className={`dashboard-progress-fill dashboard-progress-${tone}`} style={{ width }} /></div></div>
}

function Permission({ label, allowed, t }: { label: string; allowed: boolean; t: DashboardText }) {
  return <div className="dashboard-permission"><span>{label}</span><strong className={allowed ? 'is-allowed' : 'is-denied'}>{allowed ? t.allowed : t.notAllowed}</strong></div>
}

function QuickAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return <button onClick={onClick} type="button">{icon}{label}<ArrowUpRight size={13} /></button>
}

function roleName(role: AppSession['profile']['role'], t: DashboardText) {
  return role === 'superAdmin' ? t.superAdmin : role === 'admin' ? t.admin : t.subMember
}

function formatCount(value: number) {
  return value.toLocaleString('en-IN')
}

function countStatuses(counts: Record<string, number>, statuses: string[]) {
  return statuses.reduce((total, status) => total + (counts[status] ?? 0), 0)
}

function activateWithKeyboard(event: KeyboardEvent<HTMLElement>, action: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  action()
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts.slice(0, 2).map((part) => part[0]).join('') || 'VS').toUpperCase()
}

function formatDate(value: string | undefined, language: AppLanguage) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(language === 'te' ? 'te-IN' : 'en-IN', { day: '2-digit', month: 'short' }).format(date)
}

function sortByDate(items: DashboardRecentUpload[]) {
  return [...items].sort((first, second) => dateValue(second.createdAt || second.uploadedAt || second.updatedAt) - dateValue(first.createdAt || first.uploadedAt || first.updatedAt))
}

function dateValue(value: string | undefined) {
  const time = value ? new Date(value).getTime() : 0
  return Number.isNaN(time) ? 0 : time
}

function statusTone(status: DashboardRecentUpload['status']) {
  if (status === 'failed') return 'danger'
  if (['review', 'awaitingApproval', 'completedWithReview'].includes(status)) return 'warning'
  if (['queued', 'processing', 'approvalQueued', 'applying'].includes(status)) return 'primary'
  return 'success'
}
