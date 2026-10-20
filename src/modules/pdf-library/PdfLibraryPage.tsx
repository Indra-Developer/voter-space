import { Check, ChevronDown, Download, FileSpreadsheet, FileText, LoaderCircle, RefreshCcw, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { AppSession } from '../auth/types'
import { readableFirebaseError } from '../auth/firebase-auth'
import type { AppLanguage } from '../app-shell/types'
import { PageState } from '../app-shell/PageState'
import { listPdfImports } from '../pdf-import/pdf-import-service'
import type { PdfImport } from '../pdf-import/types'
import { downloadLibraryCsv, downloadLibraryExcel, downloadLibraryPdf } from './export-pdf-library'
import { requestSourcePdfDownload, startBrowserDownload } from './pdf-library-service'

type LibraryFilters = { query: string; ward: string; booth: string; area: string; status: string }
type OpenLibraryFilter = 'ward' | 'booth' | 'area' | 'status'
const emptyFilters: LibraryFilters = { query: '', ward: '', booth: '', area: '', status: '' }

const copy = {
  te: { label: 'డాక్యుమెంట్లు', title: 'PDF లైబ్రరీ', description: 'మీకు అనుమతి ఉన్న సోర్స్ PDFలను చూడండి, ఫిల్టర్ చేయండి, మరియు రిపోర్టులు డౌన్‌లోడ్ చేయండి.', refresh: 'రిఫ్రెష్', search: 'PDF పేరు వెతకండి', ward: 'వార్డు', booth: 'బూత్', area: 'ప్రాంతం', status: 'స్థితి', all: 'అన్నీ', clear: 'తొలగించండి', total: 'మొత్తం PDFలు', complete: 'పూర్తయినవి', action: 'ప్రాసెస్‌లో ఉన్నవి', reports: 'ఫిల్టర్ చేసిన రిపోర్ట్', reportHint: 'ఎంచుకున్న వార్డు, బూత్ మరియు ప్రాంతం PDFలు మాత్రమే ఎగుమతి అవుతాయి.', excel: 'ఎక్సెల్', pdf: 'PDF', csv: 'CSV', original: 'అసలు PDF', downloading: 'డౌన్‌లోడ్ అవుతోంది…', downloadError: 'అసలు PDF డౌన్‌లోడ్ కాలేదు.', noData: 'ఇంకా PDFలు లేవు.', noMatch: 'ఈ ఫిల్టర్లకు PDFలు లేవు.', loading: 'PDF లైబ్రరీ లోడ్ అవుతోంది…', error: 'PDF లైబ్రరీ లోడ్ కాలేదు.', retry: 'మళ్లీ ప్రయత్నించండి', uploaded: 'అప్‌లోడ్', rows: 'సేవ్ చేసిన ఓటర్లు' },
  en: { label: 'Documents', title: 'PDF Library', description: 'View permitted source PDFs, filter them, and download reports.', refresh: 'Refresh', search: 'Search PDF name', ward: 'Ward', booth: 'Booth', area: 'Area', status: 'Status', all: 'All', clear: 'Clear', total: 'Total PDFs', complete: 'Completed', action: 'Processing or stopped', reports: 'Filtered report', reportHint: 'Exports include only the selected ward, booth, and area PDFs.', excel: 'Excel', pdf: 'PDF', csv: 'CSV', original: 'Original PDF', downloading: 'Downloading…', downloadError: 'The original PDF could not be downloaded.', noData: 'There are no PDFs yet.', noMatch: 'No PDFs match these filters.', loading: 'Loading PDF library…', error: 'PDF Library could not be loaded.', retry: 'Try again', uploaded: 'Uploaded', rows: 'Voters saved' },
} as const

export function PdfLibraryPage({ language, session }: { language: AppLanguage; session: AppSession }) {
  const [records, setRecords] = useState<PdfImport[]>()
  const [filters, setFilters] = useState<LibraryFilters>(emptyFilters)
  const [openFilter, setOpenFilter] = useState<OpenLibraryFilter>()
  const [error, setError] = useState<string>()
  const [refreshing, setRefreshing] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string>()
  const [downloadError, setDownloadError] = useState<string>()
  const t = copy[language]
  const canDownload = session.profile.role === 'superAdmin' || session.profile.permissions.download

  const reload = async () => {
    setRefreshing(true); setError(undefined)
    try { setRecords(await listPdfImports()) } catch (reason) { setError(readableFirebaseError(reason)) } finally { setRefreshing(false) }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0)
    return () => window.clearTimeout(timer)
  }, [])
  const options = useMemo(() => ({ wards: unique(records?.map((item) => item.wardId)), booths: unique(records?.map((item) => item.boothId)), areas: unique(records?.map((item) => item.area)), statuses: unique(records?.map((item) => item.status)) }), [records])
  const visible = useMemo(() => (records ?? []).filter((item) => matches(item, filters)), [records, filters])
  const completed = visible.filter((item) => item.status === 'completed').length
  const needsAction = visible.filter((item) => item.status !== 'completed').length

  const downloadOriginal = async (item: PdfImport) => {
    setDownloadingId(item.id); setDownloadError(undefined)
    try { startBrowserDownload((await requestSourcePdfDownload(item.id)).url, item.originalFileName) } catch (reason) { setDownloadError(`${t.downloadError} ${readableFirebaseError(reason)}`) } finally { setDownloadingId(undefined) }
  }

  return <section className="pdf-library-page"><header className="page-intro pdf-library-intro"><div><p>{t.label}</p><h2>{t.title}</h2><span>{t.description}</span></div><button className="voter-secondary-button" onClick={() => void reload()} type="button"><RefreshCcw className={refreshing ? 'animate-spin' : undefined} size={15} />{t.refresh}</button></header>
    <section className="pdf-library-filter-card"><div className="pdf-library-filter-title"><Search size={18} /><strong>{t.reports}</strong><button className="voter-text-button" onClick={() => { setFilters(emptyFilters); setOpenFilter(undefined) }} type="button">{t.clear}</button></div><div className="pdf-library-filter-grid"><label><span>{t.search}</span><input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} /></label><LibraryFilterButton label={t.ward} options={options.wards} value={filters.ward} any={t.all} open={openFilter === 'ward'} onToggle={() => setOpenFilter(openFilter === 'ward' ? undefined : 'ward')} onChange={(ward) => { setFilters((current) => ({ ...current, ward })); setOpenFilter(undefined) }} /><LibraryFilterButton label={t.booth} options={options.booths} value={filters.booth} any={t.all} open={openFilter === 'booth'} onToggle={() => setOpenFilter(openFilter === 'booth' ? undefined : 'booth')} onChange={(booth) => { setFilters((current) => ({ ...current, booth })); setOpenFilter(undefined) }} /><LibraryFilterButton label={t.area} options={options.areas} value={filters.area} any={t.all} open={openFilter === 'area'} onToggle={() => setOpenFilter(openFilter === 'area' ? undefined : 'area')} onChange={(area) => { setFilters((current) => ({ ...current, area })); setOpenFilter(undefined) }} /><LibraryFilterButton label={t.status} options={options.statuses} value={filters.status} any={t.all} open={openFilter === 'status'} onToggle={() => setOpenFilter(openFilter === 'status' ? undefined : 'status')} onChange={(status) => { setFilters((current) => ({ ...current, status })); setOpenFilter(undefined) }} /></div></section>
    {downloadError ? <p className="form-alert form-alert-error">{downloadError}</p> : null}
    {records === undefined && !error ? <PageState kind="loading" title={t.loading} description="" /> : null}
    {error ? <PageState kind="error" title={t.error} description={error} actionLabel={t.retry} onAction={() => void reload()} /> : null}
    {records !== undefined && !error ? <><section className="pdf-library-stats"><Stat label={t.total} value={visible.length} /><Stat label={t.complete} value={completed} /><Stat label={t.action} value={needsAction} /></section><section className="pdf-library-report"><div><strong>{t.reports}</strong><span>{t.reportHint}</span></div><div>{canDownload ? <><button onClick={() => void downloadLibraryExcel(visible)} type="button"><FileSpreadsheet size={15} />{t.excel}</button><button onClick={() => void downloadLibraryPdf(visible)} type="button"><FileText size={15} />{t.pdf}</button><button onClick={() => downloadLibraryCsv(visible)} type="button"><Download size={15} />{t.csv}</button></> : null}</div></section>{records.length === 0 ? <PageState kind="empty" title={t.noData} description="" /> : visible.length === 0 ? <PageState kind="empty" title={t.noMatch} description="" /> : <div className="pdf-library-list">{visible.map((item) => <article className="pdf-library-row" key={item.id}><div className="pdf-library-file"><FileText size={20} /><div><strong>{item.originalFileName}</strong><span>{t.ward} {item.wardId} · {t.booth} {item.boothId}{item.area ? ` · ${item.area}` : ''}</span></div></div><div className="pdf-library-meta"><span className={`pdf-library-status status-${item.status}`}>{item.status}</span><span>{t.rows}: {item.rowCount ?? '—'}</span><span>{t.uploaded}: {formatDate(item.uploadedAt ?? item.createdAt, language)} · {item.uploadedByName}</span></div><div className="pdf-library-actions">{canDownload ? <button disabled={downloadingId === item.id} onClick={() => void downloadOriginal(item)} type="button">{downloadingId === item.id ? <LoaderCircle className="animate-spin" size={15} /> : <Download size={15} />}{downloadingId === item.id ? t.downloading : t.original}</button> : null}</div></article>)}</div>}</> : null}
  </section>
}

function LibraryFilterButton({ label, options, value, any, open, onToggle, onChange }: { label: string; options: string[]; value: string; any: string; open: boolean; onToggle: () => void; onChange: (value: string) => void }) {
  return <div className="voter-filter-menu pdf-library-filter-menu">
    <button aria-expanded={open} className={`voter-filter-menu-button${value ? ' has-value' : ''}`} onClick={onToggle} type="button"><span>{label}</span><strong>{value || any}</strong><ChevronDown size={14} /></button>
    {open ? <div className="voter-filter-menu-popover" role="menu"><button className={!value ? 'is-selected' : ''} onClick={() => onChange('')} role="menuitem" type="button"><span>{any}</span>{!value ? <Check size={14} /> : null}</button>{options.map((option) => <button className={value === option ? 'is-selected' : ''} key={option} onClick={() => onChange(option)} role="menuitem" type="button"><span>{option}</span>{value === option ? <Check size={14} /> : null}</button>)}</div> : null}
  </div>
}
function Stat({ label, value }: { label: string; value: number }) { return <article><strong>{value}</strong><span>{label}</span></article> }
function unique(values?: string[]) { return [...new Set((values ?? []).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) }
function matches(item: PdfImport, filters: LibraryFilters) { const query = filters.query.toLocaleLowerCase(); return (!query || item.originalFileName.toLocaleLowerCase().includes(query)) && (!filters.ward || item.wardId === filters.ward) && (!filters.booth || item.boothId === filters.booth) && (!filters.area || item.area === filters.area) && (!filters.status || item.status === filters.status) }
function formatDate(value: string | undefined, language: AppLanguage) { return value ? new Intl.DateTimeFormat(language === 'te' ? 'te-IN' : 'en-IN', { dateStyle: 'medium' }).format(new Date(value)) : '—' }
