import { FileText, KeyRound, RefreshCcw, ShieldCheck, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { AppSession } from '../auth/types'
import { readableFirebaseError } from '../auth/firebase-auth'
import type { AppLanguage } from '../app-shell/types'
import { PageState } from '../app-shell/PageState'
import { loadAuditLogs, type AuditEntry } from './audit-log-service'

type AuditFilter = 'all' | 'user' | 'pdf' | 'permission'

const copy = {
  te: {
    label: 'భద్రత', title: 'ఆడిట్ లాగ్‌లు', description: 'ఖాతా, PDF మరియు అనుమతి మార్పుల చరిత్ర.', own: 'మీ సొంత కార్యకలాపాలు మాత్రమే కనిపిస్తున్నాయి.', refresh: 'రిఫ్రెష్', all: 'అన్నీ', user: 'వినియోగదారు', pdf: 'PDF', permission: 'అనుమతులు', loading: 'కార్యకలాపాలు లోడ్ అవుతున్నాయి…', empty: 'ఈ విభాగంలో ఇంకా కార్యకలాపాలు లేవు.', error: 'ఆడిట్ లాగ్‌లను లోడ్ చేయలేకపోయాము.', retry: 'మళ్లీ ప్రయత్నించండి',
    actions: { account_created: 'ఖాతా సృష్టించారు', account_updated: 'ఖాతా మార్చారు', password_reset_requested: 'పాస్‌వర్డ్ రీసెట్ కోరారు', voter_record_updated: 'ఓటర్ రికార్డు మార్చారు', pdf_import_created: 'PDF దిగుమతి ప్రారంభించారు', pdf_import_row_updated: 'PDF రికార్డు మార్చారు', pdf_import_approval_requested: 'PDF ఆమోదం కోరారు', pdf_import_approved: 'PDF దిగుమతి ఆమోదించారు', pdf_import_retry_requested: 'PDF మళ్లీ ప్రయత్నించారు', pdf_downloaded: 'అసలు PDF డౌన్‌లోడ్ చేశారు' },
  },
  en: {
    label: 'Security', title: 'Audit logs', description: 'History of account, PDF, and permission changes.', own: 'Only your own activity is shown.', refresh: 'Refresh', all: 'All', user: 'Users', pdf: 'PDFs', permission: 'Permissions', loading: 'Loading activity…', empty: 'There is no activity in this section yet.', error: 'Audit logs could not be loaded.', retry: 'Try again',
    actions: { account_created: 'Account created', account_updated: 'Account updated', password_reset_requested: 'Password reset requested', voter_record_updated: 'Voter record updated', pdf_import_created: 'PDF import created', pdf_import_row_updated: 'PDF record updated', pdf_import_approval_requested: 'PDF approval requested', pdf_import_approved: 'PDF import approved', pdf_import_retry_requested: 'PDF retry requested', pdf_downloaded: 'Original PDF downloaded' },
  },
} as const

export function AuditLogPage({ language, session: _session }: { language: AppLanguage; session: AppSession }) {
  const [items, setItems] = useState<AuditEntry[]>()
  const [ownActivityOnly, setOwnActivityOnly] = useState(false)
  const [filter, setFilter] = useState<AuditFilter>('all')
  const [error, setError] = useState<string>()
  const [refreshing, setRefreshing] = useState(false)
  const t = copy[language]

  const reload = async () => {
    setRefreshing(true); setError(undefined)
    try {
      const result = await loadAuditLogs()
      setItems(result.entries)
      setOwnActivityOnly(result.ownActivityOnly)
    } catch (reason) {
      setError(readableFirebaseError(reason))
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0)
    return () => window.clearTimeout(timer)
  }, [])
  const visible = useMemo(() => (items ?? []).filter((item) => filter === 'all' || category(item) === filter), [filter, items])

  return <section className="audit-page"><header className="page-intro audit-intro"><div><p>{t.label}</p><h2>{t.title}</h2><span>{t.description}</span></div><button className="voter-secondary-button" onClick={() => void reload()} type="button"><RefreshCcw className={refreshing ? 'animate-spin' : undefined} size={15} />{t.refresh}</button></header>
    {ownActivityOnly ? <p className="form-alert form-alert-info">{t.own}</p> : null}
    <div className="audit-filter-bar" aria-label="Audit filters">{(['all', 'user', 'pdf', 'permission'] as AuditFilter[]).map((option) => <button className={filter === option ? 'is-active' : ''} key={option} onClick={() => setFilter(option)} type="button">{t[option]}</button>)}</div>
    {items === undefined && !error ? <PageState kind="loading" title={t.loading} description="" /> : null}
    {error ? <PageState kind="error" title={t.error} description={error} actionLabel={t.retry} onAction={() => void reload()} /> : null}
    {items !== undefined && !error ? <div className="audit-list-card">
      {visible.length === 0 ? <p className="audit-empty">{t.empty}</p> : null}
      {visible.map((item) => <article className="audit-row" key={item.id}><span>{iconFor(item)}</span><div><strong>{actionText(item, language)}</strong><p>{item.actorName || '—'} → {item.targetName || '—'}</p>{detailText(item, language) ? <small>{detailText(item, language)}</small> : null}</div><time>{formatDate(item.createdAt, language)}</time></article>)}
    </div> : null}
  </section>
}

function category(item: AuditEntry): AuditFilter {
  if (item.action === 'account_updated' && isObject(item.details.changes) && isObject(item.details.changes.permissions)) return 'permission'
  if (item.action.startsWith('pdf_')) return 'pdf'
  return 'user'
}

function iconFor(item: AuditEntry) {
  if (category(item) === 'permission') return <ShieldCheck size={18} />
  if (category(item) === 'pdf') return <FileText size={18} />
  if (item.action === 'password_reset_requested') return <KeyRound size={18} />
  return <UserRound size={18} />
}

function actionText(item: AuditEntry, language: AppLanguage) {
  const label = (copy[language].actions as Record<string, string>)[item.action]
  return label ?? item.action.replaceAll('_', ' ')
}

function detailText(item: AuditEntry, language: AppLanguage) {
  const changes = isObject(item.details.changes) ? item.details.changes : undefined
  if (!changes) return ''
  const labels: Record<string, string> = language === 'te'
    ? { fullName: 'పేరు', email: 'ఇమెయిల్', mobile: 'మొబైల్', status: 'స్థితి', wardIds: 'వార్డులు', boothIds: 'బూత్‌లు', permissions: 'అనుమతులు', profilePhoto: 'ప్రొఫైల్ ఫోటో', banner: 'బ్యానర్' }
    : { fullName: 'name', email: 'email', mobile: 'mobile', status: 'status', wardIds: 'wards', boothIds: 'booths', permissions: 'permissions', profilePhoto: 'profile photo', banner: 'banner' }
  const keys = Object.keys(changes).map((key) => labels[key] ?? key)
  return keys.length ? `${language === 'te' ? 'మార్చినవి' : 'Changed'}: ${keys.join(', ')}` : ''
}

function isObject(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
function formatDate(value: string | undefined, language: AppLanguage) { return value ? new Intl.DateTimeFormat(language === 'te' ? 'te-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—' }
