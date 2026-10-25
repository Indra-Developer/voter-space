import { Ban, CheckCircle2, ChevronDown, ChevronUp, Clock3, Download, FileText, Home, LoaderCircle, MessageSquareWarning, RotateCcw, Search, SlidersHorizontal, UsersRound, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppLanguage, NavigationKey } from '../app-shell/types'
import type { AppSession } from '../auth/types'
import { deleteVoter, loadDailySurveySummary, loadHouseGroups, loadVoterFilterOptions, loadVoters, runVoterExport, saveVoter, ServerExportCancelledError, updateVoterSurveyStatus, type DailySurveySummary, type VoterExportFormat } from '../voter-register/voter-service'
import { emptyVoterFilters, type VoterFilterOptions, type VoterFilters, type VoterRecord } from '../voter-register/types'
import { screenCopy, VoterDialog } from '../voter-register/VoterRegisterPage'
import './daily-reports.css'

type SurveyStatus = 'ok' | 'pending' | 'noNeed'
type SurveyAction = SurveyStatus | 'reset'
type DisplayStatus = SurveyStatus | 'unmarked'
type ReferenceSurveyReportsPageProps = { language: AppLanguage; session: AppSession; onNavigate: (key: NavigationKey, search?: string) => void }

const copy = {
  en: {
    surveyDate: 'Survey date', today: 'Today', yesterday: 'Yesterday', search: 'Search voters or houses', searchPlaceholder: 'Search by name, voter ID, door number, ward, booth, area…', filters: 'Filters', ward: 'Ward', booth: 'Booth', all: 'All', status: 'Survey status', allStatuses: 'All statuses', houseMembers: 'House members', allHouseMembers: 'Any member count', members: 'members', clear: 'Clear filters', houses: 'houses', voters: 'voters', houseGroups: 'House results', showing: 'Showing', of: 'of', loadMore: 'Load more houses', loadingResults: 'Loading house results…', noVoters: 'No voters found for these filters.', viewVoters: 'View voters', hideVoters: 'Hide', viewDetails: 'View details', matching: 'matching', door: 'Door', phone: 'Phone', notAdded: 'Not added', statusInfo: 'Status', unmarked: 'Unmarked', ok: 'OK', pending: 'Pending', noNeed: 'No Need', reset: 'Reset', pendingReason: 'Reason required', pendingPlaceholder: 'Reason / remark', reasonRequired: 'Please enter a reason before saving.', cancel: 'Cancel', cancelExport: 'Cancel export', submit: 'Submit', saving: 'Saving…', saved: 'Saved', updateError: 'The voter status could not be saved.', completedHouses: 'Completed houses', pendingHouses: 'Pending houses', pendingVoters: 'Pending voters', export: 'Export', showExport: 'Show export options', hideExport: 'Hide export options', excel: 'Excel', pdf: 'PDF', csv: 'CSV', exporting: 'Preparing…', recordsProcessed: 'Records processed', exportCancelled: 'Export cancelled.', exportDenied: 'Download permission is required for exports.', reportScope: 'Results follow the selected date, filters, and your access scope.', noFirebase: 'Live data is not available. Check the Firebase connection and try again.', error: 'The survey results could not be loaded. Please try again.', id: 'ID', area: 'Area', relative: 'Relative', relationship: 'Relationship', age: 'Age', gender: 'Gender', serial: 'Serial',
  },
  te: {
    surveyDate: 'సర్వే తేదీ', today: 'ఈ రోజు', yesterday: 'నిన్న', search: 'ఓటర్లు లేదా ఇళ్లను వెతకండి', searchPlaceholder: 'పేరు, ఓటర్ ID, డోర్ నంబర్, వార్డు, బూత్, ప్రాంతంతో వెతకండి…', filters: 'ఫిల్టర్లు', ward: 'వార్డు', booth: 'బూత్', all: 'అన్నీ', status: 'సర్వే స్థితి', allStatuses: 'అన్ని స్థితులు', houseMembers: 'ఇంటి సభ్యులు', allHouseMembers: 'ఏ సభ్యుల సంఖ్య అయినా', members: 'సభ్యులు', clear: 'ఫిల్టర్లు తొలగించండి', houses: 'ఇళ్లు', voters: 'ఓటర్లు', houseGroups: 'ఇంటి ఫలితాలు', showing: 'చూపుతున్నవి', of: 'లో', loadMore: 'మరిన్ని ఇళ్లను లోడ్ చేయండి', loadingResults: 'ఇంటి ఫలితాలు లోడ్ అవుతున్నాయి…', noVoters: 'ఈ ఫిల్టర్లకు ఓటర్లు లేరు.', viewVoters: 'ఓటర్లను చూడండి', hideVoters: 'దాచండి', viewDetails: 'వివరాలు చూడండి', matching: 'సరిపోలినవి', door: 'డోర్', phone: 'ఫోన్', notAdded: 'జోడించలేదు', statusInfo: 'స్థితి', unmarked: 'గుర్తించలేదు', ok: 'సరి', pending: 'పెండింగ్', noNeed: 'అవసరం లేదు', reset: 'రీసెట్', pendingReason: 'కారణం అవసరం', pendingPlaceholder: 'కారణం / గమనిక', reasonRequired: 'సేవ్ చేయడానికి కారణం రాయండి.', cancel: 'రద్దు', cancelExport: 'ఎగుమతి రద్దు', submit: 'సమర్పించండి', saving: 'సేవ్ అవుతోంది…', saved: 'సేవ్ అయింది', updateError: 'ఓటర్ స్థితిని సేవ్ చేయలేకపోయాము.', completedHouses: 'పూర్తైన ఇళ్లు', pendingHouses: 'పెండింగ్ ఇళ్లు', pendingVoters: 'పెండింగ్ ఓటర్లు', export: 'ఎగుమతి', showExport: 'ఎగుమతి ఎంపికలు చూపండి', hideExport: 'ఎగుమతి ఎంపికలు దాచండి', excel: 'Excel', pdf: 'PDF', csv: 'CSV', exporting: 'సిద్ధం అవుతోంది…', recordsProcessed: 'ప్రాసెస్ చేసిన రికార్డులు', exportCancelled: 'ఎగుమతి రద్దు అయింది.', exportDenied: 'ఎగుమతికి డౌన్‌లోడ్ అనుమతి అవసరం.', reportScope: 'ఎంచుకున్న తేదీ, ఫిల్టర్లు మరియు మీ యాక్సెస్ పరిధి ఆధారంగా ఫలితాలు చూపబడతాయి.', noFirebase: 'లైవ్ డేటా అందుబాటులో లేదు. Firebase కనెక్షన్‌ను తనిఖీ చేయండి.', error: 'సర్వే ఫలితాలు లోడ్ కాలేదు. మళ్లీ ప్రయత్నించండి.', id: 'ID', area: 'ప్రాంతం', relative: 'బంధువు', relationship: 'బంధుత్వం', age: 'వయసు', gender: 'లింగం', serial: 'సీరియల్',
  },
} as const
type ReportText = { [Key in keyof typeof copy.en]: string }

export function ReferenceSurveyReportsPage({ language, session }: ReferenceSurveyReportsPageProps) {
  const t = copy[language]
  const [reportDate, setReportDate] = useState(localDateString)
  const [filters, setFilters] = useState<VoterFilters>(emptyVoterFilters)
  const [options, setOptions] = useState<VoterFilterOptions>({ wards: [], booths: [], areas: [], divisions: [], sourcePdfs: [], uploaders: [], boothsByWard: {} })
  const [records, setRecords] = useState<VoterRecord[]>([])
  const [summary, setSummary] = useState<DailySurveySummary>()
  const [nextCursor, setNextCursor] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string>()
  const [exporting, setExporting] = useState<VoterExportFormat>()
  const [exportProgress, setExportProgress] = useState(0)
  const [exportCounts, setExportCounts] = useState({ processed: 0, total: 0 })
  const [exportError, setExportError] = useState<string>()
  const [showExports, setShowExports] = useState(false)
  const [houseMemberCount, setHouseMemberCount] = useState('')
  const [selectedVoterId, setSelectedVoterId] = useState<string>()
  const summaryLoaded = useRef(false)
  const exportAbortController = useRef<AbortController | undefined>(undefined)
  const mounted = useRef(true)
  const canDownload = session.profile.role === 'superAdmin' || session.profile.permissions.download
  const canEdit = session.profile.role === 'superAdmin' || session.profile.permissions.reports
  const canManageVoters = session.profile.role === 'superAdmin' || (session.profile.role === 'admin' && session.profile.permissions.edit)
  const queryFilters = useMemo(() => ({ ...filters, uploadedFrom: '', uploadedTo: '', houseMemberCount, surveyDate: reportDate }), [filters, houseMemberCount, reportDate])
  const boothOptions = useMemo(() => filters.wardId ? options.boothsByWard?.[filters.wardId] ?? [] : options.booths, [filters.wardId, options.booths, options.boothsByWard])

  useEffect(() => () => {
    mounted.current = false
    exportAbortController.current?.abort()
  }, [])

  useEffect(() => {
    let active = true
    void loadVoterFilterOptions().then((value) => { if (active) setOptions(value) }).catch(() => { if (active) setError(t.noFirebase) })
    return () => { active = false }
  }, [t.noFirebase])

  const loadReport = useCallback(async (force = false) => {
    setLoading(true)
    setError(undefined)
    try {
      if (queryFilters.houseMemberCount) {
        const page = await loadHouseGroups(undefined, { filters: queryFilters, force })
        setRecords(page.groups.flatMap((group) => group.records))
        setNextCursor(page.nextCursor)
        return
      }
      const page = await loadVoters(undefined, { filters: queryFilters, force })
      setRecords(page.records)
      setNextCursor(page.nextCursor)
    } catch {
      setRecords([])
      setNextCursor(undefined)
      setError(t.error)
    } finally { setLoading(false) }
  }, [queryFilters, t.error])

  useEffect(() => {
    if (summaryLoaded.current) return
    summaryLoaded.current = true
    setLoadingSummary(true)
    void loadDailySurveySummary(emptyVoterFilters, reportDate)
      .then((value) => setSummary(value))
      .catch(() => setError(t.error))
      .finally(() => setLoadingSummary(false))
  }, [reportDate, t.error])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReport(), 250)
    return () => window.clearTimeout(timer)
  }, [loadReport])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      if (queryFilters.houseMemberCount) {
        const page = await loadHouseGroups(nextCursor, { filters: queryFilters })
        const pageRecords = page.groups.flatMap((group) => group.records)
        setRecords((current) => [...current, ...pageRecords.filter((record) => !current.some((item) => item.id === record.id))])
        setNextCursor(page.nextCursor)
        return
      }
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
      else groups.set(key, { key, wardId: record.wardId, boothId: record.boothId, doorNumber, area: record.area, records: [record] })
    })
    return [...groups.values()]
  }, [records])
  // The server already filters by the indexed houseMemberCount field. Do not
  // filter again using the current page's partial group length: a house can
  // straddle two result pages, which would otherwise make valid results vanish.
  const visibleGroups = groupedRecords
  const selectedVoter = useMemo(() => selectedVoterId ? records.find((record) => record.id === selectedVoterId) : undefined, [records, selectedVoterId])

  const applySurveyUpdate = useCallback((recordId: string, status: SurveyAction, reason: string) => {
    const previousRecord = records.find((record) => record.id === recordId)
    if (!previousRecord) return
    const updatedRecord: VoterRecord = status === 'reset'
      ? { ...previousRecord, surveyStatus: undefined, surveyReason: undefined, surveyDate: undefined, surveyUpdatedAt: undefined, surveyUpdatedBy: undefined }
      : { ...previousRecord, surveyStatus: status, surveyReason: reason, surveyDate: reportDate }
    const houseRecords = records.filter((record) => record.wardId === previousRecord.wardId && record.boothId === previousRecord.boothId && record.doorNumber === previousRecord.doorNumber)
    const beforeHouseStatus = getHouseStatus(houseRecords, reportDate)
    const afterHouseStatus = getHouseStatus(houseRecords.map((record) => record.id === recordId ? updatedRecord : record), reportDate)
    setRecords((current) => current.map((record) => record.id === recordId ? updatedRecord : record))
    setSummary((current) => {
      if (!current) return current
      const previousStatus = surveyStatusForSummary(previousRecord, reportDate)
      const nextStatus = status
      const pendingDelta = Number(nextStatus === 'pending') - Number(previousStatus === 'pending')
      const okDelta = Number(nextStatus === 'ok') - Number(previousStatus === 'ok')
      const noNeedDelta = Number(nextStatus === 'noNeed') - Number(previousStatus === 'noNeed')
      const completedDelta = Number(afterHouseStatus !== 'pending') - Number(beforeHouseStatus !== 'pending')
      return { ...current, pendingVoters: Math.max(0, current.pendingVoters + pendingDelta), okVoters: Math.max(0, current.okVoters + okDelta), noNeedVoters: Math.max(0, current.noNeedVoters + noNeedDelta), completedHouses: Math.max(0, current.completedHouses + completedDelta), pendingHouses: Math.max(0, current.pendingHouses - completedDelta) }
    })
  }, [records, reportDate])

  const setFilter = (key: keyof VoterFilters, value: string) => setFilters((current) => ({ ...current, [key]: value, ...(key === 'wardId' ? { boothId: '' } : {}) }))
  const clearFilters = () => setFilters(emptyVoterFilters)
  const setQuickDate = (offset: number) => setReportDate(shiftDate(new Date(), offset))
  const exportReport = async (format: VoterExportFormat) => {
    if (!canDownload || exporting) return
    exportAbortController.current?.abort()
    const controller = new AbortController()
    exportAbortController.current = controller
    setExporting(format)
    setExportProgress(0)
    setExportCounts({ processed: 0, total: 0 })
    setExportError(undefined)
    try {
      await runVoterExport({
        format,
        filters: queryFilters,
        fileName: `daily-house-survey-${reportDate}`,
        signal: controller.signal,
        onJob: (job) => {
          if (!mounted.current || exportAbortController.current !== controller) return
          setExportProgress(job.progress)
          setExportCounts({ processed: job.processedCount, total: job.totalCount })
        },
      })
    } catch (reason) {
      if (!mounted.current) return
      setExportError(reason instanceof ServerExportCancelledError ? t.exportCancelled : reason instanceof Error ? reason.message : t.error)
    } finally {
      if (exportAbortController.current === controller) {
        exportAbortController.current = undefined
        if (mounted.current) setExporting(undefined)
      }
    }
  }
  const cancelExport = () => exportAbortController.current?.abort()

  const saveVoterDetails = async (record: VoterRecord) => {
    await saveVoter(record)
    setRecords((current) => current.map((item) => item.id === record.id ? record : item))
    setSelectedVoterId(undefined)
  }

  const removeVoterDetails = async (record: VoterRecord) => {
    await deleteVoter(record.id)
    const houseRecords = records.filter((item) => item.wardId === record.wardId && item.boothId === record.boothId && item.doorNumber === record.doorNumber)
    const oldHouseStatus = getHouseStatus(houseRecords, reportDate)
    const wasLastVoter = houseRecords.length === 1
    const removedStatus = surveyStatusForSummary(record, reportDate)
    setRecords((current) => current.filter((item) => item.id !== record.id))
    setSummary((current) => current ? {
      ...current,
      totalVoters: Math.max(0, current.totalVoters - 1),
      totalHouses: Math.max(0, current.totalHouses - Number(wasLastVoter)),
      okVoters: Math.max(0, current.okVoters - Number(removedStatus === 'ok')),
      pendingVoters: Math.max(0, current.pendingVoters - Number(removedStatus === 'pending')),
      noNeedVoters: Math.max(0, current.noNeedVoters - Number(removedStatus === 'noNeed')),
      completedHouses: Math.max(0, current.completedHouses - Number(wasLastVoter && oldHouseStatus !== 'pending')),
      pendingHouses: Math.max(0, current.pendingHouses - Number(wasLastVoter && oldHouseStatus === 'pending')),
    } : current)
    setSelectedVoterId(undefined)
  }

  return <section className="daily-reports-page daily-reports daily-survey-reference-page" data-report-date={reportDate}>
    <section className="daily-survey-kpis" aria-label={t.reportScope}><Kpi icon={<Home size={17} />} label={t.houses} value={summary?.totalHouses ?? 0} loading={loadingSummary} /><Kpi icon={<UsersRound size={17} />} label={t.voters} value={summary?.totalVoters ?? 0} loading={loadingSummary} /><Kpi icon={<CheckCircle2 size={17} />} label={t.completedHouses} value={summary?.completedHouses ?? 0} loading={loadingSummary} tone="success" /><Kpi icon={<Clock3 size={17} />} label={t.pendingHouses} value={summary?.pendingHouses ?? 0} loading={loadingSummary} tone="pending" /><Kpi icon={<MessageSquareWarning size={17} />} label={t.pendingVoters} value={summary?.pendingVoters ?? 0} loading={loadingSummary} tone="pending" /></section>
    <section className="daily-survey-filter-card" aria-label={t.filters}><div className="daily-survey-filter-title"><div><SlidersHorizontal size={17} /><strong>{t.filters}</strong></div><small>{t.reportScope}</small></div><div className="daily-survey-filter-controls"><label><span>{t.ward}</span><select value={filters.wardId} onChange={(event) => setFilter('wardId', event.target.value)}><option value="">{t.all}</option>{options.wards.map((ward) => <option key={ward} value={ward}>{ward}</option>)}</select></label><label><span>{t.booth}</span><select value={filters.boothId} onChange={(event) => setFilter('boothId', event.target.value)}><option value="">{t.all}</option>{boothOptions.map((booth) => <option key={booth} value={booth}>{booth}</option>)}</select></label><label><span>{t.status}</span><select value={filters.surveyStatus ?? ''} onChange={(event) => setFilter('surveyStatus', event.target.value)}><option value="">{t.allStatuses}</option><option value="ok">{t.ok}</option><option value="pending">{t.pending}</option><option value="noNeed">{t.noNeed}</option></select></label><label><span>{t.houseMembers}</span><select value={houseMemberCount} onChange={(event) => setHouseMemberCount(event.target.value)}><option value="">{t.allHouseMembers}</option>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => <option key={count} value={count}>{count} {t.members}</option>)}<option value="10+">10+ {t.members}</option></select></label><label className="daily-survey-filter-date"><span>{t.surveyDate}</span><input aria-label={t.surveyDate} type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} /></label><div className="daily-survey-date-actions"><button type="button" onClick={() => setQuickDate(0)}>{t.today}</button><button type="button" onClick={() => setQuickDate(-1)}>{t.yesterday}</button></div><button className="daily-survey-clear" type="button" onClick={() => { clearFilters(); setHouseMemberCount('') }}><X size={14} />{t.clear}</button></div><label className="daily-survey-search"><Search size={18} /><span className="sr-only">{t.search}</span><input value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder={t.searchPlaceholder} /></label><div className="daily-survey-export-toggle"><button className="daily-survey-export-trigger" type="button" aria-expanded={showExports} onClick={() => setShowExports((value) => !value)}><Download size={15} />{showExports ? t.hideExport : t.showExport}<ChevronDown className={showExports ? 'is-open' : ''} size={14} /></button>{showExports ? <><div className="daily-survey-export-actions"><ExportButton format="excel" label={t.excel} onClick={() => void exportReport('excel')} loading={exporting === 'excel'} disabled={!canDownload || Boolean(exporting)} progress={exportProgress} exportingLabel={t.exporting} /><ExportButton format="pdf" label={t.pdf} onClick={() => void exportReport('pdf')} loading={exporting === 'pdf'} disabled={!canDownload || Boolean(exporting)} progress={exportProgress} exportingLabel={t.exporting} /><ExportButton format="csv" label={t.csv} onClick={() => void exportReport('csv')} loading={exporting === 'csv'} disabled={!canDownload || Boolean(exporting)} progress={exportProgress} exportingLabel={t.exporting} /></div>{exporting ? <div aria-live="polite" className="daily-survey-export-progress"><div className="daily-survey-export-progress-row"><progress max="100" value={exportProgress} /><strong>{exportProgress}%</strong></div><span>{t.exporting} {exportCounts.total ? `${t.recordsProcessed}: ${exportCounts.processed} ${t.of} ${exportCounts.total}` : `${exportProgress}%`}</span><button type="button" onClick={cancelExport}>{t.cancelExport}</button></div> : null}{exportError ? <p className="daily-survey-export-error" role="alert">{exportError}</p> : null}</> : null}{!canDownload ? <small className="daily-reports-permission-note">{t.exportDenied}</small> : null}</div></section>
    {error ? <p className="daily-reports-error" role="alert">{error}</p> : null}
    <section className="daily-survey-results"><header><div><strong>{t.houseGroups}</strong><small>{loading ? '—' : visibleGroups.length} {t.houses}</small></div><span>{t.showing} {visibleGroups.length} {t.of} {summary?.totalHouses ?? 0}</span></header>{loading ? <ReferenceSkeleton label={t.loadingResults} /> : visibleGroups.length ? <div className="daily-survey-house-list">{visibleGroups.map((group) => <HouseCard key={`${group.key}:${reportDate}`} group={group} reportDate={reportDate} t={t} canEdit={canEdit} onOpenVoter={(record) => setSelectedVoterId(record.id)} onSaved={applySurveyUpdate} />)}</div> : <EmptyState text={t.noVoters} />}{nextCursor && !loading ? <button className="daily-reports-load-more daily-survey-load-more" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? <LoaderCircle className="daily-report-spin" size={15} /> : null}{loadingMore ? '…' : t.loadMore}</button> : null}</section>
    {selectedVoter ? <VoterDialog key={selectedVoter.id} canDelete={canManageVoters} canEdit={canManageVoters} language={language} onClose={() => setSelectedVoterId(undefined)} onDelete={removeVoterDetails} onSave={saveVoterDetails} record={selectedVoter} startEditing={false} t={screenCopy[language]} /> : null}
  </section>
}

type HouseGroup = { key: string; wardId: string; boothId: string; doorNumber: string; area: string; records: VoterRecord[] }
type HouseCardProps = { group: HouseGroup; reportDate: string; t: ReportText; canEdit: boolean; onOpenVoter: (record: VoterRecord) => void; onSaved: (recordId: string, status: SurveyAction, reason: string) => void }

function Kpi({ icon, label, value, loading, tone = '' }: { icon: React.ReactNode; label: string; value: number; loading: boolean; tone?: string }) { return <article className={`daily-survey-kpi ${tone ? `is-${tone}` : ''}`}><span>{icon}</span><div><small>{label}</small>{loading ? <i /> : <strong>{value.toLocaleString()}</strong>}</div></article> }
function ExportButton({ format, label, onClick, loading, disabled, progress, exportingLabel }: { format: VoterExportFormat; label: string; onClick: () => void; loading: boolean; disabled: boolean; progress: number; exportingLabel: string }) { return <button className={`daily-survey-export-button is-${format}`} type="button" disabled={disabled} onClick={onClick}>{loading ? <LoaderCircle className="daily-report-spin" size={15} /> : <Download size={15} />}{loading ? `${exportingLabel} ${progress}%` : label}</button> }

function HouseCard({ group, reportDate, t, canEdit, onOpenVoter, onSaved }: HouseCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [savingId, setSavingId] = useState<string>()
  const [pendingRecord, setPendingRecord] = useState<VoterRecord>()
  const [pendingReason, setPendingReason] = useState('')
  const [dialogError, setDialogError] = useState('')
  const [actionError, setActionError] = useState('')
  const houseStatus = getHouseStatus(group.records, reportDate)
  const saveStatus = async (record: VoterRecord, status: SurveyAction, reason = '') => {
    setSavingId(record.id)
    try {
      await updateVoterSurveyStatus({ voterIds: [record.id], status, reason, surveyDate: reportDate })
      onSaved(record.id, status, reason)
    } catch { throw new Error(t.updateError) } finally { setSavingId(undefined) }
  }
  const chooseStatus = async (record: VoterRecord, status: SurveyAction) => {
    if (status === 'pending') {
      setPendingRecord(record)
      setPendingReason(getRecordStatus(record, reportDate).reason)
      setDialogError('')
      return
    }
    try { setActionError(''); await saveStatus(record, status) } catch { setActionError(t.updateError) }
  }
  const submitPending = async () => {
    if (!pendingRecord) return
    if (!pendingReason.trim()) { setDialogError(t.reasonRequired); return }
    try {
      await saveStatus(pendingRecord, 'pending', pendingReason.trim())
      setPendingRecord(undefined)
      setPendingReason('')
      setDialogError('')
    } catch { setDialogError(t.updateError) }
  }
  return <article className="daily-survey-house-card"><header className="daily-survey-house-top"><div className="daily-survey-house-info"><h3>{t.door} {group.doorNumber}</h3><p>{group.area || '—'} · {t.ward} {group.wardId || '—'} · {t.booth} {group.boothId || '—'}</p><strong>{group.records.length} {group.records.length === 1 ? t.voters.slice(0, -1) : t.voters} <span>· {group.records.length} {t.matching}</span></strong></div><div className="daily-survey-house-actions"><StatusChip status={houseStatus} t={t} /><button className="daily-survey-view-button" type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? t.hideVoters : t.viewVoters}{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button></div></header>{actionError ? <p className="daily-survey-house-error">{actionError}</p> : null}{expanded ? <div className="daily-survey-house-voters">{group.records.map((record) => <VoterCard key={record.id} record={record} reportDate={reportDate} t={t} canEdit={canEdit} saving={savingId === record.id} onOpen={() => onOpenVoter(record)} onStatus={(status) => void chooseStatus(record, status)} />)}</div> : null}{pendingRecord ? <PendingDialog t={t} reason={pendingReason} error={dialogError} saving={Boolean(savingId)} onChange={setPendingReason} onCancel={() => { setPendingRecord(undefined); setDialogError('') }} onSubmit={() => void submitPending()} /> : null}</article>
}

function VoterCard({ record, reportDate, t, canEdit, saving, onOpen, onStatus }: { record: VoterRecord; reportDate: string; t: ReportText; canEdit: boolean; saving: boolean; onOpen: () => void; onStatus: (status: SurveyAction) => void }) {
  const current = getRecordStatus(record, reportDate)
  return <article className="daily-survey-voter-card"><div className="daily-survey-voter-heading"><strong>{record.fullName || '—'}</strong><StatusChip status={current.status} t={t} /></div><p>{t.id}: {record.voterId || '—'} · {t.door} {record.doorNumber || '—'} · {record.area || '—'}</p><p>{t.phone}: {record.mobile || t.notAdded}</p><p className="daily-survey-voter-status-line">{t.statusInfo}: <b>{statusLabel(current.status, t)}</b>{current.status === 'pending' ? <small>{current.reason || t.pendingReason}</small> : null}</p><button className="daily-survey-voter-open" type="button" onClick={onOpen}><FileText size={14} />{t.viewDetails}</button><div className="daily-survey-voter-actions"><StatusButton active={current.status === 'ok'} status="ok" label={t.ok} disabled={!canEdit || saving} onClick={() => onStatus('ok')} /><StatusButton active={current.status === 'pending'} status="pending" label={t.pending} disabled={!canEdit || saving} onClick={() => onStatus('pending')} /><StatusButton active={current.status === 'noNeed'} status="noNeed" label={t.noNeed} disabled={!canEdit || saving} onClick={() => onStatus('noNeed')} /><StatusButton active={false} status="reset" label={t.reset} disabled={!canEdit || saving} onClick={() => onStatus('reset')} /></div>{saving ? <LoaderCircle className="daily-report-spin daily-survey-card-saving" size={15} /> : null}</article>
}

function StatusButton({ active, status, label, disabled, onClick }: { active: boolean; status: SurveyAction; label: string; disabled: boolean; onClick: () => void }) { const Icon = status === 'ok' ? CheckCircle2 : status === 'pending' ? Clock3 : status === 'noNeed' ? Ban : RotateCcw; return <button className={`daily-survey-status-button is-${status} ${active ? 'is-active' : ''}`} type="button" disabled={disabled} onClick={onClick}><Icon size={14} />{label}</button> }
function StatusChip({ status, t }: { status: DisplayStatus; t: ReportText }) { return <span className={`daily-survey-status-chip is-${status}`}>{status === 'ok' ? <CheckCircle2 size={13} /> : status === 'pending' ? <Clock3 size={13} /> : status === 'noNeed' ? <Ban size={13} /> : null}{statusLabel(status, t)}</span> }
function statusLabel(status: DisplayStatus, t: ReportText) { return status === 'ok' ? t.ok : status === 'pending' ? t.pending : status === 'noNeed' ? t.noNeed : t.unmarked }
function getRecordStatus(record: VoterRecord, reportDate: string) { if (record.surveyDate !== reportDate) return { status: 'unmarked' as const, reason: '' }; return { status: record.surveyStatus ?? 'pending', reason: record.surveyReason ?? '' } }
function surveyStatusForSummary(record: VoterRecord, reportDate: string): SurveyStatus { const status = getRecordStatus(record, reportDate).status; return status === 'unmarked' ? 'pending' : status }
function getHouseStatus(records: VoterRecord[], reportDate: string) { const statuses = records.map((record) => getRecordStatus(record, reportDate).status); if (statuses.every((status) => status === 'ok')) return 'ok' as const; if (statuses.every((status) => status === 'noNeed')) return 'noNeed' as const; return 'pending' as const }

function PendingDialog({ t, reason, error, saving, onChange, onCancel, onSubmit }: { t: ReportText; reason: string; error: string; saving: boolean; onChange: (value: string) => void; onCancel: () => void; onSubmit: () => void }) { return <div className="daily-survey-modal-backdrop" role="presentation"><div className="daily-survey-modal" role="dialog" aria-modal="true" aria-labelledby="pending-dialog-title"><div className="daily-survey-modal-header"><h3 id="pending-dialog-title">{t.pendingReason}</h3><button type="button" onClick={onCancel} aria-label={t.cancel}><X size={18} /></button></div><p>{t.reasonRequired}</p><textarea autoFocus value={reason} onChange={(event) => onChange(event.target.value)} placeholder={t.pendingPlaceholder} rows={3} />{error ? <small className="daily-survey-modal-error">{error}</small> : null}<div className="daily-survey-modal-actions"><button className="daily-survey-cancel-button" type="button" onClick={onCancel}>{t.cancel}</button><button className="daily-survey-submit-button" type="button" disabled={saving} onClick={onSubmit}>{saving ? <LoaderCircle className="daily-report-spin" size={15} /> : null}{saving ? t.saving : t.submit}</button></div></div></div> }
function EmptyState({ text }: { text: string }) { return <div className="daily-survey-empty"><Search size={22} /><p>{text}</p></div> }
function ReferenceSkeleton({ label }: { label: string }) { return <div className="daily-survey-loading-state" aria-busy="true" role="status"><p>{label}</p>{[1, 2, 3, 4].map((item) => <div className="daily-survey-skeleton-card" key={item}><span className="daily-survey-skeleton-line is-title" /><span className="daily-survey-skeleton-line is-meta" /><span className="daily-survey-skeleton-line is-count" /><span className="daily-survey-skeleton-button" /></div>)}</div> }
function localDateString() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function shiftDate(date: Date, offset: number) { const shifted = new Date(date); shifted.setDate(shifted.getDate() + offset); return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(shifted.getDate()).padStart(2, '0')}` }
