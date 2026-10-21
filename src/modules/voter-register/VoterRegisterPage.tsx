import { ArrowRight, ArrowUp, Building2, ChevronDown, Download, Edit3, FileSpreadsheet, FileText, Filter, LoaderCircle, Map as MapIcon, MapPin, RefreshCcw, Search, SlidersHorizontal, Table2, Trash2, UsersRound, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AppSession } from '../auth/types'
import { readableFirebaseError } from '../auth/firebase-auth'
import type { AppLanguage } from '../app-shell/types'
import { PageState } from '../app-shell/PageState'
import { joinClasses, uiClasses } from '../app-shell/ui'
import { countVoters, deleteVoter, loadVoterCardImage, loadVoterFilterOptions, loadVoters, runVoterExport, saveVoter, ServerExportCancelledError, type VoterExportFormat } from './voter-service'
import { emptyVoterFilters, type VoterFilterOptions, type VoterFilters, type VoterRecord } from './types'
import { displayDoorNumber, displayOfficialVoterId, missingOfficialVoterId } from './voter-display'

type ViewMode = 'individual' | 'door'
type VoterPageResult = Awaited<ReturnType<typeof loadVoters>>
type FirstPageCache = { key: string; result: VoterPageResult; cachedAt: number }
const screenCopy = {
  en: {
    label: 'Voter data', title: 'Voter Register', description: 'Find voters, check records, and export only the records you are allowed to access.',
    search: 'Search all voter fields', searchPlaceholder: 'Name, voter ID, door number, serial, ward, booth, area, division, PDF…', searchHint: 'You can search using Telugu, English spelling, voter ID, door number, serial number, ward, booth, area, division, mobile number, or PDF name.', refresh: 'Refresh', records: 'records', individual: 'Individual records', doorWise: 'Door-wise view',
    filters: 'Filters', filterHint: 'Narrow down records using the filters below.', clear: 'Clear filters', moreFilters: 'More filters', hideFilters: 'Hide filters', name: 'Name', door: 'House number', voterId: 'Voter ID', alternateId: 'Alternate ID', mobile: 'Mobile number', serial: 'Serial number', ward: 'Ward', booth: 'Booth', area: 'Area', division: 'Division', source: 'Source PDF', uploadedFrom: 'Uploaded from', uploadedTo: 'Uploaded to', uploadedBy: 'Uploaded by', members: 'members', chooseDate: 'Choose upload dates', deleteWardOpen: 'Delete ward', deleteWardTitle: 'Delete complete ward data', deleteWardHint: 'This permanently removes the ward voters, voter card images, source PDFs, and import rows from Firestore and Storage.', selectWard: 'Select ward', typeWard: 'Type the ward number to confirm', deleteWard: 'Delete ward data', deletingWard: 'Deleting ward data…', deleteWardSuccess: 'Ward data deleted successfully.', deleteWardError: 'Ward data could not be deleted.', cancel: 'Cancel',
    any: 'All',
    export: 'Exports', hideExport: 'Hide exports', exportExcel: 'Excel', exportPdf: 'PDF', exportCsv: 'CSV', exporting: 'Preparing export…', preparingExport: 'Preparing export…', recordsProcessed: 'Records processed', downloadReady: 'Download ready.', cancelExport: 'Cancel export', retryExport: 'Retry export', exportCancelled: 'Export cancelled.', exportError: 'The export could not be completed.', exportHint: 'Exports include every database record matching the selected filters.',
    noRecords: 'No voter found for this search.', noData: 'No voter records have been imported yet.',
    loading: 'Loading voter records…', searching: 'Searching voter records…', counting: 'Counting matching records…', loadedRecords: 'Loaded records', of: 'of', totalUnavailable: 'The exact total is not available right now.', completed: 'Completed', loadingMore: 'Loading more voters…', allLoaded: 'All available voters are loaded.', error: 'Voter records could not be loaded.', retry: 'Try again', goTop: 'Go to top',
    view: 'View', edit: 'Edit', deleteVoter: 'Delete voter', deletingVoter: 'Deleting voter…', deleteVoterConfirm: 'Delete this voter record, its saved card image, and linked import data? This cannot be undone.', deleteVoterError: 'The voter record could not be deleted.', deleteVoterSuccess: 'Voter record deleted successfully.', close: 'Close', save: 'Save changes', saving: 'Saving…', details: 'Voter details', sourcePdf: 'Source PDF', uploaded: 'Uploaded', saveError: 'The record could not be saved. Please try again.', editAccess: 'You can edit records in your allowed scope.', readOnly: 'You have view-only access to these records.', originalCard: 'Original voter card', cardLoading: 'Loading the original card…', cardUnavailable: 'This voter record has no available card image in the source PDF.', cardError: 'The original voter card could not be loaded.', cardRetry: 'Retry card preview', relativeName: 'Relative name', relationship: 'Relationship', age: 'Age', gender: 'Gender', assemblySerial: 'Assembly serial', pageNumber: 'PDF page', cardPosition: 'Card position', missingVoterId: missingOfficialVoterId, houseStatus: 'House number status', houseAvailable: 'Available', houseMissing: 'Missing / Verification required', houseVerification: 'Verification required', rawOcrText: 'Original OCR text', sourceReference: 'Source reference',
  },
  te: {
    label: 'ఓటర్ డేటా', title: 'ఓటర్ రిజిస్టర్', description: 'ఓటర్లను వెతకండి, రికార్డులను చూడండి, మీకు అనుమతి ఉన్న డేటాను మాత్రమే ఎగుమతి చేయండి.',
    search: 'ఓటర్ వివరాల్లో వెతకండి', searchPlaceholder: 'పేరు, ఓటర్ ఐడి, ఇంటి నంబర్, సీరియల్, వార్డు, బూత్…', searchHint: 'తెలుగు లేదా ఇంగ్లీష్ స్పెల్లింగ్‌తో వెతకండి.', refresh: 'రిఫ్రెష్', records: 'రికార్డులు', individual: 'వ్యక్తిగతం', doorWise: 'ఇంటి వారీ',
    filters: 'ఫిల్టర్లు', filterHint: 'ఫిల్టర్లను ఉపయోగించండి.', clear: 'ఫిల్టర్లు క్లియర్', moreFilters: 'మరిన్ని ఫిల్టర్లు', hideFilters: 'ఫిల్టర్లు దాచండి', name: 'పేరు', door: 'ఇంటి నంబర్', voterId: 'ఓటర్ ఐడి', alternateId: 'ప్రత్యామ్నాయ ఐడి', mobile: 'మొబైల్ నంబర్', serial: 'సీరియల్ నంబర్', ward: 'వార్డు', booth: 'బూత్', area: 'ప్రాంతం', division: 'డివిజన్', source: 'సోర్స్ PDF', uploadedFrom: 'అప్‌లోడ్ మొదలు', uploadedTo: 'అప్‌లోడ్ చివరి తేదీ', uploadedBy: 'అప్‌లోడ్ చేసినవారు', members: 'సభ్యులు', chooseDate: 'అప్‌లోడ్ తేదీలను ఎంచుకోండి', deleteWardOpen: 'వార్డు తొలగింపు', deleteWardTitle: 'వార్డు మొత్తం డేటాను తొలగించండి', deleteWardHint: 'ఈ చర్య వార్డు ఓటర్లు, ఓటర్ కార్డు చిత్రాలు, సోర్స్ PDFలు మరియు Firestore, Storageలోని దిగుమతి వరుసలను శాశ్వతంగా తొలగిస్తుంది.', selectWard: 'వార్డును ఎంచుకోండి', typeWard: 'నిర్ధారించడానికి వార్డు నంబర్ టైప్ చేయండి', deleteWard: 'వార్డు డేటా తొలగించండి', deletingWard: 'వార్డు డేటా తొలగిస్తోంది…', deleteWardSuccess: 'వార్డు డేటా విజయవంతంగా తొలగించబడింది.', deleteWardError: 'వార్డు డేటా తొలగించలేకపోయాము.', cancel: 'రద్దు',
    any: 'అన్నీ',
    export: 'ఎగుమతులు', hideExport: 'ఎగుమతులు దాచండి', exportExcel: 'ఎక్సెల్', exportPdf: 'PDF', exportCsv: 'CSV', exporting: 'ఎగుమతి సిద్ధమవుతోంది…', preparingExport: 'ఎగుమతి సిద్ధమవుతోంది…', recordsProcessed: 'ప్రాసెస్ చేసిన రికార్డులు', downloadReady: 'డౌన్‌లోడ్ సిద్ధంగా ఉంది.', cancelExport: 'ఎగుమతి రద్దు', retryExport: 'ఎగుమతి మళ్లీ ప్రయత్నించండి', exportCancelled: 'ఎగుమతి రద్దు అయింది.', exportError: 'ఎగుమతిని పూర్తి చేయలేకపోయాము.', exportHint: 'ఎంచుకున్న ఫిల్టర్లకు సరిపోయే డేటాబేస్ రికార్డులన్నీ ఎగుమతి అవుతాయి.',
    noRecords: 'ఈ వెతుకులాటకు ఓటరు దొరకలేదు.', noData: 'ఇంకా ఓటర్ రికార్డులు దిగుమతి కాలేదు.',
    loading: 'ఓటర్ రికార్డులు లోడ్ అవుతున్నాయి…', searching: 'ఓటర్ రికార్డుల కోసం వెతుకుతున్నాము…', counting: 'సరిపోయే రికార్డుల సంఖ్య లెక్కిస్తున్నాము…', loadedRecords: 'లోడ్ అయిన రికార్డులు', of: 'లో', totalUnavailable: 'ప్రస్తుతం పూర్తి సంఖ్య అందుబాటులో లేదు.', completed: 'పూర్తయింది', loadingMore: 'మరిన్ని ఓటర్లను లోడ్ చేస్తున్నాము…', allLoaded: 'అందుబాటులో ఉన్న ఓటర్లన్నీ లోడ్ అయ్యాయి.', error: 'ఓటర్ రికార్డులు లోడ్ చేయలేకపోయాము.', retry: 'మళ్లీ ప్రయత్నించండి', goTop: 'పైకి వెళ్లండి',
    view: 'చూడండి', edit: 'సవరించండి', deleteVoter: 'ఓటర్ తొలగించండి', deletingVoter: 'ఓటర్ తొలగిస్తోంది…', deleteVoterConfirm: 'ఈ ఓటర్ రికార్డు, సేవ్ చేసిన కార్డు చిత్రం మరియు లింక్ చేసిన దిగుమతి డేటాను తొలగించాలా? ఇది తిరిగి మార్చలేరు.', deleteVoterError: 'ఓటర్ రికార్డును తొలగించలేకపోయాము.', deleteVoterSuccess: 'ఓటర్ రికార్డు విజయవంతంగా తొలగించబడింది.', close: 'మూసివేయండి', save: 'మార్పులు సేవ్ చేయండి', saving: 'సేవ్ అవుతోంది…', details: 'ఓటర్ వివరాలు', sourcePdf: 'సోర్స్ PDF', uploaded: 'అప్‌లోడ్', saveError: 'రికార్డు సేవ్ కాలేదు. మళ్లీ ప్రయత్నించండి.', editAccess: 'మీకు అనుమతి ఉన్న పరిధిలో రికార్డులను సవరించవచ్చు.', readOnly: 'ఈ రికార్డులను చూడటానికి మాత్రమే మీకు అనుమతి ఉంది.', originalCard: 'అసలు ఓటర్ కార్డు', cardLoading: 'అసలు కార్డు లోడ్ అవుతోంది…', cardUnavailable: 'ఈ ఓటర్ రికార్డుకు సోర్స్ PDFలో కార్డు చిత్రం అందుబాటులో లేదు.', cardError: 'అసలు ఓటర్ కార్డు లోడ్ కాలేదు.', cardRetry: 'కార్డు ప్రివ్యూ మళ్లీ ప్రయత్నించండి', relativeName: 'బంధువు పేరు', relationship: 'సంబంధం', age: 'వయస్సు', gender: 'లింగము', assemblySerial: 'అసెంబ్లీ సీరియల్', pageNumber: 'PDF పేజీ', cardPosition: 'కార్డు స్థానం', missingVoterId: missingOfficialVoterId, houseStatus: 'ఇంటి నంబర్ స్థితి', houseAvailable: 'అందుబాటులో ఉంది', houseMissing: 'లేదు / నిర్ధారణ అవసరం', houseVerification: 'నిర్ధారణ అవసరం', rawOcrText: 'అసలు OCR టెక్స్ట్', sourceReference: 'సోర్స్ సూచన',
  },
} as const

type ScreenText = { [Key in keyof typeof screenCopy.en]: string }

// This page deliberately uses Tailwind utilities only.  Keeping the visual
// recipes here makes the Register layout predictable and reusable without a
// second, competing stylesheet.
const voterUi = {
  panel: 'rounded-[1.25rem] border border-primary/10 bg-surface p-3 shadow-[0_8px_24px_color-mix(in_srgb,var(--primary)_9%,transparent)] sm:p-4',
  label: 'text-[13px] font-extrabold text-copy',
  helper: 'mt-0.5 block text-xs leading-4 text-muted',
  outlineButton: 'inline-flex min-w-0 min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border-2 px-4 text-sm font-extrabold shadow-[0_4px_12px_color-mix(in_srgb,var(--primary)_9%,transparent)] transition active:translate-y-px',
  select: 'h-11 w-full appearance-none rounded-xl border border-border bg-surface py-2 pl-7 pr-6 text-[11px] font-bold text-copy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15 sm:h-12 sm:pl-9 sm:pr-8 sm:text-sm',
  field: 'grid min-w-0 gap-1.5',
  mutedBox: 'min-w-0 rounded-xl border border-border bg-surface-muted/60',
} as const

export function VoterRegisterPage({ language, session }: { language: AppLanguage; session: AppSession }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [records, setRecords] = useState<VoterRecord[]>()
  const [options, setOptions] = useState<VoterFilterOptions>({ wards: [], booths: [], boothsByWard: {}, areas: [], divisions: [], sourcePdfs: [], uploaders: [] })
  const [filters, setFilters] = useState<VoterFilters>(emptyVoterFilters)
  const [showFilters, setShowFilters] = useState(false)
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [showExports, setShowExports] = useState(false)
  const [loadError, setLoadError] = useState<string>()
  const [totalCount, setTotalCount] = useState<number>()
  const [isCounting, setIsCounting] = useState(false)
  const [totalCountError, setTotalCountError] = useState(false)
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
    setLoadError(undefined)
    setTotalCount(undefined)
    setIsCounting(true)
    setTotalCountError(false)
    setRecords(undefined)
    setNextCursor(undefined)
    setHasMore(false)
    setIsLoadingMore(false)
    setLoadMoreError(undefined)
    const countPromise = countVoters(requestedFilters, { force: refreshOptions })
    const pagePromise = cachedPage ? Promise.resolve(cachedPage) : loadVoters(undefined, { filters: requestedFilters, force: refreshOptions })
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
  const boothOptions = useMemo(() => filters.wardId ? (options.boothsByWard?.[filters.wardId] ?? []) : options.booths, [filters.wardId, options.booths, options.boothsByWard])

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
  return <section aria-busy={records === undefined || isLoadingMore} className="grid min-w-0 max-w-full gap-2.5 overflow-x-hidden pb-24 pt-0 font-sans text-copy sm:gap-4 sm:pb-10">
    <section className={joinClasses(voterUi.panel, 'grid min-w-0 gap-2.5')} aria-label={t.search}>
      <div className="flex min-w-0 items-center gap-2"><div className="flex min-w-0 flex-1 items-start text-primary-strong"><strong className="min-w-0 flex-1 truncate whitespace-nowrap text-sm leading-5 sm:text-xl">{t.search}</strong></div><button aria-expanded={showFilters} className={joinClasses('inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-primary/15 bg-nav-active px-2 text-[11px] font-extrabold text-primary-strong shadow-sm transition hover:bg-primary/15', showFilters && 'border-primary bg-primary/10')} onClick={() => setShowFilters((current) => !current)} type="button"><Filter size={14} /><span className="whitespace-nowrap">{showFilters ? t.hideFilters : t.filters}</span></button></div>
      <FilterInput label={t.search} hideLabel placeholder={t.searchPlaceholder} value={filters.search} onChange={(value) => updateFilter('search', value)} />
    </section>

    {showFilters ? <section className={joinClasses(voterUi.panel, 'grid min-w-0 gap-2.5')} aria-label={t.filters}>
      <div className="flex min-w-0 items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-nav-active text-primary-strong"><Filter size={20} /></span><strong className="truncate whitespace-nowrap text-base leading-5 text-copy sm:text-xl">{t.filters}</strong></div><div className="flex shrink-0 items-center gap-1.5">{hasActiveVoterFilters(filters) ? <button aria-label={t.clear} className="inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-lg px-1.5 text-[10px] font-extrabold text-primary-strong transition hover:bg-nav-active sm:text-xs" onClick={clearFilters} type="button"><X size={13} />{t.clear}</button> : null}<button aria-expanded={showMoreFilters} className={joinClasses('inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl border border-primary/15 bg-nav-active px-2.5 text-xs font-extrabold text-primary-strong shadow-sm transition hover:bg-primary/15', Boolean(filters.division || filters.sourcePdf || filters.uploadedBy) && 'border-primary bg-primary/10')} onClick={() => setShowMoreFilters((current) => !current)} type="button"><SlidersHorizontal size={15} /><span className="whitespace-nowrap">{showMoreFilters ? t.hideFilters : t.moreFilters}</span><ChevronDown className={showMoreFilters ? 'rotate-180 transition-transform' : 'transition-transform'} size={15} /></button></div></div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3" aria-label={t.moreFilters}>
        <NativeFilterSelect icon={<MapPin size={20} />} label={t.ward} value={filters.wardId} options={options.wards} anyLabel={t.any} onChange={(value) => updateFilter('wardId', value)} />
        <NativeFilterSelect icon={<Building2 size={20} />} label={t.booth} value={filters.boothId} options={boothOptions} anyLabel={t.any} onChange={(value) => updateFilter('boothId', value)} />
        <NativeFilterSelect icon={<MapIcon size={20} />} label={t.area} value={filters.area} options={options.areas} anyLabel={t.any} onChange={(value) => updateFilter('area', value)} />
      </div>
      {showMoreFilters ? <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 sm:gap-3"><NativeFilterSelect label={t.division} value={filters.division} options={options.divisions} anyLabel={t.any} onChange={(value) => updateFilter('division', value)} /><NativeFilterSelect label={t.source} value={filters.sourcePdf} options={options.sourcePdfs} anyLabel={t.any} onChange={(value) => updateFilter('sourcePdf', value)} /><NativeFilterSelect label={t.uploadedBy} value={filters.uploadedBy} options={options.uploaders} anyLabel={t.any} onChange={(value) => updateFilter('uploadedBy', value)} /></div> : null}
    </section> : null}

    {records === undefined && !loadError ? <VoterRegisterSkeleton /> : null}
    {loadError ? <PageState kind="error" title={t.error} description={loadError} actionLabel={t.retry} onAction={() => void reload(filters, true)} /> : null}
    {records !== undefined && !loadError ? <>
      <section className={joinClasses('grid min-w-0 items-center gap-2', canDownload ? 'grid-cols-2' : 'grid-cols-1')}>
        {canDownload ? <button aria-expanded={showExports} className={joinClasses('inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-primary/15 bg-nav-active px-2 text-xs font-extrabold text-primary-strong shadow-sm transition hover:bg-primary/15', showExports && 'border-primary bg-primary/10')} onClick={() => setShowExports((current) => !current)} type="button"><Download size={15} /><span className="truncate">{showExports ? t.hideExport : t.export}</span><ChevronDown className={showExports ? 'rotate-180 transition-transform' : 'transition-transform'} size={14} /></button> : null}
        <div className="grid w-full min-w-0 grid-cols-2 overflow-hidden rounded-xl border border-border bg-surface shadow-sm" aria-label="Record view"><button className={joinClasses('flex min-h-10 min-w-0 items-center justify-center gap-0.5 overflow-hidden px-1 text-[9px] font-extrabold leading-4 transition', view === 'individual' ? 'bg-primary text-primary-contrast' : 'text-muted hover:bg-nav-active')} onClick={() => setViewMode('individual')} type="button"><Table2 className="shrink-0" size={13} /><span className="truncate">{t.individual}</span></button><button className={joinClasses('flex min-h-10 min-w-0 items-center justify-center gap-0.5 overflow-hidden px-1 text-[9px] font-extrabold leading-4 transition', view === 'door' ? 'bg-primary text-primary-contrast' : 'text-muted hover:bg-nav-active')} onClick={() => setViewMode('door')} type="button"><UsersRound className="shrink-0" size={13} /><span className="truncate">{t.doorWise}</span></button></div>
      </section>
      {canDownload && showExports ? <div className="grid grid-cols-3 gap-2"><button className={joinClasses(uiClasses.button, 'min-h-11 w-full min-w-0 rounded-xl border-emerald-200 bg-emerald-50 px-2 text-xs font-extrabold text-emerald-800 hover:bg-emerald-100')} disabled={Boolean(exportingFormat)} onClick={() => void exportRecords('excel')} type="button">{exportingFormat === 'excel' ? <LoaderCircle className="animate-spin" size={15} /> : <FileSpreadsheet size={16} />}{exportingFormat === 'excel' ? `${t.exporting} ${exportProgress}%` : t.exportExcel}</button><button className={joinClasses(uiClasses.button, 'min-h-11 w-full min-w-0 rounded-xl border-red-200 bg-red-50 px-2 text-xs font-extrabold text-red-700 hover:bg-red-100')} disabled={Boolean(exportingFormat)} onClick={() => void exportRecords('pdf')} type="button">{exportingFormat === 'pdf' ? <LoaderCircle className="animate-spin" size={15} /> : <FileText size={16} />}{exportingFormat === 'pdf' ? `${t.exporting} ${exportProgress}%` : t.exportPdf}</button><button className={joinClasses(uiClasses.button, 'min-h-11 w-full min-w-0 rounded-xl border-blue-200 bg-blue-50 px-2 text-xs font-extrabold text-blue-700 hover:bg-blue-100')} disabled={Boolean(exportingFormat)} onClick={() => void exportRecords('csv')} type="button">{exportingFormat === 'csv' ? <LoaderCircle className="animate-spin" size={15} /> : <Download size={16} />}{exportingFormat === 'csv' ? `${t.exporting} ${exportProgress}%` : t.exportCsv}</button></div> : null}
      {voterNotice ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{voterNotice}</p> : null}
      {exportReady ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800" role="status">{t.downloadReady}</p> : null}
      {exportingFormat ? <div aria-live="polite" className={joinClasses(uiClasses.card, 'flex flex-wrap items-center gap-3 p-4')}><progress className="h-2 flex-1 accent-[var(--primary)]" max="100" value={exportProgress} /><span className="text-sm font-semibold text-copy">{t.preparingExport} {exportCounts.total ? `${t.recordsProcessed}: ${exportCounts.processed} ${t.of} ${exportCounts.total}` : `${exportProgress}%`}</span><button className="rounded-lg px-2 py-1 text-sm font-bold text-primary hover:bg-nav-active" onClick={cancelExport} type="button">{t.cancelExport}</button></div> : null}
      {exportError ? <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"><span>{exportError}</span>{failedExportFormat ? <button className="underline underline-offset-2" onClick={() => void exportRecords(failedExportFormat)} type="button">{t.retryExport}</button> : null}</div> : null}
      {records.length === 0 && isCounting ? <PageState kind="loading" title={t.counting} description="" /> : records.length === 0 ? <PageState kind="empty" title={hasActiveVoterFilters(filters) ? t.noRecords : t.noData} description="" /> : filteredRecords.length === 0 ? <PageState kind="empty" title={t.noRecords} description="" /> : view === 'individual' ? <IndividualRecords records={filteredRecords} onOpen={openRecord} t={t} /> : <DoorWiseRecords groups={doorGroups} onDoorClose={() => setRegisterState({ door: null })} onDoorOpen={(door) => setRegisterState({ view: 'door', door })} selectedDoor={selectedDoor} onOpen={openRecord} onEdit={canEdit ? (record) => openRecord(record, true) : undefined} t={t} />}
      {records.length > 0 ? <div aria-live="polite" className={joinClasses('flex min-h-12 flex-wrap items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm', loadMoreError ? 'border-red-200 bg-red-50 text-red-700' : 'border-border bg-surface-muted/50 text-muted')} ref={loadMoreSentinel}>
        {loadMoreError ? <><span>{loadMoreError}</span><button className="font-extrabold underline underline-offset-2" onClick={() => void loadMore()} type="button">{t.retry}</button></> : <><strong className="text-copy">{t.loadedRecords}: {filteredRecords.length}{totalCount !== undefined ? ` ${t.of} ${totalCount}` : ''}</strong>{isCounting ? <span>{t.counting}</span> : totalCountError ? <span>{t.totalUnavailable}</span> : isLoadingMore ? <><LoaderCircle className="animate-spin" size={15} />{t.loadingMore}</> : hasMore ? <span>{t.loadingMore}</span> : <span>{t.completed}</span>}</>}
      </div> : null}
    </> : null}
    {activeRecord ? <VoterDialog key={activeRecord.id} canDelete={canDeleteVoter} canEdit={canEdit} language={language} onClose={closeRecord} onDelete={removeVoter} onSave={save} record={activeRecord} startEditing={editing} t={t} /> : null}
    {showGoTop ? <button aria-label={t.goTop} className={joinClasses(uiClasses.button, uiClasses.primaryButton, 'fixed bottom-24 right-4 z-30 min-h-12 rounded-full px-4 shadow-float sm:bottom-6')} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} type="button"><ArrowUp size={18} /><span>{t.goTop}</span></button> : null}
  </section>
}

function VoterRegisterSkeleton() {
  return <section aria-label="Loading voter records" className="grid grid-cols-2 gap-3 max-[389px]:grid-cols-1 tablet:grid-cols-2 shell:grid-cols-3" aria-busy="true">
    {Array.from({ length: 6 }, (_, index) => <article className={joinClasses(uiClasses.card, 'grid min-h-64 gap-3 rounded-[1.25rem] p-3 sm:p-4')} key={index}>
      <span className="block h-9 w-4/5 animate-pulse rounded-xl bg-surface-muted" />
      <span className="block h-11 animate-pulse rounded-xl bg-surface-muted" />
      <span className="block h-16 animate-pulse rounded-xl bg-surface-muted" />
      <span className="block h-9 w-2/5 animate-pulse rounded-xl bg-surface-muted" />
    </article>)}
  </section>
}

function IndividualRecords({ records, onOpen, t }: { records: VoterRecord[]; onOpen: (record: VoterRecord) => void; t: ScreenText }) {
  const doorCounts = records.reduce((counts, record) => {
    const key = displayDoorNumber(record.doorNumber) || '—'
    counts.set(key, (counts.get(key) ?? 0) + 1)
    return counts
  }, new Map<string, number>())
  return <div className="grid grid-cols-2 gap-2.5 max-[389px]:grid-cols-1 tablet:grid-cols-2 shell:grid-cols-3">{records.map((record) => {
    const doorNumber = displayDoorNumber(record.doorNumber) || '—'
    return <article className={joinClasses(uiClasses.card, 'min-w-0 overflow-hidden rounded-2xl border-primary/15 shadow-[0_8px_20px_color-mix(in_srgb,var(--primary)_10%,transparent)]')} key={record.id}>
      <button className="block min-w-0 w-full p-2.5 text-left transition hover:bg-nav-active focus-visible:bg-nav-active min-[390px]:p-3" onClick={() => onOpen(record)} type="button">
        <div className="flex min-h-8 items-center justify-between gap-1.5 rounded-xl bg-nav-active/75 px-2 py-1.5 text-[9px] font-extrabold text-primary-strong min-[390px]:text-[10px]"><span className="min-w-0 truncate">{t.ward} {record.wardId || '—'} · {t.booth} {record.boothId || '—'}</span><span className="shrink-0 whitespace-nowrap rounded-full bg-primary/10 px-1.5 py-0.5 text-[8px] min-[390px]:text-[9px]">{doorCounts.get(doorNumber)} {t.members}</span></div>
        <h3 className="mt-2 min-h-5 truncate whitespace-nowrap text-[10px] font-extrabold leading-4 text-copy min-[390px]:text-[12px]" title={record.fullName || '—'}>{record.fullName || '—'}</h3>
        <dl className="mt-2 grid grid-cols-2 gap-1.5"><div className={joinClasses(voterUi.mutedBox, 'min-w-0 p-1.5 min-[390px]:p-2')}><dt className="truncate text-[8px] font-semibold text-muted min-[390px]:text-[10px]">{t.voterId}</dt><dd className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[8px] font-extrabold leading-3 tracking-[-0.06em] text-copy min-[390px]:text-[9px]" title={displayOfficialVoterId(record)}>{displayOfficialVoterId(record)}</dd></div><div className={joinClasses(voterUi.mutedBox, 'min-w-0 p-1.5 min-[390px]:p-2')}><dt className="truncate text-[8px] font-semibold text-muted min-[390px]:text-[10px]">{t.door}</dt><dd className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[8px] font-extrabold leading-3 tracking-[-0.04em] text-copy min-[390px]:text-[9px]" title={doorNumber}>{doorNumber}</dd></div></dl>
        <div className={joinClasses(voterUi.mutedBox, 'mt-1.5 min-w-0 p-2')}><span className="block truncate text-[8px] font-semibold text-muted min-[390px]:text-[10px]">{t.area}</span><strong className="mt-0.5 block overflow-hidden text-ellipsis whitespace-nowrap text-[9px] font-extrabold leading-4 text-copy min-[390px]:text-[10px]" title={record.area || record.division || '—'}>{record.area || record.division || '—'}</strong></div>
        <span className="mt-2 flex items-center justify-between text-[13px] font-extrabold text-primary-strong min-[390px]:text-sm"><span>{t.view}</span><span className="grid size-7 place-items-center rounded-full border border-primary/15 bg-surface min-[390px]:size-8"><ArrowRight size={15} /></span></span>
      </button>
    </article>
  })}</div>
}

function DoorWiseRecords({ groups, selectedDoor, onDoorOpen, onDoorClose, onOpen, onEdit, t }: { groups: Array<[string, VoterRecord[]]>; selectedDoor?: string; onDoorOpen: (door: string) => void; onDoorClose: () => void; onOpen: (record: VoterRecord) => void; onEdit?: (record: VoterRecord) => void; t: ScreenText }) {
  const activeGroup = groups.find(([doorNumber]) => doorNumber === selectedDoor)

  return <>
    <div className="grid grid-cols-2 gap-2.5 max-[389px]:grid-cols-1 tablet:grid-cols-2 shell:grid-cols-3">{groups.map(([doorNumber, records]) => <article className={joinClasses(uiClasses.card, 'min-w-0 overflow-hidden rounded-2xl border-primary/15 bg-gradient-to-br from-surface via-surface to-nav-active/35 shadow-[0_6px_18px_color-mix(in_srgb,var(--primary)_8%,transparent)]')} key={doorNumber}>
      <button aria-haspopup="dialog" className="grid min-h-[5.75rem] w-full gap-2 p-3 text-left transition hover:bg-nav-active" onClick={() => onDoorOpen(doorNumber)} type="button">
        <div className="flex min-w-0 items-center justify-between gap-2"><span className="min-w-0 truncate whitespace-nowrap text-[10px] font-semibold text-muted">{t.door}</span><ChevronDown className="shrink-0 text-primary-strong" size={16} /></div>
        <div className="flex min-w-0 items-start gap-1.5"><strong className="min-w-0 flex-1 truncate whitespace-nowrap text-[10px] font-extrabold leading-4 text-copy" title={doorNumber || '—'}>{displayDoorNumber(doorNumber) || '—'}</strong><span className="shrink-0 whitespace-nowrap rounded-full bg-nav-active px-1.5 py-1 text-[8px] font-extrabold text-primary-strong">{records.length} {t.members}</span></div>
      </button>
    </article>)}</div>
    {activeGroup ? <div className="fixed inset-0 z-[70] grid place-items-end bg-slate-950/55 p-2 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={onDoorClose} role="presentation">
      <section aria-modal="true" aria-labelledby="door-members-title" className={joinClasses(uiClasses.dialog, 'max-h-[90svh] w-full max-w-2xl overflow-hidden rounded-[1.5rem] border-primary/15 bg-surface p-0 shadow-[0_20px_60px_rgb(15_23_42/0.28)]')} onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <header className="flex items-start justify-between gap-4 border-b border-primary/10 bg-gradient-to-br from-nav-active via-surface to-surface px-5 py-4">
          <div className="min-w-0"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary-strong">{t.door}</p><h2 className="mt-1 truncate whitespace-nowrap text-xl font-extrabold text-copy" id="door-members-title">{activeGroup[0] || '—'}</h2><span className="mt-1 block text-sm text-muted">{activeGroup[1].length} {t.members}</span>
          </div>
          <button aria-label={t.close} className={uiClasses.iconButton} onClick={onDoorClose} type="button"><X size={19} /></button>
        </header>
        <div className="grid max-h-[68svh] gap-2 overflow-y-auto bg-surface-muted/30 p-4">
          {activeGroup[1].map((record) => <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-surface p-3 shadow-sm transition hover:border-primary/25" key={record.id}>
            <div className="min-w-0"><strong className="block truncate text-sm font-extrabold text-copy">{record.fullName}</strong><span className="mt-1 block truncate text-[11px] text-muted">{t.voterId}: {displayOfficialVoterId(record)} · {t.serial}: {record.serialNumber}</span></div>
            <div className="flex shrink-0 items-center gap-1.5"><button className={joinClasses(uiClasses.button, uiClasses.secondaryButton, 'min-h-9 rounded-xl px-2.5 text-xs')} onClick={() => onOpen(record)} type="button">{t.view}</button>{onEdit ? <button aria-label={`${t.edit} ${record.fullName}`} className={joinClasses(uiClasses.iconButton, 'size-9 rounded-xl')} onClick={() => onEdit(record)} type="button"><Edit3 size={14} /></button> : null}</div>
          </div>)}
        </div>
      </section>
    </div> : null}
  </>
}

function VoterDialog({ canDelete, canEdit, language, onClose, onDelete, onSave, record, startEditing, t }: { canDelete: boolean; canEdit: boolean; language: AppLanguage; onClose: () => void; onDelete: (record: VoterRecord) => Promise<void>; onSave: (record: VoterRecord) => Promise<void>; record: VoterRecord; startEditing: boolean; t: ScreenText }) {
  const [editing, setEditing] = useState(startEditing)
  const [draft, setDraft] = useState(() => ({ ...record, doorNumber: displayDoorNumber(record.doorNumber) }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const [cardImage, setCardImage] = useState<{ url: string; pageNumber?: number; cardPosition?: number }>()
  const [cardImageState, setCardImageState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [cardRetryKey, setCardRetryKey] = useState(0)
  const readOnly = !editing
  const beginEditing = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setEditing(true)
  }
  const update = <Key extends keyof VoterRecord>(key: Key, value: VoterRecord[Key]) => setDraft((current) => ({ ...current, [key]: value }))
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!editing || saving) return
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

  return <div aria-modal="true" className="fixed inset-0 z-[70] grid place-items-end bg-slate-950/55 p-2 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }} role="dialog"><form className={joinClasses(uiClasses.dialog, 'flex max-h-[92svh] w-full max-w-3xl flex-col overflow-hidden rounded-[1.5rem] border-primary/15 bg-surface p-0 shadow-[0_20px_60px_rgb(15_23_42/0.3)]')} onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}><header className="flex items-start justify-between gap-4 border-b border-primary/10 bg-gradient-to-br from-nav-active via-surface to-surface px-5 py-4"><div className="min-w-0"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary-strong">{t.details}</p><h2 className="mt-1 truncate whitespace-nowrap text-xl font-extrabold text-copy sm:text-2xl">{record.fullName}</h2></div><button aria-label={t.close} className={uiClasses.iconButton} onClick={onClose} type="button"><X size={19} /></button></header><div className="grid min-h-0 gap-4 overflow-y-auto bg-surface-muted/20 p-4 sm:gap-5 sm:p-5">
    {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{t.saveError}</p> : null}
    <section className={joinClasses(uiClasses.card, 'min-h-[14rem] overflow-hidden border-primary/15 bg-surface shadow-[0_8px_24px_color-mix(in_srgb,var(--primary)_10%,transparent)]')}><div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/10 bg-nav-active/45 px-4 py-3"><strong className="text-sm font-extrabold text-copy">{t.originalCard}</strong><div className="flex flex-wrap gap-2 text-[11px] text-muted"><span className="rounded-full border border-border bg-surface px-2 py-1"><b className="text-copy">{t.pageNumber}</b> {previewPage ?? '—'}</span><span className="rounded-full border border-border bg-surface px-2 py-1"><b className="text-copy">{t.cardPosition}</b> {previewCardPosition ?? '—'}</span></div></div><div className="flex min-h-[11rem] max-h-[56svh] items-center justify-center overflow-hidden bg-surface-muted/50 p-3">{cardImageState === 'loaded' && cardImage ? <img alt={`${t.originalCard} - ${record.fullName}`} className="block h-auto max-h-[52svh] w-auto max-w-full rounded-lg object-contain shadow-sm" decoding="async" onError={() => { setCardImage(undefined); setCardImageState('error') }} src={cardImage.url} /> : <div className={joinClasses('grid min-h-40 w-full max-w-full place-items-center gap-3 rounded-xl border border-dashed p-4 text-center text-sm text-muted', previewFailed ? 'border-red-200 bg-red-50 text-red-700' : 'border-border bg-surface')}><p>{previewFailed ? (record.voterCardImagePath ? t.cardError : t.cardUnavailable) : t.cardLoading}</p>{previewFailed ? <button className={joinClasses(uiClasses.button, uiClasses.secondaryButton)} onClick={() => { setCardImage(undefined); setCardImageState('loading'); setCardRetryKey((current) => current + 1) }} type="button"><RefreshCcw size={14} />{t.cardRetry}</button> : <LoaderCircle className="animate-spin text-primary" size={22} />}</div>}</div></section>
    <div className="grid gap-3 sm:grid-cols-2">
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
    <dl className="grid gap-3 rounded-xl border border-border bg-surface-muted/45 p-3 text-sm sm:grid-cols-2"><div><dt className="font-semibold text-muted">{t.sourcePdf}</dt><dd className="mt-1 break-words font-bold text-copy">{record.sourcePdfName || record.sourcePdfId || '—'}</dd></div><div><dt className="font-semibold text-muted">{t.pageNumber}</dt><dd className="mt-1 font-bold text-copy">{previewPage ?? '—'}</dd></div><div><dt className="font-semibold text-muted">{t.cardPosition}</dt><dd className="mt-1 font-bold text-copy">{previewCardPosition ?? '—'}</dd></div><div><dt className="font-semibold text-muted">{t.uploaded}</dt><dd className="mt-1 font-bold text-copy">{formatDate(record.uploadedAt, language)} · {record.uploadedBy || '—'}</dd></div></dl>
    <details className="rounded-xl border border-border bg-surface p-3"><summary className="cursor-pointer font-extrabold text-copy">{t.rawOcrText}</summary><pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-muted">{record.rawText || t.missingVoterId}</pre></details>
    {deleteError ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{t.deleteVoterError}</p> : null}
  </div><footer className="flex flex-wrap justify-end gap-3 border-t border-primary/10 bg-surface/95 px-4 py-3 backdrop-blur sm:px-5">{editing ? <><button className={joinClasses(uiClasses.button, uiClasses.secondaryButton)} onClick={() => setEditing(false)} type="button">{t.close}</button><button className={joinClasses(uiClasses.button, uiClasses.primaryButton)} disabled={saving} type="submit">{saving ? <LoaderCircle className="animate-spin" size={15} /> : <Edit3 size={15} />}{saving ? t.saving : t.save}</button></> : <>{canDelete ? <button className={joinClasses(uiClasses.button, uiClasses.dangerButton)} disabled={deleting} onClick={() => void remove()} type="button"><Trash2 size={14} />{deleting ? t.deletingVoter : t.deleteVoter}</button> : null}{canEdit ? <button className={joinClasses(uiClasses.button, uiClasses.primaryButton)} disabled={deleting} formNoValidate onClick={beginEditing} type="button"><Edit3 size={15} />{t.edit}</button> : null}<button className={joinClasses(uiClasses.button, uiClasses.secondaryButton)} disabled={deleting} onClick={onClose} type="button">{t.close}</button></>}</footer></form></div>
}

function FilterInput({ hideLabel = false, label, type = 'search', placeholder, value, onChange }: { hideLabel?: boolean; label: string; type?: 'search' | 'date'; placeholder?: string; value: string; onChange: (value: string) => void }) {
  return <label className={hideLabel ? 'relative block' : voterUi.field}><span className={hideLabel ? 'sr-only' : voterUi.label}>{label}</span><Search aria-hidden="true" className={hideLabel ? 'pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-muted' : 'hidden'} size={21} /><input className={joinClasses(uiClasses.input, hideLabel && 'h-12 rounded-xl border px-12 text-sm font-medium shadow-inner placeholder:text-muted sm:h-14 sm:text-base')} onFocus={(event) => { if (hideLabel) window.setTimeout(() => event.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }), 180) }} placeholder={placeholder} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>
}

function NativeFilterSelect({ icon, label, value, options, anyLabel, onChange }: { icon?: ReactNode; label: string; value: string; options: string[]; anyLabel: string; onChange: (value: string) => void }) {
  return <label className={voterUi.field}><span className="truncate text-xs font-extrabold text-copy sm:text-sm">{label}</span><div className="relative min-w-0">{icon ? <span aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 z-10 -translate-y-1/2 text-muted">{icon}</span> : null}<select className={joinClasses(voterUi.select, icon ? undefined : 'px-2')} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{anyLabel}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted" size={14} /></div></label>
}

function EditorField({ disabled, label, placeholder, value, onChange }: { disabled: boolean; label: string; placeholder?: string; value: string; onChange: (value: string) => void }) {
  return <label className={voterUi.field}><span className={voterUi.label}>{label}</span><input className={joinClasses(uiClasses.input, 'bg-surface-muted/40')} disabled={disabled} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></label>
}

function groupByDoor(records: VoterRecord[]) {
  const groups = records.reduce((result, record) => {
    // Use the corrected, stored house number. A verification candidate is
    // intentionally not used for grouping until it is confirmed.
    const key = displayDoorNumber(record.doorNumber).trim() || '—'
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
