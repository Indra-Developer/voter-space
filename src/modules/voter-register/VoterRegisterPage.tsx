import { ArrowUp, Check, ChevronDown, Download, Edit3, FileSpreadsheet, FileText, LoaderCircle, RefreshCcw, Search, Table2, Trash2, UsersRound, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AppSession } from '../auth/types'
import { readableFirebaseError } from '../auth/firebase-auth'
import type { AppLanguage } from '../app-shell/types'
import { PageState } from '../app-shell/PageState'
import { downloadCsv, downloadExcel, downloadPdf } from './export-voters'
import { deleteVotersByWard, loadVoterCardImage, loadVoterFilterOptions, loadVoters, saveVoter } from './voter-service'
import { emptyVoterFilters, type VoterFilterOptions, type VoterFilters, type VoterRecord } from './types'
import { matchesVoterSearch } from './voter-search'

type ViewMode = 'individual' | 'door'
type OpenFilter = 'ward' | 'booth' | 'area' | 'division' | 'source' | 'uploadedBy' | 'date'

const screenCopy = {
  en: {
    label: 'Voter data', title: 'Voter Register', description: 'Find voters, check records, and export only the records you are allowed to access.',
    search: 'Search all voter fields', searchPlaceholder: 'Name, voter ID, door number, serial, ward, booth, area, division, PDF…', searchHint: 'You can search using Telugu, English spelling, voter ID, door number, serial number, ward, booth, area, division, mobile number, or PDF name.', refresh: 'Refresh', records: 'records', individual: 'Individual records', doorWise: 'Door-wise view',
    filters: 'Filters', clear: 'Clear all', moreFilters: 'More filters', hideFilters: 'Hide filters', name: 'Name', door: 'House number', voterId: 'Voter ID', alternateId: 'Alternate ID', mobile: 'Mobile number', serial: 'Serial number', ward: 'Ward', booth: 'Booth', area: 'Area', division: 'Division', source: 'Source PDF', uploadedFrom: 'Uploaded from', uploadedTo: 'Uploaded to', uploadedBy: 'Uploaded by', members: 'members', chooseDate: 'Choose upload dates', deleteWardOpen: 'Delete ward', deleteWardTitle: 'Delete complete ward data', deleteWardHint: 'This permanently removes the ward voters, voter card images, source PDFs, and import rows from Firestore and Storage.', selectWard: 'Select ward', typeWard: 'Type the ward number to confirm', deleteWard: 'Delete ward data', deletingWard: 'Deleting ward data…', deleteWardSuccess: 'Ward data deleted successfully.', deleteWardError: 'Ward data could not be deleted.', cancel: 'Cancel',
    any: 'All',
    exportExcel: 'Excel', exportPdf: 'PDF', exportCsv: 'CSV', exportHint: 'Exports include the filtered records only.',
    noRecords: 'No voter records match these filters.', noData: 'No voter records have been imported yet.',
    loading: 'Loading voter records…', loadingMore: 'Loading more voters…', allLoaded: 'All available voters are loaded.', error: 'Voter records could not be loaded.', retry: 'Try again', goTop: 'Go to top',
    view: 'View', edit: 'Edit', close: 'Close', save: 'Save changes', saving: 'Saving…', details: 'Voter details', sourcePdf: 'Source PDF', uploaded: 'Uploaded', saveError: 'The record could not be saved. Please try again.', editAccess: 'You can edit records in your allowed scope.', readOnly: 'You have view-only access to these records.', originalCard: 'Original voter card', cardLoading: 'Loading the original card…', cardUnavailable: 'This older voter record has no saved card image. Open PDF Upload and choose Process again for its PDF.', relativeName: 'Relative name', relationship: 'Relationship', age: 'Age', gender: 'Gender', assemblySerial: 'Assembly serial', pdfPosition: 'PDF position',
  },
  te: {
    label: 'ఓటర్ డేటా', title: 'ఓటర్ రిజిస్టర్', description: 'ఓటర్లను వెతకండి, రికార్డులను చూడండి, మీకు అనుమతి ఉన్న డేటాను మాత్రమే ఎగుమతి చేయండి.',
    search: 'అన్ని ఓటర్ వివరాల్లో వెతకండి', searchPlaceholder: 'పేరు, ఓటర్ ఐడి, ఇంటి నంబర్, సీరియల్, వార్డు, బూత్, ప్రాంతం, డివిజన్, PDF…', searchHint: 'తెలుగు, ఇంగ్లీష్ స్పెల్లింగ్, ఓటర్ ఐడి, ఇంటి నంబర్, సీరియల్, వార్డు, బూత్, ప్రాంతం, డివిజన్, మొబైల్ లేదా PDF పేరుతో వెతకండి.', refresh: 'రిఫ్రెష్', records: 'రికార్డులు', individual: 'ఒక్కో రికార్డు', doorWise: 'ఇంటి నంబర్ వారీగా',
    filters: 'ఫిల్టర్లు', clear: 'అన్నీ తొలగించండి', moreFilters: 'మరిన్ని ఫిల్టర్లు', hideFilters: 'ఫిల్టర్లు దాచండి', name: 'పేరు', door: 'ఇంటి నంబర్', voterId: 'ఓటర్ ఐడి', alternateId: 'ప్రత్యామ్నాయ ఐడి', mobile: 'మొబైల్ నంబర్', serial: 'సీరియల్ నంబర్', ward: 'వార్డు', booth: 'బూత్', area: 'ప్రాంతం', division: 'డివిజన్', source: 'సోర్స్ PDF', uploadedFrom: 'అప్‌లోడ్ మొదలు', uploadedTo: 'అప్‌లోడ్ చివరి తేదీ', uploadedBy: 'అప్‌లోడ్ చేసినవారు', members: 'సభ్యులు', chooseDate: 'అప్‌లోడ్ తేదీలను ఎంచుకోండి', deleteWardOpen: 'వార్డు తొలగింపు', deleteWardTitle: 'వార్డు మొత్తం డేటాను తొలగించండి', deleteWardHint: 'ఈ చర్య వార్డు ఓటర్లు, ఓటర్ కార్డు చిత్రాలు, సోర్స్ PDFలు మరియు Firestore, Storageలోని దిగుమతి వరుసలను శాశ్వతంగా తొలగిస్తుంది.', selectWard: 'వార్డును ఎంచుకోండి', typeWard: 'నిర్ధారించడానికి వార్డు నంబర్ టైప్ చేయండి', deleteWard: 'వార్డు డేటా తొలగించండి', deletingWard: 'వార్డు డేటా తొలగిస్తోంది…', deleteWardSuccess: 'వార్డు డేటా విజయవంతంగా తొలగించబడింది.', deleteWardError: 'వార్డు డేటా తొలగించలేకపోయాము.', cancel: 'రద్దు',
    any: 'అన్నీ',
    exportExcel: 'ఎక్సెల్', exportPdf: 'PDF', exportCsv: 'CSV', exportHint: 'ఎంచుకున్న ఫిల్టర్లలో ఉన్న రికార్డులు మాత్రమే ఎగుమతి అవుతాయి.',
    noRecords: 'ఈ ఫిల్టర్లకు సరిపోయే ఓటర్ రికార్డులు లేవు.', noData: 'ఇంకా ఓటర్ రికార్డులు దిగుమతి కాలేదు.',
    loading: 'ఓటర్ రికార్డులు లోడ్ అవుతున్నాయి…', loadingMore: 'మరిన్ని ఓటర్లను లోడ్ చేస్తున్నాము…', allLoaded: 'అందుబాటులో ఉన్న ఓటర్లన్నీ లోడ్ అయ్యాయి.', error: 'ఓటర్ రికార్డులు లోడ్ చేయలేకపోయాము.', retry: 'మళ్లీ ప్రయత్నించండి', goTop: 'పైకి వెళ్లండి',
    view: 'చూడండి', edit: 'సవరించండి', close: 'మూసివేయండి', save: 'మార్పులు సేవ్ చేయండి', saving: 'సేవ్ అవుతోంది…', details: 'ఓటర్ వివరాలు', sourcePdf: 'సోర్స్ PDF', uploaded: 'అప్‌లోడ్', saveError: 'రికార్డు సేవ్ కాలేదు. మళ్లీ ప్రయత్నించండి.', editAccess: 'మీకు అనుమతి ఉన్న పరిధిలో రికార్డులను సవరించవచ్చు.', readOnly: 'ఈ రికార్డులను చూడటానికి మాత్రమే మీకు అనుమతి ఉంది.', originalCard: 'అసలు ఓటర్ కార్డు', cardLoading: 'అసలు కార్డు లోడ్ అవుతోంది…', cardUnavailable: 'ఈ పాత ఓటర్ రికార్డుకు కార్డు చిత్రం లేదు. PDF Uploadలో ఆ PDFకి మళ్లీ ప్రాసెస్ చేయండి నొక్కండి.', relativeName: 'బంధువు పేరు', relationship: 'సంబంధం', age: 'వయస్సు', gender: 'లింగము', assemblySerial: 'అసెంబ్లీ సీరియల్', pdfPosition: 'PDF స్థానం',
  },
} as const

type ScreenText = { [Key in keyof typeof screenCopy.en]: string }

export function VoterRegisterPage({ language, session }: { language: AppLanguage; session: AppSession }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [records, setRecords] = useState<VoterRecord[]>()
  const [options, setOptions] = useState<VoterFilterOptions>({ wards: [], booths: [], areas: [], divisions: [], sourcePdfs: [], uploaders: [] })
  const [filters, setFilters] = useState<VoterFilters>(emptyVoterFilters)
  const [openFilter, setOpenFilter] = useState<OpenFilter>()
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [loadError, setLoadError] = useState<string>()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [nextCursor, setNextCursor] = useState<string>()
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string>()
  const [showGoTop, setShowGoTop] = useState(false)
  const loadMoreSentinel = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(false)
  const [deleteWardId, setDeleteWardId] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [showDeleteWard, setShowDeleteWard] = useState(false)
  const [deleteWorking, setDeleteWorking] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState<string>()
  const [deleteError, setDeleteError] = useState<string>()
  const t = screenCopy[language]
  const canEdit = session.profile.role === 'superAdmin' || (session.profile.role === 'admin' && session.profile.permissions.edit)
  const canDownload = session.profile.role === 'superAdmin' || session.profile.permissions.download
  const canDeleteWard = session.profile.role === 'superAdmin'
  const view: ViewMode = searchParams.get('view') === 'door' ? 'door' : 'individual'
  const selectedDoor = searchParams.get('door') || undefined
  const selectedVoterId = searchParams.get('voter') || undefined
  const activeRecord = useMemo(() => selectedVoterId ? (records ?? []).find((record) => record.id === selectedVoterId) ?? null : null, [records, selectedVoterId])

  const reload = async () => {
    setIsRefreshing(true)
    setLoadError(undefined)
    try {
      const [result, databaseOptions] = await Promise.all([loadVoters(), loadVoterFilterOptions()])
      setRecords(result.records)
      setOptions(databaseOptions)
      setNextCursor(result.nextCursor)
      setHasMore(result.hasMore)
      setLoadMoreError(undefined)
    } catch (reason) {
      setLoadError(readableFirebaseError(reason))
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void reload(), 0)
    return () => window.clearTimeout(initialLoad)
  }, [])

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || isLoadingMore) return
    setIsLoadingMore(true)
    setLoadMoreError(undefined)
    try {
      const result = await loadVoters(nextCursor)
      setRecords((current) => [...(current ?? []), ...result.records])
      setNextCursor(result.nextCursor)
      setHasMore(result.hasMore)
    } catch (reason) {
      setLoadMoreError(readableFirebaseError(reason))
    } finally {
      setIsLoadingMore(false)
    }
  }, [hasMore, isLoadingMore, nextCursor])

  useEffect(() => {
    const target = loadMoreSentinel.current
    if (!target || !hasMore) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore()
    }, { rootMargin: '500px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, isLoadingMore, loadMore, nextCursor])

  useEffect(() => {
    const onScroll = () => setShowGoTop(window.scrollY > 450)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const filteredRecords = useMemo(() => (records ?? []).filter((record) => matchesFilters(record, filters)), [records, filters])
  const doorGroups = useMemo(() => groupByDoor(filteredRecords), [filteredRecords])

  const updateFilter = <Key extends keyof VoterFilters>(key: Key, value: VoterFilters[Key]) => setFilters((current) => ({ ...current, [key]: value }))
  const setRegisterState = (changes: { view?: ViewMode; door?: string | null; voter?: string }, replace = false) => {
    const next = new URLSearchParams(searchParams)
    if (changes.view) next.set('view', changes.view)
    if (changes.door === undefined && changes.view === 'individual') next.delete('door')
    if (changes.door === null) next.delete('door')
    if (changes.door) next.set('door', changes.door)
    if (changes.voter !== undefined) next.set('voter', changes.voter)
    setSearchParams(next, { replace })
  }
  const setViewMode = (nextView: ViewMode) => {
    const next = new URLSearchParams(searchParams)
    next.set('view', nextView)
    next.delete('voter')
    if (nextView === 'individual') next.delete('door')
    setEditing(false)
    setSearchParams(next)
  }
  const closeRecord = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('voter')
    setEditing(false)
    setSearchParams(next, { replace: true })
  }
  const openRecord = (record: VoterRecord, shouldEdit = false) => {
    setEditing(shouldEdit && canEdit)
    setRegisterState({ voter: record.id, view })
  }
  const save = async (record: VoterRecord) => {
    await saveVoter(record)
    await reload()
    closeRecord()
  }
  const deleteWard = async () => {
    if (!deleteWardId || deleteConfirmation.trim() !== deleteWardId) return
    setDeleteWorking(true)
    setDeleteMessage(undefined)
    setDeleteError(undefined)
    try {
      await deleteVotersByWard(deleteWardId)
      setDeleteMessage(t.deleteWardSuccess)
      setDeleteWardId('')
      setDeleteConfirmation('')
      setFilters(emptyVoterFilters)
      void reload()
    } catch (reason) {
      setDeleteError(`${t.deleteWardError} ${readableFirebaseError(reason)}`)
    } finally {
      setDeleteWorking(false)
    }
  }

  return <section className="voter-register-page">
    <header className="page-intro voter-register-intro"><div className="voter-register-header-actions">{canDeleteWard ? <button aria-label={t.deleteWardOpen} className="voter-delete-ward-trigger" onClick={() => { setShowDeleteWard(true); setDeleteMessage(undefined); setDeleteError(undefined) }} type="button"><Trash2 size={14} />{t.deleteWardOpen}</button> : null}<button className="voter-secondary-button" onClick={() => void reload()} type="button"><RefreshCcw className={isRefreshing ? 'animate-spin' : undefined} size={15} />{t.refresh}</button></div></header>

    <section className="voter-filter-card" aria-label={t.filters}>
      <div className="voter-filter-title"><div><Search size={18} /><strong>{t.search}</strong></div><button className="voter-text-button" onClick={() => { setFilters(emptyVoterFilters); setOpenFilter(undefined); setShowMoreFilters(false) }} type="button">{t.clear}</button></div>
      <div className="voter-global-search"><FilterInput label={t.search} placeholder={t.searchPlaceholder} value={filters.search} onChange={(value) => updateFilter('search', value)} /></div>
      <div className="voter-filter-button-row" aria-label={t.moreFilters}>
        <FilterMenuButton closeLabel={t.close} label={t.ward} value={filters.wardId} options={options.wards} anyLabel={t.any} open={openFilter === 'ward'} onToggle={() => setOpenFilter(openFilter === 'ward' ? undefined : 'ward')} onChange={(value) => { updateFilter('wardId', value); setOpenFilter(undefined) }} />
        <FilterMenuButton closeLabel={t.close} label={t.booth} value={filters.boothId} options={options.booths} anyLabel={t.any} open={openFilter === 'booth'} onToggle={() => setOpenFilter(openFilter === 'booth' ? undefined : 'booth')} onChange={(value) => { updateFilter('boothId', value); setOpenFilter(undefined) }} />
        <FilterMenuButton closeLabel={t.close} label={t.area} value={filters.area} options={options.areas} anyLabel={t.any} open={openFilter === 'area'} onToggle={() => setOpenFilter(openFilter === 'area' ? undefined : 'area')} onChange={(value) => { updateFilter('area', value); setOpenFilter(undefined) }} />
        <button aria-expanded={showMoreFilters} className={`voter-filter-menu-button voter-more-filters-button${filters.division || filters.sourcePdf || filters.uploadedBy || filters.uploadedFrom || filters.uploadedTo ? ' has-value' : ''}`} onClick={() => { setShowMoreFilters((current) => !current); setOpenFilter(undefined) }} type="button"><span>{t.filters}</span><strong>{showMoreFilters ? t.hideFilters : t.moreFilters}</strong><ChevronDown size={14} /></button>
        {showMoreFilters ? <>
          <FilterMenuButton closeLabel={t.close} label={t.division} value={filters.division} options={options.divisions} anyLabel={t.any} open={openFilter === 'division'} onToggle={() => setOpenFilter(openFilter === 'division' ? undefined : 'division')} onChange={(value) => { updateFilter('division', value); setOpenFilter(undefined) }} />
          <FilterMenuButton closeLabel={t.close} label={t.source} value={filters.sourcePdf} options={options.sourcePdfs} anyLabel={t.any} open={openFilter === 'source'} onToggle={() => setOpenFilter(openFilter === 'source' ? undefined : 'source')} onChange={(value) => { updateFilter('sourcePdf', value); setOpenFilter(undefined) }} />
          <FilterMenuButton closeLabel={t.close} label={t.uploadedBy} value={filters.uploadedBy} options={options.uploaders} anyLabel={t.any} open={openFilter === 'uploadedBy'} onToggle={() => setOpenFilter(openFilter === 'uploadedBy' ? undefined : 'uploadedBy')} onChange={(value) => { updateFilter('uploadedBy', value); setOpenFilter(undefined) }} />
          <DateFilterButton label={t.chooseDate} from={filters.uploadedFrom} to={filters.uploadedTo} open={openFilter === 'date'} onToggle={() => setOpenFilter(openFilter === 'date' ? undefined : 'date')} onFromChange={(value) => updateFilter('uploadedFrom', value)} onToChange={(value) => updateFilter('uploadedTo', value)} t={t} />
        </> : null}
      </div>
    </section>

    {canDeleteWard && showDeleteWard ? <div className="voter-delete-ward-overlay" onMouseDown={() => { if (!deleteWorking) setShowDeleteWard(false) }} role="presentation"><section aria-modal="true" className="voter-delete-ward-card voter-delete-ward-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog"><div className="voter-delete-ward-dialog-heading"><div><strong>{t.deleteWardTitle}</strong><p>{t.deleteWardHint}</p></div><button aria-label={t.cancel} className="voter-dialog-close" disabled={deleteWorking} onClick={() => setShowDeleteWard(false)} type="button"><X size={17} /></button></div><div className="voter-delete-ward-controls"><FilterSelect label={t.selectWard} value={deleteWardId} options={options.wards} anyLabel={t.any} onChange={(value) => { setDeleteWardId(value); setDeleteConfirmation(''); setDeleteMessage(undefined); setDeleteError(undefined) }} /><label className="voter-field"><span>{t.typeWard}</span><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder={deleteWardId || '—'} /></label></div>{deleteMessage ? <p className="voter-delete-success">{deleteMessage}</p> : null}{deleteError ? <p className="voter-delete-error">{deleteError}</p> : null}<footer className="voter-delete-ward-dialog-footer"><button className="voter-secondary-button" disabled={deleteWorking} onClick={() => setShowDeleteWard(false)} type="button">{t.cancel}</button><button className="voter-danger-button" disabled={!deleteWardId || deleteConfirmation.trim() !== deleteWardId || deleteWorking} onClick={() => void deleteWard()} type="button"><Trash2 size={15} />{deleteWorking ? t.deletingWard : t.deleteWard}</button></footer></section></div> : null}

    {records === undefined && !loadError ? <PageState kind="loading" title={t.loading} description="" /> : null}
    {loadError ? <PageState kind="error" title={t.error} description={loadError} actionLabel={t.retry} onAction={() => void reload()} /> : null}
    {records !== undefined && !loadError ? <>
      <section className="voter-results-toolbar">
        <div><strong>{filteredRecords.length} {t.records}</strong><span>{canEdit ? t.editAccess : t.readOnly}</span></div>
        <div className="voter-toolbar-actions">
          <div className="voter-view-toggle" aria-label="Record view"><button className={view === 'individual' ? 'is-active' : ''} onClick={() => setViewMode('individual')} type="button"><Table2 size={15} />{t.individual}</button><button className={view === 'door' ? 'is-active' : ''} onClick={() => setViewMode('door')} type="button"><UsersRound size={15} />{t.doorWise}</button></div>
          {canDownload ? <div className="voter-export-buttons"><button onClick={() => void downloadExcel(filteredRecords)} type="button"><FileSpreadsheet size={15} />{t.exportExcel}</button><button onClick={() => void downloadPdf(filteredRecords)} type="button"><FileText size={15} />{t.exportPdf}</button><button onClick={() => downloadCsv(filteredRecords)} type="button"><Download size={15} />{t.exportCsv}</button></div> : null}
        </div>
      </section>
      {canDownload ? <p className="voter-export-hint">{t.exportHint}</p> : null}
      {records.length === 0 ? <PageState kind="empty" title={t.noData} description="" /> : filteredRecords.length === 0 ? <PageState kind="empty" title={t.noRecords} description="" /> : view === 'individual' ? <IndividualRecords records={filteredRecords} onOpen={openRecord} onEdit={canEdit ? (record) => openRecord(record, true) : undefined} t={t} /> : <DoorWiseRecords groups={doorGroups} onDoorClose={() => setRegisterState({ door: null })} onDoorOpen={(door) => setRegisterState({ view: 'door', door })} selectedDoor={selectedDoor} onOpen={openRecord} onEdit={canEdit ? (record) => openRecord(record, true) : undefined} t={t} />}
      {records.length > 0 ? <div aria-live="polite" className={`voter-pagination-status${loadMoreError ? ' is-error' : ''}`} ref={loadMoreSentinel}>
        {loadMoreError ? <><span>{loadMoreError}</span><button className="voter-text-button" onClick={() => void loadMore()} type="button">{t.retry}</button></> : isLoadingMore ? <><LoaderCircle className="animate-spin" size={15} />{t.loadingMore}</> : hasMore ? t.loadingMore : t.allLoaded}
      </div> : null}
    </> : null}
    {activeRecord ? <VoterDialog key={activeRecord.id} canEdit={canEdit} language={language} onClose={closeRecord} onSave={save} record={activeRecord} startEditing={editing} t={t} /> : null}
    {showGoTop ? <button aria-label={t.goTop} className="voter-go-top-button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} type="button"><ArrowUp size={16} /><span>{t.goTop}</span></button> : null}
  </section>
}

function IndividualRecords({ records, onOpen, onEdit, t }: { records: VoterRecord[]; onOpen: (record: VoterRecord) => void; onEdit?: (record: VoterRecord) => void; t: ScreenText }) {
  const doorCounts = records.reduce((counts, record) => {
    const key = record.doorNumber || '—'
    counts.set(key, (counts.get(key) ?? 0) + 1)
    return counts
  }, new Map<string, number>())
  return <div className="voter-card-grid voter-record-card-grid">{records.map((record) => {
    const doorNumber = record.doorNumber || '—'
    return <article className="voter-profile-card voter-record-card" key={record.id}>
      <button className="voter-profile-card-main voter-record-card-main" onClick={() => onOpen(record)} type="button">
        <div className="voter-profile-card-top"><span>{t.ward} {record.wardId || '—'} · {t.booth} {record.boothId || '—'}</span><span className="voter-house-count">{doorCounts.get(doorNumber)} {t.members}</span></div>
        <h3>{record.fullName || '—'}</h3>
        <dl className="voter-record-card-fields"><div><dt>{t.voterId}</dt><dd>{record.voterId || record.alternateIdentifier || '—'}</dd></div><div><dt>{t.door}</dt><dd>{doorNumber}</dd></div></dl>
        <div className="voter-record-card-area"><span>{t.area}</span><strong>{record.area || record.division || '—'}</strong></div>
        <span className="voter-profile-card-open">{t.view}</span>
      </button>
      {onEdit ? <button className="voter-profile-card-edit" onClick={() => onEdit(record)} type="button"><Edit3 size={14} />{t.edit}</button> : null}
    </article>
  })}</div>
}

function DoorWiseRecords({ groups, selectedDoor, onDoorOpen, onDoorClose, onOpen, onEdit, t }: { groups: Array<[string, VoterRecord[]]>; selectedDoor?: string; onDoorOpen: (door: string) => void; onDoorClose: () => void; onOpen: (record: VoterRecord) => void; onEdit?: (record: VoterRecord) => void; t: ScreenText }) {
  const activeGroup = groups.find(([doorNumber]) => doorNumber === selectedDoor)

  return <>
    <div className="door-wise-grid">{groups.map(([doorNumber, records]) => <article className="door-wise-card" key={doorNumber}>
      <button aria-haspopup="dialog" className="door-wise-summary" onClick={() => onDoorOpen(doorNumber)} type="button">
        <span className="door-wise-summary-label">{t.door}</span>
        <strong className="door-wise-summary-number">{doorNumber || '—'}</strong>
        <span className="door-wise-summary-count">{records.length} {t.members}</span>
        <ChevronDown size={16} />
      </button>
    </article>)}</div>
    {activeGroup ? <div className="door-members-backdrop" onMouseDown={onDoorClose} role="presentation">
      <section aria-modal="true" aria-labelledby="door-members-title" className="door-members-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <header className="door-members-dialog-header">
          <div>
            <p>{t.door}</p>
            <h2 id="door-members-title">{activeGroup[0] || '—'}</h2>
            <span>{activeGroup[1].length} {t.members}</span>
          </div>
          <button aria-label={t.close} className="voter-dialog-close" onClick={onDoorClose} type="button"><X size={19} /></button>
        </header>
        <div className="door-members-dialog-list">
          {activeGroup[1].map((record) => <div className="door-voter-row" key={record.id}>
            <div><strong>{record.fullName}</strong><span>{t.voterId}: {record.voterId} · {t.serial}: {record.serialNumber}</span></div>
            <div><button className="voter-row-button" onClick={() => onOpen(record)} type="button">{t.view}</button>{onEdit ? <button aria-label={`${t.edit} ${record.fullName}`} className="voter-icon-action" onClick={() => onEdit(record)} type="button"><Edit3 size={14} /></button> : null}</div>
          </div>)}
        </div>
      </section>
    </div> : null}
  </>
}

function VoterDialog({ canEdit, language, onClose, onSave, record, startEditing, t }: { canEdit: boolean; language: AppLanguage; onClose: () => void; onSave: (record: VoterRecord) => Promise<void>; record: VoterRecord; startEditing: boolean; t: ScreenText }) {
  const [editing, setEditing] = useState(startEditing)
  const [draft, setDraft] = useState(record)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [cardImageUrl, setCardImageUrl] = useState<string>()
  const [cardImageError, setCardImageError] = useState(!record.voterCardImagePath)
  const readOnly = !editing
  const update = <Key extends keyof VoterRecord>(key: Key, value: VoterRecord[Key]) => setDraft((current) => ({ ...current, [key]: value }))
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing) return
    setSaving(true); setError(false)
    try { await onSave(draft) } catch { setError(true); setSaving(false) }
  }

  useEffect(() => {
    let active = true
    if (!record.voterCardImagePath) return () => { active = false }
    void loadVoterCardImage(record.id).then((url) => { if (active) setCardImageUrl(url) }).catch(() => { if (active) setCardImageError(true) })
    return () => { active = false }
  }, [record.id, record.voterCardImagePath])

  return <div aria-modal="true" className="voter-dialog-backdrop" role="dialog"><form className="voter-dialog" onSubmit={submit}><header><div><p>{t.details}</p><h2>{record.fullName}</h2></div><button aria-label={t.close} className="voter-dialog-close" onClick={onClose} type="button"><X size={19} /></button></header><div className="voter-dialog-body">
    {error ? <p className="form-alert form-alert-error">{t.saveError}</p> : null}
    <section className="voter-original-card"><div className="voter-original-card-heading"><strong>{t.originalCard}</strong>{record.pageNumber ? <span>{t.pdfPosition}: {record.pageNumber} / {record.cardPosition ?? '—'}</span> : null}</div>{cardImageUrl ? <img alt={`${t.originalCard} - ${record.fullName}`} src={cardImageUrl} /> : <div className="voter-card-placeholder">{cardImageError ? t.cardUnavailable : t.cardLoading}</div>}</section>
    <div className="voter-editor-grid">
      <EditorField disabled={readOnly} label={t.name} value={draft.fullName} onChange={(value) => update('fullName', value)} />
      <EditorField disabled={readOnly} label={t.relativeName} value={draft.relativeName} onChange={(value) => update('relativeName', value)} />
      <EditorField disabled={readOnly} label={t.relationship} value={draft.relationshipType} onChange={(value) => update('relationshipType', value)} />
      <EditorField disabled={readOnly} label={t.age} value={draft.age} onChange={(value) => update('age', value)} />
      <EditorField disabled={readOnly} label={t.gender} value={draft.gender} onChange={(value) => update('gender', value)} />
      <EditorField disabled={readOnly} label={t.door} value={draft.doorNumber} onChange={(value) => update('doorNumber', value)} />
      <EditorField disabled={readOnly} label={t.voterId} value={draft.voterId} onChange={(value) => update('voterId', value)} />
      <EditorField disabled={readOnly} label={t.alternateId} value={draft.alternateIdentifier} onChange={(value) => update('alternateIdentifier', value)} />
      <EditorField disabled={readOnly} label={t.mobile} value={draft.mobile} onChange={(value) => update('mobile', value)} />
      <EditorField disabled={readOnly} label={t.serial} value={draft.serialNumber} onChange={(value) => update('serialNumber', value)} />
      <EditorField disabled={readOnly} label={t.assemblySerial} value={draft.assemblySerial} onChange={(value) => update('assemblySerial', value)} />
      <EditorField disabled={readOnly} label={t.ward} value={draft.wardId} onChange={(value) => update('wardId', value)} />
      <EditorField disabled={readOnly} label={t.booth} value={draft.boothId} onChange={(value) => update('boothId', value)} />
      <EditorField disabled={readOnly} label={t.area} value={draft.area} onChange={(value) => update('area', value)} />
      <EditorField disabled={readOnly} label={t.division} value={draft.division} onChange={(value) => update('division', value)} />
    </div>
    <dl className="voter-readonly-data"><div><dt>{t.sourcePdf}</dt><dd>{record.sourcePdfName || '—'}</dd></div><div><dt>{t.uploaded}</dt><dd>{formatDate(record.uploadedAt, language)} · {record.uploadedBy || '—'}</dd></div></dl>
  </div><footer>{editing ? <><button className="voter-secondary-button" onClick={() => setEditing(false)} type="button">{t.close}</button><button className="voter-primary-button" disabled={saving} type="submit">{saving ? <LoaderCircle className="animate-spin" size={15} /> : <Edit3 size={15} />}{saving ? t.saving : t.save}</button></> : <>{canEdit ? <button className="voter-primary-button" onClick={() => setEditing(true)} type="button"><Edit3 size={15} />{t.edit}</button> : null}<button className="voter-secondary-button" onClick={onClose} type="button">{t.close}</button></>}</footer></form></div>
}

function FilterInput({ label, type = 'search', placeholder, value, onChange }: { label: string; type?: 'search' | 'date'; placeholder?: string; value: string; onChange: (value: string) => void }) {
  return <label className="voter-field"><span>{label}</span><input placeholder={placeholder} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>
}

function FilterMenuButton({ label, value, options, anyLabel, closeLabel = 'Close', open, onToggle, onChange }: { label: string; value: string; options: string[]; anyLabel: string; closeLabel?: string; open: boolean; onToggle: () => void; onChange: (value: string) => void }) {
  return <div className="voter-filter-menu">
    <button aria-expanded={open} className={`voter-filter-menu-button${value ? ' has-value' : ''}`} onClick={onToggle} type="button"><span>{label}</span><strong>{value || anyLabel}</strong><ChevronDown size={14} /></button>
    {open ? <div aria-modal="true" className="voter-filter-menu-popover" role="dialog"><div className="voter-filter-menu-popover-header"><strong>{label}</strong><button aria-label={closeLabel} onClick={onToggle} type="button"><X size={17} /></button></div><div className="voter-filter-menu-options" role="menu"><button className={!value ? 'is-selected' : ''} onClick={() => onChange('')} role="menuitem" type="button"><span>{anyLabel}</span>{!value ? <Check size={14} /> : null}</button>{options.map((option) => <button className={value === option ? 'is-selected' : ''} key={option} onClick={() => onChange(option)} role="menuitem" type="button"><span>{option}</span>{value === option ? <Check size={14} /> : null}</button>)}</div></div> : null}
  </div>
}

function DateFilterButton({ label, from, to, open, onToggle, onFromChange, onToChange, t }: { label: string; from: string; to: string; open: boolean; onToggle: () => void; onFromChange: (value: string) => void; onToChange: (value: string) => void; t: ScreenText }) {
  const value = from && to ? `${from} – ${to}` : from || to || t.any
  return <div className="voter-filter-menu voter-date-filter-menu">
    <button aria-expanded={open} className={`voter-filter-menu-button${from || to ? ' has-value' : ''}`} onClick={onToggle} type="button"><span>{label}</span><strong>{value}</strong><ChevronDown size={14} /></button>
    {open ? <div className="voter-filter-menu-popover voter-date-filter-popover" role="dialog"><div className="voter-filter-menu-popover-header"><strong>{label}</strong><button aria-label={t.close} onClick={onToggle} type="button"><X size={17} /></button></div><div className="voter-filter-menu-options"><FilterInput label={t.uploadedFrom} type="date" value={from} onChange={onFromChange} /><FilterInput label={t.uploadedTo} type="date" value={to} onChange={onToChange} /></div></div> : null}
  </div>
}

function FilterSelect({ label, value, options, anyLabel, onChange }: { label: string; value: string; options: string[]; anyLabel: string; onChange: (value: string) => void }) {
  return <label className="voter-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{anyLabel}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
}

function EditorField({ disabled, label, value, onChange }: { disabled: boolean; label: string; value: string; onChange: (value: string) => void }) {
  return <label className="voter-field"><span>{label}</span><input disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} /></label>
}

function groupByDoor(records: VoterRecord[]) { return Array.from(records.reduce((groups, record) => { const key = record.doorNumber || '—'; groups.set(key, [...(groups.get(key) ?? []), record]); return groups }, new Map<string, VoterRecord[]>()).entries()).sort(([first], [second]) => first.localeCompare(second, 'en', { numeric: true })) }
function formatDate(value: string | undefined, language: AppLanguage) { return value ? new Intl.DateTimeFormat(language === 'te' ? 'te-IN' : 'en-IN', { dateStyle: 'medium' }).format(new Date(value)) : '—' }
function sourceLabel(record: VoterRecord) { return record.sourcePdfName || record.sourcePdfId }
function matchesFilters(record: VoterRecord, filters: VoterFilters) {
  const match = (value: string, query: string) => !query || value.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  const uploadedDate = record.uploadedAt?.slice(0, 10) ?? ''
  return matchesVoterSearch(record, filters.search) &&
    match(record.fullName, filters.name) &&
    match(record.doorNumber, filters.doorNumber) &&
    match(record.voterId, filters.voterId) &&
    match(record.alternateIdentifier, filters.alternateIdentifier) &&
    match(record.mobile, filters.mobile) &&
    match(record.serialNumber, filters.serialNumber) &&
    match(record.wardId, filters.wardId) &&
    match(record.boothId, filters.boothId) &&
    match(record.area, filters.area) &&
    match(record.division, filters.division) &&
    match(sourceLabel(record), filters.sourcePdf) &&
    (!filters.uploadedFrom || uploadedDate >= filters.uploadedFrom) &&
    (!filters.uploadedTo || uploadedDate <= filters.uploadedTo) &&
    match(record.uploadedBy, filters.uploadedBy)
}
