import { Camera, Download, LoaderCircle, Mail, MapPinned, Phone, ShieldCheck, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { joinClasses, uiClasses } from '../app-shell/ui'
import type { AppLanguage } from '../app-shell/types'
import type { AppSession } from './types'
import './auth.css'
import { readableFirebaseError, updateOwnProfileMedia, uploadAccountImage } from './firebase-auth'
import { deleteVotersByWard as deleteWardData, loadVoterFilterOptions } from '../voter-register/voter-service'

type ProfilePageProps = {
  language: AppLanguage
  session: AppSession
}

const profileCopy = {
    te: {
    label: 'నా ఖాతా', title: 'ప్రొఫైల్ & యాక్సెస్', email: 'ఇమెయిల్', mobile: 'మొబైల్ నంబర్', access: 'డేటా యాక్సెస్', wards: 'వార్డులు', booths: 'బూత్‌లు', permissions: 'అనుమతులు', upload: 'అప్‌లోడ్', edit: 'సవరింపు', download: 'డౌన్‌లోడ్', enabled: 'అనుమతి ఉంది', noAccess: 'కేటాయించిన యాక్సెస్ లేదు', mediaTitle: 'ప్రొఫైల్ చిత్రాలు', mediaHint: 'మీ ప్రొఫైల్ ఫోటో మరియు బ్యానర్‌ను మార్చండి.', profilePhoto: 'ప్రొఫైల్ ఫోటో', banner: 'బ్యానర్', chooseImage: 'చిత్రాన్ని ఎంచుకోండి', currentImage: 'ప్రస్తుత చిత్రం', saveMedia: 'చిత్రాలను సేవ్ చేయండి', savingMedia: 'సేవ్ అవుతోంది…', mediaSaved: 'ప్రొఫైల్ చిత్రాలు సేవ్ అయ్యాయి.', mediaError: 'చిత్రాలను సేవ్ చేయలేకపోయాము.', dangerZone: 'ప్రమాదకర చర్యలు', deleteWardOpen: 'వార్డు డేటా తొలగింపు', deleteWardTitle: 'వార్డు మొత్తం డేటాను తొలగించండి', deleteWardHint: 'ఈ చర్య ఆ వార్డులోని ఓటర్లు, ఓటర్ కార్డు చిత్రాలు, సోర్స్ PDFలు మరియు దిగుమతి డేటాను శాశ్వతంగా తొలగిస్తుంది.', selectWard: 'వార్డును ఎంచుకోండి', typeWard: 'నిర్ధారించడానికి వార్డు నంబర్ టైప్ చేయండి', deleteWard: 'వార్డు డేటా తొలగించండి', deletingWard: 'వార్డు డేటా తొలగిస్తోంది…', deleteWardSuccess: 'వార్డు డేటా విజయవంతంగా తొలగించబడింది.', deleteWardError: 'వార్డు డేటా తొలగించలేకపోయాము.', cancel: 'రద్దు చేయండి', roles: { superAdmin: 'సూపర్ అడ్మిన్', admin: 'అడ్మిన్', subMember: 'సబ్-మెంబర్' },
  },
  en: {
    label: 'My account', title: 'Profile & access', email: 'Email', mobile: 'Mobile number', access: 'Data access', wards: 'Wards', booths: 'Booths', permissions: 'Permissions', upload: 'Upload', edit: 'Edit', download: 'Download', enabled: 'Allowed', noAccess: 'No assigned access', mediaTitle: 'Profile images', mediaHint: 'Change your profile photo and banner.', profilePhoto: 'Profile photo', banner: 'Banner', chooseImage: 'Choose an image', currentImage: 'Current image', saveMedia: 'Save images', savingMedia: 'Saving…', mediaSaved: 'Profile images saved.', mediaError: 'The images could not be saved.', dangerZone: 'Danger zone', deleteWardOpen: 'Delete ward data', deleteWardTitle: 'Delete complete ward data', deleteWardHint: 'This permanently removes voters, voter card images, source PDFs, and import data for the selected ward.', selectWard: 'Select ward', typeWard: 'Type the ward number to confirm', deleteWard: 'Delete ward data', deletingWard: 'Deleting ward data…', deleteWardSuccess: 'Ward data deleted successfully.', deleteWardError: 'Ward data could not be deleted.', cancel: 'Cancel', roles: { superAdmin: 'Super Admin', admin: 'Admin', subMember: 'Sub-member' },
  },
} as const

export function ProfilePage({ language, session }: ProfilePageProps) {
  const t = profileCopy[language]
  const profile = session.profile
  const scope = profile.role === 'superAdmin' ? null : profile.scope
  const [profileFile, setProfileFile] = useState<File>()
  const [bannerFile, setBannerFile] = useState<File>()
  const [mediaSaving, setMediaSaving] = useState(false)
  const [mediaMessage, setMediaMessage] = useState<string>()
  const [mediaError, setMediaError] = useState<string>()
  const [wardOptions, setWardOptions] = useState<string[]>([])
  const [deleteWardId, setDeleteWardId] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [showDeleteWard, setShowDeleteWard] = useState(false)
  const [deleteWorking, setDeleteWorking] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState<string>()
  const [deleteError, setDeleteError] = useState<string>()

  useEffect(() => {
    if (profile.role !== 'superAdmin') return
    let active = true
    void loadVoterFilterOptions().then((options) => {
      if (active) setWardOptions(options.wards)
    }).catch(() => undefined)
    return () => { active = false }
  }, [profile.role])

  const saveMedia = async () => {
    if (profile.role !== 'superAdmin' || (!profileFile && !bannerFile)) return
    setMediaSaving(true)
    setMediaMessage(undefined)
    setMediaError(undefined)
    try {
      const [profilePhotoPath, bannerPath] = await Promise.all([
        profileFile ? uploadAccountImage(profileFile, 'profile') : Promise.resolve(undefined),
        bannerFile ? uploadAccountImage(bannerFile, 'banner') : Promise.resolve(undefined),
      ])
      await updateOwnProfileMedia({ profilePhotoPath, bannerPath })
      setProfileFile(undefined)
      setBannerFile(undefined)
      setMediaMessage(t.mediaSaved)
    } catch (reason) {
      setMediaError(`${t.mediaError} ${readableFirebaseError(reason)}`)
    } finally {
      setMediaSaving(false)
    }
  }

  const deleteWard = async () => {
    if (!deleteWardId || deleteConfirmation.trim() !== deleteWardId) return
    setDeleteWorking(true)
    setDeleteMessage(undefined)
    setDeleteError(undefined)
    try {
      await deleteWardData(deleteWardId)
      setDeleteMessage(t.deleteWardSuccess)
      setDeleteWardId('')
      setDeleteConfirmation('')
      setWardOptions((current) => current.filter((ward) => ward !== deleteWardId))
    } catch (reason) {
      setDeleteError(`${t.deleteWardError} ${readableFirebaseError(reason)}`)
    } finally {
      setDeleteWorking(false)
    }
  }

  return (
    <section className="profile-page space-y-4 font-sans text-copy">
      <header className="page-intro"><p>{t.label}</p><h2>{t.title}</h2></header>
      <article className={joinClasses('profile-page-card', uiClasses.card)}>
        <div className="profile-page-banner">
          {session.bannerUrl ? <img alt={`${profile.fullName} ${t.banner}`} src={session.bannerUrl} /> : null}
          <span className="profile-page-banner-mark">Voter Space</span>
        </div>
        <div className="profile-page-main">
          <div className="profile-page-photo-frame">
            {session.profilePhotoUrl ? <img alt={profile.fullName} className="profile-page-photo" src={session.profilePhotoUrl} /> : <span className="profile-page-photo profile-page-photo-placeholder">{profile.fullName.slice(0, 1).toUpperCase()}</span>}
          </div>
          <div className="profile-page-name"><small>{t.label}</small><h3>{profile.fullName}</h3><span>{t.roles[profile.role]}</span></div>
        </div>
        <div className="profile-contact-grid">
          <span><Mail size={17} /><small>{t.email}</small><strong>{profile.email}</strong></span>
          <span><Phone size={17} /><small>{t.mobile}</small><strong>{profile.mobile}</strong></span>
        </div>
      </article>

      {profile.role === 'superAdmin' ? <section className={joinClasses('profile-media-editor', uiClasses.card, 'grid gap-4 p-4')}>
        <header><div><p>{t.mediaTitle}</p><h3>{t.mediaHint}</h3></div><Camera size={20} /></header>
        <div className="profile-media-input-grid">
          <label className="profile-media-input"><span>{t.profilePhoto}</span><small>{profileFile?.name ?? (session.profilePhotoUrl ? t.currentImage : t.chooseImage)}</small><input accept="image/png,image/jpeg,image/webp" onChange={(event) => setProfileFile(event.target.files?.[0])} type="file" /></label>
          <label className="profile-media-input"><span>{t.banner}</span><small>{bannerFile?.name ?? (session.bannerUrl ? t.currentImage : t.chooseImage)}</small><input accept="image/png,image/jpeg,image/webp" onChange={(event) => setBannerFile(event.target.files?.[0])} type="file" /></label>
        </div>
        {mediaMessage ? <p className="profile-media-message">{mediaMessage}</p> : null}
        {mediaError ? <p className="form-alert form-alert-error">{mediaError}</p> : null}
        <button className={joinClasses('primary-button', uiClasses.button, uiClasses.primaryButton, 'w-fit')} disabled={mediaSaving || (!profileFile && !bannerFile)} onClick={() => void saveMedia()} type="button">{mediaSaving ? <LoaderCircle className="animate-spin" size={15} /> : <Upload size={15} />}{mediaSaving ? t.savingMedia : t.saveMedia}</button>
      </section> : null}

      {profile.role === 'superAdmin' ? <section className={joinClasses('profile-danger-zone', uiClasses.card, 'grid gap-3 border-red-200/70 bg-red-50/40 p-4')}>
        <header className="flex items-start justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-red-700">{t.dangerZone}</p><h3 className="mt-1 text-base font-extrabold text-copy">{t.deleteWardOpen}</h3><span className="mt-1 block text-sm leading-5 text-muted">{t.deleteWardHint}</span></div><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-red-100 text-red-700"><Trash2 size={19} /></span></header>
        <button className={joinClasses(uiClasses.button, uiClasses.dangerButton, 'w-fit')} onClick={() => { setShowDeleteWard(true); setDeleteMessage(undefined); setDeleteError(undefined) }} type="button"><Trash2 size={15} />{t.deleteWardOpen}</button>
      </section> : null}

      {profile.role === 'superAdmin' && showDeleteWard ? <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={() => { if (!deleteWorking) setShowDeleteWard(false) }} role="presentation"><section aria-modal="true" className={joinClasses(uiClasses.dialog, 'grid w-full max-w-xl gap-5 p-5 sm:p-6')} onMouseDown={(event) => event.stopPropagation()} role="dialog"><div className="flex items-start justify-between gap-4"><div><strong className="text-xl text-copy">{t.deleteWardTitle}</strong><p className="mt-1 text-sm leading-6 text-muted">{t.deleteWardHint}</p></div><button aria-label={t.cancel} className={uiClasses.iconButton} disabled={deleteWorking} onClick={() => setShowDeleteWard(false)} type="button"><X size={17} /></button></div><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5"><span className="text-[13px] font-extrabold text-copy">{t.selectWard}</span><select className={uiClasses.select} value={deleteWardId} onChange={(event) => { setDeleteWardId(event.target.value); setDeleteConfirmation(''); setDeleteMessage(undefined); setDeleteError(undefined) }}><option value="">—</option>{wardOptions.map((ward) => <option key={ward} value={ward}>{ward}</option>)}</select></label><label className="grid gap-1.5"><span className="text-[13px] font-extrabold text-copy">{t.typeWard}</span><input className={uiClasses.input} value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder={deleteWardId || '—'} /></label></div>{deleteMessage ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{deleteMessage}</p> : null}{deleteError ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{deleteError}</p> : null}<footer className="flex flex-wrap justify-end gap-3"><button className={joinClasses(uiClasses.button, uiClasses.secondaryButton)} disabled={deleteWorking} onClick={() => setShowDeleteWard(false)} type="button">{t.cancel}</button><button className={joinClasses(uiClasses.button, uiClasses.dangerButton)} disabled={!deleteWardId || deleteConfirmation.trim() !== deleteWardId || deleteWorking} onClick={() => void deleteWard()} type="button"><Trash2 size={15} />{deleteWorking ? t.deletingWard : t.deleteWard}</button></footer></section></div> : null}

      <section className="profile-detail-grid">
        <article className={joinClasses(uiClasses.card, 'p-4')}><h3><MapPinned size={18} />{t.access}</h3>{scope ? <div className="access-lines"><span><small>{t.wards}</small><strong>{scope.wardIds.join(', ') || t.noAccess}</strong></span><span><small>{t.booths}</small><strong>{scope.boothIds.join(', ') || t.noAccess}</strong></span></div> : <p>{t.enabled}</p>}</article>
        <article className={joinClasses(uiClasses.card, 'p-4')}><h3><ShieldCheck size={18} />{t.permissions}</h3><div className="permission-list"><Permission icon={Upload} label={t.upload} visible={profile.permissions.upload || profile.role === 'superAdmin'} /><Permission icon={ShieldCheck} label={t.edit} visible={profile.permissions.edit || profile.role === 'superAdmin'} /><Permission icon={Download} label={t.download} visible={profile.permissions.download || profile.role === 'superAdmin'} /></div></article>
      </section>
    </section>
  )
}

function Permission({ icon: Icon, label, visible }: { icon: typeof Upload; label: string; visible: boolean }) {
  return <span className={visible ? 'is-enabled' : ''}><Icon size={16} />{label}</span>
}
