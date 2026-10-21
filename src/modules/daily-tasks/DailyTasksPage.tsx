import { ClipboardCheck, FileClock, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { AppLanguage } from '../app-shell/types'
import { readableFirebaseError } from '../auth/firebase-auth'
import { PageState } from '../app-shell/PageState'
import { loadDailyTasks, type DailyTask } from './daily-task-service'

const copy = {
  te: { label: 'రోజువారీ ప్లాన్', title: 'రోజువారీ పనులు', description: 'మీ వార్డు మరియు బూత్‌కు సంబంధించిన అత్యవసర PDF మరియు డేటా రివ్యూ పనులు.', refresh: 'రిఫ్రెష్', all: 'అన్ని పనులు', high: 'అత్యవసరం', normal: 'సాధారణం', dataReview: 'డేటా రివ్యూ', progress: 'ప్రాసెస్ అవుతోంది', loading: 'పనులు లోడ్ అవుతున్నాయి…', error: 'పనులు లోడ్ కాలేదు.', retry: 'మళ్లీ ప్రయత్నించండి', empty: 'ఇప్పటికి చేయాల్సిన పనులు లేవు.', openUpload: 'PDF అప్‌లోడ్ తెరవండి', openRegister: 'ఓటర్ రిజిస్టర్ తెరవండి', records: 'రికార్డులు', review: 'రివ్యూ అవసరం', updated: 'చివరి మార్పు', kinds: { retryPdf: 'విఫలమైన PDFను మళ్లీ ప్రాసెస్ చేయండి', reviewImport: 'PDF నుంచి వచ్చిన డేటాను రివ్యూ చేయండి', approveImport: 'అడ్మిన్ పంపిన PDF దిగుమతిని ఆమోదించండి', reviewVoters: 'రివ్యూ అవసరమైన ఓటర్ రికార్డులను తనిఖీ చేయండి', processing: 'PDF ప్రాసెసింగ్ స్థితిని గమనించండి' } },
  en: { label: 'Daily plan', title: 'Daily Tasks', description: 'Urgent PDF and data-review work for your allowed wards and booths.', refresh: 'Refresh', all: 'All tasks', high: 'Urgent', normal: 'Normal', dataReview: 'Data review', progress: 'Processing', loading: 'Loading tasks…', error: 'Tasks could not be loaded.', retry: 'Try again', empty: 'There are no tasks to do right now.', openUpload: 'Open PDF Upload', openRegister: 'Open Voter Register', records: 'Records', review: 'Needs review', updated: 'Last updated', kinds: { retryPdf: 'Retry failed PDF processing', reviewImport: 'Review imported PDF data', approveImport: 'Approve Admin PDF import', reviewVoters: 'Check voter records needing review', processing: 'Follow PDF processing progress' } },
} as const

type Filter = 'all' | 'high' | 'review' | 'processing'

export function DailyTasksPage({ language, onNavigate }: { language: AppLanguage; onNavigate: (destination: 'upload' | 'register') => void }) {
  const [tasks, setTasks] = useState<DailyTask[]>()
  const [filter, setFilter] = useState<Filter>('all')
  const [error, setError] = useState<string>()
  const t = copy[language]
  const reload = async () => { setError(undefined); try { setTasks(await loadDailyTasks()) } catch (reason) { setError(readableFirebaseError(reason)) } }
  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0)
    return () => window.clearTimeout(timer)
  }, [])
  const visible = useMemo(() => (tasks ?? []).filter((task) => filter === 'all' || (filter === 'high' ? task.priority === 'high' : filter === 'processing' ? task.kind === 'processing' : task.kind === 'reviewImport' || task.kind === 'reviewVoters')), [tasks, filter])

  return <section className="daily-tasks-page"><header className="page-intro daily-tasks-intro"><div><p>{t.label}</p><h2>{t.title}</h2><span>{t.description}</span></div></header>
    <div className="daily-task-filters">{([{ id: 'all', label: t.all }, { id: 'high', label: t.high }, { id: 'review', label: t.dataReview }, { id: 'processing', label: t.progress }] as Array<{ id: Filter; label: string }>).map((item) => <button className={filter === item.id ? 'is-active' : ''} key={item.id} onClick={() => setFilter(item.id)} type="button">{item.label}</button>)}</div>
    {tasks === undefined && !error ? <PageState kind="loading" title={t.loading} description="" /> : null}
    {error ? <PageState kind="error" title={t.error} description={error} actionLabel={t.retry} onAction={() => void reload()} /> : null}
    {tasks !== undefined && !error ? visible.length === 0 ? <PageState kind="empty" title={t.empty} description="" /> : <div className="daily-task-grid">{visible.map((task) => <article className="daily-task-card" key={`${task.kind}-${task.id}`}><header><span className={`daily-task-icon ${task.priority === 'high' ? 'is-high' : ''}`}>{task.kind === 'processing' ? <FileClock size={18} /> : task.priority === 'high' ? <TriangleAlert size={18} /> : <ClipboardCheck size={18} />}</span><span className={`daily-task-priority ${task.priority === 'high' ? 'is-high' : ''}`}>{task.priority === 'high' ? t.high : t.normal}</span></header><h3>{t.kinds[task.kind]}</h3><p>{task.sourcePdfName || `${language === 'te' ? 'వార్డు' : 'Ward'} ${task.wardId} · ${language === 'te' ? 'బూత్' : 'Booth'} ${task.boothId}`}</p><dl><div><dt>{language === 'te' ? 'వార్డు / బూత్' : 'Ward / Booth'}</dt><dd>{task.wardId} / {task.boothId}</dd></div><div><dt>{t.records}</dt><dd>{task.rowCount}</dd></div><div><dt>{t.review}</dt><dd>{task.needsReviewCount}</dd></div><div><dt>{t.updated}</dt><dd>{formatDate(task.updatedAt, language)}</dd></div></dl><button onClick={() => onNavigate(task.action)} type="button">{task.action === 'upload' ? t.openUpload : t.openRegister}</button></article>)}</div> : null}
  </section>
}

function formatDate(value: string | undefined, language: AppLanguage) { return value ? new Intl.DateTimeFormat(language === 'te' ? 'te-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—' }
