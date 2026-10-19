import { Download, Mail, MapPinned, Phone, ShieldCheck, Upload } from 'lucide-react'
import type { AppLanguage } from '../app-shell/types'
import type { AppSession } from './types'

type ProfilePageProps = {
  language: AppLanguage
  session: AppSession
}

const profileCopy = {
  te: {
    label: 'నా ఖాతా', title: 'ప్రొఫైల్ & యాక్సెస్', email: 'ఇమెయిల్', mobile: 'మొబైల్ నంబర్', access: 'డేటా యాక్సెస్', wards: 'వార్డులు', booths: 'బూత్‌లు', permissions: 'అనుమతులు', upload: 'అప్‌లోడ్', edit: 'సవరింపు', download: 'డౌన్‌లోడ్', enabled: 'అనుమతి ఉంది', noAccess: 'కేటాయించిన యాక్సెస్ లేదు', roles: { superAdmin: 'సూపర్ అడ్మిన్', admin: 'అడ్మిన్', subMember: 'సబ్-మెంబర్' },
  },
  en: {
    label: 'My account', title: 'Profile & access', email: 'Email', mobile: 'Mobile number', access: 'Data access', wards: 'Wards', booths: 'Booths', permissions: 'Permissions', upload: 'Upload', edit: 'Edit', download: 'Download', enabled: 'Allowed', noAccess: 'No assigned access', roles: { superAdmin: 'Super Admin', admin: 'Admin', subMember: 'Sub-member' },
  },
} as const

export function ProfilePage({ language, session }: ProfilePageProps) {
  const t = profileCopy[language]
  const profile = session.profile
  const bannerStyle = session.bannerUrl ? { backgroundImage: `url(${session.bannerUrl})` } : undefined
  const scope = profile.role === 'superAdmin' ? null : profile.scope

  return (
    <section className="profile-page">
      <header className="page-intro"><p>{t.label}</p><h2>{t.title}</h2></header>
      <article className="profile-page-card">
        <div className="profile-page-banner" style={bannerStyle} />
        <div className="profile-page-main">
          {session.profilePhotoUrl ? <img alt={profile.fullName} className="profile-page-photo" src={session.profilePhotoUrl} /> : <span className="profile-page-photo profile-page-photo-placeholder">{profile.fullName.slice(0, 1).toUpperCase()}</span>}
          <div className="profile-page-name"><h3>{profile.fullName}</h3><span>{t.roles[profile.role]}</span></div>
        </div>
        <div className="profile-contact-grid">
          <span><Mail size={17} /><small>{t.email}</small><strong>{profile.email}</strong></span>
          <span><Phone size={17} /><small>{t.mobile}</small><strong>{profile.mobile}</strong></span>
        </div>
      </article>

      <section className="profile-detail-grid">
        <article><h3><MapPinned size={18} />{t.access}</h3>{scope ? <div className="access-lines"><span><small>{t.wards}</small><strong>{scope.wardIds.join(', ') || t.noAccess}</strong></span><span><small>{t.booths}</small><strong>{scope.boothIds.join(', ') || t.noAccess}</strong></span></div> : <p>{t.enabled}</p>}</article>
        <article><h3><ShieldCheck size={18} />{t.permissions}</h3><div className="permission-list"><Permission icon={Upload} label={t.upload} visible={profile.permissions.upload || profile.role === 'superAdmin'} /><Permission icon={ShieldCheck} label={t.edit} visible={profile.permissions.edit || profile.role === 'superAdmin'} /><Permission icon={Download} label={t.download} visible={profile.permissions.download || profile.role === 'superAdmin'} /></div></article>
      </section>
    </section>
  )
}

function Permission({ icon: Icon, label, visible }: { icon: typeof Upload; label: string; visible: boolean }) {
  return <span className={visible ? 'is-enabled' : ''}><Icon size={16} />{label}</span>
}
