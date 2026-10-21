import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, Database, FileText, Layers3, MapPinned, ShieldCheck, UploadCloud, UsersRound } from 'lucide-react'
import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { AppSession } from '../auth/types'
import { joinClasses, uiClasses } from '../app-shell/ui'
import type { AppLanguage, NavigationKey } from '../app-shell/types'
import { loadAuditLogs, type AuditEntry } from '../audit-logs/audit-log-service'
import './dashboard.css'
import { dashboardMetricNames, loadDashboardMetric, type DashboardMetric, type DashboardMetricResult, type DashboardRecentUpload } from './dashboard-service'

type DashboardPageProps = {
  language: AppLanguage
  session: AppSession
  onNavigate: (key: NavigationKey, search?: string) => void
}

type DashboardMetrics = {
  voterCount?: number
  wardCount?: number
  boothCount?: number
  areaCount?: number
  divisionCount?: number
  sourcePdfCount?: number
  completedPdfCount?: number
  processingPdfCount?: number
  attentionCount?: number
  sourceStatusCounts?: Record<string, number>
  recentUploads?: DashboardRecentUpload[]
}

const copy = {
  en: {
    title: 'Dashboard',
    refresh: 'Refresh', voters: 'Voter records', wards: 'Wards', booths: 'Booths', pdfs: 'Source PDFs', processing: 'PDFs in progress', attention: 'Needs attention',
    voterHint: 'Exact records in your access scope', voterLimit: 'More records load as you scroll in Voter Register', wardsHint: 'Wards in your access scope', boothsHint: 'Booths in your access scope', pdfHint: 'PDF files in your allowed scope', processingHint: 'Queued or currently processing', attentionHint: 'Failed, review, or approval work',
    coverage: 'Data coverage', coverageHint: 'The areas and divisions found in your visible voter data.', areas: 'Areas', divisions: 'Divisions', databaseReady: 'Firebase data connected', databaseHint: 'The dashboard is reading live data.',
    pdfStatus: 'PDF processing status', pdfStatusHint: 'Upload and processing progress for your allowed PDFs.', completed: 'Completed', active: 'Working', review: 'Review / approval', failed: 'Failed', openUpload: 'Open PDF Upload',
    recentUploads: 'Recent PDF uploads', noUploads: 'No PDF uploads in your visible scope.', uploadedBy: 'Uploaded by',
    activity: 'Recent activity', noActivity: 'No recent activity is available.', openAudit: 'Open Audit Logs',
    access: 'Your access', role: 'Role', allowedWards: 'Allowed wards', allowedBooths: 'Allowed booths', allWards: 'All wards', allBooths: 'All booths', permissions: 'Permissions', uploadPermission: 'Upload', editPermission: 'Edit', downloadPermission: 'Download', auditPermission: 'Audit', allowed: 'Allowed', notAllowed: 'Not allowed',
    quickActions: 'Quick actions', register: 'Voter Register', upload: 'Upload PDF', users: 'User Management', audit: 'Audit Logs', profile: 'My Profile',
    superAdmin: 'Super Admin', admin: 'Admin', subMember: 'Sub-member', loading: 'Loading dashboard…', refreshing: 'Refreshing dashboard…', partial: 'Some dashboard sections could not be loaded. Use Refresh or open the related page.',
  },
  te: {
    title: 'డ్యాష్‌బోర్డ్',
    refresh: 'రిఫ్రెష్', voters: 'ఓటర్ రికార్డులు', wards: 'వార్డులు', booths: 'బూత్‌లు', pdfs: 'సోర్స్ PDFలు', processing: 'ప్రాసెస్‌లో ఉన్న PDFలు', attention: 'చర్య అవసరం',
    voterHint: 'మీ పరిధిలోని మొత్తం రికార్డులు', voterLimit: 'ఓటర్ రిజిస్టర్‌లో స్క్రోల్ చేస్తే మరిన్ని రికార్డులు లోడ్ అవుతాయి', wardsHint: 'మీ పరిధిలోని వార్డులు', boothsHint: 'మీ పరిధిలోని బూత్‌లు', pdfHint: 'మీ పరిధిలోని PDF ఫైళ్లు', processingHint: 'క్యూలో లేదా ప్రాసెస్‌లో ఉన్నవి', attentionHint: 'ఫెయిల్, రివ్యూ లేదా ఆమోదం అవసరమైనవి',
    coverage: 'డేటా పరిధి', coverageHint: 'మీకు కనిపించే ఓటర్ డేటాలో ఉన్న ప్రాంతాలు మరియు డివిజన్లు.', areas: 'ప్రాంతాలు', divisions: 'డివిజన్లు', databaseReady: 'Firebase డేటా కనెక్ట్ అయింది', databaseHint: 'డ్యాష్‌బోర్డ్ లైవ్ డేటాను చదువుతోంది.',
    pdfStatus: 'PDF ప్రాసెసింగ్ స్థితి', pdfStatusHint: 'మీ పరిధిలోని PDFల అప్‌లోడ్ మరియు ప్రాసెసింగ్ పురోగతి.', completed: 'పూర్తయినవి', active: 'పనిలో ఉన్నవి', review: 'రివ్యూ / ఆమోదం', failed: 'ఫెయిల్ అయినవి', openUpload: 'PDF అప్‌లోడ్ తెరవండి',
    recentUploads: 'ఇటీవలి PDF అప్‌లోడ్‌లు', noUploads: 'మీ పరిధిలో PDF అప్‌లోడ్‌లు లేవు.', uploadedBy: 'అప్‌లోడ్ చేసినవారు',
    activity: 'ఇటీవలి కార్యకలాపాలు', noActivity: 'ఇటీవలి కార్యకలాపాలు లేవు.', openAudit: 'ఆడిట్ లాగ్‌లు తెరవండి',
    access: 'మీ యాక్సెస్', role: 'పాత్ర', allowedWards: 'అనుమతించిన వార్డులు', allowedBooths: 'అనుమతించిన బూత్‌లు', allWards: 'అన్ని వార్డులు', allBooths: 'అన్ని బూత్‌లు', permissions: 'అనుమతులు', uploadPermission: 'అప్‌లోడ్', editPermission: 'సవరణ', downloadPermission: 'డౌన్‌లోడ్', auditPermission: 'ఆడిట్', allowed: 'అనుమతి ఉంది', notAllowed: 'అనుమతి లేదు',
    quickActions: 'త్వరిత చర్యలు', register: 'ఓటర్ రిజిస్టర్', upload: 'PDF అప్‌లోడ్', users: 'యూజర్ మేనేజ్‌మెంట్', audit: 'ఆడిట్ లాగ్‌లు', profile: 'నా ప్రొఫైల్',
    superAdmin: 'సూపర్ అడ్మిన్', admin: 'అడ్మిన్', subMember: 'సబ్-మెంబర్', loading: 'డ్యాష్‌బోర్డ్ లోడ్ అవుతోంది…', refreshing: 'డ్యాష్‌బోర్డ్ మళ్లీ లోడ్ అవుతోంది…', partial: 'కొన్ని డ్యాష్‌బోర్డ్ విభాగాలు లోడ్ కాలేదు. రిఫ్రెష్ నొక్కండి లేదా సంబంధిత పేజీని తెరవండి.',
  },
} as const

type DashboardText = { [Key in keyof typeof copy.en]: string }

export function DashboardPage({ language, session, onNavigate }: DashboardPageProps) {
  const t = copy[language]
  const scope = { wardIds: session.profile.scope?.wardIds ?? [], boothIds: session.profile.scope?.boothIds ?? [] }
  const permissions = session.profile.permissions ?? { upload: false, edit: false, download: false, audit: false }
  const [metrics, setMetrics] = useState<DashboardMetrics>({})
  const [metricLoading, setMetricLoading] = useState<Partial<Record<DashboardMetric, boolean>>>({})
  const [activity, setActivity] = useState<AuditEntry[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState(false)
  const [hasError, setHasError] = useState(false)

  const reload = useCallback(async (force = false) => {
    setHasError(false)
    setMetricLoading(Object.fromEntries(dashboardMetricNames.map((metric) => [metric, true])) as Partial<Record<DashboardMetric, boolean>>)
    setActivityError(false)
    const metricRequests = dashboardMetricNames.map(async (metric) => {
      try {
        const result = await loadDashboardMetric(metric, { force })
        setMetrics((current) => applyMetricResult(current, result))
      } catch {
        setHasError(true)
      } finally {
        setMetricLoading((current) => ({ ...current, [metric]: false }))
      }
    })

    const canReadActivity = session.profile.role === 'superAdmin' || permissions.audit
    setActivityLoading(canReadActivity)
    const activityRequest = canReadActivity ? loadAuditLogs({ force }) : Promise.resolve({ entries: [] as AuditEntry[] })
    const activityTask = activityRequest.then((result) => {
      setActivity(result.entries)
    }).catch(() => {
      setActivityError(true)
      setHasError(true)
    }).finally(() => {
      setActivityLoading(false)
    })

    await Promise.all([...metricRequests, activityTask])
  }, [permissions.audit, session.profile.role])

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0)
    return () => window.clearTimeout(timer)
  }, [reload])

  const roleLabel = roleName(session.profile.role, t)
  const pdfs = metrics.recentUploads ?? []
  const statusCounts = metrics.sourceStatusCounts ?? {}
  const activePdfs = metrics.processingPdfCount
  const reviewPdfs = countStatuses(statusCounts, ['review', 'awaitingApproval', 'completedWithReview'])
  const failedPdfs = countStatuses(statusCounts, ['failed'])
  const completedPdfs = metrics.completedPdfCount
  const needsAttention = metrics.attentionCount
  const stats = [
    { metric: 'voterCount' as const, icon: <UsersRound size={19} />, value: metrics.voterCount, label: t.voters, hint: t.voterHint, tone: 'blue', target: 'register' as const, search: '' },
    { metric: 'wardCount' as const, icon: <MapPinned size={19} />, value: metrics.wardCount, label: t.wards, hint: t.wardsHint, tone: 'green', target: 'register' as const, search: '' },
    { metric: 'boothCount' as const, icon: <Layers3 size={19} />, value: metrics.boothCount, label: t.booths, hint: t.boothsHint, tone: 'purple', target: 'register' as const, search: '' },
    { metric: 'sourcePdfCount' as const, icon: <FileText size={19} />, value: metrics.sourcePdfCount, label: t.pdfs, hint: t.pdfHint, tone: 'orange', target: 'upload' as const, search: '' },
    { metric: 'processingPdfCount' as const, icon: <Clock3 size={19} />, value: activePdfs, label: t.processing, hint: t.processingHint, tone: 'sky', target: 'upload' as const, search: '' },
    { metric: 'attentionCount' as const, icon: <AlertTriangle size={19} />, value: needsAttention, label: t.attention, hint: t.attentionHint, tone: 'red', target: 'upload' as const, search: '' },
  ]
  const coverageTotal = metrics.areaCount !== undefined && metrics.divisionCount !== undefined ? metrics.areaCount + metrics.divisionCount : undefined
  const sourcePdfCount = metrics.sourcePdfCount
  const isMetricLoading = (metric: DashboardMetric) => metricLoading[metric] === true

  return <section className="dashboard-page grid gap-4 font-sans text-copy">
    <section className={joinClasses('dashboard-profile-hero dashboard-clickable-panel', uiClasses.card, 'cursor-pointer overflow-hidden transition hover:-translate-y-0.5')} aria-label={t.access} onClick={() => onNavigate('settings')} onKeyDown={(event) => activateWithKeyboard(event, () => onNavigate('settings'))} role="button" tabIndex={0}>
      <div className="dashboard-profile-banner aspect-[1600/340] overflow-hidden">
        {session.bannerUrl ? <img alt="" className="dashboard-profile-banner-image size-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none' }} src={session.bannerUrl} /> : null}
        <span className="dashboard-profile-banner-mark">Voter Space</span>
      </div>
      <div className="dashboard-profile-identity flex items-center gap-4 bg-surface">
        <div className="dashboard-profile-avatar shrink-0">
          <span>{initials(session.profile.fullName)}</span>
          {session.profilePhotoUrl ? <img alt={session.profile.fullName} onError={(event) => { event.currentTarget.style.display = 'none' }} src={session.profilePhotoUrl} /> : null}
        </div>
        <div><small>Workspace profile</small><strong>{session.profile.fullName}</strong><span>{roleLabel}</span></div>
      </div>
    </section>
    {hasError ? <p className="form-alert form-alert-error">{t.partial}</p> : null}
    <section className="dashboard-stat-grid grid grid-cols-2 gap-3 tablet:grid-cols-3 shell:grid-cols-6">{stats.map((card) => <button className={joinClasses(`dashboard-stat-card dashboard-stat-${card.tone}`, uiClasses.card, 'relative text-left transition hover:-translate-y-0.5')} key={card.label} onClick={() => onNavigate(card.target, card.search)} type="button"><span className="dashboard-stat-icon inline-grid size-9 place-items-center rounded-xl bg-nav-active text-primary-strong">{card.icon}</span><strong><MetricValue loading={isMetricLoading(card.metric)} value={card.value} /></strong><b>{card.label}</b><small>{card.hint}</small><ArrowUpRight className="dashboard-card-arrow" size={15} /></button>)}</section>

      <section className="dashboard-main-grid grid gap-3 shell:grid-cols-2">
        <article className={joinClasses('dashboard-panel dashboard-coverage-panel dashboard-clickable-panel', uiClasses.card, 'cursor-pointer transition hover:-translate-y-0.5')} onClick={() => onNavigate('register')} onKeyDown={(event) => activateWithKeyboard(event, () => onNavigate('register'))} role="button" tabIndex={0}>
          <header><div><p>{t.coverage}</p><h3><MetricValue loading={isMetricLoading('areaCount') || isMetricLoading('divisionCount')} value={coverageTotal} /></h3></div><MapPinned size={21} /></header>
          <span>{t.coverageHint}</span>
          <div className="dashboard-coverage-list"><div><strong><MetricValue loading={isMetricLoading('areaCount')} value={metrics.areaCount} /></strong><span>{t.areas}</span></div><div><strong><MetricValue loading={isMetricLoading('divisionCount')} value={metrics.divisionCount} /></strong><span>{t.divisions}</span></div><div><strong><MetricValue loading={isMetricLoading('sourcePdfCount')} value={sourcePdfCount} /></strong><span>{t.pdfs}</span></div></div>
          <div className="dashboard-connected"><CheckCircle2 size={15} /><div><strong>{t.databaseReady}</strong><span>{t.databaseHint}</span></div></div>
        </article>

        <article className={joinClasses('dashboard-panel dashboard-pdf-status-panel dashboard-clickable-panel', uiClasses.card, 'cursor-pointer transition hover:-translate-y-0.5')} onClick={() => onNavigate('upload')} onKeyDown={(event) => activateWithKeyboard(event, () => onNavigate('upload'))} role="button" tabIndex={0}>
          <header><div><p>{t.pdfStatus}</p><h3><MetricValue loading={isMetricLoading('sourcePdfCount')} value={sourcePdfCount} /></h3></div><UploadCloud size={21} /></header>
          <span>{t.pdfStatusHint}</span>
          <div className="dashboard-progress-list"><StatusLine label={t.completed} loading={isMetricLoading('completedPdfCount')} value={completedPdfs} total={sourcePdfCount} tone="success" /><StatusLine label={t.active} loading={isMetricLoading('processingPdfCount')} value={activePdfs} total={sourcePdfCount} tone="primary" /><StatusLine label={t.review} loading={isMetricLoading('sourceStatusCounts')} value={reviewPdfs} total={sourcePdfCount} tone="warning" /><StatusLine label={t.failed} loading={isMetricLoading('sourceStatusCounts')} value={failedPdfs} total={sourcePdfCount} tone="danger" /></div>
          <button className="dashboard-link-button" onClick={() => onNavigate('upload')} type="button">{t.openUpload}<ArrowUpRight size={15} /></button>
        </article>
      </section>

      <section className="dashboard-content-grid grid gap-3 shell:grid-cols-2">
        <article className={joinClasses('dashboard-panel dashboard-list-panel', uiClasses.card)}>
          <header><div><p>{t.recentUploads}</p><h3><MetricValue loading={isMetricLoading('recentUploads')} value={metrics.recentUploads?.length} /></h3></div><FileText size={21} /></header>
          {isMetricLoading('recentUploads') ? <DashboardPanelPlaceholder /> : pdfs.length === 0 ? <span className="dashboard-empty-line">{t.noUploads}</span> : <div className="dashboard-item-list">{sortByDate(pdfs).slice(0, 5).map((item) => <button className="dashboard-list-item" key={item.id} onClick={() => onNavigate('upload')} type="button"><span className={`dashboard-status-dot dashboard-status-${statusTone(item.status)}`} /><div><strong>{item.originalFileName}</strong><span>{t.wards}: {item.wardId || '—'} · {t.booths}: {item.boothId || '—'}</span></div><small>{formatDate(item.createdAt || item.uploadedAt || item.updatedAt, language)}</small></button>)}</div>}
          <button className="dashboard-link-button" onClick={() => onNavigate('upload')} type="button">{t.openUpload}<ArrowUpRight size={15} /></button>
        </article>

        <article className={joinClasses('dashboard-panel dashboard-list-panel', uiClasses.card)}>
          <header><div><p>{t.activity}</p><h3><MetricValue loading={activityLoading} value={activity.length} /></h3></div><Database size={21} /></header>
          {activityLoading ? <DashboardPanelPlaceholder /> : activityError ? <span className="dashboard-empty-line">{t.partial}</span> : activity.length === 0 ? <span className="dashboard-empty-line">{t.noActivity}</span> : <div className="dashboard-item-list">{activity.slice(0, 5).map((item) => <button className="dashboard-list-item" key={item.id} onClick={() => onNavigate('audit')} type="button"><span className="dashboard-activity-icon"><ShieldCheck size={14} /></span><div><strong>{item.targetName || item.action}</strong><span>{item.actorName} · {item.action.replaceAll('_', ' ')}</span></div><small>{formatDate(item.createdAt, language)}</small></button>)}</div>}
          {(session.profile.role === 'superAdmin' || permissions.audit) ? <button className="dashboard-link-button" onClick={() => onNavigate('audit')} type="button">{t.openAudit}<ArrowUpRight size={15} /></button> : null}
        </article>
      </section>

      <section className="dashboard-bottom-grid grid gap-3 shell:grid-cols-2">
        <article className={joinClasses('dashboard-panel dashboard-access-panel dashboard-clickable-panel', uiClasses.card, 'cursor-pointer transition hover:-translate-y-0.5')} onClick={() => onNavigate('settings')} onKeyDown={(event) => activateWithKeyboard(event, () => onNavigate('settings'))} role="button" tabIndex={0}><header><div><p>{t.access}</p><h3>{roleLabel}</h3></div><ShieldCheck size={21} /></header><div className="dashboard-access-summary"><div><span>{t.allowedWards}</span><strong>{scope.wardIds.length ? scope.wardIds.join(', ') : t.allWards}</strong></div><div><span>{t.allowedBooths}</span><strong>{scope.boothIds.length ? scope.boothIds.join(', ') : t.allBooths}</strong></div></div><div className="dashboard-permission-list"><Permission label={t.uploadPermission} allowed={session.profile.role === 'superAdmin' || permissions.upload} t={t} /><Permission label={t.editPermission} allowed={session.profile.role === 'superAdmin' || permissions.edit} t={t} /><Permission label={t.downloadPermission} allowed={session.profile.role === 'superAdmin' || permissions.download} t={t} /><Permission label={t.auditPermission} allowed={session.profile.role === 'superAdmin' || permissions.audit} t={t} /></div></article>
        <article className={joinClasses('dashboard-panel dashboard-quick-panel', uiClasses.card)}><header><div><p>{t.quickActions}</p><h3>{t.title}</h3></div><ArrowUpRight size={21} /></header><nav className="dashboard-quick-actions" aria-label={t.quickActions}><QuickAction icon={<UsersRound size={17} />} label={t.register} onClick={() => onNavigate('register')} />{session.profile.role !== 'subMember' && (session.profile.role === 'superAdmin' || permissions.upload) ? <QuickAction icon={<UploadCloud size={17} />} label={t.upload} onClick={() => onNavigate('upload')} /> : null}{session.profile.role === 'superAdmin' || session.profile.role === 'admin' ? <QuickAction icon={<UsersRound size={17} />} label={t.users} onClick={() => onNavigate('users')} /> : null}{session.profile.role === 'superAdmin' || permissions.audit ? <QuickAction icon={<ShieldCheck size={17} />} label={t.audit} onClick={() => onNavigate('audit')} /> : null}<QuickAction icon={<Database size={17} />} label={t.profile} onClick={() => onNavigate('settings')} /></nav></article>
      </section>
  </section>
}

function StatusLine({ label, loading, value, total, tone }: { label: string; loading: boolean; value?: number; total?: number; tone: 'success' | 'primary' | 'warning' | 'danger' }) {
  const width = value !== undefined && total !== undefined && total > 0 ? `${Math.min(100, Math.round((value / total) * 100))}%` : '0%'
  return <div className="dashboard-status-line"><div><span>{label}</span><strong><MetricValue loading={loading} value={value} /></strong></div><div className="dashboard-progress-track"><span className={`dashboard-progress-fill dashboard-progress-${tone}`} style={{ width }} /></div></div>
}

function applyMetricResult(current: DashboardMetrics, result: DashboardMetricResult): DashboardMetrics {
  switch (result.metric) {
    case 'sourceStatusCounts': return { ...current, sourceStatusCounts: result.value as Record<string, number> }
    case 'recentUploads': return { ...current, recentUploads: result.value as DashboardRecentUpload[] }
    case 'voterCount': return { ...current, voterCount: result.value as number }
    case 'wardCount': return { ...current, wardCount: result.value as number }
    case 'boothCount': return { ...current, boothCount: result.value as number }
    case 'areaCount': return { ...current, areaCount: result.value as number }
    case 'divisionCount': return { ...current, divisionCount: result.value as number }
    case 'sourcePdfCount': return { ...current, sourcePdfCount: result.value as number }
    case 'completedPdfCount': return { ...current, completedPdfCount: result.value as number }
    case 'processingPdfCount': return { ...current, processingPdfCount: result.value as number }
    case 'attentionCount': return { ...current, attentionCount: result.value as number }
  }
}

function MetricValue({ loading, value }: { loading: boolean; value?: number }) {
  if (loading) return <span aria-label="Loading" className="dashboard-metric-skeleton inline-block animate-pulse rounded-md" />
  return value === undefined ? '—' : formatCount(value)
}

function DashboardPanelPlaceholder() {
  return <div aria-hidden="true" className="dashboard-panel-placeholder grid min-h-32 content-center gap-3"><span className="block h-3 animate-pulse rounded-md" /><span className="block h-3 w-3/4 animate-pulse rounded-md" /><span className="block h-3 w-1/2 animate-pulse rounded-md" /></div>
}

function Permission({ label, allowed, t }: { label: string; allowed: boolean; t: DashboardText }) {
  return <div className="dashboard-permission"><span>{label}</span><strong className={allowed ? 'is-allowed' : 'is-denied'}>{allowed ? t.allowed : t.notAllowed}</strong></div>
}

function QuickAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={joinClasses(uiClasses.button, uiClasses.secondaryButton, 'min-h-10 justify-start bg-surface-muted text-xs')} onClick={onClick} type="button">{icon}{label}<ArrowUpRight className="ml-auto" size={13} /></button>
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
