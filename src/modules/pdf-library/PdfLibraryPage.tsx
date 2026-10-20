import { Check, ChevronDown, Download, FileSpreadsheet, FileText, LoaderCircle, RefreshCcw, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { AppSession } from '../auth/types'
import { readableFirebaseError } from '../auth/firebase-auth'
import type { AppLanguage } from '../app-shell/types'
import { PageState } from '../app-shell/PageState'
import { listPdfImports } from '../pdf-import/pdf-import-service'
import type { PdfImport } from '../pdf-import/types'
import { downloadCsv, downloadExcel, downloadPdf } from '../voter-register/export-voters'
import { loadVoters } from '../voter-register/voter-service'
import type { VoterRecord } from '../voter-register/types'
import { requestSourcePdfDownload, startBrowserDownload } from './pdf-library-service'

type LibraryFilters = { query: string; ward: string; booth: string; area: string; division: string; sourcePdf: string; status: string; uploadedBy: string; uploadedFrom: string; uploadedTo: string }
type OpenLibraryFilter = 'ward' | 'booth' | 'area' | 'division' | 'sourcePdf' | 'status' | 'uploadedBy' | 'date'
type ExportFormat = 'excel' | 'pdf' | 'csv'
const emptyFilters: LibraryFilters = { query: '', ward: '', booth: '', area: '', division: '', sourcePdf: '', status: '', uploadedBy: '', uploadedFrom: '', uploadedTo: '' }

const copy = {
  te: { label: 'డాక్యుమెంట్లు', title: 'PDF లైబ్రరీ', description: 'మీకు అనుమతి ఉన్న సోర్స్ PDFలను ఫిల్టర్ చేసి, ప్రతి PDFలోని ఓటర్ డేటాను ఎగుమతి చేయండి.', refresh: 'రిఫ్రెష్', search: 'అన్ని PDF వివరాల్లో వెతకండి', searchPlaceholder: 'PDF పేరు, వార్డు, బూత్, ప్రాంతం, డివిజన్…', filters: 'ఫిల్టర్లు', ward: 'వార్డు', booth: 'బూత్', area: 'ప్రాంతం', division: 'డివిజన్', source: 'సోర్స్ PDF', status: 'స్థితి', uploadedBy: 'అప్‌లోడ్ చేసినవారు', uploadedFrom: 'అప్‌లోడ్ మొదలు', uploadedTo: 'అప్‌లోడ్ చివరి తేదీ', moreFilters: 'మరిన్ని ఫిల్టర్లు', hideFilters: 'ఫిల్టర్లు దాచండి', all: 'అన్నీ', clear: 'తొలగించండి', close: 'మూసివేయండి', total: 'మొత్తం PDFలు', complete: 'పూర్తయినవి', action: 'చర్య అవసరమైనవి', export: 'ఎగుమతి', excel: 'ఎక్సెల్', pdf: 'PDF', csv: 'CSV', original: 'అసలు PDF', downloading: 'డౌన్‌లోడ్ అవుతోంది…', exporting: 'ఎగుమతి అవుతోంది…', downloadError: 'డౌన్‌లోడ్ కాలేదు.', noVoters: 'ఈ PDFలో ఓటర్ రికార్డులు లేవు.', noData: 'ఇంకా PDFలు లేవు.', noMatch: 'ఈ ఫిల్టర్లకు PDFలు లేవు.', loading: 'PDF లైబ్రరీ లోడ్ అవుతోంది…', error: 'PDF లైబ్రరీ లోడ్ కాలేదు.', retry: 'మళ్లీ ప్రయత్నించండి', uploaded: 'అప్‌లోడ్', rows: 'సేవ్ చేసిన ఓటర్లు' },
  en: { label: 'Documents', title: 'PDF Library', description: 'Filter permitted source PDFs and export the voter data from each PDF.', refresh: 'Refresh', search: 'Search all PDF fields', searchPlaceholder: 'PDF name, ward, booth, area, division…', filters: 'Filters', ward: 'Ward', booth: 'Booth', area: 'Area', division: 'Division', source: 'Source PDF', status: 'Status', uploadedBy: 'Uploaded by', uploadedFrom: 'Uploaded from', uploadedTo: 'Uploaded to', moreFilters: 'More filters', hideFilters: 'Hide filters', all: 'All', clear: 'Clear', close: 'Close', total: 'Total PDFs', complete: 'Completed', action: 'Needs action', export: 'Export', excel: 'Excel', pdf: 'PDF', csv: 'CSV', original: 'Original PDF', downloading: 'Downloading…', exporting: 'Exporting…', downloadError: 'The download could not be completed.', noVoters: 'No voter records are available for this PDF.', noData: 'There are no PDFs yet.', noMatch: 'No PDFs match these filters.', loading: 'Loading PDF library…', error: 'PDF Library could not be loaded.', retry: 'Try again', uploaded: 'Uploaded', rows: 'Voters saved' },
} as const

export function PdfLibraryPage({ language, session }: { language: AppLanguage; session: AppSession }) {
  const [records, setRecords] = useState<PdfImport[]>()
  const [filters, setFilters] = useState<LibraryFilters>(emptyFilters)
  const [openFilter, setOpenFilter] = useState<OpenLibraryFilter>()
  const [error, setError] = useState<string>()
  const [refreshing, setRefreshing] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string>()
  const [exportingKey, setExportingKey] = useState<string>()
  const [openExportId, setOpenExportId] = useState<string>()
  const [showMoreFilters, setShowMoreFilters] = useState(false)
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
  const options = useMemo(() => ({ wards: unique(records?.map((item) => item.wardId)), booths: unique(records?.map((item) => item.boothId)), areas: unique(records?.map((item) => item.area)), divisions: unique(records?.map((item) => item.division)), sourcePdfs: unique(records?.map((item) => item.originalFileName)), statuses: unique(records?.map((item) => item.status)), uploaders: unique(records?.map((item) => item.uploadedByName)) }), [records])
  const visible = useMemo(() => (records ?? []).filter((item) => matches(item, filters)), [records, filters])
  const completed = visible.filter((item) => item.status === 'completed').length
  const needsAction = visible.filter((item) => item.status !== 'completed').length

  const downloadOriginal = async (item: PdfImport) => {
    setDownloadingId(item.id); setDownloadError(undefined)
    try { startBrowserDownload((await requestSourcePdfDownload(item.id)).url, item.originalFileName) } catch (reason) { setDownloadError(`${t.downloadError} ${readableFirebaseError(reason)}`) } finally { setDownloadingId(undefined) }
  }

  const exportPdfVoters = async (item: PdfImport, format: ExportFormat) => {
    const key = `${item.id}:${format}`
    setExportingKey(key); setOpenExportId(undefined); setDownloadError(undefined)
    try {
      const voters = await loadAllVotersForPdf(item.id)
      if (!voters.length) throw new Error(t.noVoters)
      if (format === 'excel') await downloadExcel(voters)
      if (format === 'pdf') await downloadPdf(voters)
      if (format === 'csv') downloadCsv(voters)
    } catch (reason) {
      setDownloadError(`${t.downloadError} ${readableFirebaseError(reason)}`)
    } finally {
      setExportingKey(undefined)
    }
  }

  return <section className="pdf-library-page"><header className="page-intro pdf-library-intro"><div><p>{t.label}</p><h2>{t.title}</h2><span>{t.description}</span></div><button className="voter-secondary-button" onClick={() => void reload()} type="button"><RefreshCcw className={refreshing ? 'animate-spin' : undefined} size={15} />{t.refresh}</button></header>
    <section className="voter-filter-card pdf-library-filter-card">
      <div className="voter-filter-title"><div><Search size={18} /><strong>{t.search}</strong></div><button className="voter-text-button" onClick={() => { setFilters(emptyFilters); setOpenFilter(undefined); setShowMoreFilters(false) }} type="button">{t.clear}</button></div>
      <div className="voter-global-search"><label className="voter-field"><span>{t.search}</span><input placeholder={t.searchPlaceholder} value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} /></label></div>
      <div className="voter-filter-button-row" aria-label={t.filters}>
        <LibraryFilterButton closeLabel={t.close} label={t.ward} options={options.wards} value={filters.ward} any={t.all} open={openFilter === 'ward'} onToggle={() => setOpenFilter(openFilter === 'ward' ? undefined : 'ward')} onChange={(ward) => { setFilters((current) => ({ ...current, ward })); setOpenFilter(undefined) }} />
        <LibraryFilterButton closeLabel={t.close} label={t.booth} options={options.booths} value={filters.booth} any={t.all} open={openFilter === 'booth'} onToggle={() => setOpenFilter(openFilter === 'booth' ? undefined : 'booth')} onChange={(booth) => { setFilters((current) => ({ ...current, booth })); setOpenFilter(undefined) }} />
        <LibraryFilterButton closeLabel={t.close} label={t.area} options={options.areas} value={filters.area} any={t.all} open={openFilter === 'area'} onToggle={() => setOpenFilter(openFilter === 'area' ? undefined : 'area')} onChange={(area) => { setFilters((current) => ({ ...current, area })); setOpenFilter(undefined) }} />
        <button aria-expanded={showMoreFilters} className={`voter-filter-menu-button voter-more-filters-button${filters.division || filters.sourcePdf || filters.status || filters.uploadedBy || filters.uploadedFrom || filters.uploadedTo ? ' has-value' : ''}`} onClick={() => { setShowMoreFilters((current) => !current); setOpenFilter(undefined) }} type="button"><span>{t.filters}</span><strong>{showMoreFilters ? t.hideFilters : t.moreFilters}</strong><ChevronDown size={14} /></button>
        {showMoreFilters ? <>
          <LibraryFilterButton closeLabel={t.close} label={t.division} options={options.divisions} value={filters.division} any={t.all} open={openFilter === 'division'} onToggle={() => setOpenFilter(openFilter === 'division' ? undefined : 'division')} onChange={(division) => { setFilters((current) => ({ ...current, division })); setOpenFilter(undefined) }} />
          <LibraryFilterButton closeLabel={t.close} label={t.source} options={options.sourcePdfs} value={filters.sourcePdf} any={t.all} open={openFilter === 'sourcePdf'} onToggle={() => setOpenFilter(openFilter === 'sourcePdf' ? undefined : 'sourcePdf')} onChange={(sourcePdf) => { setFilters((current) => ({ ...current, sourcePdf })); setOpenFilter(undefined) }} />
          <LibraryFilterButton closeLabel={t.close} label={t.status} options={options.statuses} value={filters.status} any={t.all} open={openFilter === 'status'} onToggle={() => setOpenFilter(openFilter === 'status' ? undefined : 'status')} onChange={(status) => { setFilters((current) => ({ ...current, status })); setOpenFilter(undefined) }} />
          <LibraryFilterButton closeLabel={t.close} label={t.uploadedBy} options={options.uploaders} value={filters.uploadedBy} any={t.all} open={openFilter === 'uploadedBy'} onToggle={() => setOpenFilter(openFilter === 'uploadedBy' ? undefined : 'uploadedBy')} onChange={(uploadedBy) => { setFilters((current) => ({ ...current, uploadedBy })); setOpenFilter(undefined) }} />
          <LibraryDateFilterButton closeLabel={t.close} from={filters.uploadedFrom} label={`${t.uploadedFrom} / ${t.uploadedTo}`} open={openFilter === 'date'} to={filters.uploadedTo} onFromChange={(uploadedFrom) => setFilters((current) => ({ ...current, uploadedFrom }))} onToChange={(uploadedTo) => setFilters((current) => ({ ...current, uploadedTo }))} onToggle={() => setOpenFilter(openFilter === 'date' ? undefined : 'date')} t={t} />
        </> : null}
      </div>
    </section>
    {downloadError ? <p className="form-alert form-alert-error">{downloadError}</p> : null}
    {records === undefined && !error ? <PageState kind="loading" title={t.loading} description="" /> : null}
    {error ? <PageState kind="error" title={t.error} description={error} actionLabel={t.retry} onAction={() => void reload()} /> : null}
    {records !== undefined && !error ? <><section className="pdf-library-stats"><Stat label={t.total} value={visible.length} /><Stat label={t.complete} value={completed} /><Stat label={t.action} value={needsAction} /></section>{records.length === 0 ? <PageState kind="empty" title={t.noData} description="" /> : visible.length === 0 ? <PageState kind="empty" title={t.noMatch} description="" /> : <div className="pdf-library-list">{visible.map((item) => <article className="pdf-library-row" key={item.id}><div className="pdf-library-file"><FileText size={20} /><div><strong>{item.originalFileName}</strong><span>{t.ward} {item.wardId} · {t.booth} {item.boothId}{item.area ? ` · ${item.area}` : ''}{item.division ? ` · ${item.division}` : ''}</span></div></div><div className="pdf-library-meta"><span className={`pdf-library-status status-${item.status}`}>{item.status}</span><span>{t.rows}: {item.rowCount ?? '—'}</span><span>{t.uploaded}: {formatDate(item.uploadedAt ?? item.createdAt, language)} · {item.uploadedByName}</span></div><div className="pdf-library-actions">{canDownload ? <><ExportMenu exportingKey={exportingKey} id={item.id} onSelect={(format) => void exportPdfVoters(item, format)} onToggle={() => setOpenExportId(openExportId === item.id ? undefined : item.id)} open={openExportId === item.id} t={t} /><button disabled={downloadingId === item.id} onClick={() => void downloadOriginal(item)} type="button">{downloadingId === item.id ? <LoaderCircle className="animate-spin" size={15} /> : <Download size={15} />}{downloadingId === item.id ? t.downloading : t.original}</button></> : null}</div></article>)}</div>}</> : null}
  </section>
}

function LibraryFilterButton({ label, options, value, any, open, onToggle, onChange, closeLabel }: { label: string; options: string[]; value: string; any: string; open: boolean; onToggle: () => void; onChange: (value: string) => void; closeLabel: string }) {
  return <div className="voter-filter-menu pdf-library-filter-menu">
    <button aria-expanded={open} className={`voter-filter-menu-button${value ? ' has-value' : ''}`} onClick={onToggle} type="button"><span>{label}</span><strong>{value || any}</strong><ChevronDown size={14} /></button>
    {open ? <div aria-modal="true" className="voter-filter-menu-popover" role="dialog"><div className="voter-filter-menu-popover-header"><strong>{label}</strong><button aria-label={closeLabel} onClick={onToggle} type="button"><X size={17} /></button></div><div className="voter-filter-menu-options" role="menu"><button className={!value ? 'is-selected' : ''} onClick={() => onChange('')} role="menuitem" type="button"><span>{any}</span>{!value ? <Check size={14} /> : null}</button>{options.map((option) => <button className={value === option ? 'is-selected' : ''} key={option} onClick={() => onChange(option)} role="menuitem" type="button"><span>{option}</span>{value === option ? <Check size={14} /> : null}</button>)}</div></div> : null}
  </div>
}

function LibraryDateFilterButton({ closeLabel, from, label, open, to, onFromChange, onToChange, onToggle, t }: { closeLabel: string; from: string; label: string; open: boolean; to: string; onFromChange: (value: string) => void; onToChange: (value: string) => void; onToggle: () => void; t: { all: string; close: string; uploadedFrom: string; uploadedTo: string } }) {
  const value = from && to ? `${from} – ${to}` : from || to || t.all
  return <div className="voter-filter-menu pdf-library-filter-menu">
    <button aria-expanded={open} className={`voter-filter-menu-button${from || to ? ' has-value' : ''}`} onClick={onToggle} type="button"><span>{label}</span><strong>{value}</strong><ChevronDown size={14} /></button>
    {open ? <div aria-modal="true" className="voter-filter-menu-popover voter-date-filter-popover" role="dialog"><div className="voter-filter-menu-popover-header"><strong>{label}</strong><button aria-label={closeLabel} onClick={onToggle} type="button"><X size={17} /></button></div><div className="voter-filter-menu-options"><label className="voter-field"><span>{t.uploadedFrom}</span><input type="date" value={from} onChange={(event) => onFromChange(event.target.value)} /></label><label className="voter-field"><span>{t.uploadedTo}</span><input type="date" value={to} onChange={(event) => onToChange(event.target.value)} /></label></div></div> : null}
  </div>
}

function ExportMenu({ exportingKey, id, onSelect, onToggle, open, t }: { exportingKey?: string; id: string; onSelect: (format: ExportFormat) => void; onToggle: () => void; open: boolean; t: { export: string; exporting: string; excel: string; pdf: string; csv: string } }) {
  const isExporting = exportingKey?.startsWith(`${id}:`) ?? false
  return <div className="pdf-export-menu">
    <button aria-expanded={open} aria-haspopup="menu" className="pdf-export-trigger" disabled={isExporting} onClick={onToggle} type="button">{isExporting ? <LoaderCircle className="animate-spin" size={15} /> : <Download size={15} />}{isExporting ? t.exporting : t.export}<ChevronDown size={14} /></button>
    {open ? <div className="pdf-export-options" role="menu"><button onClick={() => onSelect('excel')} role="menuitem" type="button"><FileSpreadsheet size={15} />{t.excel}</button><button onClick={() => onSelect('pdf')} role="menuitem" type="button"><FileText size={15} />{t.pdf}</button><button onClick={() => onSelect('csv')} role="menuitem" type="button"><Download size={15} />{t.csv}</button></div> : null}
  </div>
}

function Stat({ label, value }: { label: string; value: number }) { return <article><strong>{value}</strong><span>{label}</span></article> }
function unique(values?: string[]) { return [...new Set((values ?? []).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) }
function matches(item: PdfImport, filters: LibraryFilters) {
  const query = filters.query.toLocaleLowerCase()
  const uploadedDate = (item.uploadedAt ?? item.createdAt ?? '').slice(0, 10)
  const searchable = [item.originalFileName, item.wardId, item.boothId, item.area, item.division, item.status, item.uploadedByName].join(' ').toLocaleLowerCase()
  return (!query || searchable.includes(query)) &&
    (!filters.ward || item.wardId === filters.ward) &&
    (!filters.booth || item.boothId === filters.booth) &&
    (!filters.area || item.area === filters.area) &&
    (!filters.division || item.division === filters.division) &&
    (!filters.sourcePdf || item.originalFileName === filters.sourcePdf) &&
    (!filters.status || item.status === filters.status) &&
    (!filters.uploadedBy || item.uploadedByName === filters.uploadedBy) &&
    (!filters.uploadedFrom || uploadedDate >= filters.uploadedFrom) &&
    (!filters.uploadedTo || uploadedDate <= filters.uploadedTo)
}

async function loadAllVotersForPdf(sourcePdfId: string) {
  const voters: VoterRecord[] = []
  let cursor: string | undefined
  let hasMore = true
  while (hasMore) {
    const result = await loadVoters(cursor, sourcePdfId)
    voters.push(...result.records)
    cursor = result.nextCursor
    hasMore = result.hasMore && Boolean(cursor)
  }
  return voters
}

function formatDate(value: string | undefined, language: AppLanguage) { return value ? new Intl.DateTimeFormat(language === 'te' ? 'te-IN' : 'en-IN', { dateStyle: 'medium' }).format(new Date(value)) : '—' }
