import { ChevronDown, CloudUpload, Edit3, FileText, Filter, LoaderCircle, Pause, Play, RefreshCcw, Save, Search, Trash2, UploadCloud, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { AppSession } from '../auth/types'
import { readableFirebaseError } from '../auth/firebase-auth'
import type { AppLanguage } from '../app-shell/types'
import { PageState } from '../app-shell/PageState'
import { joinClasses, uiClasses } from '../app-shell/ui'
import './pdf-import.css'
import { cancelPdfImport, createPdfImport, deletePdfImport, hashPdfFile, loadPdfImportPage, retryPdfImport, type PdfImportListFilters, type UploadTaskHandle, updatePdfImportMetadata, uploadPdfFile } from './pdf-import-service'
import type { PdfImport, PdfImportDetails, UploadQueueItem } from './types'

const copy = {
  en: {
    select: 'Choose PDF files', refresh: 'Refresh', queue: 'Upload queue', noQueue: 'No PDFs have been added yet.',
    ward: 'Ward', booth: 'Booth', area: 'Area (optional)', autoArea: '', filenameDetected: '', enterRequired: 'Enter ward and booth before upload', remove: 'Remove', pause: 'Pause', resume: 'Resume', retryUpload: 'Retry upload',
    accessDenied: 'You do not have PDF upload permission. Ask the Super Admin for upload access.', loading: 'Loading PDFs…', sourceEmpty: 'No source PDFs are available for your access.', search: 'Search uploaded PDFs', searchPlaceholder: 'Search by file name, ward, booth, area, or uploader', filters: 'Filters', hideFilters: 'Hide filters', clearFilters: 'Clear filters', status: 'Status', allStatuses: 'All statuses', loadMore: 'Load 10 more', loadingMore: 'Loading more…', noMore: 'All matching PDFs are shown.',
    stage: 'Current step', records: 'voters saved', duplicates: 'existing voters updated', pages: 'pages', failedPage: 'Last page reached', duplicate: 'This PDF was already uploaded. The existing import is being used.', retryOcr: 'Retry from saved page', reprocess: 'Process again', cancel: 'Cancel', delete: 'Delete source PDF', cancelling: 'Cancelling…', deleting: 'Deleting…', cancelled: 'Cancelled', updated: 'Updated', completed: 'Completed', edit: 'Edit', editMetadata: 'Edit PDF details', save: 'Save changes', saving: 'Saving…', metadataError: 'PDF details could not be updated.', metadataHint: 'Changes apply to this PDF, its imported rows, voter records, and filter options.', uploadingPdf: 'Uploading PDF…', uploadComplete: 'PDF upload complete — waiting for OCR…', waitingForOcr: 'Waiting for OCR to start…',
    subMember: 'Sub-members can view only their assigned Voter Register. They cannot upload PDFs.',
  },
  te: {
    select: 'PDF ఫైళ్లు ఎంచుకోండి', refresh: 'రిఫ్రెష్', queue: 'అప్‌లోడ్ క్యూ', noQueue: 'ఇంకా PDFలు జోడించలేదు.',
    ward: 'వార్డు', booth: 'బూత్', area: 'ప్రాంతం (ఐచ్ఛికం)', autoArea: '', filenameDetected: '', enterRequired: 'అప్‌లోడ్ ముందు వార్డు, బూత్ ఇవ్వండి', remove: 'తొలగించండి', pause: 'పాజ్', resume: 'కొనసాగించండి', retryUpload: 'మళ్లీ అప్‌లోడ్ చేయండి',
    accessDenied: 'మీకు PDF అప్‌లోడ్ అనుమతి లేదు. సూపర్ అడ్మిన్‌ను అడగండి.', loading: 'PDFలు లోడ్ అవుతున్నాయి…', sourceEmpty: 'మీ యాక్సెస్‌లో ఇంకా సోర్స్ PDFలు లేవు.', search: 'అప్‌లోడ్ చేసిన PDFలను వెతకండి', searchPlaceholder: 'ఫైల్ పేరు, వార్డు, బూత్, ప్రాంతం లేదా అప్‌లోడర్‌తో వెతకండి', filters: 'ఫిల్టర్లు', hideFilters: 'ఫిల్టర్లు దాచండి', clearFilters: 'ఫిల్టర్లు క్లియర్ చేయండి', status: 'స్థితి', allStatuses: 'అన్ని స్థితులు', loadMore: 'మరో 10 లోడ్ చేయండి', loadingMore: 'లోడ్ అవుతోంది…', noMore: 'సరిపోలిన అన్ని PDFలు చూపించబడ్డాయి.',
    stage: 'ప్రస్తుత దశ', records: 'సేవ్ చేసిన ఓటర్లు', duplicates: 'అప్‌డేట్ అయిన ఓటర్లు', pages: 'పేజీలు', failedPage: 'చివరిగా చదివిన పేజీ', duplicate: 'ఈ PDF ఇప్పటికే అప్‌లోడ్ అయింది. ఉన్న దిగుమతినే ఉపయోగిస్తున్నాం.', retryOcr: 'చివరి పేజీ నుంచి మళ్లీ ప్రయత్నించండి', reprocess: 'మళ్లీ ప్రాసెస్ చేయండి', cancel: 'రద్దు చేయండి', delete: 'సోర్స్ PDF తొలగించండి', cancelling: 'రద్దు అవుతోంది…', deleting: 'తొలగిస్తోంది…', cancelled: 'రద్దు అయింది', updated: 'అప్‌డేట్ అయింది', completed: 'పూర్తయింది', edit: 'సవరించండి', editMetadata: 'PDF వివరాలను సవరించండి', save: 'మార్పులను సేవ్ చేయండి', saving: 'సేవ్ అవుతోంది…', metadataError: 'PDF వివరాలను అప్‌డేట్ చేయలేకపోయాము.', metadataHint: 'మార్పులు ఈ PDF, దాని దిగుమతి వరుసలు, ఓటర్ రికార్డులు మరియు ఫిల్టర్ ఎంపికలకు వర్తిస్తాయి.', uploadingPdf: 'PDF అప్‌లోడ్ అవుతోంది…', uploadComplete: 'PDF అప్‌లోడ్ పూర్తయింది — OCR కోసం వేచి ఉంది…', waitingForOcr: 'OCR ప్రారంభం కోసం వేచి ఉంది…',
    subMember: 'సబ్-మెంబర్లు తమకు కేటాయించిన ఓటర్ రిజిస్టర్ మాత్రమే చూడగలరు. PDFలు అప్‌లోడ్ చేయలేరు.',
  },
} as const

type PageText = { [Key in keyof typeof copy.en]: string }

export function PdfImportPage({ language, session }: { language: AppLanguage; session: AppSession }) {
  const t = copy[language]
  const canUpload = session.profile.role === 'superAdmin' || (session.profile.role === 'admin' && session.profile.permissions.upload)
  const [queue, setQueue] = useState<UploadQueueItem[]>([])
  const [imports, setImports] = useState<PdfImport[]>()
  const [importFilters, setImportFilters] = useState<PdfImportListFilters>({ search: '', wardId: '', boothId: '', area: '', status: '' })
  const [nextImportCursor, setNextImportCursor] = useState<string>()
  const [hasMoreImports, setHasMoreImports] = useState(false)
  const [loadingMoreImports, setLoadingMoreImports] = useState(false)
  const [showImportFilters, setShowImportFilters] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()
  const uploadTasks = useRef(new Map<string, UploadTaskHandle>())
  const importRequestVersion = useRef(0)
  const [workingSourceId, setWorkingSourceId] = useState<string>()
  const [editingSource, setEditingSource] = useState<PdfImport>()
  const [metadataDraft, setMetadataDraft] = useState<PdfImportDetails>({ wardId: '', boothId: '', area: '', division: '' })
  const [metadataSaving, setMetadataSaving] = useState(false)

  const refreshImports = useCallback(async (force = false) => {
    const requestVersion = ++importRequestVersion.current
    try {
      const page = await loadPdfImportPage(undefined, { force, filters: importFilters })
      if (requestVersion !== importRequestVersion.current) return
      setImports(page.imports)
      setNextImportCursor(page.nextCursor)
      setHasMoreImports(page.hasMore)
      setError(undefined)
    } catch (reason) {
      if (requestVersion === importRequestVersion.current) setError(readableError(reason))
    }
  }, [importFilters])

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshImports(), 0)
    const refreshTimer = window.setInterval(() => void refreshImports(true), 12000)
    return () => { window.clearTimeout(initial); window.clearInterval(refreshTimer) }
  }, [refreshImports])

  const updateImportFilter = (key: keyof PdfImportListFilters, value: string) => {
    setImports(undefined)
    setNextImportCursor(undefined)
    setHasMoreImports(false)
    setImportFilters((current) => ({ ...current, [key]: value }))
  }

  const clearImportFilters = () => {
    setImports(undefined)
    setNextImportCursor(undefined)
    setHasMoreImports(false)
    setImportFilters({ search: '', wardId: '', boothId: '', area: '', status: '' })
  }

  const loadMoreImports = async () => {
    if (!nextImportCursor || loadingMoreImports) return
    setLoadingMoreImports(true)
    try {
      const page = await loadPdfImportPage(nextImportCursor, { filters: importFilters })
      setImports((current) => {
        const existing = current ?? []
        const known = new Set(existing.map((item) => item.id))
        return [...existing, ...page.imports.filter((item) => !known.has(item.id))]
      })
      setNextImportCursor(page.nextCursor)
      setHasMoreImports(page.hasMore)
    } catch (reason) {
      setError(readableError(reason))
    } finally {
      setLoadingMoreImports(false)
    }
  }

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

  const openMetadataEditor = (source: PdfImport) => {
    setEditingSource(source)
    setMetadataDraft({ wardId: source.wardId, boothId: source.boothId, area: source.area, division: source.division })
    setError(undefined)
  }
  const saveMetadata = async () => {
    if (!editingSource || metadataSaving) return
    setMetadataSaving(true)
    setError(undefined)
    try {
      await updatePdfImportMetadata(editingSource.id, metadataDraft)
      setEditingSource(undefined)
      setNotice(t.updated)
      await refreshImports(true)
    } catch (reason) {
      setError(readableError(reason) || t.metadataError)
    } finally {
      setMetadataSaving(false)
    }
  }

  if (session.profile.role === 'subMember') return <PageState kind="empty" title={t.subMember} description="" />

  return <section className="pdf-import-page grid gap-4 font-sans text-copy">
    {error ? <p className="form-alert form-alert-error">{error}</p> : null}{notice ? <p className="form-alert form-alert-info">{notice}</p> : null}
    <div className="pdf-upload-workspace grid gap-3">
      <UploadPanel canManage={canUpload} imports={imports} language={language} onAddFiles={addFiles} onCancel={cancel} onCancelSource={(source) => void cancelSource(source)} onDeleteSource={(source) => void deleteSource(source)} onEditSource={openMetadataEditor} onPause={pause} onProcessAgain={(source) => void processAgain(source)} onQueueField={setQueueField} onRemove={(id) => setQueue((current) => current.filter((item) => item.localId !== id))} onResume={resume} onRetry={(item) => void uploadOne(item)} queue={queue} t={t} workingSourceId={workingSourceId} />
      <SourcePdfList canManage={canUpload} filters={importFilters} hasMore={hasMoreImports} hiddenSourceIds={queue.map((item) => item.sourcePdfId).filter((id): id is string => Boolean(id))} imports={imports} language={language} loadingMore={loadingMoreImports} onCancel={(source) => void cancelSource(source)} onClearFilters={clearImportFilters} onDelete={(source) => void deleteSource(source)} onEditSource={openMetadataEditor} onFilterChange={updateImportFilter} onLoadMore={() => void loadMoreImports()} onProcessAgain={(source) => void processAgain(source)} onToggleFilters={() => setShowImportFilters((current) => !current)} showFilters={showImportFilters} t={t} workingSourceId={workingSourceId} />
    </div>
    {editingSource ? <PdfMetadataDialog draft={metadataDraft} onChange={(key, value) => setMetadataDraft((current) => ({ ...current, [key]: value }))} onClose={() => { if (!metadataSaving) setEditingSource(undefined) }} onSave={() => void saveMetadata()} saving={metadataSaving} t={t} /> : null}
  </section>
}

function UploadPanel({ canManage, imports, language, onAddFiles, onCancel, onCancelSource, onDeleteSource, onEditSource, onPause, onProcessAgain, onQueueField, onRemove, onResume, onRetry, queue, t, workingSourceId }: { canManage: boolean; imports?: PdfImport[]; language: AppLanguage; onAddFiles: (event: ChangeEvent<HTMLInputElement>) => void; onCancel: (id: string) => void; onCancelSource: (source: PdfImport) => void; onDeleteSource: (source: PdfImport) => void; onEditSource: (source: PdfImport) => void; onPause: (id: string) => void; onProcessAgain: (source: PdfImport) => void; onQueueField: <Key extends keyof PdfImportDetails>(id: string, key: Key, value: PdfImportDetails[Key]) => void; onRemove: (id: string) => void; onResume: (id: string) => void; onRetry: (item: UploadQueueItem) => void; queue: UploadQueueItem[]; t: PageText; workingSourceId?: string }) {
  if (!canManage) return <PageState kind="empty" title={t.accessDenied} description="" />
  return <>
    <section className={joinClasses('pdf-drop-card', uiClasses.card, 'grid place-items-center gap-3 p-3 text-center sm:p-4')}>
      <div className={joinClasses('pdf-drop-icon', uiClasses.iconBadge)}><CloudUpload size={23} /></div>
      <div className="min-w-0">
        <strong className="block text-sm font-extrabold text-copy">{t.select}</strong>
        <span className="mt-0.5 block text-xs text-muted">PDF only · Fast processing · Secure storage</span>
      </div>
      <label className={joinClasses('pdf-primary-button', uiClasses.button, uiClasses.primaryButton, 'mx-auto cursor-pointer')}><UploadCloud size={15} />{t.select}<input accept="application/pdf,.pdf" multiple onChange={onAddFiles} type="file" /></label>
    </section>
    <section className="pdf-queue grid gap-2">
      <header className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><h3 className="m-0 text-base font-bold text-copy">{t.queue}</h3><span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-bold text-muted">{queue.length}</span></div></header>
      {queue.length === 0 ? <p className="pdf-empty-text m-0 text-sm text-muted">{t.noQueue}</p> : queue.map((item) => <UploadQueueCard canManage={canManage} item={item} key={item.localId} language={language} onCancel={onCancel} onCancelSource={onCancelSource} onChange={onQueueField} onDeleteSource={onDeleteSource} onEditSource={onEditSource} onPause={onPause} onProcessAgain={onProcessAgain} onRemove={onRemove} onResume={onResume} onRetry={onRetry} source={imports?.find((entry) => entry.id === item.sourcePdfId)} t={t} workingSourceId={workingSourceId} />)}
    </section>
  </>
}

function UploadQueueCard({ canManage, item, language, onCancel, onCancelSource, onChange, onDeleteSource, onEditSource, onPause, onProcessAgain, onRemove, onResume, onRetry, source, t, workingSourceId }: { canManage: boolean; item: UploadQueueItem; language: AppLanguage; onCancel: (id: string) => void; onCancelSource: (source: PdfImport) => void; onChange: <Key extends keyof PdfImportDetails>(id: string, key: Key, value: PdfImportDetails[Key]) => void; onDeleteSource: (source: PdfImport) => void; onEditSource: (source: PdfImport) => void; onPause: (id: string) => void; onProcessAgain: (source: PdfImport) => void; onRemove: (id: string) => void; onResume: (id: string) => void; onRetry: (item: UploadQueueItem) => void; source?: PdfImport; t: PageText; workingSourceId?: string }) {
  const locked = Boolean(source) || (item.status !== 'draft' && item.status !== 'failed' && item.status !== 'cancelled')
  // The Storage upload is a browser-side operation. It must own the progress
  // bar until it has completed; the source document can already be processing
  // in the backend by then, but showing that state early makes OCR look stuck.
  const uploadComplete = item.status === 'uploaded'
  const showOcr = Boolean(source && uploadComplete)
  const progress = showOcr ? source?.progress ?? 100 : item.progress
  const displayStage = showOcr ? source?.stage ?? t.uploadComplete : uploadComplete ? t.uploadComplete : `${t.uploadingPdf} ${item.progress}%`
  const displayStatus = showOcr && source ? statusText(source.status, language) : queueStatus(item.status, language)
  const working = source?.id === workingSourceId
  return <article className={joinClasses('pdf-queue-card', uiClasses.card, 'grid gap-2.5 p-3 sm:p-4')}><header className="flex items-start justify-between gap-3"><div className="pdf-file-name flex min-w-0 items-start gap-2"><FileText size={19} /><div><strong>{source?.originalFileName ?? item.file.name}</strong><span>{formatBytes(item.file.size)} · {displayStatus}</span></div></div>{showOcr && source ? <StatusPill language={language} status={source.status} /> : source ? <span className="pdf-status pdf-status-uploading">{displayStatus}</span> : <button aria-label={t.remove} className={uiClasses.iconButton} disabled={locked} onClick={() => onRemove(item.localId)} type="button"><X size={16} /></button>}</header><div className="pdf-progress overflow-hidden rounded-full bg-surface-muted" aria-label={`${progress}%`}><span style={{ width: `${progress}%` }} /></div>{source ? <><div className="pdf-source-stats grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-4"><span>{t.stage}: {displayStage}</span><span>{showOcr ? `${source.processedPage ?? 0}${source.pageCount ? ` / ${source.pageCount}` : ''} ${t.pages}` : '—'}</span><span>{showOcr ? `${source.rowCount ?? 0} ${t.records}` : '—'}</span><span>{showOcr ? `${source.duplicateCount ?? 0} ${t.duplicates}` : '—'}</span></div><div className="grid grid-cols-3 gap-2"><MetadataEditButton label={t.ward} value={source.wardId} onClick={() => onEditSource(source)} /><MetadataEditButton label={t.booth} value={source.boothId} onClick={() => onEditSource(source)} /><MetadataEditButton label={t.area} value={source.area} onClick={() => onEditSource(source)} /></div></> : <div className="pdf-metadata-grid grid gap-2 tablet:grid-cols-3"><QueueInput disabled={locked} label={t.ward} value={item.wardId} onChange={(value) => onChange(item.localId, 'wardId', value)} /><QueueInput disabled={locked} label={t.booth} value={item.boothId} onChange={(value) => onChange(item.localId, 'boothId', value)} /><QueueInput disabled={locked} label={t.area} value={item.area} onChange={(value) => onChange(item.localId, 'area', value)} /></div>}{item.error ? <p className="pdf-item-error rounded-lg border border-red-200 bg-red-50 px-3 py-2">{item.error}</p> : null}<footer className="flex flex-wrap items-center justify-end gap-2">{source && showOcr && canManage && canCancel(source.status) ? <button className={joinClasses('pdf-secondary-button', uiClasses.button, uiClasses.secondaryButton, 'min-h-9 text-xs')} disabled={working} onClick={() => onCancelSource(source)} type="button"><X size={14} />{working ? t.cancelling : t.cancel}</button> : null}{source && showOcr && canReprocess(source.status) ? <button className={joinClasses('pdf-primary-button', uiClasses.button, uiClasses.primaryButton, 'min-h-9 text-xs')} disabled={working} onClick={() => onProcessAgain(source)} type="button"><RefreshCcw size={14} />{source.status === 'failed' ? t.retryOcr : t.reprocess}</button> : null}{source && canManage ? <button className={joinClasses('pdf-danger-button', uiClasses.button, uiClasses.dangerButton, 'min-h-9 text-xs')} disabled={working} onClick={() => onDeleteSource(source)} type="button"><Trash2 size={14} />{working ? t.deleting : t.delete}</button> : null}{!source && item.status === 'uploading' ? <button className={joinClasses('pdf-secondary-button', uiClasses.button, uiClasses.secondaryButton, 'min-h-9 text-xs')} onClick={() => onPause(item.localId)} type="button"><Pause size={14} />{t.pause}</button> : null}{!source && item.status === 'paused' ? <><button className={joinClasses('pdf-primary-button', uiClasses.button, uiClasses.primaryButton, 'min-h-9 text-xs')} onClick={() => onResume(item.localId)} type="button"><Play size={14} />{t.resume}</button><button className={joinClasses('pdf-secondary-button', uiClasses.button, uiClasses.secondaryButton, 'min-h-9 text-xs')} onClick={() => onCancel(item.localId)} type="button">{t.remove}</button></> : null}{!source && (item.status === 'failed' || item.status === 'cancelled') ? <button className={joinClasses('pdf-primary-button', uiClasses.button, uiClasses.primaryButton, 'min-h-9 text-xs')} onClick={() => onRetry(item)} type="button"><RefreshCcw size={14} />{t.retryUpload}</button> : null}{!source && item.status === 'uploaded' ? <span className="pdf-uploaded inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><LoaderCircle className="animate-spin" size={14} />{t.waitingForOcr}</span> : null}</footer></article>
}

function SourcePdfList({ canManage, filters, hasMore, hiddenSourceIds = [], imports, language, loadingMore, onCancel, onClearFilters, onDelete, onEditSource, onFilterChange, onLoadMore, onProcessAgain, onToggleFilters, showFilters, t, workingSourceId }: { canManage: boolean; filters: PdfImportListFilters; hasMore: boolean; hiddenSourceIds?: string[]; imports?: PdfImport[]; language: AppLanguage; loadingMore: boolean; onCancel: (source: PdfImport) => void; onClearFilters: () => void; onDelete: (source: PdfImport) => void; onEditSource: (source: PdfImport) => void; onFilterChange: (key: keyof PdfImportListFilters, value: string) => void; onLoadMore: () => void; onProcessAgain: (source: PdfImport) => void; onToggleFilters: () => void; showFilters: boolean; t: PageText; workingSourceId?: string }) {
  const statusOptions: PdfImport['status'][] = ['readyForUpload', 'uploaded', 'queued', 'processing', 'review', 'awaitingApproval', 'approvalQueued', 'applying', 'completed', 'completedWithReview', 'failed', 'cancelled']
  const visibleImports = imports?.filter((source) => !hiddenSourceIds.includes(source.id))
  const hasActiveFilters = Boolean(filters.search || filters.wardId || filters.boothId || filters.area || filters.status)
  return <section className="pdf-source-list grid gap-2.5">
    <div className="pdf-source-toolbar">
      <div className="pdf-source-toolbar-row">
        <label className="pdf-source-search">
          <Search aria-hidden="true" size={16} />
          <span className="sr-only">{t.search}</span>
          <input aria-label={t.search} onChange={(event) => onFilterChange('search', event.target.value)} placeholder={t.searchPlaceholder} value={filters.search ?? ''} />
        </label>
        <button aria-expanded={showFilters} className={joinClasses('pdf-secondary-button', 'pdf-filter-toggle')} onClick={onToggleFilters} type="button"><Filter size={15} />{showFilters ? t.hideFilters : t.filters}<ChevronDown className={showFilters ? 'rotate-180' : ''} size={15} /></button>
      </div>
      {showFilters ? <div className="pdf-source-filter-grid">
        <label><span>{t.ward}</span><input onChange={(event) => onFilterChange('wardId', event.target.value)} placeholder={t.ward} value={filters.wardId ?? ''} /></label>
        <label><span>{t.booth}</span><input onChange={(event) => onFilterChange('boothId', event.target.value)} placeholder={t.booth} value={filters.boothId ?? ''} /></label>
        <label><span>{t.area}</span><input onChange={(event) => onFilterChange('area', event.target.value)} placeholder={t.area} value={filters.area ?? ''} /></label>
        <label><span>{t.status}</span><select onChange={(event) => onFilterChange('status', event.target.value)} value={filters.status ?? ''}><option value="">{t.allStatuses}</option>{statusOptions.map((status) => <option key={status} value={status}>{statusText(status, language)}</option>)}</select></label>
        {hasActiveFilters ? <button className="pdf-clear-filters" onClick={onClearFilters} type="button">{t.clearFilters}</button> : null}
      </div> : null}
    </div>
    {!imports ? <PdfSourceSkeletonList /> : !visibleImports?.length ? hiddenSourceIds.length ? null : <PageState kind="empty" title={t.sourceEmpty} description="" /> : <>
      <div className="pdf-source-results grid gap-2.5">{visibleImports.map((source) => { const working = workingSourceId === source.id; return <article className={joinClasses('pdf-source-card', uiClasses.card, 'grid gap-2.5 p-3 sm:p-4')} key={source.id}><header className="flex flex-wrap items-start justify-between gap-3"><div className="pdf-file-name flex min-w-0 items-start gap-2"><FileText size={19} /><div><strong>{source.originalFileName}</strong><span>{source.uploadedByName}</span></div></div><StatusPill status={source.status} language={language} /></header><div className="grid grid-cols-3 gap-2"><MetadataEditButton label={t.ward} value={source.wardId} onClick={() => onEditSource(source)} /><MetadataEditButton label={t.booth} value={source.boothId} onClick={() => onEditSource(source)} /><MetadataEditButton label={t.area} value={source.area} onClick={() => onEditSource(source)} /></div><div className="pdf-source-stats grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-4"><span>{t.stage}: {source.stage}</span><span>{source.processedPage ?? 0}{source.pageCount ? ` / ${source.pageCount}` : ''} {t.pages}</span><span>{source.rowCount ?? 0} {t.records}</span><span>{source.duplicateCount ?? 0} {t.duplicates}</span>{source.failedPage ? <span>{t.failedPage}: {source.failedPage}</span> : null}</div><div className="pdf-progress overflow-hidden rounded-full bg-surface-muted"><span style={{ width: `${source.progress}%` }} /></div>{source.errorMessage ? <p className="pdf-item-error rounded-lg border border-red-200 bg-red-50 px-3 py-2">{source.errorMessage}</p> : null}<footer className="pdf-card-actions">{canManage && canCancel(source.status) ? <button className={joinClasses('pdf-secondary-button', uiClasses.button, uiClasses.secondaryButton, 'min-h-9 text-xs')} disabled={working} onClick={() => onCancel(source)} type="button"><X size={14} />{working ? t.cancelling : t.cancel}</button> : null}{canReprocess(source.status) ? <button className={joinClasses('pdf-primary-button', uiClasses.button, uiClasses.primaryButton, 'min-h-9 text-xs')} disabled={working} onClick={() => onProcessAgain(source)} type="button"><RefreshCcw size={14} />{source.status === 'failed' ? t.retryOcr : t.reprocess}</button> : null}{canManage ? <button className={joinClasses('pdf-danger-button', uiClasses.button, uiClasses.dangerButton, 'min-h-9 text-xs')} disabled={working} onClick={() => onDelete(source)} type="button"><Trash2 size={14} />{working ? t.deleting : t.delete}</button> : null}</footer></article> })}</div>
      {hasMore ? <button className={joinClasses('pdf-secondary-button', 'pdf-load-more')} disabled={loadingMore} onClick={onLoadMore} type="button">{loadingMore ? <LoaderCircle className="animate-spin" size={15} /> : null}{loadingMore ? t.loadingMore : t.loadMore}</button> : <p className="pdf-no-more">{t.noMore}</p>}
    </>}
  </section>
}

function PdfSourceSkeletonList() {
  return <section aria-busy="true" aria-label="Loading PDF cards" className="pdf-source-list grid gap-2.5">{['one', 'two', 'three'].map((key) => <article className="pdf-source-card pdf-source-card-skeleton grid gap-2.5 p-3 sm:p-4" key={key}><header><span className="pdf-skeleton-file" /><span className="pdf-skeleton-status" /></header><div className="pdf-skeleton-metadata"><span /><span /><span /></div><div className="pdf-skeleton-stats"><span /><span /><span /><span /></div><span className="pdf-skeleton-progress" /><footer><span /><span /></footer></article>)}</section>
}

function MetadataEditButton({ label, onClick, value }: { label: string; onClick: () => void; value: string }) {
  return <div className="flex min-w-0 items-center gap-1 rounded-xl border border-border bg-surface-muted/55 px-2 py-1.5"><div className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold text-muted">{label}</span><strong className="block truncate text-xs font-extrabold text-copy">{value || '—'}</strong></div><button aria-label={`Edit ${label}`} className="grid size-7 shrink-0 place-items-center rounded-lg text-primary transition hover:bg-nav-active" onClick={onClick} type="button"><Edit3 size={13} /></button></div>
}

function PdfMetadataDialog({ draft, onChange, onClose, onSave, saving, t }: { draft: PdfImportDetails; onChange: (key: 'wardId' | 'boothId' | 'area', value: string) => void; onClose: () => void; onSave: () => void; saving: boolean; t: PageText }) {
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={onClose} role="presentation"><section aria-modal="true" aria-labelledby="pdf-metadata-title" className={joinClasses(uiClasses.dialog, 'grid w-full max-w-lg gap-4 p-5')} onMouseDown={(event) => event.stopPropagation()} role="dialog"><header className="flex items-start justify-between gap-3"><div><p className="m-0 text-xs font-extrabold uppercase tracking-[0.14em] text-primary-strong">{t.editMetadata}</p><h2 className="mt-1 text-xl font-extrabold text-copy" id="pdf-metadata-title">{t.editMetadata}</h2></div><button aria-label={t.cancel} className={uiClasses.iconButton} disabled={saving} onClick={onClose} type="button"><X size={17} /></button></header><div className="grid gap-3 sm:grid-cols-3"><MetadataInput label={t.ward} value={draft.wardId} onChange={(value) => onChange('wardId', value)} /><MetadataInput label={t.booth} value={draft.boothId} onChange={(value) => onChange('boothId', value)} /><MetadataInput label={t.area} value={draft.area} onChange={(value) => onChange('area', value)} /></div><p className="m-0 text-xs leading-5 text-muted">{t.metadataHint}</p><footer className="flex justify-end gap-2"><button className={joinClasses(uiClasses.button, uiClasses.secondaryButton)} disabled={saving} onClick={onClose} type="button">{t.cancel}</button><button className={joinClasses(uiClasses.button, uiClasses.primaryButton)} disabled={saving || !draft.wardId.trim() || !draft.boothId.trim()} onClick={onSave} type="button">{saving ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />}{saving ? t.saving : t.save}</button></footer></section></div>
}

function MetadataInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return <label className="grid gap-1.5"><span className="text-xs font-extrabold text-copy">{label}</span><input className={uiClasses.input} onChange={(event) => onChange(event.target.value)} value={value} /></label>
}

function StatusPill({ language, status }: { language: AppLanguage; status: PdfImport['status'] }) { return <span className={`pdf-status pdf-status-${status}`}>{statusText(status, language)}</span> }
function QueueInput({ disabled, label, onChange, value }: { disabled?: boolean; label: string; onChange: (value: string) => void; value: string }) { return <label className="pdf-field grid min-w-0 gap-1"><span>{label}</span><input className={uiClasses.input} disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value ?? ''} /></label> }
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
