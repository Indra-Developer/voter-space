import { CheckCircle2, CloudUpload, FileText, Pause, Play, RefreshCcw, Trash2, UploadCloud, X } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { AppSession } from '../auth/types'
import { readableFirebaseError } from '../auth/firebase-auth'
import type { AppLanguage } from '../app-shell/types'
import { PageState } from '../app-shell/PageState'
import './pdf-import.css'
import { cancelPdfImport, createPdfImport, deletePdfImport, hashPdfFile, listPdfImports, retryPdfImport, type UploadTaskHandle, uploadPdfFile } from './pdf-import-service'
import type { PdfImport, PdfImportDetails, UploadQueueItem } from './types'

const copy = {
  en: {
    select: 'Choose PDF files', refresh: 'Refresh', queue: 'Upload queue', noQueue: 'No PDFs have been added yet.',
    ward: 'Ward', booth: 'Booth', area: 'Area (optional)', autoArea: '', filenameDetected: '', enterRequired: 'Enter ward and booth before upload', remove: 'Remove', pause: 'Pause', resume: 'Resume', retryUpload: 'Retry upload',
    accessDenied: 'You do not have PDF upload permission. Ask the Super Admin for upload access.', loading: 'Loading PDFs…', sourceEmpty: 'No source PDFs are available for your access.',
    stage: 'Current step', records: 'voters saved', duplicates: 'existing voters updated', pages: 'pages', failedPage: 'Last page reached', duplicate: 'This PDF was already uploaded. The existing import is being used.', retryOcr: 'Retry from saved page', reprocess: 'Process again', cancel: 'Cancel', delete: 'Delete source PDF', cancelling: 'Cancelling…', deleting: 'Deleting…', cancelled: 'Cancelled', updated: 'Updated', completed: 'Completed',
    subMember: 'Sub-members can view only their assigned Voter Register. They cannot upload PDFs.',
  },
  te: {
    select: 'PDF ఫైళ్లు ఎంచుకోండి', refresh: 'రిఫ్రెష్', queue: 'అప్‌లోడ్ క్యూ', noQueue: 'ఇంకా PDFలు జోడించలేదు.',
    ward: 'వార్డు', booth: 'బూత్', area: 'ప్రాంతం (ఐచ్ఛికం)', autoArea: '', filenameDetected: '', enterRequired: 'అప్‌లోడ్ ముందు వార్డు, బూత్ ఇవ్వండి', remove: 'తొలగించండి', pause: 'పాజ్', resume: 'కొనసాగించండి', retryUpload: 'మళ్లీ అప్‌లోడ్ చేయండి',
    accessDenied: 'మీకు PDF అప్‌లోడ్ అనుమతి లేదు. సూపర్ అడ్మిన్‌ను అడగండి.', loading: 'PDFలు లోడ్ అవుతున్నాయి…', sourceEmpty: 'మీ యాక్సెస్‌లో ఇంకా సోర్స్ PDFలు లేవు.',
    stage: 'ప్రస్తుత దశ', records: 'సేవ్ చేసిన ఓటర్లు', duplicates: 'అప్‌డేట్ అయిన ఓటర్లు', pages: 'పేజీలు', failedPage: 'చివరిగా చదివిన పేజీ', duplicate: 'ఈ PDF ఇప్పటికే అప్‌లోడ్ అయింది. ఉన్న దిగుమతినే ఉపయోగిస్తున్నాం.', retryOcr: 'చివరి పేజీ నుంచి మళ్లీ ప్రయత్నించండి', reprocess: 'మళ్లీ ప్రాసెస్ చేయండి', cancel: 'రద్దు చేయండి', delete: 'సోర్స్ PDF తొలగించండి', cancelling: 'రద్దు అవుతోంది…', deleting: 'తొలగిస్తోంది…', cancelled: 'రద్దు అయింది', updated: 'అప్‌డేట్ అయింది', completed: 'పూర్తయింది',
    subMember: 'సబ్-మెంబర్లు తమకు కేటాయించిన ఓటర్ రిజిస్టర్ మాత్రమే చూడగలరు. PDFలు అప్‌లోడ్ చేయలేరు.',
  },
} as const

type PageText = { [Key in keyof typeof copy.en]: string }

export function PdfImportPage({ language, session }: { language: AppLanguage; session: AppSession }) {
  const t = copy[language]
  const canUpload = session.profile.role === 'superAdmin' || (session.profile.role === 'admin' && session.profile.permissions.upload)
  const [queue, setQueue] = useState<UploadQueueItem[]>([])
  const [imports, setImports] = useState<PdfImport[]>()
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()
  const uploadTasks = useRef(new Map<string, UploadTaskHandle>())
  const [workingSourceId, setWorkingSourceId] = useState<string>()

  const refreshImports = async (force = false) => {
    try {
      setImports(await listPdfImports({ force }))
      setError(undefined)
    } catch (reason) { setError(readableError(reason)) }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshImports(), 0)
    const refreshTimer = window.setInterval(() => void refreshImports(true), 12000)
    return () => { window.clearTimeout(initial); window.clearInterval(refreshTimer) }
  }, [])

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    const pdfs = files.filter(isPdf)
    if (pdfs.length !== files.length) setNotice(language === 'te' ? 'PDF ఫైళ్లు మాత్రమే క్యూ‌లో చేర్చబడ్డాయి.' : 'Only PDF files were added to the queue.')
    const newItems = pdfs.map(makeQueueItem)
    setQueue((current) => [...current, ...newItems])
    if (newItems.length) window.setTimeout(() => void startItems(newItems), 0)
    event.target.value = ''
  }

  const setQueueField = <Key extends keyof PdfImportDetails>(localId: string, key: Key, value: PdfImportDetails[Key]) => setQueue((current) => current.map((item) => item.localId === localId ? { ...item, [key]: value } : item))

  const uploadOne = async (item: UploadQueueItem) => {
    if (!item.wardId || !item.boothId) {
      setQueue((current) => current.map((entry) => entry.localId === item.localId ? { ...entry, status: 'failed', error: t.enterRequired } : entry))
      return
    }
    try {
      setQueue((current) => current.map((entry) => entry.localId === item.localId ? { ...entry, status: 'preparing', error: undefined } : entry))
      const uploadHash = item.uploadHash ?? await hashPdfFile(item.file)
      setQueue((current) => current.map((entry) => entry.localId === item.localId ? { ...entry, uploadHash } : entry))
      const source = item.sourcePdfId && item.storagePath ? { id: item.sourcePdfId, storagePath: item.storagePath, duplicate: false } : await createPdfImport(item.file, toDetails(item), uploadHash)
      if (source.duplicate) {
        setQueue((current) => current.map((entry) => entry.localId === item.localId ? { ...entry, sourcePdfId: source.id, storagePath: source.storagePath, uploadHash, status: 'uploaded', progress: 100 } : entry))
        setNotice(t.duplicate)
        window.setTimeout(() => void refreshImports(true), 300)
        return
      }
      setQueue((current) => current.map((entry) => entry.localId === item.localId ? { ...entry, sourcePdfId: source.id, storagePath: source.storagePath, status: 'uploading' } : entry))
      const upload = uploadPdfFile({ file: item.file, sourcePdfId: source.id, storagePath: source.storagePath, onProgress: (progress) => setQueue((current) => current.map((entry) => entry.localId === item.localId ? { ...entry, progress, status: 'uploading' } : entry)) })
      uploadTasks.current.set(item.localId, upload.task)
      await upload.completion
      uploadTasks.current.delete(item.localId)
      setQueue((current) => current.map((entry) => entry.localId === item.localId ? { ...entry, status: 'uploaded', progress: 100 } : entry))
      window.setTimeout(() => void refreshImports(true), 1200)
    } catch (reason) {
      uploadTasks.current.delete(item.localId)
      setQueue((current) => current.map((entry) => entry.localId === item.localId ? { ...entry, status: entry.status === 'cancelled' ? 'cancelled' : 'failed', error: readableError(reason) } : entry))
    }
  }

  const startItems = async (pending: UploadQueueItem[]) => {
    let index = 0
    await Promise.all(Array.from({ length: Math.min(3, pending.length) }, async () => {
      while (index < pending.length) await uploadOne(pending[index++])
    }))
  }

  const pause = (localId: string) => { uploadTasks.current.get(localId)?.pause(); setQueue((current) => current.map((item) => item.localId === localId ? { ...item, status: 'paused' } : item)) }
  const resume = (localId: string) => { uploadTasks.current.get(localId)?.resume(); setQueue((current) => current.map((item) => item.localId === localId ? { ...item, status: 'uploading' } : item)) }
  const cancel = (localId: string) => { uploadTasks.current.get(localId)?.cancel(); setQueue((current) => current.map((item) => item.localId === localId ? { ...item, status: 'cancelled' } : item)) }
  const processAgain = async (source: PdfImport) => {
    try { await retryPdfImport(source.id); setNotice(t.updated); await refreshImports(true) } catch (reason) { setError(readableError(reason)) }
  }
  const cancelSource = async (source: PdfImport) => {
    if (!window.confirm(language === 'te' ? 'ఈ PDF ప్రాసెసింగ్‌ను రద్దు చేయాలా?' : 'Cancel processing for this PDF?')) return
    setWorkingSourceId(source.id); setError(undefined)
    try { await cancelPdfImport(source.id); setNotice(t.cancelled); await refreshImports(true) } catch (reason) { setError(readableError(reason)) } finally { setWorkingSourceId(undefined) }
  }
  const deleteSource = async (source: PdfImport) => {
    if (!window.confirm(language === 'te' ? 'ఈ సోర్స్ PDF మరియు దాని దిగుమతి వరుసలను శాశ్వతంగా తొలగించాలా? ఓటర్ రిజిస్టర్‌లోని ఓటర్లు తొలగించబడరు.' : 'Permanently delete this source PDF and its import rows? Voter Register records will not be deleted.')) return
    setWorkingSourceId(source.id); setError(undefined)
    try { await deletePdfImport(source.id); setNotice(t.updated); await refreshImports(true) } catch (reason) { setError(readableError(reason)) } finally { setWorkingSourceId(undefined) }
  }

  if (session.profile.role === 'subMember') return <PageState kind="empty" title={t.subMember} description="" />

  return <section className="pdf-import-page">
    <div className="pdf-import-actions"><button className="pdf-secondary-button" onClick={() => void refreshImports(true)} type="button"><RefreshCcw size={15} />{t.refresh}</button></div>
    {error ? <p className="form-alert form-alert-error">{error}</p> : null}{notice ? <p className="form-alert form-alert-info">{notice}</p> : null}
    <div className="pdf-upload-workspace">
      <UploadPanel canUpload={canUpload} language={language} onAddFiles={addFiles} onCancel={cancel} onPause={pause} onQueueField={setQueueField} onRemove={(id) => setQueue((current) => current.filter((item) => item.localId !== id))} onResume={resume} onRetry={(item) => void uploadOne(item)} queue={queue} t={t} />
      <SourcePdfList canManage={canUpload} imports={imports} language={language} onCancel={(source) => void cancelSource(source)} onDelete={(source) => void deleteSource(source)} onProcessAgain={(source) => void processAgain(source)} t={t} workingSourceId={workingSourceId} />
    </div>
  </section>
}

function UploadPanel({ canUpload, language, onAddFiles, onCancel, onPause, onQueueField, onRemove, onResume, onRetry, queue, t }: { canUpload: boolean; language: AppLanguage; onAddFiles: (event: ChangeEvent<HTMLInputElement>) => void; onCancel: (id: string) => void; onPause: (id: string) => void; onQueueField: <Key extends keyof PdfImportDetails>(id: string, key: Key, value: PdfImportDetails[Key]) => void; onRemove: (id: string) => void; onResume: (id: string) => void; onRetry: (item: UploadQueueItem) => void; queue: UploadQueueItem[]; t: PageText }) {
  if (!canUpload) return <PageState kind="empty" title={t.accessDenied} description="" />
  return <><section className="pdf-drop-card"><div className="pdf-drop-icon"><CloudUpload size={25} /></div><label className="pdf-primary-button"><UploadCloud size={15} />{t.select}<input accept="application/pdf,.pdf" multiple onChange={onAddFiles} type="file" /></label></section><section className="pdf-queue"><header><div><h3>{t.queue}</h3><span>{queue.length}</span></div></header>{queue.length === 0 ? <p className="pdf-empty-text">{t.noQueue}</p> : queue.map((item) => <UploadQueueCard item={item} key={item.localId} language={language} onCancel={onCancel} onChange={onQueueField} onPause={onPause} onRemove={onRemove} onResume={onResume} onRetry={onRetry} t={t} />)}</section></>
}

function UploadQueueCard({ item, language, onCancel, onChange, onPause, onRemove, onResume, onRetry, t }: { item: UploadQueueItem; language: AppLanguage; onCancel: (id: string) => void; onChange: <Key extends keyof PdfImportDetails>(id: string, key: Key, value: PdfImportDetails[Key]) => void; onPause: (id: string) => void; onRemove: (id: string) => void; onResume: (id: string) => void; onRetry: (item: UploadQueueItem) => void; t: PageText }) {
  const locked = item.status !== 'draft' && item.status !== 'failed' && item.status !== 'cancelled'
  return <article className="pdf-queue-card"><header><div className="pdf-file-name"><FileText size={19} /><div><strong>{item.file.name}</strong><span>{formatBytes(item.file.size)} · {queueStatus(item.status, language)}</span></div></div><button aria-label={t.remove} className="pdf-icon-button" disabled={locked} onClick={() => onRemove(item.localId)} type="button"><X size={16} /></button></header><div className="pdf-progress" aria-label={`${item.progress}%`}><span style={{ width: `${item.progress}%` }} /></div>{item.error ? <p className="pdf-item-error">{item.error}</p> : null}<div className="pdf-metadata-grid"><QueueInput disabled={locked} label={t.ward} value={item.wardId} onChange={(value) => onChange(item.localId, 'wardId', value)} /><QueueInput disabled={locked} label={t.booth} value={item.boothId} onChange={(value) => onChange(item.localId, 'boothId', value)} /><QueueInput disabled={locked} label={t.area} value={item.area} onChange={(value) => onChange(item.localId, 'area', value)} /></div><footer>{item.status === 'uploading' ? <button className="pdf-secondary-button" onClick={() => onPause(item.localId)} type="button"><Pause size={14} />{t.pause}</button> : null}{item.status === 'paused' ? <><button className="pdf-primary-button" onClick={() => onResume(item.localId)} type="button"><Play size={14} />{t.resume}</button><button className="pdf-secondary-button" onClick={() => onCancel(item.localId)} type="button">{t.remove}</button></> : null}{item.status === 'failed' || item.status === 'cancelled' ? <button className="pdf-primary-button" onClick={() => onRetry(item)} type="button"><RefreshCcw size={14} />{t.retryUpload}</button> : null}{item.status === 'uploaded' ? <span className="pdf-uploaded"><CheckCircle2 size={15} />{t.completed}</span> : null}</footer></article>
}

function SourcePdfList({ canManage, imports, language, onCancel, onDelete, onProcessAgain, t, workingSourceId }: { canManage: boolean; imports?: PdfImport[]; language: AppLanguage; onCancel: (source: PdfImport) => void; onDelete: (source: PdfImport) => void; onProcessAgain: (source: PdfImport) => void; t: PageText; workingSourceId?: string }) {
  if (!imports) return <PageState kind="loading" title={t.loading} description="" />
  if (!imports.length) return <PageState kind="empty" title={t.sourceEmpty} description="" />
  return <section className="pdf-source-list">{imports.map((source) => { const working = workingSourceId === source.id; return <article className="pdf-source-card" key={source.id}><header><div className="pdf-file-name"><FileText size={19} /><div><strong>{source.originalFileName}</strong><span>{source.wardId} · {source.boothId}{source.area ? ` · ${source.area}` : ''} · {source.uploadedByName}</span></div></div><StatusPill status={source.status} language={language} /></header><div className="pdf-source-stats"><span>{t.stage}: {source.stage}</span><span>{source.processedPage ?? 0}{source.pageCount ? ` / ${source.pageCount}` : ''} {t.pages}</span><span>{source.rowCount ?? 0} {t.records}</span><span>{source.duplicateCount ?? 0} {t.duplicates}</span>{source.failedPage ? <span>{t.failedPage}: {source.failedPage}</span> : null}</div><div className="pdf-progress"><span style={{ width: `${source.progress}%` }} /></div>{source.errorMessage ? <p className="pdf-item-error">{source.errorMessage}</p> : null}<footer>{canManage && canCancel(source.status) ? <button className="pdf-secondary-button" disabled={working} onClick={() => onCancel(source)} type="button"><X size={14} />{working ? t.cancelling : t.cancel}</button> : null}{canReprocess(source.status) ? <button className="pdf-primary-button" disabled={working} onClick={() => void onProcessAgain(source)} type="button"><RefreshCcw size={14} />{source.status === 'failed' ? t.retryOcr : t.reprocess}</button> : null}{canManage ? <button className="pdf-danger-button" disabled={working} onClick={() => void onDelete(source)} type="button"><Trash2 size={14} />{working ? t.deleting : t.delete}</button> : null}</footer></article> })}</section>
}

function StatusPill({ language, status }: { language: AppLanguage; status: PdfImport['status'] }) { return <span className={`pdf-status pdf-status-${status}`}>{statusText(status, language)}</span> }
function QueueInput({ disabled, label, onChange, value }: { disabled?: boolean; label: string; onChange: (value: string) => void; value: string }) { return <label className="pdf-field"><span>{label}</span><input disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value ?? ''} /></label> }
function toDetails(item: UploadQueueItem): PdfImportDetails { return { wardId: item.wardId, boothId: item.boothId, area: item.area, division: item.division } }
function isPdf(file: File) { return file.type === 'application/pdf' || file.name.toLocaleLowerCase().endsWith('.pdf') }
function makeQueueItem(file: File): UploadQueueItem { const detected = detectScope(file.name); return { localId: `${Date.now()}-${crypto.randomUUID()}`, file, ...detected, status: 'draft', progress: 0 } }
function detectScope(name: string): PdfImportDetails { const simple = name.replace(/\.pdf$/i, '').match(/^(\d+[A-Za-z-]*)[ _-]+(\d+[A-Za-z-]*)/); const ward = name.match(/(?:ward|wd)[ _-]*(\d+[A-Za-z-]*)/i)?.[1] ?? simple?.[1] ?? ''; const booth = name.match(/(?:booth|part|pt)[ _-]*(\d+[A-Za-z-]*)/i)?.[1] ?? simple?.[2] ?? ''; return { wardId: ward, boothId: booth, area: '', division: '' } }
function queueStatus(status: UploadQueueItem['status'], language: AppLanguage) { const te: Record<UploadQueueItem['status'], string> = { draft: 'సిద్ధంగా ఉంది', preparing: 'సిద్ధం అవుతోంది', uploading: 'అప్‌లోడ్ అవుతోంది', paused: 'పాజ్', uploaded: 'అప్‌లోడ్ పూర్తయింది', failed: 'ఆగిపోయింది', cancelled: 'రద్దు అయింది' }; const en: Record<UploadQueueItem['status'], string> = { draft: 'Ready', preparing: 'Preparing', uploading: 'Uploading', paused: 'Paused', uploaded: 'Uploaded', failed: 'Stopped', cancelled: 'Cancelled' }; return (language === 'te' ? te : en)[status] }
function statusText(status: PdfImport['status'], language: AppLanguage) { const te: Record<PdfImport['status'], string> = { readyForUpload: 'అప్‌లోడ్ సిద్ధం', uploaded: 'అప్‌లోడ్ పూర్తయింది', queued: 'క్యూలో ఉంది', processing: 'కార్డులు చదువుతోంది', review: 'కార్డులు చదవడం పూర్తయింది', awaitingApproval: 'కార్డులు చదవడం పూర్తయింది', approvalQueued: 'ఓటర్లను సేవ్ చేస్తోంది', applying: 'ఓటర్లను సేవ్ చేస్తోంది', completed: 'పూర్తయింది', completedWithReview: 'పూర్తయింది', failed: 'ఆగిపోయింది', cancelled: 'రద్దు అయింది' }; const en: Record<PdfImport['status'], string> = { readyForUpload: 'Ready to upload', uploaded: 'Uploaded', queued: 'Queued', processing: 'Reading cards', review: 'Cards read', awaitingApproval: 'Cards read', approvalQueued: 'Saving voters', applying: 'Saving voters', completed: 'Completed', completedWithReview: 'Completed', failed: 'Stopped', cancelled: 'Cancelled' }; return (language === 'te' ? te : en)[status] }
function canReprocess(status: PdfImport['status']) { return !['readyForUpload', 'uploaded', 'queued', 'processing', 'approvalQueued', 'applying'].includes(status) }
function canCancel(status: PdfImport['status']) { return ['readyForUpload', 'uploaded', 'queued', 'processing', 'review', 'awaitingApproval', 'approvalQueued', 'applying'].includes(status) }
function formatBytes(bytes: number) { if (!bytes) return '0 B'; const units = ['B', 'KB', 'MB', 'GB']; const position = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${(bytes / 1024 ** position).toFixed(position ? 1 : 0)} ${units[position]}` }
function readableError(reason: unknown) { return readableFirebaseError(reason) }
