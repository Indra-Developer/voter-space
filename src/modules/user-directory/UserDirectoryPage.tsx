import { ArrowLeft, CheckCircle2, CircleUserRound, KeyRound, Mail, MapPin, Phone, RefreshCcw, Search, ShieldCheck, UserRound, Users, XCircle } from 'lucide-react'
import { collection, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { db } from '../../lib/firebase'
import type { AppLanguage } from '../app-shell/types'
import './user-directory.css'
import { PageState } from '../app-shell/PageState'
import { readableFirebaseError, recordPasswordReset, resolveStorageFileUrl, sendAccountPasswordReset } from '../auth/firebase-auth'
import type { AppSession, UserProfile } from '../auth/types'
import { loadAllVoters } from '../voter-register/voter-service'
import type { VoterRecord } from '../voter-register/types'

type DirectoryUser = UserProfile & { uid: string; profilePhotoUrl?: string; bannerUrl?: string; createdAt?: unknown; updatedAt?: unknown }
type RoleFilter = 'all' | 'admin' | 'subMember'
type StatusFilter = 'all' | 'active' | 'disabled'

type RawDirectoryUser = {
  fullName?: unknown
  email?: unknown
  mobile?: unknown
  role?: unknown
  status?: unknown
  scope?: { wardIds?: unknown; boothIds?: unknown }
  permissions?: { upload?: unknown; edit?: unknown; download?: unknown; audit?: unknown }
  parentAdminId?: unknown
  profilePhotoPath?: unknown
  bannerPath?: unknown
  createdBy?: unknown
  createdAt?: unknown
  updatedAt?: unknown
  deviceLimit?: unknown
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

function normalizeDirectoryUser(uid: string, value: unknown): DirectoryUser {
  const raw = (value && typeof value === 'object' ? value : {}) as RawDirectoryUser
  const role = raw.role === 'superAdmin' || raw.role === 'admin' || raw.role === 'subMember' ? raw.role : 'subMember'

  return {
    uid,
    fullName: typeof raw.fullName === 'string' ? raw.fullName : '',
    email: typeof raw.email === 'string' ? raw.email : '',
    mobile: typeof raw.mobile === 'string' ? raw.mobile : '',
    role,
    status: raw.status === 'disabled' ? 'disabled' : 'active',
    scope: {
      wardIds: stringList(raw.scope?.wardIds),
      boothIds: stringList(raw.scope?.boothIds),
    },
    permissions: {
      upload: Boolean(raw.permissions?.upload),
      edit: Boolean(raw.permissions?.edit),
      download: Boolean(raw.permissions?.download),
      audit: Boolean(raw.permissions?.audit),
    },
    parentAdminId: typeof raw.parentAdminId === 'string' ? raw.parentAdminId : undefined,
    profilePhotoPath: typeof raw.profilePhotoPath === 'string' ? raw.profilePhotoPath : undefined,
    bannerPath: typeof raw.bannerPath === 'string' ? raw.bannerPath : undefined,
    createdBy: typeof raw.createdBy === 'string' ? raw.createdBy : '',
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    deviceLimit: typeof raw.deviceLimit === 'number' && raw.deviceLimit >= 1 ? Math.min(5, Math.floor(raw.deviceLimit)) : 1,
  }
}

const copy = {
    en: {
    label: 'Account overview', title: 'User directory', description: 'See every Admin, Sub-member, permission, and access area in one place.', search: 'Search users', searchPlaceholder: 'Name, email, mobile, ward, booth…', role: 'Role', status: 'Status', mobile: 'Mobile number', all: 'All', superAdmin: 'Super Admin', admin: 'Admin', subMember: 'Sub-member', active: 'Active', disabled: 'Disabled', clear: 'Clear', refresh: 'Refresh', admins: 'Admins', members: 'Sub-members', activeUsers: 'Active users', adminMembers: 'Sub-members under Admins', noUsers: 'No users match these filters.', noAdmins: 'No Admins match these filters.', noMembers: 'No Sub-members match these filters.', openDetails: 'Open details', memberCount: 'Sub-members', wards: 'Wards', booths: 'Booths', areas: 'Areas', details: 'User details', back: 'Back to directory', accountInfo: 'Account information', access: 'Access scope', permissions: 'Permissions', controlledAreas: 'Areas under this user', loadingAreas: 'Finding areas from voter data…', noAreas: 'No area names are available for this scope.', areaCount: 'area(s)', parentAdmin: 'Parent Admin', membersUnder: 'Sub-members under this Admin', noMembersUnder: 'This Admin has no Sub-members yet.', password: 'Password', passwordProtected: 'Protected — passwords are never displayed.', deviceLimit: 'Allowed devices', resetPassword: 'Send password reset', resetSent: 'Password reset email sent.', resetError: 'Password reset could not be sent.', resetHint: 'This sends a secure reset link to the login email.', profilePhoto: 'Profile photo', banner: 'Admin banner', notSet: 'Not set', yes: 'Yes', no: 'No', upload: 'PDF upload', edit: 'Edit data', download: 'Download', audit: 'Audit activity', created: 'Created', updated: 'Updated', noFirebase: 'Firebase is not configured.', loading: 'Loading user accounts…', loadError: 'User accounts could not be loaded.', retry: 'Try again', openParent: 'Open parent Admin', votersInScope: 'Voters in scope', securityNote: 'For security, the original password cannot be recovered or shown. Use the reset option when needed.', resetConfirm: 'Send a password reset link to this user?', areaAccess: 'Area access', scopeFromVoters: 'Calculated from voter records in the selected ward and booth scope.',
  },
  te: {
    label: 'ఖాతాల అవలోకనం', title: 'వినియోగదారుల వివరాలు', description: 'ప్రతి అడ్మిన్, సబ్-మెంబర్, అనుమతి మరియు యాక్సెస్ ప్రాంతాన్ని ఒకే చోట చూడండి.', search: 'వినియోగదారులను వెతకండి', searchPlaceholder: 'పేరు, ఇమెయిల్, మొబైల్, వార్డు, బూత్…', role: 'పాత్ర', status: 'స్థితి', mobile: 'మొబైల్ నంబర్', all: 'అన్నీ', superAdmin: 'సూపర్ అడ్మిన్', admin: 'అడ్మిన్', subMember: 'సబ్-మెంబర్', active: 'యాక్టివ్', disabled: 'డిసేబుల్', clear: 'తొలగించండి', refresh: 'రిఫ్రెష్', admins: 'అడ్మిన్లు', members: 'సబ్-మెంబర్లు', activeUsers: 'యాక్టివ్ యూజర్లు', adminMembers: 'అడ్మిన్ల కింద సబ్-మెంబర్లు', noUsers: 'ఈ ఫిల్టర్లకు యూజర్లు లేరు.', noAdmins: 'ఈ ఫిల్టర్లకు అడ్మిన్లు లేరు.', noMembers: 'ఈ ఫిల్టర్లకు సబ్-మెంబర్లు లేరు.', openDetails: 'వివరాలు తెరవండి', memberCount: 'సబ్-మెంబర్లు', wards: 'వార్డులు', booths: 'బూత్‌లు', areas: 'ప్రాంతాలు', details: 'యూజర్ వివరాలు', back: 'వివరాల జాబితాకు వెనక్కి', accountInfo: 'ఖాతా సమాచారం', access: 'యాక్సెస్ పరిధి', permissions: 'అనుమతులు', controlledAreas: 'ఈ యూజర్ పరిధిలోని ప్రాంతాలు', loadingAreas: 'ఓటర్ డేటా నుంచి ప్రాంతాలు వెతుకుతున్నాము…', noAreas: 'ఈ పరిధికి ప్రాంతాల పేర్లు లేవు.', areaCount: 'ప్రాంతాలు', parentAdmin: 'పేరెంట్ అడ్మిన్', membersUnder: 'ఈ అడ్మిన్ కింద సబ్-మెంబర్లు', noMembersUnder: 'ఈ అడ్మిన్‌కు ఇంకా సబ్-మెంబర్లు లేరు.', password: 'పాస్‌వర్డ్', passwordProtected: 'రక్షించబడింది — పాస్‌వర్డ్ ఎప్పుడూ చూపించబడదు.', deviceLimit: 'అనుమతించిన డివైస్‌లు', resetPassword: 'పాస్‌వర్డ్ రీసెట్ పంపండి', resetSent: 'పాస్‌వర్డ్ రీసెట్ ఇమెయిల్ పంపాము.', resetError: 'పాస్‌వర్డ్ రీసెట్ పంపలేకపోయాము.', resetHint: 'లాగిన్ ఇమెయిల్‌కు సురక్షిత రీసెట్ లింక్ పంపబడుతుంది.', profilePhoto: 'ప్రొఫైల్ ఫోటో', banner: 'అడ్మిన్ బ్యానర్', notSet: 'సెట్ చేయలేదు', yes: 'అవును', no: 'కాదు', upload: 'PDF అప్‌లోడ్', edit: 'డేటా సవరణ', download: 'డౌన్‌లోడ్', audit: 'ఆడిట్ కార్యకలాపాలు', created: 'సృష్టించిన తేదీ', updated: 'మార్చిన తేదీ', noFirebase: 'Firebase కాన్ఫిగర్ కాలేదు.', loading: 'యూజర్ ఖాతాలు లోడ్ అవుతున్నాయి…', loadError: 'యూజర్ ఖాతాలు లోడ్ కాలేదు.', retry: 'మళ్లీ ప్రయత్నించండి', openParent: 'పేరెంట్ అడ్మిన్ తెరవండి', votersInScope: 'పరిధిలోని ఓటర్లు', securityNote: 'భద్రత కోసం అసలు పాస్‌వర్డ్‌ను తిరిగి పొందడం లేదా చూపించడం సాధ్యం కాదు. అవసరమైతే రీసెట్ ఉపయోగించండి.', resetConfirm: 'ఈ యూజర్‌కు పాస్‌వర్డ్ రీసెట్ లింక్ పంపాలా?', areaAccess: 'ప్రాంత యాక్సెస్', scopeFromVoters: 'ఎంచుకున్న వార్డు, బూత్ పరిధిలోని ఓటర్ రికార్డుల ఆధారంగా లెక్కించబడుతుంది.',
  },
} as const

type PageText = { [Key in keyof typeof copy.en]: string }

export function UserDirectoryPage({ language, session }: { language: AppLanguage; session: AppSession }) {
  const t = copy[language]
  const [searchParams, setSearchParams] = useSearchParams()
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [queryText, setQueryText] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loadError, setLoadError] = useState<string>()
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [notice, setNotice] = useState<string>()
  const [refreshKey, setRefreshKey] = useState(0)
  const selectedUid = searchParams.get('user') ?? undefined
  const selectedFromUid = searchParams.get('from') ?? undefined
  const selectedUser = users.find((user) => user.uid === selectedUid)

  useEffect(() => {
    if (session.profile.role !== 'superAdmin') return
    if (!db) {
      const timer = window.setTimeout(() => { setLoadError(t.noFirebase); setLoadingUsers(false) }, 0)
      return () => window.clearTimeout(timer)
    }
    const usersCollection = collection(db, 'users')
    let active = true
    const unsubscribe = onSnapshot(usersCollection, (snapshot) => {
      const profiles = snapshot.docs.map((item) => normalizeDirectoryUser(item.id, item.data()))
      void Promise.all(profiles.map(async (profile) => ({ ...profile, profilePhotoUrl: await resolveStorageFileUrl(profile.profilePhotoPath), bannerUrl: await resolveStorageFileUrl(profile.bannerPath) }))).then((resolved) => {
        if (active) {
          setLoadError(undefined)
          setUsers(resolved.sort((first, second) => first.fullName.localeCompare(second.fullName, language === 'te' ? 'te' : 'en', { numeric: true })))
          setLoadingUsers(false)
        }
      })
    }, (error) => { setLoadError(`${t.loadError} ${readableFirebaseError(error)}`); setLoadingUsers(false) })
    return () => { active = false; unsubscribe() }
  }, [language, refreshKey, session.profile.role, t.loadError, t.noFirebase])

  const parentNames = useMemo(() => new Map(users.filter((user) => user.role === 'admin').map((user) => [user.uid, user.fullName])), [users])
  const filteredUsers = useMemo(() => {
    const search = queryText.trim().toLocaleLowerCase()
    return users.filter((user) => {
      const searchable = [user.fullName, user.email, user.mobile, user.role, user.status, ...user.scope.wardIds, ...user.scope.boothIds, user.parentAdminId ? parentNames.get(user.parentAdminId) : ''].join(' ').toLocaleLowerCase()
      return (!search || searchable.includes(search)) && (roleFilter === 'all' || user.role === roleFilter) && (statusFilter === 'all' || user.status === statusFilter)
    })
  }, [parentNames, queryText, roleFilter, statusFilter, users])
  const admins = filteredUsers.filter((user) => user.role === 'admin')
  const members = filteredUsers.filter((user) => user.role === 'subMember')
  const totalMembers = users.filter((user) => user.role === 'subMember').length
  const activeUsers = users.filter((user) => user.status === 'active').length
  const refresh = () => { setLoadingUsers(true); setLoadError(undefined); setRefreshKey((value) => value + 1) }

  if (session.profile.role !== 'superAdmin') return <PageState kind="empty" title={t.noUsers} description="" />
  if (selectedUser) return <><div className="user-directory-detail-notice">{notice ? <p className={`form-alert ${notice.includes(t.resetError) ? 'form-alert-error' : 'form-alert-info'}`}>{notice}</p> : null}</div><UserDirectoryDetail language={language} members={users.filter((user) => user.role === 'subMember' && user.parentAdminId === selectedUser.uid)} onBack={() => { if (selectedFromUid && users.some((user) => user.uid === selectedFromUid)) { setSearchParams({ user: selectedFromUid }); return } const next = new URLSearchParams(searchParams); next.delete('user'); next.delete('from'); setSearchParams(next) }} onOpenUser={(user) => setSearchParams(selectedUser.role === 'admin' && user.parentAdminId === selectedUser.uid ? { user: user.uid, from: selectedUser.uid } : { user: user.uid })} onPasswordReset={async (user) => { if (!window.confirm(t.resetConfirm)) return; setNotice(undefined); try { await sendAccountPasswordReset(user.email); await recordPasswordReset(user.uid) ; setNotice(t.resetSent) } catch (reason) { setNotice(`${t.resetError} ${readableFirebaseError(reason)}`) } }} parentNames={parentNames} t={t} user={selectedUser} users={users} /></>

  return <section className="user-directory-page">
    <header className="page-intro user-directory-intro"><div><p>{t.label}</p><h2>{t.title}</h2><span>{t.description}</span></div><button className="secondary-button" onClick={refresh} type="button"><RefreshCcw size={15} />{t.refresh}</button></header>
    {notice ? <p className={`form-alert ${notice.includes(t.resetError) ? 'form-alert-error' : 'form-alert-info'}`}>{notice}</p> : null}
    {loadingUsers ? <PageState kind="loading" title={t.loading} description="" /> : loadError ? <PageState kind="error" title={t.loadError} description={loadError} actionLabel={t.retry} onAction={refresh} /> : <>
      <section className="user-directory-stats"><DirectoryStat icon={<ShieldCheck size={19} />} label={t.admins} value={users.filter((user) => user.role === 'admin').length} /><DirectoryStat icon={<Users size={19} />} label={t.members} value={totalMembers} /><DirectoryStat icon={<CheckCircle2 size={19} />} label={t.activeUsers} value={activeUsers} /><DirectoryStat icon={<Users size={19} />} label={t.adminMembers} value={users.filter((user) => user.role === 'subMember' && user.parentAdminId).length} /></section>
      <section className="user-directory-filter-card"><label className="user-directory-search"><Search size={18} /><span className="sr-only">{t.search}</span><input placeholder={t.searchPlaceholder} value={queryText} onChange={(event) => setQueryText(event.target.value)} /></label><label><span>{t.role}</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}><option value="all">{t.all}</option><option value="admin">{t.admin}</option><option value="subMember">{t.subMember}</option></select></label><label><span>{t.status}</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option value="all">{t.all}</option><option value="active">{t.active}</option><option value="disabled">{t.disabled}</option></select></label><button className="user-directory-clear" onClick={() => { setQueryText(''); setRoleFilter('all'); setStatusFilter('all') }} type="button">{t.clear}</button></section>
      <section className="user-directory-section"><header><div><p>{t.admins}</p><h3>{admins.length}</h3></div><span>{t.memberCount}</span></header>{admins.length ? <div className="user-directory-card-grid">{admins.map((user) => <DirectoryUserCard key={user.uid} memberCount={users.filter((item) => item.role === 'subMember' && item.parentAdminId === user.uid).length} onOpen={() => setSearchParams({ user: user.uid })} t={t} user={user} />)}</div> : <p className="user-directory-empty">{t.noAdmins}</p>}</section>
      <section className="user-directory-section"><header><div><p>{t.members}</p><h3>{members.length}</h3></div><span>{t.openDetails}</span></header>{members.length ? <div className="user-directory-card-grid">{members.map((user) => <DirectoryUserCard key={user.uid} memberCount={0} onOpen={() => setSearchParams({ user: user.uid })} parentName={user.parentAdminId ? parentNames.get(user.parentAdminId) : undefined} t={t} user={user} />)}</div> : <p className="user-directory-empty">{t.noMembers}</p>}</section>
    </>}
  </section>
}

function DirectoryUserCard({ memberCount, onOpen, parentName, t, user }: { memberCount: number; onOpen: () => void; parentName?: string; t: PageText; user: DirectoryUser }) {
  return <button className="user-directory-card" onClick={onOpen} type="button"><div className="user-directory-card-top"><Avatar user={user} /><span className={`directory-status directory-status-${user.status}`}>{user.status === 'active' ? t.active : t.disabled}</span></div><strong>{user.fullName}</strong><span className="directory-user-role">{roleLabel(user.role, t)}</span><span className="directory-user-contact">{user.email}</span><span className="directory-user-contact">{user.mobile}</span><div className="directory-card-summary"><span>{t.wards}: {user.scope.wardIds.length}</span><span>{t.booths}: {user.scope.boothIds.length}</span>{user.role === 'admin' ? <span>{t.memberCount}: {memberCount}</span> : <span>{t.parentAdmin}: {parentName ?? t.notSet}</span>}</div></button>
}

function UserDirectoryDetail({ language, members, onBack, onOpenUser, onPasswordReset, parentNames, t, user, users }: { language: AppLanguage; members: DirectoryUser[]; onBack: () => void; onOpenUser: (user: DirectoryUser) => void; onPasswordReset: (user: DirectoryUser) => Promise<void>; parentNames: Map<string, string>; t: PageText; user: DirectoryUser; users: DirectoryUser[] }) {
  const [areaNames, setAreaNames] = useState<string[]>()
  const [areaError, setAreaError] = useState<string>()
  const [voterCount, setVoterCount] = useState<number>()
  useEffect(() => {
    let active = true
    const resetTimer = window.setTimeout(() => { if (active) { setAreaNames(undefined); setAreaError(undefined); setVoterCount(undefined) } }, 0)
    void loadAllVoters().then((records) => {
      if (!active) return
      const scoped = records.filter((record) => isInScope(record, user))
      setAreaNames(unique(scoped.map((record) => record.area)))
      setVoterCount(scoped.length)
    }).catch((reason) => { if (active) setAreaError(readableFirebaseError(reason)) })
    return () => { active = false; window.clearTimeout(resetTimer) }
  }, [user])
  const parentName = user.parentAdminId ? parentNames.get(user.parentAdminId) : undefined
  return <section className="user-directory-page user-directory-detail-page"><button className="directory-back-button" onClick={onBack} type="button"><ArrowLeft size={17} />{t.back}</button><header className="directory-detail-hero">{user.bannerUrl ? <img alt="" className="directory-detail-banner" src={user.bannerUrl} /> : <div className="directory-detail-banner directory-detail-banner-empty" />}<div className="directory-detail-identity"><Avatar user={user} large /><div><p>{roleLabel(user.role, t)}</p><h2>{user.fullName}</h2><span className={`directory-status directory-status-${user.status}`}>{user.status === 'active' ? t.active : t.disabled}</span></div></div></header><div className="directory-detail-actions"><button className="primary-button" onClick={() => void onPasswordReset(user)} type="button"><KeyRound size={15} />{t.resetPassword}</button><span>{t.resetHint}</span></div><section className="directory-detail-grid"><DetailSection title={t.accountInfo}><DetailItem icon={<UserRound size={16} />} label={t.role} value={roleLabel(user.role, t)} /><DetailItem icon={<Mail size={16} />} label="Email" value={user.email} /><DetailItem icon={<Phone size={16} />} label={t.mobile} value={user.mobile} /><DetailItem icon={<KeyRound size={16} />} label={t.password} value={t.passwordProtected} /><DetailItem icon={<ShieldCheck size={16} />} label={t.deviceLimit} value={String(user.deviceLimit ?? 1)} /><DetailItem icon={<ShieldCheck size={16} />} label={t.created} value={formatDate(user.createdAt, language)} /><DetailItem icon={<RefreshCcw size={16} />} label={t.updated} value={formatDate(user.updatedAt, language)} /></DetailSection><DetailSection title={t.access}><DetailItem icon={<MapPin size={16} />} label={t.wards} value={`${user.scope.wardIds.length}: ${user.scope.wardIds.join(', ') || t.notSet}`} /><DetailItem icon={<MapPin size={16} />} label={t.booths} value={`${user.scope.boothIds.length}: ${user.scope.boothIds.join(', ') || t.notSet}`} /><DetailItem icon={<MapPin size={16} />} label={t.areaAccess} value={areaNames === undefined ? t.loadingAreas : areaError ? areaError : `${areaNames.length} ${t.areaCount}`} /><div className="directory-area-list">{areaNames?.length ? areaNames.map((area) => <span key={area}>{area}</span>) : areaNames ? <em>{t.noAreas}</em> : null}</div>{voterCount !== undefined ? <DetailItem icon={<Users size={16} />} label={t.votersInScope} value={String(voterCount)} /> : null}<small>{t.scopeFromVoters}</small></DetailSection><DetailSection title={t.permissions}><PermissionRow label={t.upload} allowed={user.role === 'superAdmin' || user.permissions.upload} t={t} /><PermissionRow label={t.edit} allowed={user.role === 'superAdmin' || user.permissions.edit} t={t} /><PermissionRow label={t.download} allowed={user.role === 'superAdmin' || user.permissions.download} t={t} /><PermissionRow label={t.audit} allowed={user.role === 'superAdmin' || user.permissions.audit} t={t} /></DetailSection></section>{user.role === 'subMember' ? <section className="directory-parent-card"><strong>{t.parentAdmin}</strong><span>{parentName ?? t.notSet}</span>{user.parentAdminId ? <button onClick={() => { const parent = users.find((candidate) => candidate.uid === user.parentAdminId); if (parent) onOpenUser(parent) }} type="button">{t.openParent}</button> : null}</section> : <section className="directory-members-section"><header><div><p>{t.membersUnder}</p><h3>{members.length}</h3></div></header>{members.length ? <div className="directory-members-list">{members.map((member) => <button key={member.uid} onClick={() => onOpenUser(member)} type="button"><Avatar user={member} /><span><strong>{member.fullName}</strong><small>{member.email} · {member.mobile}</small></span><span className={`directory-status directory-status-${member.status}`}>{member.status === 'active' ? t.active : t.disabled}</span></button>)}</div> : <p className="user-directory-empty">{t.noMembersUnder}</p>}</section>}<p className="directory-security-note"><ShieldCheck size={16} />{t.securityNote}</p></section>
}

function DetailSection({ children, title }: { children: React.ReactNode; title: string }) { return <section className="directory-detail-section"><h3>{title}</h3><div>{children}</div></section> }
function DetailItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="directory-detail-item">{icon}<span><small>{label}</small><strong>{value}</strong></span></div> }
function PermissionRow({ allowed, label, t }: { allowed: boolean; label: string; t: PageText }) { return <div className="directory-permission-row"><span>{label}</span><strong className={allowed ? 'allowed' : 'not-allowed'}>{allowed ? <CheckCircle2 size={15} /> : <XCircle size={15} />}{allowed ? t.yes : t.no}</strong></div> }
function DirectoryStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) { return <article><span>{icon}</span><strong>{value}</strong><small>{label}</small></article> }
function Avatar({ large = false, user }: { large?: boolean; user: DirectoryUser }) { return user.profilePhotoUrl ? <img alt={user.fullName} className={`directory-avatar${large ? ' directory-avatar-large' : ''}`} src={user.profilePhotoUrl} /> : <span className={`directory-avatar directory-avatar-placeholder${large ? ' directory-avatar-large' : ''}`}><CircleUserRound size={large ? 38 : 22} /></span> }
function roleLabel(role: DirectoryUser['role'], t: PageText) { return role === 'superAdmin' ? t.superAdmin : role === 'admin' ? t.admin : t.subMember }
function isInScope(record: VoterRecord, user: DirectoryUser) { return user.role === 'superAdmin' || (user.scope.wardIds.includes(record.wardId) && (user.scope.boothIds.length === 0 || user.scope.boothIds.includes(record.boothId))) }
function unique(values: string[]) { return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) }
function formatDate(value: unknown, language: AppLanguage) { if (!value) return '—'; const date = typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function' ? (value as { toDate: () => Date }).toDate() : new Date(String(value)); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(language === 'te' ? 'te-IN' : 'en-IN', { dateStyle: 'medium' }).format(date) }
