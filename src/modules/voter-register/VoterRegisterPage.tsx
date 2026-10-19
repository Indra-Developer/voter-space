import { Download, Edit3, FileSpreadsheet, FileText, LoaderCircle, RefreshCcw, Search, Table2, Trash2, UsersRound, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { AppSession } from '../auth/types'
import { readableFirebaseError } from '../auth/firebase-auth'
import type { AppLanguage } from '../app-shell/types'
import { PageState } from '../app-shell/PageState'
import { downloadCsv, downloadExcel, downloadPdf } from './export-voters'
import { deleteVotersByWard, loadVoterCardImage, loadVoterFilterOptions, loadVoters, saveVoter } from './voter-service'
import { emptyVoterFilters, type VoterFilterOptions, type VoterFilters, type VoterRecord } from './types'
import { matchesVoterSearch } from './voter-search'

type ViewMode = 'individual' | 'door'

const screenCopy = {
  en: {
    label: 'Voter data', title: 'Voter Register', description: 'Find voters, check records, and export only the records you are allowed to access.',
    search: 'Search all voter fields', searchPlaceholder: 'Name, voter ID, door number, serial, ward, booth, area, division, PDF…', searchHint: 'You can search using Telugu, English spelling, voter ID, door number, serial number, ward, booth, area, division, mobile number, or PDF name.', refresh: 'Refresh', records: 'records', individual: 'Individual records', doorWise: 'Door-wise view',
    filters: 'Filters', clear: 'Clear all', moreFilters: 'All filters', name: 'Name', door: 'Door number', voterId: 'Voter ID', alternateId: 'Alternate ID', mobile: 'Mobile number', serial: 'Serial number', ward: 'Ward', booth: 'Booth', area: 'Area', division: 'Division', source: 'Source PDF', uploadedFrom: 'Uploaded from', uploadedTo: 'Uploaded to', uploadedBy: 'Uploaded by', deleteWardOpen: 'Delete ward', deleteWardTitle: 'Delete complete ward data', deleteWardHint: 'This permanently removes the ward voters, voter card images, source PDFs, and import rows from Firestore and Storage.', selectWard: 'Select ward', typeWard: 'Type the ward number to confirm', deleteWard: 'Delete ward data', deletingWard: 'Deleting ward data…', deleteWardSuccess: 'Ward data deleted successfully.', deleteWardError: 'Ward data could not be deleted.', cancel: 'Cancel',
    any: 'All',
    exportExcel: 'Excel', exportPdf: 'PDF', exportCsv: 'CSV', exportHint: 'Exports include the filtered records only.',
    noRecords: 'No voter records match these filters.', noData: 'No voter records have been imported yet.',
    loading: 'Loading voter records…', error: 'Voter records could not be loaded.', retry: 'Try again', limit: 'Only the first 5,000 imported records can be shown. Narrow the data by ward or booth after the importer is expanded.',
    view: 'View', edit: 'Edit', close: 'Close', save: 'Save changes', saving: 'Saving…', details: 'Voter details', sourcePdf: 'Source PDF', uploaded: 'Uploaded', saveError: 'The record could not be saved. Please try again.', editAccess: 'You can edit records in your allowed scope.', readOnly: 'You have view-only access to these records.', originalCard: 'Original voter card', cardLoading: 'Loading the original card…', cardUnavailable: 'This older voter record has no saved card image. Open PDF Upload and choose Process again for its PDF.', relativeName: 'Relative name', relationship: 'Relationship', age: 'Age', gender: 'Gender', assemblySerial: 'Assembly serial', pdfPosition: 'PDF position',
  },
  te: {
    label: 'ఓటర్ డేటా', title: 'ఓటర్ రిజిస్టర్', description: 'ఓటర్లను వెతకండి, రికార్డులను చూడండి, మీకు అనుమతి ఉన్న డేటాను మాత్రమే ఎగుమతి చేయండి.',
    search: 'అన్ని ఓటర్ వివరాల్లో వెతకండి', searchPlaceholder: 'పేరు, ఓటర్ ఐడి, ఇంటి నంబర్, సీరియల్, వార్డు, బూత్, ప్రాంతం, డివిజన్, PDF…', searchHint: 'తెలుగు, ఇంగ్లీష్ స్పెల్లింగ్, ఓటర్ ఐడి, ఇంటి నంబర్, సీరియల్, వార్డు, బూత్, ప్రాంతం, డివిజన్, మొబైల్ లేదా PDF పేరుతో వెతకండి.', refresh: 'రిఫ్రెష్', records: 'రికార్డులు', individual: 'ఒక్కో రికార్డు', doorWise: 'ఇంటి నంబర్ వారీగా',
    filters: 'ఫిల్టర్లు', clear: 'అన్నీ తొలగించండి', moreFilters: 'అన్ని ఫిల్టర్లు', name: 'పేరు', door: 'ఇంటి నంబర్', voterId: 'ఓటర్ ఐడి', alternateId: 'ప్రత్యామ్నాయ ఐడి', mobile: 'మొబైల్ నంబర్', serial: 'సీరియల్ నంబర్', ward: 'వార్డు', booth: 'బూత్', area: 'ప్రాంతం', division: 'డివిజన్', source: 'సోర్స్ PDF', uploadedFrom: 'అప్‌లోడ్ మొదలు', uploadedTo: 'అప్‌లోడ్ చివరి తేదీ', uploadedBy: 'అప్‌లోడ్ చేసినవారు', deleteWardOpen: 'వార్డు తొలగింపు', deleteWardTitle: 'వార్డు మొత్తం డేటాను తొలగించండి', deleteWardHint: 'ఈ చర్య వార్డు ఓటర్లు, ఓటర్ కార్డు చిత్రాలు, సోర్స్ PDFలు మరియు Firestore, Storageలోని దిగుమతి వరుసలను శాశ్వతంగా తొలగిస్తుంది.', selectWard: 'వార్డును ఎంచుకోండి', typeWard: 'నిర్ధారించడానికి వార్డు నంబర్ టైప్ చేయండి', deleteWard: 'వార్డు డేటా తొలగించండి', deletingWard: 'వార్డు డేటా తొలగిస్తోంది…', deleteWardSuccess: 'వార్డు డేటా విజయవంతంగా తొలగించబడింది.', deleteWardError: 'వార్డు డేటా తొలగించలేకపోయాము.', cancel: 'రద్దు',
    any: 'అన్నీ',
    exportExcel: 'ఎక్సెల్', exportPdf: 'PDF', exportCsv: 'CSV', exportHint: 'ఎంచుకున్న ఫిల్టర్లలో ఉన్న రికార్డులు మాత్రమే ఎగుమతి అవుతాయి.',
    noRecords: 'ఈ ఫిల్టర్లకు సరిపోయే ఓటర్ రికార్డులు లేవు.', noData: 'ఇంకా ఓటర్ రికార్డులు దిగుమతి కాలేదు.',
    loading: 'ఓటర్ రికార్డులు లోడ్ అవుతున్నాయి…', error: 'ఓటర్ రికార్డులు లోడ్ చేయలేకపోయాము.', retry: 'మళ్లీ ప్రయత్నించండి', limit: 'మొదటి 5,000 దిగుమతి చేసిన రికార్డులు మాత్రమే చూపించవచ్చు. దిగుమతి వ్యవస్థ విస్తరించే వరకు వార్డు లేదా బూత్‌తో డేటాను తగ్గించండి.',
    view: 'చూడండి', edit: 'సవరించండి', close: 'మూసివేయండి', save: 'మార్పులు సేవ్ చేయండి', saving: 'సేవ్ అవుతోంది…', details: 'ఓటర్ వివరాలు', sourcePdf: 'సోర్స్ PDF', uploaded: 'అప్‌లోడ్', saveError: 'రికార్డు సేవ్ కాలేదు. మళ్లీ ప్రయత్నించండి.', editAccess: 'మీకు అనుమతి ఉన్న పరిధిలో రికార్డులను సవరించవచ్చు.', readOnly: 'ఈ రికార్డులను చూడటానికి మాత్రమే మీకు అనుమతి ఉంది.', originalCard: 'అసలు ఓటర్ కార్డు', cardLoading: 'అసలు కార్డు లోడ్ అవుతోంది…', cardUnavailable: 'ఈ పాత ఓటర్ రికార్డుకు కార్డు చిత్రం లేదు. PDF Uploadలో ఆ PDFకి మళ్లీ ప్రాసెస్ చేయండి నొక్కండి.', relativeName: 'బంధువు పేరు', relationship: 'సంబంధం', age: 'వయస్సు', gender: 'లింగము', assemblySerial: 'అసెంబ్లీ సీరియల్', pdfPosition: 'PDF స్థానం',
  },
} as const

type ScreenText = { [Key in keyof typeof screenCopy.en]: string }

export function VoterRegisterPage({ language, session }: { language: AppLanguage; session: AppSession }) {
  const [records, setRecords] = useState<VoterRecord[]>()
  const [options, setOptions] = useState<VoterFilterOptions>({ wards: [], booths: [], areas: [], divisions: [], sourcePdfs: [], uploaders: [] })
  const [filters, setFilters] = useState<VoterFilters>(emptyVoterFilters)
  const [loadError, setLoadError] = useState<string>()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [view, setView] = useState<ViewMode>('individual')
  const [activeRecord, setActiveRecord] = useState<VoterRecord | null>(null)
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

  const reload = async () => {
    setIsRefreshing(true)
    setLoadError(undefined)
    try {
      const [result, databaseOptions] = await Promise.all([loadVoters(), loadVoterFilterOptions()])
      setRecords(result.records)
      setOptions(databaseOptions)
      setTruncated(result.truncated)
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

  const filteredRecords = useMemo(() => (records ?? []).filter((record) => matchesFilters(record, filters)), [records, filters])
  const doorGroups = useMemo(() => groupByDoor(filteredRecords), [filteredRecords])

  const updateFilter = <Key extends keyof VoterFilters>(key: Key, value: VoterFilters[Key]) => setFilters((current) => ({ ...current, [key]: value }))
  const openRecord = (record: VoterRecord, shouldEdit = false) => { setActiveRecord(record); setEditing(shouldEdit && canEdit) }
  const save = async (record: VoterRecord) => {
    await saveVoter(record)
    await reload()
    setActiveRecord(null)
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
    <header className="page-intro voter-register-intro"><div><p>{t.label}</p><h2>{t.title}</h2><span>{t.description}</span></div><div className="voter-register-header-actions">{canDeleteWard ? <button aria-label={t.deleteWardOpen} className="voter-delete-ward-trigger" onClick={() => { setShowDeleteWard(true); setDeleteMessage(undefined); setDeleteError(undefined) }} type="button"><Trash2 size={14} />{t.deleteWardOpen}</button> : null}<button className="voter-secondary-button" onClick={() => void reload()} type="button"><RefreshCcw className={isRefreshing ? 'animate-spin' : undefined} size={15} />{t.refresh}</button></div></header>

    <section className="voter-filter-card" aria-label={t.filters}>
      <div className="voter-filter-title"><div><Search size={18} /><strong>{t.search}</strong></div><button className="voter-text-button" onClick={() => setFilters(emptyVoterFilters)} type="button">{t.clear}</button></div>
      <div className="voter-global-search"><FilterInput label={t.search} placeholder={t.searchPlaceholder} value={filters.search} onChange={(value) => updateFilter('search', value)} /><p>{t.searchHint}</p></div>
      <details className="voter-more-filters">
        <summary>{t.moreFilters}</summary>
        <div className="voter-filter-grid voter-filter-grid-extra">
          <FilterSelect label={t.ward} value={filters.wardId} options={options.wards} anyLabel={t.any} onChange={(value) => updateFilter('wardId', value)} />
          <FilterSelect label={t.booth} value={filters.boothId} options={options.booths} anyLabel={t.any} onChange={(value) => updateFilter('boothId', value)} />
          <FilterSelect label={t.area} value={filters.area} options={options.areas} anyLabel={t.any} onChange={(value) => updateFilter('area', value)} />
          <FilterSelect label={t.division} value={filters.division} options={options.divisions} anyLabel={t.any} onChange={(value) => updateFilter('division', value)} />
          <FilterSelect label={t.source} value={filters.sourcePdf} options={options.sourcePdfs} anyLabel={t.any} onChange={(value) => updateFilter('sourcePdf', value)} />
          <FilterSelect label={t.uploadedBy} value={filters.uploadedBy} options={options.uploaders} anyLabel={t.any} onChange={(value) => updateFilter('uploadedBy', value)} />
          <FilterInput label={t.uploadedFrom} type="date" value={filters.uploadedFrom} onChange={(value) => updateFilter('uploadedFrom', value)} />
          <FilterInput label={t.uploadedTo} type="date" value={filters.uploadedTo} onChange={(value) => updateFilter('uploadedTo', value)} />
        </div>
      </details>
    </section>

    {canDeleteWard && showDeleteWard ? <div className="voter-delete-ward-overlay" onMouseDown={() => { if (!deleteWorking) setShowDeleteWard(false) }} role="presentation"><section aria-modal="true" className="voter-delete-ward-card voter-delete-ward-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog"><div className="voter-delete-ward-dialog-heading"><div><strong>{t.deleteWardTitle}</strong><p>{t.deleteWardHint}</p></div><button aria-label={t.cancel} className="voter-dialog-close" disabled={deleteWorking} onClick={() => setShowDeleteWard(false)} type="button"><X size={17} /></button></div><div className="voter-delete-ward-controls"><FilterSelect label={t.selectWard} value={deleteWardId} options={options.wards} anyLabel={t.any} onChange={(value) => { setDeleteWardId(value); setDeleteConfirmation(''); setDeleteMessage(undefined); setDeleteError(undefined) }} /><label className="voter-field"><span>{t.typeWard}</span><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder={deleteWardId || '—'} /></label></div>{deleteMessage ? <p className="voter-delete-success">{deleteMessage}</p> : null}{deleteError ? <p className="voter-delete-error">{deleteError}</p> : null}<footer className="voter-delete-ward-dialog-footer"><button className="voter-secondary-button" disabled={deleteWorking} onClick={() => setShowDeleteWard(false)} type="button">{t.cancel}</button><button className="voter-danger-button" disabled={!deleteWardId || deleteConfirmation.trim() !== deleteWardId || deleteWorking} onClick={() => void deleteWard()} type="button"><Trash2 size={15} />{deleteWorking ? t.deletingWard : t.deleteWard}</button></footer></section></div> : null}

    {records === undefined && !loadError ? <PageState kind="loading" title={t.loading} description="" /> : null}
    {loadError ? <PageState kind="error" title={t.error} description={loadError} actionLabel={t.retry} onAction={() => void reload()} /> : null}
    {records !== undefined && !loadError ? <>
      {truncated ? <p className="form-alert form-alert-error">{t.limit}</p> : null}
      <section className="voter-results-toolbar">
        <div><strong>{filteredRecords.length} {t.records}</strong><span>{canEdit ? t.editAccess : t.readOnly}</span></div>
        <div className="voter-toolbar-actions">
          <div className="voter-view-toggle" aria-label="Record view"><button className={view === 'individual' ? 'is-active' : ''} onClick={() => setView('individual')} type="button"><Table2 size={15} />{t.individual}</button><button className={view === 'door' ? 'is-active' : ''} onClick={() => setView('door')} type="button"><UsersRound size={15} />{t.doorWise}</button></div>
          {canDownload ? <div className="voter-export-buttons"><button onClick={() => void downloadExcel(filteredRecords)} type="button"><FileSpreadsheet size={15} />{t.exportExcel}</button><button onClick={() => void downloadPdf(filteredRecords)} type="button"><FileText size={15} />{t.exportPdf}</button><button onClick={() => downloadCsv(filteredRecords)} type="button"><Download size={15} />{t.exportCsv}</button></div> : null}
        </div>
      </section>
      {canDownload ? <p className="voter-export-hint">{t.exportHint}</p> : null}
      {records.length === 0 ? <PageState kind="empty" title={t.noData} description="" /> : filteredRecords.length === 0 ? <PageState kind="empty" title={t.noRecords} description="" /> : view === 'individual' ? <IndividualRecords records={filteredRecords} onOpen={openRecord} onEdit={canEdit ? (record) => openRecord(record, true) : undefined} t={t} /> : <DoorWiseRecords groups={doorGroups} onOpen={openRecord} onEdit={canEdit ? (record) => openRecord(record, true) : undefined} t={t} />}
    </> : null}
    {activeRecord ? <VoterDialog key={activeRecord.id} canEdit={canEdit} language={language} onClose={() => setActiveRecord(null)} onSave={save} record={activeRecord} startEditing={editing} t={t} /> : null}
  </section>
}

function IndividualRecords({ records, onOpen, onEdit, t }: { records: VoterRecord[]; onOpen: (record: VoterRecord) => void; onEdit?: (record: VoterRecord) => void; t: ScreenText }) {
  return <>
    <div className="voter-table-card voter-desktop-records"><table className="voter-table"><thead><tr><th>{t.name}</th><th>{t.door}</th><th>{t.voterId}</th><th>{t.mobile}</th><th>{t.serial}</th><th>{t.ward}</th><th>{t.booth}</th><th>{t.area}</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><button className="voter-profile-link" onClick={() => onOpen(record)} type="button"><strong>{record.fullName}</strong><span>{record.division}</span></button></td><td>{record.doorNumber}</td><td>{record.voterId || record.alternateIdentifier || '—'}</td><td>{record.mobile || '—'}</td><td>{record.serialNumber}</td><td>{record.wardId}</td><td>{record.boothId}</td><td>{record.area || '—'}</td><td className="voter-row-actions"><button className="voter-row-button" onClick={() => onOpen(record)} type="button">{t.view}</button>{onEdit ? <button className="voter-row-button voter-row-button-primary" onClick={() => onEdit(record)} type="button"><Edit3 size={13} />{t.edit}</button> : null}</td></tr>)}</tbody></table></div>
    <div className="voter-card-grid voter-mobile-records">{records.map((record) => <article className="voter-profile-card" key={record.id}><button className="voter-profile-card-main" onClick={() => onOpen(record)} type="button"><div className="voter-profile-card-top"><span>{t.serial}: {record.serialNumber || '—'}</span><span>{t.ward} {record.wardId} · {t.booth} {record.boothId}</span></div><h3>{record.fullName || '—'}</h3><p>{record.voterId || record.alternateIdentifier || '—'}</p><dl><div><dt>{t.door}</dt><dd>{record.doorNumber || '—'}</dd></div><div><dt>{t.mobile}</dt><dd>{record.mobile || '—'}</dd></div><div><dt>{t.area}</dt><dd>{record.area || record.division || '—'}</dd></div></dl><span className="voter-profile-card-open">{t.view}</span></button>{onEdit ? <button className="voter-profile-card-edit" onClick={() => onEdit(record)} type="button"><Edit3 size={14} />{t.edit}</button> : null}</article>)}</div>
  </>
}

function DoorWiseRecords({ groups, onOpen, onEdit, t }: { groups: Array<[string, VoterRecord[]]>; onOpen: (record: VoterRecord) => void; onEdit?: (record: VoterRecord) => void; t: ScreenText }) {
  return <div className="door-wise-grid">{groups.map(([doorNumber, records]) => <article className="door-wise-card" key={doorNumber}><header><div><span>{t.door}</span><h3>{doorNumber || '—'}</h3></div><strong>{records.length} {t.records}</strong></header><div className="door-voter-list">{records.map((record) => <div className="door-voter-row" key={record.id}><div><strong>{record.fullName}</strong><span>{t.voterId}: {record.voterId} · {t.serial}: {record.serialNumber}</span></div><div><button className="voter-row-button" onClick={() => onOpen(record)} type="button">{t.view}</button>{onEdit ? <button aria-label={`${t.edit} ${record.fullName}`} className="voter-icon-action" onClick={() => onEdit(record)} type="button"><Edit3 size={14} /></button> : null}</div></div>)}</div></article>)}</div>
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
