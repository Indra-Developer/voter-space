import { Camera, Download, LoaderCircle, Mail, MapPinned, Phone, ShieldCheck, Upload } from 'lucide-react'
import { useState } from 'react'
import { joinClasses, uiClasses } from '../app-shell/ui'
import type { AppLanguage } from '../app-shell/types'
import type { AppSession } from './types'
import './auth.css'
import { readableFirebaseError, updateOwnProfileMedia, uploadAccountImage } from './firebase-auth'

type ProfilePageProps = {
  language: AppLanguage
  session: AppSession
}

const profileCopy = {
  te: {
    label: 'నా ఖాతా', title: 'ప్రొఫైల్ & యాక్సెస్', email: 'ఇమెయిల్', mobile: 'మొబైల్ నంబర్', access: 'డేటా యాక్సెస్', wards: 'వార్డులు', booths: 'బూత్‌లు', permissions: 'అనుమతులు', upload: 'అప్‌లోడ్', edit: 'సవరింపు', download: 'డౌన్‌లోడ్', enabled: 'అనుమతి ఉంది', noAccess: 'కేటాయించిన యాక్సెస్ లేదు', mediaTitle: 'ప్రొఫైల్ చిత్రాలు', mediaHint: 'మీ ప్రొఫైల్ ఫోటో మరియు బ్యానర్‌ను మార్చండి.', profilePhoto: 'ప్రొఫైల్ ఫోటో', banner: 'బ్యానర్', chooseImage: 'చిత్రాన్ని ఎంచుకోండి', currentImage: 'ప్రస్తుత చిత్రం', saveMedia: 'చిత్రాలను సేవ్ చేయండి', savingMedia: 'సేవ్ అవుతోంది…', mediaSaved: 'ప్రొఫైల్ చిత్రాలు సేవ్ అయ్యాయి.', mediaError: 'చిత్రాలను సేవ్ చేయలేకపోయాము.', roles: { superAdmin: 'సూపర్ అడ్మిన్', admin: 'అడ్మిన్', subMember: 'సబ్-మెంబర్' },
  },
  en: {
    label: 'My account', title: 'Profile & access', email: 'Email', mobile: 'Mobile number', access: 'Data access', wards: 'Wards', booths: 'Booths', permissions: 'Permissions', upload: 'Upload', edit: 'Edit', download: 'Download', enabled: 'Allowed', noAccess: 'No assigned access', mediaTitle: 'Profile images', mediaHint: 'Change your profile photo and banner.', profilePhoto: 'Profile photo', banner: 'Banner', chooseImage: 'Choose an image', currentImage: 'Current image', saveMedia: 'Save images', savingMedia: 'Saving…', mediaSaved: 'Profile images saved.', mediaError: 'The images could not be saved.', roles: { superAdmin: 'Super Admin', admin: 'Admin', subMember: 'Sub-member' },
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
