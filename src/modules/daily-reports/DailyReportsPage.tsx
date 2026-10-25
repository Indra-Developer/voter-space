import { CalendarDays, CheckCircle2, ChevronDown, Download, FileBarChart2, FileText, Printer, Search, ShieldAlert, UsersRound, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppLanguage, NavigationKey } from '../app-shell/types'
import { joinClasses } from '../app-shell/ui'
import type { AppSession } from '../auth/types'
import { listPdfImports } from '../pdf-import/pdf-import-service'
import type { PdfImport } from '../pdf-import/types'
import { countVoters, loadVoterFilterOptions, loadVoters, runVoterExport, type VoterExportFormat } from '../voter-register/voter-service'
import { emptyVoterFilters, type VoterFilterOptions, type VoterFilters, type VoterRecord } from '../voter-register/types'
import './daily-reports.css'

type DailyReportsPageProps = {
  language: AppLanguage
  session: AppSession
  onNavigate: (key: NavigationKey, search?: string) => void
}

const copy = {
  en: {
    eyebrow: 'Live account report', title: 'Daily reports', description: 'Review the voter records and PDF activity visible in your account scope.',
    date: 'Report date', today: 'Today', yesterday: 'Yesterday', search: 'Search voter records', searchPlaceholder: 'Name, voter ID, door number, serial, ward, booth, area, division, PDF…',
    ward: 'Ward', booth: 'Booth', all: 'All', status: 'Review status', allStatuses: 'All statuses', pending: 'Pending', reviewed: 'Reviewed', needsReview: 'Needs review', clear: 'Clear filters',
    matching: 'Matching voters', reviewedCount: 'Reviewed', attention: 'Needs review', pdfActivity: 'PDF activity', reportScope: 'Live data in your access scope',
    voterResults: 'Voter results', noVoters: 'No voter found for this date and search.', noPdfs: 'No PDF activity for this date.', source: 'Source PDF', area: 'Area', door: 'Door', id: 'Voter ID', relative: 'Relative name', relationship: 'Relationship',
    openRegister: 'Open in register', export: 'Export', excel: 'Excel', pdf: 'PDF', csv: 'CSV', print: 'Print report', exporting: 'Preparing…', exportDenied: 'Download permission is required for exports.',
    loadMore: 'Load more', showing: 'Showing', of: 'of', voters: 'voters', rows: 'records', pages: 'pages', completed: 'Completed', processing: 'Processing', review: 'Needs review', failed: 'Failed', uploaded: 'Uploaded',
    noFirebase: 'Live data is not available. Check the Firebase connection and try again.', error: 'The report could not be loaded. Please try again.',
  },
  te: {
    eyebrow: 'లైవ్ ఖాతా నివేదిక', title: 'రోజువారీ నివేదికలు', description: 'మీ ఖాతా పరిధిలో కనిపించే ఓటర్ రికార్డులు మరియు PDF కార్యకలాపాలను చూడండి.',
    date: 'నివేదిక తేదీ', today: 'ఈ రోజు', yesterday: 'నిన్న', search: 'ఓటర్ రికార్డులను వెతకండి', searchPlaceholder: 'పేరు, ఓటర్ ID, డోర్ నంబర్, సీరియల్, వార్డు, బూత్, ప్రాంతం, డివిజన్, PDF…',
    ward: 'వార్డు', booth: 'బూత్', all: 'అన్నీ', status: 'రివ్యూ స్థితి', allStatuses: 'అన్ని స్థితులు', pending: 'పెండింగ్', reviewed: 'రివ్యూ చేసినవి', needsReview: 'రివ్యూ అవసరం', clear: 'ఫిల్టర్లు తొలగించండి',
    matching: 'సరిపోలిన ఓటర్లు', reviewedCount: 'రివ్యూ చేసినవి', attention: 'రివ్యూ అవసరం', pdfActivity: 'PDF కార్యకలాపాలు', reportScope: 'మీ యాక్సెస్ పరిధిలోని లైవ్ డేటా',
    voterResults: 'ఓటర్ ఫలితాలు', noVoters: 'ఈ తేదీ మరియు శోధనకు ఓటర్ కనబడలేదు.', noPdfs: 'ఈ తేదీకి PDF కార్యకలాపాలు లేవు.', source: 'సోర్స్ PDF', area: 'ప్రాంతం', door: 'డోర్', id: 'ఓటర్ ID', relative: 'బంధువు పేరు', relationship: 'బంధం',
    openRegister: 'రిజిస్టర్‌లో తెరవండి', export: 'ఎగుమతి', excel: 'Excel', pdf: 'PDF', csv: 'CSV', print: 'నివేదిక ప్రింట్', exporting: 'సిద్ధం అవుతోంది…', exportDenied: 'ఎగుమతికి డౌన్‌లోడ్ అనుమతి అవసరం.',
    loadMore: 'మరిన్ని లోడ్ చేయండి', showing: 'చూపుతున్నవి', of: 'లో', voters: 'ఓటర్లు', rows: 'రికార్డులు', pages: 'పేజీలు', completed: 'పూర్తయింది', processing: 'ప్రాసెస్‌లో ఉంది', review: 'రివ్యూ అవసరం', failed: 'విఫలమైంది', uploaded: 'అప్‌లోడ్ అయింది',
    noFirebase: 'లైవ్ డేటా అందుబాటులో లేదు. Firebase కనెక్షన్‌ను తనిఖీ చేసి మళ్లీ ప్రయత్నించండి.', error: 'నివేదిక లోడ్ కాలేదు. మళ్లీ ప్రయత్నించండి.',
  },
} as const

type ReportText = { [Key in keyof typeof copy.en]: string }

export function DailyReportsPage({ language, session, onNavigate }: DailyReportsPageProps) {
  const t = copy[language]
  const [reportDate, setReportDate] = useState(localDateString)
  const [filters, setFilters] = useState<VoterFilters>(emptyVoterFilters)
  const [options, setOptions] = useState<VoterFilterOptions>({ wards: [], booths: [], areas: [], divisions: [], sourcePdfs: [], uploaders: [], boothsByWard: {} })
  const [records, setRecords] = useState<VoterRecord[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [reviewedCount, setReviewedCount] = useState(0)
  const [needsReviewCount, setNeedsReviewCount] = useState(0)
  const [pdfs, setPdfs] = useState<PdfImport[]>([])
  const [nextCursor, setNextCursor] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string>()
  const [exporting, setExporting] = useState<VoterExportFormat>()
  const canDownload = session.profile.role === 'superAdmin' || session.profile.permissions.download

  const queryFilters = useMemo(() => ({ ...filters, uploadedFrom: reportDate, uploadedTo: reportDate }), [filters, reportDate])
  const boothOptions = useMemo(() => filters.wardId ? options.boothsByWard?.[filters.wardId] ?? [] : options.booths, [filters.wardId, options.booths, options.boothsByWard])

  useEffect(() => {
    let active = true
    void Promise.all([loadVoterFilterOptions(), listPdfImports()]).then(([filterOptions, importRecords]) => {
      if (!active) return
      setOptions(filterOptions)
      setPdfs(importRecords)
    }).catch(() => { if (active) setError(t.noFirebase) })
    return () => { active = false }
  }, [t.noFirebase])

  const loadReport = useCallback(async (force = false) => {
    setLoading(true)
    setError(undefined)
    try {
      const [page, total, reviewed, needsReview] = await Promise.all([
        loadVoters(undefined, { filters: queryFilters, force }),
        countVoters(queryFilters, { force }),
        countVoters({ ...queryFilters, reviewStatus: 'reviewed' }, { force }),
        countVoters({ ...queryFilters, needsReview: 'yes' }, { force }),
      ])
      setRecords(page.records)
      setNextCursor(page.nextCursor)
      setTotalCount(total.totalCount)
      setReviewedCount(reviewed.totalCount)
      setNeedsReviewCount(needsReview.totalCount)
    } catch {
      setError(t.error)
      setRecords([])
      setNextCursor(undefined)
      setTotalCount(0)
      setReviewedCount(0)
      setNeedsReviewCount(0)
    } finally {
      setLoading(false)
    }
  }, [queryFilters, t.error])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReport(), 300)
    return () => window.clearTimeout(timer)
  }, [loadReport])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await loadVoters(nextCursor, { filters: queryFilters })
      setRecords((current) => [...current, ...page.records.filter((record) => !current.some((item) => item.id === record.id))])
      setNextCursor(page.nextCursor)
    } catch {
      setError(t.error)
    } finally {
      setLoadingMore(false)
    }
  }

  const filteredPdfs = useMemo(() => pdfs.filter((item) => {
    const createdDate = (item.uploadedAt ?? item.createdAt ?? '').slice(0, 10)
    if (createdDate !== reportDate) return false
    if (filters.wardId && item.wardId !== filters.wardId) return false
    if (filters.boothId && item.boothId !== filters.boothId) return false
    if (filters.area && !item.area.toLocaleLowerCase().includes(filters.area.toLocaleLowerCase())) return false
    return true
  }), [filters.area, filters.boothId, filters.wardId, pdfs, reportDate])

  const groupedRecords = useMemo(() => {
    const groups = new Map<string, VoterRecord[]>()
    records.forEach((record) => groups.set(record.doorNumber || '—', [...(groups.get(record.doorNumber || '—') ?? []), record]))
    return [...groups.entries()]
  }, [records])

  const setFilter = (key: keyof VoterFilters, value: string) => setFilters((current) => ({ ...current, [key]: value, ...(key === 'wardId' ? { boothId: '' } : {}) }))
  const clearFilters = () => setFilters(emptyVoterFilters)
  const setQuickDate = (offset: number) => setReportDate(shiftDate(new Date(), offset))

  const exportReport = async (format: VoterExportFormat) => {
    if (!canDownload || exporting) return
    setExporting(format)
    try {
      await runVoterExport({ format, filters: queryFilters, fileName: `daily-report-${reportDate}`, onJob: () => undefined })
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : t.error)
    } finally {
      setExporting(undefined)
    }
  }

  return <section className="daily-reports-page daily-reports print-report" data-report-date={reportDate}>
    <header className="daily-reports-hero">
      <div><p className="daily-reports-eyebrow"><FileBarChart2 size={16} />{t.eyebrow}</p><h2>{t.title}</h2><span>{t.description}</span></div>
      <div className="daily-reports-date-control"><label htmlFor="daily-report-date"><CalendarDays size={17} />{t.date}</label><input id="daily-report-date" type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} /><div className="daily-reports-date-actions"><button type="button" onClick={() => setQuickDate(0)}>{t.today}</button><button type="button" onClick={() => setQuickDate(-1)}>{t.yesterday}</button></div></div>
    </header>

    <section className="daily-reports-toolbar" aria-label={t.search}>
      <label className="daily-reports-search"><Search size={18} /><span className="sr-only">{t.search}</span><input value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder={t.searchPlaceholder} /></label>
      <div className="daily-reports-filter-row"><label><span>{t.ward}</span><select value={filters.wardId} onChange={(event) => setFilter('wardId', event.target.value)}><option value="">{t.all}</option>{options.wards.map((ward) => <option key={ward} value={ward}>{ward}</option>)}</select></label><label><span>{t.booth}</span><select value={filters.boothId} onChange={(event) => setFilter('boothId', event.target.value)}><option value="">{t.all}</option>{boothOptions.map((booth) => <option key={booth} value={booth}>{booth}</option>)}</select></label><label><span>{t.status}</span><select value={filters.reviewStatus} onChange={(event) => setFilter('reviewStatus', event.target.value)}><option value="">{t.allStatuses}</option><option value="pending">{t.pending}</option><option value="reviewed">{t.reviewed}</option><option value="needsReview">{t.needsReview}</option></select></label><button className="daily-reports-clear" type="button" onClick={clearFilters}><X size={15} />{t.clear}</button></div>
    </section>

    <section className="daily-reports-metrics" aria-label={t.reportScope}><MetricCard icon={<UsersRound size={19} />} label={t.matching} value={totalCount} loading={loading} /><MetricCard icon={<CheckCircle2 size={19} />} label={t.reviewedCount} value={reviewedCount} loading={loading} /><MetricCard icon={<ShieldAlert size={19} />} label={t.attention} value={needsReviewCount} loading={loading} tone="attention" /><MetricCard icon={<FileText size={19} />} label={t.pdfActivity} value={filteredPdfs.length} loading={false} /></section>

    <section className="daily-reports-actions"><div><strong>{t.export}</strong><small>{t.reportScope}</small></div><div className="daily-reports-action-buttons"><ExportButton format="excel" label={t.excel} onClick={() => void exportReport('excel')} loading={exporting === 'excel'} disabled={!canDownload || Boolean(exporting)} /><ExportButton format="pdf" label={t.pdf} onClick={() => void exportReport('pdf')} loading={exporting === 'pdf'} disabled={!canDownload || Boolean(exporting)} /><ExportButton format="csv" label={t.csv} onClick={() => void exportReport('csv')} loading={exporting === 'csv'} disabled={!canDownload || Boolean(exporting)} /><button className="daily-reports-print" type="button" onClick={() => window.print()}><Printer size={16} />{t.print}</button></div>{!canDownload ? <small className="daily-reports-permission-note">{t.exportDenied}</small> : null}</section>

    {error ? <p className="daily-reports-error" role="alert">{error}</p> : null}
    <section className="daily-reports-results"><header><div><p>{t.voterResults}</p><h3>{loading ? '—' : totalCount.toLocaleString()} <small>{t.voters}</small></h3></div><span>{t.showing} {records.length} {t.of} {totalCount}</span></header>{loading ? <ReportSkeleton /> : groupedRecords.length ? <div className="daily-reports-groups">{groupedRecords.map(([door, group]) => <article className="daily-report-door-group" key={door}><header><div><span>{t.door}</span><strong>{door}</strong></div><span>{group.length} {t.voters}</span></header><div className="daily-report-voter-grid">{group.map((record) => <VoterReportCard key={record.id} record={record} t={t} onOpen={() => onNavigate('register')} />)}</div></article>)}</div> : <EmptyState icon={<Search size={22} />} text={t.noVoters} />}{nextCursor && !loading ? <button className="daily-reports-load-more" disabled={loadingMore} onClick={() => void loadMore()} type="button">{loadingMore ? '…' : t.loadMore}</button> : null}</section>

    <section className="daily-reports-pdf-activity"><header><div><p>{t.pdfActivity}</p><h3>{filteredPdfs.length} <small>{t.rows}</small></h3></div><FileText size={20} /></header>{filteredPdfs.length ? <div className="daily-reports-pdf-list">{filteredPdfs.map((item) => <PdfActivityCard item={item} key={item.id} t={t} />)}</div> : <EmptyState icon={<FileText size={22} />} text={t.noPdfs} />}</section>
  </section>
}

function MetricCard({ icon, label, value, loading, tone = '' }: { icon: React.ReactNode; label: string; value: number; loading: boolean; tone?: string }) {
  return <article className={joinClasses('daily-report-metric', tone && `is-${tone}`)}><span>{icon}</span><div><small>{label}</small>{loading ? <i aria-hidden="true" /> : <strong>{value.toLocaleString()}</strong>}</div></article>
}

function ExportButton({ format, label, onClick, loading, disabled }: { format: VoterExportFormat; label: string; onClick: () => void; loading: boolean; disabled: boolean }) {
  return <button className={joinClasses('daily-report-export', `is-${format}`)} disabled={disabled} onClick={onClick} type="button">{loading ? <span className="daily-report-spinner" /> : <Download size={15} />}{loading ? '…' : label}</button>
}

function VoterReportCard({ record, t, onOpen }: { record: VoterRecord; t: ReportText; onOpen: () => void }) {
  const status = record.needsReview || record.reviewStatus === 'needsReview' ? t.needsReview : record.reviewStatus === 'reviewed' ? t.reviewed : t.pending
  return <article className="daily-report-voter-card"><div className="daily-report-voter-top"><strong>{record.fullName || '—'}</strong><span className={joinClasses('daily-report-status', record.needsReview || record.reviewStatus === 'needsReview' ? 'is-attention' : record.reviewStatus === 'reviewed' ? 'is-reviewed' : 'is-pending')}>{status}</span></div><div className="daily-report-voter-fields"><span><small>{t.id}</small><b>{record.voterId || '—'}</b></span><span><small>{t.relative}</small><b>{record.relativeName || '—'}</b></span><span><small>{t.relationship}</small><b>{record.relationshipType || '—'}</b></span><span><small>{t.area}</small><b>{record.area || '—'}</b></span><span><small>{t.ward} · {t.booth}</small><b>{record.wardId || '—'} · {record.boothId || '—'}</b></span><span><small>{t.source}</small><b>{record.sourcePdfName || '—'}</b></span></div><button className="daily-report-open" onClick={onOpen} type="button">{t.openRegister} <ChevronDown size={15} /></button></article>
}

function PdfActivityCard({ item, t }: { item: PdfImport; t: ReportText }) {
  const statusLabel = item.status === 'completed' || item.status === 'completedWithReview' ? t.completed : item.status === 'failed' ? t.failed : item.status === 'review' || item.status === 'awaitingApproval' ? t.review : item.status === 'uploaded' ? t.uploaded : t.processing
  return <article className="daily-report-pdf-card"><span className="daily-report-pdf-icon"><FileText size={18} /></span><div><strong>{item.originalFileName}</strong><small>{[item.area, item.wardId && `${t.ward} ${item.wardId}`, item.boothId && `${t.booth} ${item.boothId}`].filter(Boolean).join(' · ') || '—'}</small></div><span className={joinClasses('daily-report-status', item.status === 'failed' ? 'is-attention' : item.status === 'completed' || item.status === 'completedWithReview' ? 'is-reviewed' : 'is-pending')}>{statusLabel}</span><small className="daily-report-pdf-count">{item.rowCount ?? 0} {t.rows}</small></article>
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="daily-reports-empty"><span>{icon}</span><p>{text}</p></div>
}

function ReportSkeleton() {
  return <div className="daily-reports-skeleton" aria-busy="true"><span /><span /><span /><span /></div>
}

function localDateString() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function shiftDate(date: Date, offset: number) {
  const shifted = new Date(date)
  shifted.setDate(shifted.getDate() + offset)
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(shifted.getDate()).padStart(2, '0')}`
}
