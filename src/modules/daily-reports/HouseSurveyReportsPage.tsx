import { Ban, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, Clock3, Download, FileBarChart2, Home, LoaderCircle, MessageSquareWarning, Search, SlidersHorizontal, UsersRound, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppLanguage, NavigationKey } from '../app-shell/types'
import type { AppSession } from '../auth/types'
import { loadDailySurveySummary, loadVoterFilterOptions, loadVoters, runVoterExport, updateVoterSurveyStatus, type DailySurveySummary, type VoterExportFormat } from '../voter-register/voter-service'
import { emptyVoterFilters, type VoterFilterOptions, type VoterFilters, type VoterRecord } from '../voter-register/types'
import './daily-reports.css'

type SurveyStatus = 'ok' | 'pending' | 'noNeed'
type DailyReportsPageProps = { language: AppLanguage; session: AppSession; onNavigate: (key: NavigationKey, search?: string) => void }
const copy = {
  en: {
    eyebrow: 'House survey', title: 'Daily reports', description: 'Visit each house and record the survey status for every voter in that home.', date: 'Survey date', today: 'Today', yesterday: 'Yesterday', search: 'Search voters or houses', searchPlaceholder: 'Name, voter ID, door number, ward, booth, area…', filters: 'Filters', ward: 'Ward', booth: 'Booth', all: 'All', status: 'Survey status', allStatuses: 'All statuses', clear: 'Clear filters', houses: 'Houses', voters: 'Voters', completedHouses: 'Completed houses', pendingHouses: 'Pending houses', pendingVoters: 'Pending voters', housesShowing: 'House groups', showing: 'Showing', of: 'of', loadMore: 'Load more houses', noVoters: 'No voters found for these filters.', viewVoters: 'View voters', hideVoters: 'Hide voters', voter: 'voter', votersPlural: 'voters', wardLabel: 'Ward', boothLabel: 'Booth', door: 'House number', ok: 'OK', pending: 'Pending', noNeed: 'No Need', saveStatus: 'Save status', saving: 'Saving…', saved: 'Saved', pendingReason: 'Pending reason', pendingReasonPlaceholder: 'Explain why this house is pending…', reasonRequired: 'Add a reason before saving Pending.', statusInfo: 'Survey status', noReason: 'No reason added', name: 'Name', id: 'Voter ID', relative: 'Relative', relationship: 'Relationship', age: 'Age', gender: 'Gender', area: 'Area', serial: 'Serial', export: 'Export survey', excel: 'Excel', pdf: 'PDF', csv: 'CSV', exporting: 'Preparing…', exportDenied: 'Download permission is required for exports.', noFirebase: 'Live data is not available. Check the Firebase connection and try again.', error: 'The daily report could not be loaded. Please try again.', updateError: 'The survey status could not be saved.', completed: 'Completed', pendingLabel: 'Pending', noNeedLabel: 'No Need', reportScope: 'Counts follow your access and selected filters.',
  },
  te: {
    eyebrow: 'ఇంటి సర్వే', title: 'రోజువారీ నివేదికలు', description: 'ప్రతి ఇంటిని సందర్శించి ఆ ఇంటిలోని ప్రతి ఓటర్ సర్వే స్థితిని నమోదు చేయండి.', date: 'సర్వే తేదీ', today: 'ఈ రోజు', yesterday: 'నిన్న', search: 'ఓటర్లు లేదా ఇళ్లను వెతకండి', searchPlaceholder: 'పేరు, ఓటర్ ID, డోర్ నంబర్, వార్డు, బూత్, ప్రాంతం…', filters: 'ఫిల్టర్లు', ward: 'వార్డు', booth: 'బూత్', all: 'అన్నీ', status: 'సర్వే స్థితి', allStatuses: 'అన్ని స్థితులు', clear: 'ఫిల్టర్లు తొలగించండి', houses: 'ఇళ్లు', voters: 'ఓటర్లు', completedHouses: 'పూర్తైన ఇళ్లు', pendingHouses: 'పెండింగ్ ఇళ్లు', pendingVoters: 'పెండింగ్ ఓటర్లు', housesShowing: 'ఇంటి సమూహాలు', showing: 'చూపుతున్నవి', of: 'లో', loadMore: 'మరిన్ని ఇళ్లను లోడ్ చేయండి', noVoters: 'ఈ ఫిల్టర్లకు ఓటర్లు లేరు.', viewVoters: 'ఓటర్లను చూడండి', hideVoters: 'ఓటర్లను దాచండి', voter: 'ఓటర్', votersPlural: 'ఓటర్లు', wardLabel: 'వార్డు', boothLabel: 'బూత్', door: 'ఇంటి నంబర్', ok: 'సరి', pending: 'పెండింగ్', noNeed: 'అవసరం లేదు', saveStatus: 'స్థితిని సేవ్ చేయండి', saving: 'సేవ్ అవుతోంది…', saved: 'సేవ్ అయింది', pendingReason: 'పెండింగ్ కారణం', pendingReasonPlaceholder: 'ఈ ఇల్లు ఎందుకు పెండింగ్‌లో ఉందో రాయండి…', reasonRequired: 'పెండింగ్ సేవ్ చేయడానికి కారణం రాయండి.', statusInfo: 'సర్వే స్థితి', noReason: 'కారణం నమోదు కాలేదు', name: 'పేరు', id: 'ఓటర్ ID', relative: 'బంధువు', relationship: 'బంధుత్వం', age: 'వయసు', gender: 'లింగం', area: 'ప్రాంతం', serial: 'సీరియల్', export: 'సర్వే ఎగుమతి', excel: 'Excel', pdf: 'PDF', csv: 'CSV', exporting: 'సిద్ధం అవుతోంది…', exportDenied: 'ఎగుమతికి డౌన్‌లోడ్ అనుమతి అవసరం.', noFirebase: 'లైవ్ డేటా అందుబాటులో లేదు. Firebase కనెక్షన్‌ను తనిఖీ చేసి మళ్లీ ప్రయత్నించండి.', error: 'రోజువారీ నివేదిక లోడ్ కాలేదు. మళ్లీ ప్రయత్నించండి.', updateError: 'సర్వే స్థితిని సేవ్ చేయలేకపోయాము.', completed: 'పూర్తయింది', pendingLabel: 'పెండింగ్', noNeedLabel: 'అవసరం లేదు', reportScope: 'మీ యాక్సెస్ మరియు ఎంచుకున్న ఫిల్టర్ల ఆధారంగా లెక్కలు చూపబడతాయి.',
  },
} as const
type ReportText = { [Key in keyof typeof copy.en]: string }

export function HouseSurveyReportsPage({ language, session }: DailyReportsPageProps) {
  const t = copy[language]
  const [reportDate, setReportDate] = useState(localDateString)
  const [filters, setFilters] = useState<VoterFilters>(emptyVoterFilters)
  const [options, setOptions] = useState<VoterFilterOptions>({ wards: [], booths: [], areas: [], divisions: [], sourcePdfs: [], uploaders: [], boothsByWard: {} })
  const [records, setRecords] = useState<VoterRecord[]>([])
  const [summary, setSummary] = useState<DailySurveySummary>()
  const [nextCursor, setNextCursor] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string>()
  const [exporting, setExporting] = useState<VoterExportFormat>()
  const canDownload = session.profile.role === 'superAdmin' || session.profile.permissions.download
  const canEdit = session.profile.role === 'superAdmin' || session.profile.permissions.reports
  const queryFilters = useMemo(() => ({ ...filters, uploadedFrom: '', uploadedTo: '', surveyDate: reportDate }), [filters, reportDate])
  const summaryFilters = useMemo<VoterFilters>(() => ({ ...filters, surveyStatus: '', uploadedFrom: '', uploadedTo: '' }), [filters])
  const boothOptions = useMemo(() => filters.wardId ? options.boothsByWard?.[filters.wardId] ?? [] : options.booths, [filters.wardId, options.booths, options.boothsByWard])

  useEffect(() => {
    let active = true
    void loadVoterFilterOptions().then((filterOptions) => { if (active) setOptions(filterOptions) }).catch(() => { if (active) setError(t.noFirebase) })
    return () => { active = false }
  }, [t.noFirebase])

  const loadReport = useCallback(async (force = false) => {
    setLoading(true)
    setError(undefined)
    try {
      const [page, dailySummary] = await Promise.all([loadVoters(undefined, { filters: queryFilters, force }), loadDailySurveySummary(summaryFilters, reportDate, { force })])
      setRecords(page.records)
      setNextCursor(page.nextCursor)
      setSummary(dailySummary)
    } catch {
      setError(t.error)
      setRecords([])
      setNextCursor(undefined)
      setSummary(undefined)
    } finally { setLoading(false) }
  }, [queryFilters, reportDate, summaryFilters, t.error])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReport(), 250)
    return () => window.clearTimeout(timer)
  }, [loadReport])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await loadVoters(nextCursor, { filters: queryFilters })
      setRecords((current) => [...current, ...page.records.filter((record) => !current.some((item) => item.id === record.id))])
      setNextCursor(page.nextCursor)
    } catch { setError(t.error) } finally { setLoadingMore(false) }
  }

  const groupedRecords = useMemo(() => {
    const groups = new Map<string, HouseGroup>()
    records.forEach((record) => {
      const doorNumber = record.doorNumber || '—'
      const key = `${record.wardId}::${record.boothId}::${doorNumber}`
      const current = groups.get(key)
      if (current) current.records.push(record)
      else groups.set(key, { key, wardId: record.wardId, boothId: record.boothId, doorNumber, records: [record] })
    })
    return [...groups.values()]
  }, [records])

  const setFilter = (key: keyof VoterFilters, value: string) => setFilters((current) => ({ ...current, [key]: value, ...(key === 'wardId' ? { boothId: '' } : {}) }))
  const clearFilters = () => setFilters(emptyVoterFilters)
  const setQuickDate = (offset: number) => setReportDate(shiftDate(new Date(), offset))
  const exportReport = async (format: VoterExportFormat) => {
    if (!canDownload || exporting) return
    setExporting(format)
    try { await runVoterExport({ format, filters: queryFilters, fileName: `daily-house-survey-${reportDate}`, onJob: () => undefined }) } catch (exportError) { setError(exportError instanceof Error ? exportError.message : t.error) } finally { setExporting(undefined) }
  }

  return <section className="daily-reports-page daily-reports print-report" data-report-date={reportDate}>
    <header className="daily-reports-hero daily-survey-heading"><div><p className="daily-reports-eyebrow"><FileBarChart2 size={16} />{t.eyebrow}</p><h2>{t.title}</h2><span>{t.description}</span></div><div className="daily-reports-date-control"><label htmlFor="daily-report-date"><CalendarDays size={17} />{t.date}</label><input id="daily-report-date" type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} /><div className="daily-reports-date-actions"><button type="button" onClick={() => setQuickDate(0)}>{t.today}</button><button type="button" onClick={() => setQuickDate(-1)}>{t.yesterday}</button></div></div></header>
    <section className="daily-reports-survey-summary" aria-label={t.reportScope}><div className="daily-reports-summary-grid"><SummaryCard icon={<Home size={19} />} label={t.houses} value={summary?.totalHouses ?? 0} loading={loading} /><SummaryCard icon={<UsersRound size={19} />} label={t.voters} value={summary?.totalVoters ?? 0} loading={loading} /><SummaryCard icon={<CheckCircle2 size={19} />} label={t.completedHouses} value={summary?.completedHouses ?? 0} loading={loading} tone="success" /><SummaryCard icon={<Clock3 size={19} />} label={t.pendingHouses} value={summary?.pendingHouses ?? 0} loading={loading} tone="attention" /><SummaryCard icon={<MessageSquareWarning size={19} />} label={t.pendingVoters} value={summary?.pendingVoters ?? 0} loading={loading} tone="warning" /></div></section>
    <section className="daily-reports-toolbar" aria-label={t.filters}><div className="daily-report-filter-heading"><div><SlidersHorizontal size={18} /><strong>{t.filters}</strong></div><small>{t.reportScope}</small></div><label className="daily-reports-search"><Search size={18} /><span className="sr-only">{t.search}</span><input value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder={t.searchPlaceholder} /></label><div className="daily-reports-filter-row"><label><span>{t.ward}</span><select value={filters.wardId} onChange={(event) => setFilter('wardId', event.target.value)}><option value="">{t.all}</option>{options.wards.map((ward) => <option key={ward} value={ward}>{ward}</option>)}</select></label><label><span>{t.booth}</span><select value={filters.boothId} onChange={(event) => setFilter('boothId', event.target.value)}><option value="">{t.all}</option>{boothOptions.map((booth) => <option key={booth} value={booth}>{booth}</option>)}</select></label><label><span>{t.status}</span><select value={filters.surveyStatus ?? ''} onChange={(event) => setFilter('surveyStatus', event.target.value)}><option value="">{t.allStatuses}</option><option value="ok">{t.ok}</option><option value="pending">{t.pending}</option><option value="noNeed">{t.noNeed}</option></select></label><button className="daily-reports-clear" type="button" onClick={clearFilters}><X size={15} />{t.clear}</button></div></section>
    <section className="daily-reports-actions"><div><strong>{t.export}</strong><small>{t.reportScope}</small></div><div className="daily-reports-action-buttons"><ExportButton format="excel" label={t.excel} onClick={() => void exportReport('excel')} loading={exporting === 'excel'} disabled={!canDownload || Boolean(exporting)} /><ExportButton format="pdf" label={t.pdf} onClick={() => void exportReport('pdf')} loading={exporting === 'pdf'} disabled={!canDownload || Boolean(exporting)} /><ExportButton format="csv" label={t.csv} onClick={() => void exportReport('csv')} loading={exporting === 'csv'} disabled={!canDownload || Boolean(exporting)} /></div>{!canDownload ? <small className="daily-reports-permission-note">{t.exportDenied}</small> : null}</section>
    {error ? <p className="daily-reports-error" role="alert">{error}</p> : null}
    <section className="daily-reports-results daily-house-results"><header><div><p>{t.housesShowing}</p><h3>{loading ? '—' : (summary?.totalHouses ?? 0).toLocaleString()} <small>{t.houses}</small></h3></div><span>{t.showing} {groupedRecords.length} {t.of} {summary?.totalHouses ?? 0}</span></header>{loading ? <ReportSkeleton /> : groupedRecords.length ? <div className="daily-report-house-list">{groupedRecords.map((group) => <HouseSurveyGroup key={`${group.key}:${reportDate}:${group.records.map((record) => `${record.id}-${record.surveyDate ?? ''}-${record.surveyStatus ?? 'pending'}-${record.surveyReason ?? ''}`).join('|')}`} group={group} reportDate={reportDate} t={t} canEdit={canEdit} onSaved={() => void loadReport(true)} />)}</div> : <EmptyState icon={<Search size={22} />} text={t.noVoters} />}{nextCursor && !loading ? <button className="daily-reports-load-more" disabled={loadingMore} onClick={() => void loadMore()} type="button">{loadingMore ? <LoaderCircle className="daily-report-spin" size={15} /> : null}{loadingMore ? '…' : t.loadMore}</button> : null}</section>
  </section>
}

type HouseGroup = { key: string; wardId: string; boothId: string; doorNumber: string; records: VoterRecord[] }
function SummaryCard({ icon, label, value, loading, tone = '' }: { icon: React.ReactNode; label: string; value: number; loading: boolean; tone?: string }) { return <article className={`daily-survey-summary-card ${tone ? `is-${tone}` : ''}`}><span>{icon}</span><div><small>{label}</small>{loading ? <i aria-hidden="true" /> : <strong>{value.toLocaleString()}</strong>}</div></article> }
function ExportButton({ format, label, onClick, loading, disabled }: { format: VoterExportFormat; label: string; onClick: () => void; loading: boolean; disabled: boolean }) { return <button className={`daily-report-export is-${format}`} disabled={disabled} onClick={onClick} type="button">{loading ? <LoaderCircle className="daily-report-spin" size={15} /> : <Download size={15} />}{loading ? '…' : label}</button> }

function HouseSurveyGroup({ group, reportDate, t, canEdit, onSaved }: { group: HouseGroup; reportDate: string; t: ReportText; canEdit: boolean; onSaved: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const initialStatus = groupStatus(group.records, reportDate)
  const [selectedStatus, setSelectedStatus] = useState<SurveyStatus>(initialStatus.status)
  const [reason, setReason] = useState(initialStatus.reason)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [localError, setLocalError] = useState('')
  const statusChanged = selectedStatus !== initialStatus.status || reason !== initialStatus.reason
  const save = async () => {
    if (selectedStatus === 'pending' && !reason.trim()) { setLocalError(t.reasonRequired); return }
    setSaving(true); setLocalError(''); setMessage('')
    try {
      await updateVoterSurveyStatus({ voterIds: group.records.map((record) => record.id), status: selectedStatus, reason: selectedStatus === 'pending' ? reason.trim() : '', surveyDate: reportDate, house: { wardId: group.wardId, boothId: group.boothId, doorNumber: group.doorNumber } })
      setMessage(t.saved); onSaved()
    } catch { setLocalError(t.updateError) } finally { setSaving(false) }
  }
  return <article className="daily-report-house-group"><header className="daily-report-house-header"><div className="daily-report-house-title"><span className="daily-report-house-icon"><Home size={18} /></span><div><p>{t.door}</p><h3>{group.doorNumber}</h3><small>{t.wardLabel} {group.wardId || '—'} · {t.boothLabel} {group.boothId || '—'}</small></div></div><div className="daily-report-house-meta"><StatusBadge status={initialStatus.status} t={t} /><span>{group.records.length} {group.records.length === 1 ? t.voter : t.votersPlural}</span><button className="daily-report-view-button" type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}{expanded ? t.hideVoters : t.viewVoters}</button></div></header><div className="daily-report-house-status-editor"><div className="daily-report-status-buttons" role="group" aria-label={t.status}><StatusChoice active={selectedStatus === 'ok'} status="ok" label={t.ok} onClick={() => setSelectedStatus('ok')} disabled={!canEdit || saving} /><StatusChoice active={selectedStatus === 'pending'} status="pending" label={t.pending} onClick={() => setSelectedStatus('pending')} disabled={!canEdit || saving} /><StatusChoice active={selectedStatus === 'noNeed'} status="noNeed" label={t.noNeed} onClick={() => setSelectedStatus('noNeed')} disabled={!canEdit || saving} /></div>{selectedStatus === 'pending' ? <label className="daily-report-pending-editor"><span>{t.pendingReason}</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t.pendingReasonPlaceholder} disabled={!canEdit || saving} rows={2} /></label> : null}<div className="daily-report-house-save-row">{localError ? <small className="daily-report-inline-error">{localError}</small> : message ? <small className="daily-report-inline-success">{message}</small> : <span />}{canEdit ? <button className="daily-report-save-status" type="button" onClick={() => void save()} disabled={saving || !statusChanged}>{saving ? <LoaderCircle className="daily-report-spin" size={15} /> : <CheckCircle2 size={15} />}{saving ? t.saving : t.saveStatus}</button> : null}</div></div>{expanded ? <div className="daily-report-voter-details">{group.records.map((record) => <VoterDetail key={record.id} record={record} reportDate={reportDate} t={t} />)}</div> : null}</article>
}

function StatusChoice({ active, status, label, onClick, disabled }: { active: boolean; status: SurveyStatus; label: string; onClick: () => void; disabled: boolean }) { const Icon = status === 'ok' ? CheckCircle2 : status === 'pending' ? Clock3 : Ban; return <button className={`daily-report-status-choice is-${status} ${active ? 'is-active' : ''}`} type="button" onClick={onClick} disabled={disabled}><Icon size={15} />{label}</button> }
function StatusBadge({ status, t }: { status: SurveyStatus; t: ReportText }) { const label = status === 'ok' ? t.completed : status === 'pending' ? t.pendingLabel : t.noNeedLabel; return <span className={`daily-report-status is-${status}`}>{status === 'ok' ? <CheckCircle2 size={13} /> : status === 'pending' ? <Clock3 size={13} /> : <Ban size={13} />}{label}</span> }
function VoterDetail({ record, reportDate, t }: { record: VoterRecord; reportDate: string; t: ReportText }) { const status = record.surveyDate === reportDate ? record.surveyStatus ?? 'pending' : 'pending'; const reason = record.surveyDate === reportDate ? record.surveyReason : ''; return <article className="daily-report-voter-detail"><div className="daily-report-voter-detail-heading"><div><strong>{record.fullName || '—'}</strong><small>{record.voterId || '—'} · {t.serial} {record.serialNumber || '—'}</small></div><StatusBadge status={status} t={t} /></div><div className="daily-report-voter-detail-grid"><InfoField label={t.relative} value={record.relativeName} /><InfoField label={t.relationship} value={record.relationshipType} /><InfoField label={t.age} value={record.age} /><InfoField label={t.gender} value={record.gender} /><InfoField label={t.area} value={record.area} /></div><div className={`daily-report-status-info is-${status}`}><span>{t.statusInfo}</span><strong>{status === 'ok' ? t.ok : status === 'pending' ? t.pending : t.noNeed}</strong>{status === 'pending' ? <small>{reason || t.noReason}</small> : null}</div></article> }
function InfoField({ label, value }: { label: string; value?: string }) { return <span><small>{label}</small><b>{value || '—'}</b></span> }
function groupStatus(records: VoterRecord[], reportDate: string) { const statuses = records.map((record) => record.surveyDate === reportDate ? record.surveyStatus ?? 'pending' : 'pending'); const status: SurveyStatus = statuses.every((value) => value === statuses[0]) ? statuses[0] : 'pending'; const reason = records.find((record) => record.surveyDate === reportDate && record.surveyReason)?.surveyReason ?? ''; return { status, reason } }
function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) { return <div className="daily-reports-empty"><span>{icon}</span><p>{text}</p></div> }
function ReportSkeleton() { return <div className="daily-reports-skeleton" aria-busy="true"><span /><span /><span /><span /></div> }
function localDateString() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function shiftDate(date: Date, offset: number) { const shifted = new Date(date); shifted.setDate(shifted.getDate() + offset); return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(shifted.getDate()).padStart(2, '0')}` }
