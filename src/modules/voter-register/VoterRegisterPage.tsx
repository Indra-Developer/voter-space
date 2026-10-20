import { ArrowUp, ChevronDown, Download, Edit3, FileSpreadsheet, FileText, ImageIcon, LoaderCircle, RefreshCcw, Search, Table2, Trash2, UsersRound, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AppSession } from '../auth/types'
import { readableFirebaseError } from '../auth/firebase-auth'
import type { AppLanguage } from '../app-shell/types'
import { PageState } from '../app-shell/PageState'
import './voter-register.css'
import { countVoters, deleteVoter, deleteVotersByWard, loadVoterCardImage, loadVoterCardThumbnail, loadVoterFilterOptions, loadVoters, runVoterExport, saveVoter, ServerExportCancelledError, type VoterExportFormat } from './voter-service'
import { emptyVoterFilters, type VoterFilterOptions, type VoterFilters, type VoterRecord } from './types'
import { displayOfficialVoterId, missingOfficialVoterId } from './voter-display'

type ViewMode = 'individual' | 'door'
type VoterPageResult = Awaited<ReturnType<typeof loadVoters>>
type FirstPageCache = { key: string; result: VoterPageResult; cachedAt: number }
const screenCopy = {
  en: {
    label: 'Voter data', title: 'Voter Register', description: 'Find voters, check records, and export only the records you are allowed to access.',
    search: 'Search all voter fields', searchPlaceholder: 'Name, voter ID, door number, serial, ward, booth, area, division, PDF…', searchHint: 'You can search using Telugu, English spelling, voter ID, door number, serial number, ward, booth, area, division, mobile number, or PDF name.', refresh: 'Refresh', records: 'records', individual: 'Individual records', doorWise: 'Door-wise view',
    filters: 'Filters', clear: 'Clear all', moreFilters: 'More filters', hideFilters: 'Hide filters', name: 'Name', door: 'House number', voterId: 'Voter ID', alternateId: 'Alternate ID', mobile: 'Mobile number', serial: 'Serial number', ward: 'Ward', booth: 'Booth', area: 'Area', division: 'Division', source: 'Source PDF', uploadedFrom: 'Uploaded from', uploadedTo: 'Uploaded to', uploadedBy: 'Uploaded by', members: 'members', chooseDate: 'Choose upload dates', deleteWardOpen: 'Delete ward', deleteWardTitle: 'Delete complete ward data', deleteWardHint: 'This permanently removes the ward voters, voter card images, source PDFs, and import rows from Firestore and Storage.', selectWard: 'Select ward', typeWard: 'Type the ward number to confirm', deleteWard: 'Delete ward data', deletingWard: 'Deleting ward data…', deleteWardSuccess: 'Ward data deleted successfully.', deleteWardError: 'Ward data could not be deleted.', cancel: 'Cancel',
    any: 'All',
    exportExcel: 'Excel', exportPdf: 'PDF', exportCsv: 'CSV', exporting: 'Preparing export…', preparingExport: 'Preparing export…', recordsProcessed: 'Records processed', downloadReady: 'Download ready.', cancelExport: 'Cancel export', retryExport: 'Retry export', exportCancelled: 'Export cancelled.', exportError: 'The export could not be completed.', exportHint: 'Exports include every database record matching the selected filters.',
    noRecords: 'No voter records match these filters.', noData: 'No voter records have been imported yet.',
    loading: 'Loading voter records…', searching: 'Searching voter records…', counting: 'Counting matching records…', loadedRecords: 'Loaded records', of: 'of', totalUnavailable: 'The exact total is not available right now.', completed: 'Completed', loadingMore: 'Loading more voters…', allLoaded: 'All available voters are loaded.', error: 'Voter records could not be loaded.', retry: 'Try again', goTop: 'Go to top',
    view: 'View', edit: 'Edit', deleteVoter: 'Delete voter', deletingVoter: 'Deleting voter…', deleteVoterConfirm: 'Delete this voter record, its saved card image, and linked import data? This cannot be undone.', deleteVoterError: 'The voter record could not be deleted.', deleteVoterSuccess: 'Voter record deleted successfully.', close: 'Close', save: 'Save changes', saving: 'Saving…', details: 'Voter details', sourcePdf: 'Source PDF', uploaded: 'Uploaded', saveError: 'The record could not be saved. Please try again.', editAccess: 'You can edit records in your allowed scope.', readOnly: 'You have view-only access to these records.', originalCard: 'Original voter card', cardLoading: 'Loading the original card…', cardUnavailable: 'This voter record has no available card image in the source PDF.', cardError: 'The original voter card could not be loaded.', cardRetry: 'Retry card preview', relativeName: 'Relative name', relationship: 'Relationship', age: 'Age', gender: 'Gender', assemblySerial: 'Assembly serial', pageNumber: 'PDF page', cardPosition: 'Card position', missingVoterId: missingOfficialVoterId, houseStatus: 'House number status', houseAvailable: 'Available', houseMissing: 'Missing / Verification required', houseVerification: 'Verification required', rawOcrText: 'Original OCR text', sourceReference: 'Source reference',
  },
  te: {
    label: 'ఓటర్ డేటా', title: 'ఓటర్ రిజిస్టర్', description: 'ఓటర్లను వెతకండి, రికార్డులను చూడండి, మీకు అనుమతి ఉన్న డేటాను మాత్రమే ఎగుమతి చేయండి.',
    search: 'అన్ని ఓటర్ వివరాల్లో వెతకండి', searchPlaceholder: 'పేరు, ఓటర్ ఐడి, ఇంటి నంబర్, సీరియల్, వార్డు, బూత్, ప్రాంతం, డివిజన్, PDF…', searchHint: 'తెలుగు, ఇంగ్లీష్ స్పెల్లింగ్, ఓటర్ ఐడి, ఇంటి నంబర్, సీరియల్, వార్డు, బూత్, ప్రాంతం, డివిజన్, మొబైల్ లేదా PDF పేరుతో వెతకండి.', refresh: 'రిఫ్రెష్', records: 'రికార్డులు', individual: 'ఒక్కో రికార్డు', doorWise: 'ఇంటి నంబర్ వారీగా',
    filters: 'ఫిల్టర్లు', clear: 'అన్నీ తొలగించండి', moreFilters: 'మరిన్ని ఫిల్టర్లు', hideFilters: 'ఫిల్టర్లు దాచండి', name: 'పేరు', door: 'ఇంటి నంబర్', voterId: 'ఓటర్ ఐడి', alternateId: 'ప్రత్యామ్నాయ ఐడి', mobile: 'మొబైల్ నంబర్', serial: 'సీరియల్ నంబర్', ward: 'వార్డు', booth: 'బూత్', area: 'ప్రాంతం', division: 'డివిజన్', source: 'సోర్స్ PDF', uploadedFrom: 'అప్‌లోడ్ మొదలు', uploadedTo: 'అప్‌లోడ్ చివరి తేదీ', uploadedBy: 'అప్‌లోడ్ చేసినవారు', members: 'సభ్యులు', chooseDate: 'అప్‌లోడ్ తేదీలను ఎంచుకోండి', deleteWardOpen: 'వార్డు తొలగింపు', deleteWardTitle: 'వార్డు మొత్తం డేటాను తొలగించండి', deleteWardHint: 'ఈ చర్య వార్డు ఓటర్లు, ఓటర్ కార్డు చిత్రాలు, సోర్స్ PDFలు మరియు Firestore, Storageలోని దిగుమతి వరుసలను శాశ్వతంగా తొలగిస్తుంది.', selectWard: 'వార్డును ఎంచుకోండి', typeWard: 'నిర్ధారించడానికి వార్డు నంబర్ టైప్ చేయండి', deleteWard: 'వార్డు డేటా తొలగించండి', deletingWard: 'వార్డు డేటా తొలగిస్తోంది…', deleteWardSuccess: 'వార్డు డేటా విజయవంతంగా తొలగించబడింది.', deleteWardError: 'వార్డు డేటా తొలగించలేకపోయాము.', cancel: 'రద్దు',
    any: 'అన్నీ',
    exportExcel: 'ఎక్సెల్', exportPdf: 'PDF', exportCsv: 'CSV', exporting: 'ఎగుమతి సిద్ధమవుతోంది…', preparingExport: 'ఎగుమతి సిద్ధమవుతోంది…', recordsProcessed: 'ప్రాసెస్ చేసిన రికార్డులు', downloadReady: 'డౌన్‌లోడ్ సిద్ధంగా ఉంది.', cancelExport: 'ఎగుమతి రద్దు', retryExport: 'ఎగుమతి మళ్లీ ప్రయత్నించండి', exportCancelled: 'ఎగుమతి రద్దు అయింది.', exportError: 'ఎగుమతిని పూర్తి చేయలేకపోయాము.', exportHint: 'ఎంచుకున్న ఫిల్టర్లకు సరిపోయే డేటాబేస్ రికార్డులన్నీ ఎగుమతి అవుతాయి.',
    noRecords: 'ఈ ఫిల్టర్లకు సరిపోయే ఓటర్ రికార్డులు లేవు.', noData: 'ఇంకా ఓటర్ రికార్డులు దిగుమతి కాలేదు.',
    loading: 'ఓటర్ రికార్డులు లోడ్ అవుతున్నాయి…', searching: 'ఓటర్ రికార్డుల కోసం వెతుకుతున్నాము…', counting: 'సరిపోయే రికార్డుల సంఖ్య లెక్కిస్తున్నాము…', loadedRecords: 'లోడ్ అయిన రికార్డులు', of: 'లో', totalUnavailable: 'ప్రస్తుతం పూర్తి సంఖ్య అందుబాటులో లేదు.', completed: 'పూర్తయింది', loadingMore: 'మరిన్ని ఓటర్లను లోడ్ చేస్తున్నాము…', allLoaded: 'అందుబాటులో ఉన్న ఓటర్లన్నీ లోడ్ అయ్యాయి.', error: 'ఓటర్ రికార్డులు లోడ్ చేయలేకపోయాము.', retry: 'మళ్లీ ప్రయత్నించండి', goTop: 'పైకి వెళ్లండి',
    view: 'చూడండి', edit: 'సవరించండి', deleteVoter: 'ఓటర్ తొలగించండి', deletingVoter: 'ఓటర్ తొలగిస్తోంది…', deleteVoterConfirm: 'ఈ ఓటర్ రికార్డు, సేవ్ చేసిన కార్డు చిత్రం మరియు లింక్ చేసిన దిగుమతి డేటాను తొలగించాలా? ఇది తిరిగి మార్చలేరు.', deleteVoterError: 'ఓటర్ రికార్డును తొలగించలేకపోయాము.', deleteVoterSuccess: 'ఓటర్ రికార్డు విజయవంతంగా తొలగించబడింది.', close: 'మూసివేయండి', save: 'మార్పులు సేవ్ చేయండి', saving: 'సేవ్ అవుతోంది…', details: 'ఓటర్ వివరాలు', sourcePdf: 'సోర్స్ PDF', uploaded: 'అప్‌లోడ్', saveError: 'రికార్డు సేవ్ కాలేదు. మళ్లీ ప్రయత్నించండి.', editAccess: 'మీకు అనుమతి ఉన్న పరిధిలో రికార్డులను సవరించవచ్చు.', readOnly: 'ఈ రికార్డులను చూడటానికి మాత్రమే మీకు అనుమతి ఉంది.', originalCard: 'అసలు ఓటర్ కార్డు', cardLoading: 'అసలు కార్డు లోడ్ అవుతోంది…', cardUnavailable: 'ఈ ఓటర్ రికార్డుకు సోర్స్ PDFలో కార్డు చిత్రం అందుబాటులో లేదు.', cardError: 'అసలు ఓటర్ కార్డు లోడ్ కాలేదు.', cardRetry: 'కార్డు ప్రివ్యూ మళ్లీ ప్రయత్నించండి', relativeName: 'బంధువు పేరు', relationship: 'సంబంధం', age: 'వయస్సు', gender: 'లింగము', assemblySerial: 'అసెంబ్లీ సీరియల్', pageNumber: 'PDF పేజీ', cardPosition: 'కార్డు స్థానం', missingVoterId: missingOfficialVoterId, houseStatus: 'ఇంటి నంబర్ స్థితి', houseAvailable: 'అందుబాటులో ఉంది', houseMissing: 'లేదు / నిర్ధారణ అవసరం', houseVerification: 'నిర్ధారణ అవసరం', rawOcrText: 'అసలు OCR టెక్స్ట్', sourceReference: 'సోర్స్ సూచన',
  },
} as const

type ScreenText = { [Key in keyof typeof screenCopy.en]: string }

export function VoterRegisterPage({ language, session }: { language: AppLanguage; session: AppSession }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [records, setRecords] = useState<VoterRecord[]>()
  const [options, setOptions] = useState<VoterFilterOptions>({ wards: [], booths: [], areas: [], divisions: [], sourcePdfs: [], uploaders: [] })
  const [filters, setFilters] = useState<VoterFilters>(emptyVoterFilters)
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [loadError, setLoadError] = useState<string>()
  const [totalCount, setTotalCount] = useState<number>()
  const [isCounting, setIsCounting] = useState(false)
  const [totalCountError, setTotalCountError] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [nextCursor, setNextCursor] = useState<string>()
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string>()
  const [showGoTop, setShowGoTop] = useState(false)
  const loadMoreSentinel = useRef<HTMLDivElement>(null)
  const dataRequestVersion = useRef(0)
  const filterOptionsLoaded = useRef(false)
  const firstPageCache = useRef<FirstPageCache | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [deleteWardId, setDeleteWardId] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [showDeleteWard, setShowDeleteWard] = useState(false)
  const [deleteWorking, setDeleteWorking] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState<string>()
  const [deleteError, setDeleteError] = useState<string>()
  const [voterNotice, setVoterNotice] = useState<string>()
  const [exportingFormat, setExportingFormat] = useState<VoterExportFormat>()
  const [exportProgress, setExportProgress] = useState(0)
  const [exportCounts, setExportCounts] = useState({ processed: 0, total: 0 })
  const [exportReady, setExportReady] = useState(false)
  const [exportError, setExportError] = useState<string>()
  const [failedExportFormat, setFailedExportFormat] = useState<VoterExportFormat>()
  const exportAbortController = useRef<AbortController | undefined>(undefined)
  const mounted = useRef(true)
  const t = screenCopy[language]
  const canEdit = session.profile.role === 'superAdmin' || (session.profile.role === 'admin' && session.profile.permissions.edit)
  const canDeleteVoter = session.profile.role === 'superAdmin' || (session.profile.role === 'admin' && session.profile.permissions.edit)
  const canDownload = session.profile.role === 'superAdmin' || session.profile.permissions.download
  const canDeleteWard = session.profile.role === 'superAdmin'
  const view: ViewMode = searchParams.get('view') === 'door' ? 'door' : 'individual'
  const selectedDoor = searchParams.get('door') || undefined
  const selectedVoterId = searchParams.get('voter') || undefined
  const activeRecord = useMemo(() => selectedVoterId ? (records ?? []).find((record) => record.id === selectedVoterId) ?? null : null, [records, selectedVoterId])

  useEffect(() => () => {
    mounted.current = false
    exportAbortController.current?.abort()
  }, [])

  const reload = useCallback(async (requestedFilters: VoterFilters, refreshOptions = false) => {
    const requestVersion = ++dataRequestVersion.current
    const cacheKey = JSON.stringify(requestedFilters)
    if (refreshOptions) firstPageCache.current = undefined
    const cachedEntry = !refreshOptions && firstPageCache.current?.key === cacheKey && Date.now() - firstPageCache.current.cachedAt < 60_000 ? firstPageCache.current : undefined
    if (!cachedEntry && firstPageCache.current?.key === cacheKey) firstPageCache.current = undefined
    const cachedPage = cachedEntry?.result
    const shouldLoadOptions = refreshOptions || !filterOptionsLoaded.current
    setIsRefreshing(true)
    setLoadError(undefined)
    setTotalCount(undefined)
    setIsCounting(true)
    setTotalCountError(false)
    setRecords(undefined)
    setNextCursor(undefined)
    setHasMore(false)
    setIsLoadingMore(false)
    setLoadMoreError(undefined)
    const countPromise = countVoters(requestedFilters)
    const pagePromise = cachedPage ? Promise.resolve(cachedPage) : loadVoters(undefined, { filters: requestedFilters })
    const optionsPromise = shouldLoadOptions ? loadVoterFilterOptions() : Promise.resolve<VoterFilterOptions | undefined>(undefined)
    try {
      const result = await pagePromise
      // A slower response for an older search/filter must never replace the
      // records requested by the latest filter state.
      if (requestVersion !== dataRequestVersion.current) return
      setRecords(result.records)
      if (!cachedPage) firstPageCache.current = { key: cacheKey, result, cachedAt: Date.now() }
      void optionsPromise.then((databaseOptions) => {
        if (requestVersion !== dataRequestVersion.current || !databaseOptions) return
        setOptions(databaseOptions)
        filterOptionsLoaded.current = true
      }).catch(() => undefined)
      setNextCursor(result.nextCursor)
      setHasMore(result.hasMore)
      setLoadMoreError(undefined)
      void countPromise.then((countResult) => {
        if (requestVersion !== dataRequestVersion.current) return
        setTotalCount(countResult.totalCount)
        setIsCounting(false)
      }).catch(() => {
        if (requestVersion !== dataRequestVersion.current) return
        setIsCounting(false)
        setTotalCountError(true)
      })
    } catch (reason) {
      if (requestVersion === dataRequestVersion.current) {
        setLoadError(readableFirebaseError(reason))
        setIsCounting(false)
        void optionsPromise.catch(() => undefined)
        void countPromise.catch(() => undefined)
      }
    } finally {
      if (requestVersion === dataRequestVersion.current) setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    // Wait until typing has stopped before starting a callable request. The
    // version guard in reload/updateFilter invalidates any older request that
    // is still running, so an old search can never replace newer results.
    const filterLoad = window.setTimeout(() => void reload(filters), 500)
    return () => window.clearTimeout(filterLoad)
  }, [filters, reload])

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || isLoadingMore) return
    const requestVersion = dataRequestVersion.current
    setIsLoadingMore(true)
    setLoadMoreError(undefined)
    try {
      const result = await loadVoters(nextCursor, { filters })
      if (requestVersion !== dataRequestVersion.current) return
      setRecords((current) => [...(current ?? []), ...result.records])
      setNextCursor(result.nextCursor)
      setHasMore(result.hasMore)
    } catch (reason) {
      if (requestVersion === dataRequestVersion.current) {
        setLoadMoreError(readableFirebaseError(reason))
      }
    } finally {
      if (requestVersion === dataRequestVersion.current) setIsLoadingMore(false)
    }
  }, [filters, hasMore, isLoadingMore, nextCursor])

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

  // The callable function has already applied the exact same filters used by
  // exports. Keep this list as-is so the browser cannot accidentally apply a
  // different or partial filter rule to the displayed page.
  const filteredRecords = useMemo(() => records ?? [], [records])
  const doorGroups = useMemo(() => groupByDoor(filteredRecords), [filteredRecords])

  const updateFilter = <Key extends keyof VoterFilters>(key: Key, value: VoterFilters[Key]) => {
    dataRequestVersion.current += 1
    setRecords(undefined)
    setNextCursor(undefined)
    setHasMore(false)
    setLoadMoreError(undefined)
    setFilters((current) => ({ ...current, [key]: value }))
  }
  const clearFilters = () => {
    dataRequestVersion.current += 1
    setRecords(undefined)
    setNextCursor(undefined)
    setHasMore(false)
    setLoadMoreError(undefined)
    setFilters(emptyVoterFilters)
    setShowMoreFilters(false)
  }
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
    setVoterNotice(undefined)
    setRegisterState({ voter: record.id, view })
  }
  const save = async (record: VoterRecord) => {
    await saveVoter(record)
    firstPageCache.current = undefined
    await reload(filters, true)
    closeRecord()
  }
  const removeVoter = async (record: VoterRecord) => {
    await deleteVoter(record.id)
    firstPageCache.current = undefined
    setRecords((current) => current?.filter((item) => item.id !== record.id))
    setVoterNotice(t.deleteVoterSuccess)
    closeRecord()
    void reload(filters, true)
  }
  const exportRecords = async (format: VoterExportFormat) => {
    exportAbortController.current?.abort()
    const controller = new AbortController()
    exportAbortController.current = controller
    setExportingFormat(format)
    setExportProgress(0)
    setExportCounts({ processed: 0, total: 0 })
    setExportReady(false)
    setExportError(undefined)
    setFailedExportFormat(undefined)
    try {
      await runVoterExport({
        format,
        filters,
        fileName: `voter-register.${format === 'excel' ? 'xlsx' : format}`,
        signal: controller.signal,
        onJob: (job) => {
          if (!mounted.current || exportAbortController.current !== controller) return
          setExportProgress(job.progress)
          setExportCounts({ processed: job.processedCount, total: job.totalCount })
        },
      })
      setExportReady(true)
    } catch (reason) {
      if (!mounted.current) return
      setFailedExportFormat(format)
      setExportError(reason instanceof ServerExportCancelledError ? t.exportCancelled : `${t.exportError} ${readableFirebaseError(reason)}`)
    } finally {
      if (exportAbortController.current === controller) {
        exportAbortController.current = undefined
        if (mounted.current) {
          setExportingFormat(undefined)
          setExportProgress(0)
        }
      }
    }
  }
  const cancelExport = () => exportAbortController.current?.abort()
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
      filterOptionsLoaded.current = false
      firstPageCache.current = undefined
      setFilters(emptyVoterFilters)
    } catch (reason) {
      setDeleteError(`${t.deleteWardError} ${readableFirebaseError(reason)}`)
    } finally {
      setDeleteWorking(false)
    }
  }

  return <section aria-busy={records === undefined || isLoadingMore} className="voter-register-page">
    <header className="page-intro voter-register-intro"><div className="voter-register-header-actions">{canDeleteWard ? <button aria-label={t.deleteWardOpen} className="voter-delete-ward-trigger" onClick={() => { setShowDeleteWard(true); setDeleteMessage(undefined); setDeleteError(undefined) }} type="button"><Trash2 size={14} />{t.deleteWardOpen}</button> : null}<button className="voter-secondary-button" onClick={() => void reload(filters, true)} type="button"><RefreshCcw className={isRefreshing ? 'animate-spin' : undefined} size={15} />{t.refresh}</button></div></header>

    <section className="voter-filter-card" aria-label={t.filters}>
      <div className="voter-filter-title"><div><Search size={18} /><strong>{t.search}</strong></div><button className="voter-text-button" onClick={clearFilters} type="button">{t.clear}</button></div>
      <div className="voter-global-search"><FilterInput label={t.search} placeholder={t.searchPlaceholder} value={filters.search} onChange={(value) => updateFilter('search', value)} /></div>
      <div className="voter-filter-button-row" aria-label={t.moreFilters}>
        <NativeFilterSelect label={t.ward} value={filters.wardId} options={options.wards} anyLabel={t.any} onChange={(value) => updateFilter('wardId', value)} />
        <NativeFilterSelect label={t.booth} value={filters.boothId} options={options.booths} anyLabel={t.any} onChange={(value) => updateFilter('boothId', value)} />
        <NativeFilterSelect label={t.area} value={filters.area} options={options.areas} anyLabel={t.any} onChange={(value) => updateFilter('area', value)} />
        <button aria-expanded={showMoreFilters} className={`voter-filter-menu-button voter-more-filters-button${filters.division || filters.sourcePdf || filters.uploadedBy || filters.uploadedFrom || filters.uploadedTo ? ' has-value' : ''}`} onClick={() => setShowMoreFilters((current) => !current)} type="button"><span>{t.filters}</span><strong>{showMoreFilters ? t.hideFilters : t.moreFilters}</strong><ChevronDown size={14} /></button>
        {showMoreFilters ? <>
          <NativeFilterSelect label={t.division} value={filters.division} options={options.divisions} anyLabel={t.any} onChange={(value) => updateFilter('division', value)} />
          <NativeFilterSelect label={t.source} value={filters.sourcePdf} options={options.sourcePdfs} anyLabel={t.any} onChange={(value) => updateFilter('sourcePdf', value)} />
          <NativeFilterSelect label={t.uploadedBy} value={filters.uploadedBy} options={options.uploaders} anyLabel={t.any} onChange={(value) => updateFilter('uploadedBy', value)} />
          <NativeDateFilter from={filters.uploadedFrom} to={filters.uploadedTo} onFromChange={(value) => updateFilter('uploadedFrom', value)} onToChange={(value) => updateFilter('uploadedTo', value)} t={t} />
        </> : null}
      </div>
    </section>

    {canDeleteWard && showDeleteWard ? <div className="voter-delete-ward-overlay" onMouseDown={() => { if (!deleteWorking) setShowDeleteWard(false) }} role="presentation"><section aria-modal="true" className="voter-delete-ward-card voter-delete-ward-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog"><div className="voter-delete-ward-dialog-heading"><div><strong>{t.deleteWardTitle}</strong><p>{t.deleteWardHint}</p></div><button aria-label={t.cancel} className="voter-dialog-close" disabled={deleteWorking} onClick={() => setShowDeleteWard(false)} type="button"><X size={17} /></button></div><div className="voter-delete-ward-controls"><FilterSelect label={t.selectWard} value={deleteWardId} options={options.wards} anyLabel={t.any} onChange={(value) => { setDeleteWardId(value); setDeleteConfirmation(''); setDeleteMessage(undefined); setDeleteError(undefined) }} /><label className="voter-field"><span>{t.typeWard}</span><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder={deleteWardId || '—'} /></label></div>{deleteMessage ? <p className="voter-delete-success">{deleteMessage}</p> : null}{deleteError ? <p className="voter-delete-error">{deleteError}</p> : null}<footer className="voter-delete-ward-dialog-footer"><button className="voter-secondary-button" disabled={deleteWorking} onClick={() => setShowDeleteWard(false)} type="button">{t.cancel}</button><button className="voter-danger-button" disabled={!deleteWardId || deleteConfirmation.trim() !== deleteWardId || deleteWorking} onClick={() => void deleteWard()} type="button"><Trash2 size={15} />{deleteWorking ? t.deletingWard : t.deleteWard}</button></footer></section></div> : null}

    {records === undefined && !loadError ? <VoterRegisterSkeleton /> : null}
    {loadError ? <PageState kind="error" title={t.error} description={loadError} actionLabel={t.retry} onAction={() => void reload(filters, true)} /> : null}
    {records !== undefined && !loadError ? <>
      <section className="voter-results-toolbar">
        <div><strong>{filteredRecords.length} {t.records}</strong><span>{canEdit ? t.editAccess : t.readOnly}</span></div>
        <div className="voter-toolbar-actions">
          <div className="voter-view-toggle" aria-label="Record view"><button className={view === 'individual' ? 'is-active' : ''} onClick={() => setViewMode('individual')} type="button"><Table2 size={15} />{t.individual}</button><button className={view === 'door' ? 'is-active' : ''} onClick={() => setViewMode('door')} type="button"><UsersRound size={15} />{t.doorWise}</button></div>
          {canDownload ? <div className="voter-export-buttons"><button disabled={Boolean(exportingFormat)} onClick={() => void exportRecords('excel')} type="button">{exportingFormat === 'excel' ? <LoaderCircle className="animate-spin" size={15} /> : <FileSpreadsheet size={15} />}{exportingFormat === 'excel' ? `${t.exporting} ${exportProgress}%` : t.exportExcel}</button><button disabled={Boolean(exportingFormat)} onClick={() => void exportRecords('pdf')} type="button">{exportingFormat === 'pdf' ? <LoaderCircle className="animate-spin" size={15} /> : <FileText size={15} />}{exportingFormat === 'pdf' ? `${t.exporting} ${exportProgress}%` : t.exportPdf}</button><button disabled={Boolean(exportingFormat)} onClick={() => void exportRecords('csv')} type="button">{exportingFormat === 'csv' ? <LoaderCircle className="animate-spin" size={15} /> : <Download size={15} />}{exportingFormat === 'csv' ? `${t.exporting} ${exportProgress}%` : t.exportCsv}</button></div> : null}
        </div>
      </section>
      {voterNotice ? <p className="voter-delete-success">{voterNotice}</p> : null}
      {exportReady ? <p className="voter-export-ready" role="status">{t.downloadReady}</p> : null}
      {exportingFormat ? <div aria-live="polite" className="voter-export-progress"><progress max="100" value={exportProgress} /><span>{t.preparingExport} {exportCounts.total ? `${t.recordsProcessed}: ${exportCounts.processed} ${t.of} ${exportCounts.total}` : `${exportProgress}%`}</span><button className="voter-text-button" onClick={cancelExport} type="button">{t.cancelExport}</button></div> : null}
      {exportError ? <div className="form-alert form-alert-error voter-export-error"><span>{exportError}</span>{failedExportFormat ? <button className="voter-text-button" onClick={() => void exportRecords(failedExportFormat)} type="button">{t.retryExport}</button> : null}</div> : null}
      {canDownload ? <p className="voter-export-hint">{t.exportHint}</p> : null}
      {records.length === 0 && isCounting ? <PageState kind="loading" title={t.counting} description="" /> : records.length === 0 ? <PageState kind="empty" title={hasActiveVoterFilters(filters) ? t.noRecords : t.noData} description="" /> : filteredRecords.length === 0 ? <PageState kind="empty" title={t.noRecords} description="" /> : view === 'individual' ? <IndividualRecords records={filteredRecords} onOpen={openRecord} onEdit={canEdit ? (record) => openRecord(record, true) : undefined} t={t} /> : <DoorWiseRecords groups={doorGroups} onDoorClose={() => setRegisterState({ door: null })} onDoorOpen={(door) => setRegisterState({ view: 'door', door })} selectedDoor={selectedDoor} onOpen={openRecord} onEdit={canEdit ? (record) => openRecord(record, true) : undefined} t={t} />}
      {records.length > 0 ? <div aria-live="polite" className={`voter-pagination-status${loadMoreError ? ' is-error' : ''}`} ref={loadMoreSentinel}>
        {loadMoreError ? <><span>{loadMoreError}</span><button className="voter-text-button" onClick={() => void loadMore()} type="button">{t.retry}</button></> : <><strong>{t.loadedRecords}: {filteredRecords.length}{totalCount !== undefined ? ` ${t.of} ${totalCount}` : ''}</strong>{isCounting ? <span>{t.counting}</span> : totalCountError ? <span>{t.totalUnavailable}</span> : isLoadingMore ? <><LoaderCircle className="animate-spin" size={15} />{t.loadingMore}</> : hasMore ? <span>{t.loadingMore}</span> : <span>{t.completed}</span>}</>}
      </div> : null}
    </> : null}
    {activeRecord ? <VoterDialog key={activeRecord.id} canDelete={canDeleteVoter} canEdit={canEdit} language={language} onClose={closeRecord} onDelete={removeVoter} onSave={save} record={activeRecord} startEditing={editing} t={t} /> : null}
    {showGoTop ? <button aria-label={t.goTop} className="voter-go-top-button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} type="button"><ArrowUp size={16} /><span>{t.goTop}</span></button> : null}
  </section>
}

function VoterRegisterSkeleton() {
  return <section aria-label="Loading voter records" className="voter-loading-skeleton" aria-busy="true">
    {Array.from({ length: 6 }, (_, index) => <article className="voter-loading-skeleton-card" key={index}>
      <span className="voter-loading-skeleton-line voter-loading-skeleton-line-short" />
      <span className="voter-loading-skeleton-line voter-loading-skeleton-line-title" />
      <span className="voter-loading-skeleton-line" />
      <span className="voter-loading-skeleton-line voter-loading-skeleton-line-short" />
    </article>)}
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
        <div className="voter-record-card-heading"><VoterCardThumbnail record={record} /><h3>{record.fullName || '—'}</h3></div>
        <dl className="voter-record-card-fields"><div><dt>{t.voterId}</dt><dd>{displayOfficialVoterId(record)}</dd></div><div><dt>{t.door}</dt><dd>{doorNumber}</dd></div></dl>
        <div className="voter-record-card-area"><span>{t.area}</span><strong>{record.area || record.division || '—'}</strong></div>
        <span className="voter-profile-card-open">{t.view}</span>
      </button>
      {onEdit ? <button className="voter-profile-card-edit" onClick={() => onEdit(record)} type="button"><Edit3 size={14} />{t.edit}</button> : null}
    </article>
  })}</div>
}

function VoterCardThumbnail({ record }: { record: VoterRecord }) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const [url, setUrl] = useState<string>()
  const [failed, setFailed] = useState(false)
  const hasSourceCard = Boolean(record.voterCardImagePath || record.sourcePdfId)

  useEffect(() => {
    const target = containerRef.current
    if (!target || !hasSourceCard) return
    let active = true
    let started = false
    const load = () => {
      if (started) return
      started = true
      void loadVoterCardThumbnail(record.id).then((image) => {
        if (active) setUrl(image.url)
      }).catch(() => {
        if (active) setFailed(true)
      })
    }
    if (!('IntersectionObserver' in window)) {
      load()
      return () => { active = false }
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        load()
        observer.disconnect()
      }
    }, { rootMargin: '240px' })
    observer.observe(target)
    return () => {
      active = false
      observer.disconnect()
    }
  }, [hasSourceCard, record.id])

  return <span aria-hidden="true" className={`voter-card-thumbnail${failed ? ' is-error' : ''}`} ref={containerRef}>{url ? <img alt="" decoding="async" loading="lazy" src={url} /> : <ImageIcon size={16} />}</span>
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
            <div className="door-voter-info"><VoterCardThumbnail record={record} /><div><strong>{record.fullName}</strong><span>{t.voterId}: {record.voterId} · {t.serial}: {record.serialNumber}</span></div></div>
            <div><button className="voter-row-button" onClick={() => onOpen(record)} type="button">{t.view}</button>{onEdit ? <button aria-label={`${t.edit} ${record.fullName}`} className="voter-icon-action" onClick={() => onEdit(record)} type="button"><Edit3 size={14} /></button> : null}</div>
          </div>)}
        </div>
      </section>
    </div> : null}
  </>
}

function VoterDialog({ canDelete, canEdit, language, onClose, onDelete, onSave, record, startEditing, t }: { canDelete: boolean; canEdit: boolean; language: AppLanguage; onClose: () => void; onDelete: (record: VoterRecord) => Promise<void>; onSave: (record: VoterRecord) => Promise<void>; record: VoterRecord; startEditing: boolean; t: ScreenText }) {
  const [editing, setEditing] = useState(startEditing)
  const [draft, setDraft] = useState(record)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const [cardImage, setCardImage] = useState<{ url: string; pageNumber?: number; cardPosition?: number }>()
  const [cardImageState, setCardImageState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [cardRetryKey, setCardRetryKey] = useState(0)
  const readOnly = !editing
  const update = <Key extends keyof VoterRecord>(key: Key, value: VoterRecord[Key]) => setDraft((current) => ({ ...current, [key]: value }))
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing) return
    setSaving(true); setError(false)
    try { await onSave(draft) } catch { setError(true); setSaving(false) }
  }
  const remove = async () => {
    if (!window.confirm(t.deleteVoterConfirm)) return
    setDeleting(true)
    setDeleteError(false)
    try { await onDelete(record) } catch { setDeleteError(true); setDeleting(false) }
  }

  useEffect(() => {
    let active = true
    let timeoutId: number | undefined
    void (async () => {
      try {
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => reject(new Error('Card preview timed out.')), 15000)
        })
        const image = await Promise.race([loadVoterCardImage(record.id), timeout])
        if (active) {
          setCardImage(image)
          setCardImageState('loaded')
        }
      } catch {
        if (active) setCardImageState('error')
      } finally {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      }
    })()
    return () => { active = false }
  }, [record.id, cardRetryKey])

  const previewPage = cardImage?.pageNumber ?? record.pageNumber
  const previewCardPosition = cardImage?.cardPosition ?? record.cardPosition
  const previewFailed = cardImageState === 'error'

  return <div aria-modal="true" className="voter-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }} role="dialog"><form className="voter-dialog" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}><header><div><p>{t.details}</p><h2>{record.fullName}</h2></div><button aria-label={t.close} className="voter-dialog-close" onClick={onClose} type="button"><X size={19} /></button></header><div className="voter-dialog-body">
    {error ? <p className="form-alert form-alert-error">{t.saveError}</p> : null}
    <section className="voter-original-card"><div className="voter-original-card-heading"><strong>{t.originalCard}</strong><div className="voter-card-reference"><span><b>{t.pageNumber}</b> {previewPage ?? '—'}</span><span><b>{t.cardPosition}</b> {previewCardPosition ?? '—'}</span></div></div><div className="voter-original-card-media">{cardImageState === 'loaded' && cardImage ? <img alt={`${t.originalCard} - ${record.fullName}`} decoding="async" onError={() => { setCardImage(undefined); setCardImageState('error') }} src={cardImage.url} /> : <div className={`voter-card-placeholder${previewFailed ? ' is-error' : ''}`}><p>{previewFailed ? (record.voterCardImagePath ? t.cardError : t.cardUnavailable) : t.cardLoading}</p>{previewFailed ? <button className="voter-secondary-button" onClick={() => { setCardImage(undefined); setCardImageState('loading'); setCardRetryKey((current) => current + 1) }} type="button"><RefreshCcw size={14} />{t.cardRetry}</button> : <LoaderCircle className="animate-spin" size={18} />}</div>}</div></section>
    <div className="voter-editor-grid">
      <EditorField disabled={readOnly} label={t.name} value={draft.fullName} onChange={(value) => update('fullName', value)} />
      <EditorField disabled={readOnly} label={t.relativeName} value={draft.relativeName} onChange={(value) => update('relativeName', value)} />
      <EditorField disabled={readOnly} label={t.relationship} value={draft.relationshipType} onChange={(value) => update('relationshipType', value)} />
      <EditorField disabled={readOnly} label={t.age} value={draft.age} onChange={(value) => update('age', value)} />
      <EditorField disabled={readOnly} label={t.gender} value={draft.gender} onChange={(value) => update('gender', value)} />
      <EditorField disabled={readOnly} label={t.door} value={draft.doorNumber} onChange={(value) => update('doorNumber', value)} />
      <EditorField disabled={readOnly} label={t.voterId} placeholder={draft.voterId ? undefined : t.missingVoterId} value={draft.voterId} onChange={(value) => update('voterId', value)} />
      <EditorField disabled={readOnly} label={t.alternateId} value={draft.alternateIdentifier} onChange={(value) => update('alternateIdentifier', value)} />
      <EditorField disabled={readOnly} label={t.mobile} value={draft.mobile} onChange={(value) => update('mobile', value)} />
      <EditorField disabled={readOnly} label={t.serial} value={draft.serialNumber} onChange={(value) => update('serialNumber', value)} />
      <EditorField disabled={readOnly} label={t.assemblySerial} value={draft.assemblySerial} onChange={(value) => update('assemblySerial', value)} />
      <EditorField disabled={readOnly} label={t.ward} value={draft.wardId} onChange={(value) => update('wardId', value)} />
      <EditorField disabled={readOnly} label={t.booth} value={draft.boothId} onChange={(value) => update('boothId', value)} />
      <EditorField disabled={readOnly} label={t.area} value={draft.area} onChange={(value) => update('area', value)} />
      <EditorField disabled={readOnly} label={t.division} value={draft.division} onChange={(value) => update('division', value)} />
      <EditorField disabled label={t.houseStatus} value={doorStatusText(record.doorNumberStatus, t)} onChange={() => undefined} />
    </div>
    <dl className="voter-readonly-data"><div><dt>{t.sourcePdf}</dt><dd>{record.sourcePdfName || record.sourcePdfId || '—'}</dd></div><div><dt>{t.pageNumber}</dt><dd>{previewPage ?? '—'}</dd></div><div><dt>{t.cardPosition}</dt><dd>{previewCardPosition ?? '—'}</dd></div><div><dt>{t.uploaded}</dt><dd>{formatDate(record.uploadedAt, language)} · {record.uploadedBy || '—'}</dd></div></dl>
    <details className="voter-ocr-text"><summary>{t.rawOcrText}</summary><pre>{record.rawText || t.missingVoterId}</pre></details>
    {deleteError ? <p className="form-alert form-alert-error">{t.deleteVoterError}</p> : null}
  </div><footer>{editing ? <><button className="voter-secondary-button" onClick={() => setEditing(false)} type="button">{t.close}</button><button className="voter-primary-button" disabled={saving} type="submit">{saving ? <LoaderCircle className="animate-spin" size={15} /> : <Edit3 size={15} />}{saving ? t.saving : t.save}</button></> : <>{canDelete ? <button className="voter-danger-button" disabled={deleting} onClick={() => void remove()} type="button"><Trash2 size={14} />{deleting ? t.deletingVoter : t.deleteVoter}</button> : null}{canEdit ? <button className="voter-primary-button" disabled={deleting} onClick={() => setEditing(true)} type="button"><Edit3 size={15} />{t.edit}</button> : null}<button className="voter-secondary-button" disabled={deleting} onClick={onClose} type="button">{t.close}</button></>}</footer></form></div>
}

function FilterInput({ label, type = 'search', placeholder, value, onChange }: { label: string; type?: 'search' | 'date'; placeholder?: string; value: string; onChange: (value: string) => void }) {
  return <label className="voter-field"><span>{label}</span><input placeholder={placeholder} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>
}

function NativeFilterSelect({ label, value, options, anyLabel, onChange }: { label: string; value: string; options: string[]; anyLabel: string; onChange: (value: string) => void }) {
  return <label className={`voter-native-filter${value ? ' has-value' : ''}`}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{anyLabel}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
}

function NativeDateFilter({ from, to, onFromChange, onToChange, t }: { from: string; to: string; onFromChange: (value: string) => void; onToChange: (value: string) => void; t: ScreenText }) {
  return <div className={`voter-native-date-filter${from || to ? ' has-value' : ''}`}><span>{t.chooseDate}</span><div><input aria-label={t.uploadedFrom} type="date" value={from} onChange={(event) => onFromChange(event.target.value)} /><input aria-label={t.uploadedTo} type="date" value={to} onChange={(event) => onToChange(event.target.value)} /></div></div>
}

function FilterSelect({ label, value, options, anyLabel, onChange }: { label: string; value: string; options: string[]; anyLabel: string; onChange: (value: string) => void }) {
  return <label className="voter-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{anyLabel}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
}

function EditorField({ disabled, label, placeholder, value, onChange }: { disabled: boolean; label: string; placeholder?: string; value: string; onChange: (value: string) => void }) {
  return <label className="voter-field"><span>{label}</span><input disabled={disabled} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></label>
}

function groupByDoor(records: VoterRecord[]) {
  const groups = records.reduce((result, record) => {
    // Use the corrected, stored house number. A verification candidate is
    // intentionally not used for grouping until it is confirmed.
    const key = record.doorNumber.trim() || '—'
    result.set(key, [...(result.get(key) ?? []), record])
    return result
  }, new Map<string, VoterRecord[]>())
  return Array.from(groups.entries())
    .map(([doorNumber, members]) => [doorNumber, [...members].sort((first, second) => naturalCompare(first.serialNumber, second.serialNumber) || first.fullName.localeCompare(second.fullName, 'te'))] as [string, VoterRecord[]])
    .sort(([first], [second]) => naturalCompare(first, second))
}

function naturalCompare(first: string, second: string) {
  if (first === '—') return second === '—' ? 0 : 1
  if (second === '—') return -1
  const firstParts = first.toLocaleUpperCase().match(/\d+|\D+/g) ?? []
  const secondParts = second.toLocaleUpperCase().match(/\d+|\D+/g) ?? []
  for (let index = 0; index < Math.max(firstParts.length, secondParts.length); index += 1) {
    const left = firstParts[index] ?? ''
    const right = secondParts[index] ?? ''
    if (left === right) continue
    if (/^\d+$/.test(left) && /^\d+$/.test(right)) return Number(left) - Number(right)
    return left.localeCompare(right, 'en')
  }
  return 0
}

function hasActiveVoterFilters(filters: VoterFilters) {
  return Object.values(filters).some(Boolean)
}

function formatDate(value: string | undefined, language: AppLanguage) { return value ? new Intl.DateTimeFormat(language === 'te' ? 'te-IN' : 'en-IN', { dateStyle: 'medium' }).format(new Date(value)) : '—' }
function doorStatusText(status: VoterRecord['doorNumberStatus'], t: ScreenText) { return status === 'available' ? t.houseAvailable : status === 'verificationRequired' ? t.houseVerification : t.houseMissing }
