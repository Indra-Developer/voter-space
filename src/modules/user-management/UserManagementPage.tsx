import { Camera, Check, CheckCircle2, ChevronDown, Eye, EyeOff, Pencil, Plus, ShieldCheck, UserRound, Users, XCircle } from 'lucide-react'
import { collection, getCountFromServer, onSnapshot, orderBy, query, where, type Query } from 'firebase/firestore'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { db } from '../../lib/firebase'
import type { AppLanguage } from '../app-shell/types'
import { joinClasses, uiClasses } from '../app-shell/ui'
import './user-management.css'
import { createAccount, readableFirebaseError, resolveStorageFileUrl, updateAccount, uploadAccountImage } from '../auth/firebase-auth'
import { emptyPermissions, type AccountFormValues, type AppSession, type UserProfile } from '../auth/types'
import { loadVoterFilterOptions } from '../voter-register/voter-service'

type DirectoryUser = UserProfile & { uid: string; profilePhotoUrl?: string; bannerUrl?: string }
type UserMetricKey = 'accounts' | 'admins' | 'members' | 'active'
type UserMetricValues = Partial<Record<UserMetricKey, number>>
type ScopeOptions = {
  wards: string[]
  booths: string[]
  boothsByWard: Record<string, string[]>
}

type UserManagementPageProps = {
  language: AppLanguage
  session: AppSession
}

const pageCopy = {
  te: {
    accountsMetric: 'ఖాతాలు', adminsMetric: 'అడ్మిన్లు', membersMetric: 'సబ్-మెంబర్లు', assignedMetric: 'మీ సభ్యులు', activeMetric: 'యాక్టివ్ ఖాతాలు',
    create: 'కొత్త ఖాతా', edit: 'ఖాతా సవరించండి', fullName: 'పూర్తి పేరు', mobile: 'మొబైల్ నంబర్', email: 'లాగిన్ ఇమెయిల్',
    role: 'పాత్ర', admin: 'అడ్మిన్', subMember: 'సబ్-మెంబర్', status: 'ఖాతా స్థితి', active: 'యాక్టివ్', disabled: 'డిసేబుల్',
    profilePhoto: 'ప్రొఫైల్ ఫోటో', banner: 'అడ్మిన్ బ్యానర్', parentAdmin: 'పేరెంట్ అడ్మిన్', wardAccess: 'అనుమతించిన వార్డులు', boothAccess: 'అనుమతించిన బూత్‌లు',
    assignedWard: 'కేటాయించిన వార్డులు', assignedBooth: 'కేటాయించిన బూత్‌లు', permissions: 'అడ్మిన్ అనుమతులు', upload: 'PDF అప్‌లోడ్', editPermission: 'డేటా సవరింపు', download: 'డౌన్‌లోడ్', audit: 'సొంత ఆడిట్ కార్యకలాపాలు',
    password: 'లాగిన్ పాస్‌వర్డ్', confirmPassword: 'పాస్‌వర్డ్ నిర్ధారించండి', showPassword: 'పాస్‌వర్డ్ చూపించండి', hidePassword: 'పాస్‌వర్డ్ దాచండి', passwordHelp: 'కనీసం 8 అక్షరాలు. సృష్టించిన ఖాతా ఇదే పాస్‌వర్డ్‌తో లాగిన్ అవుతుంది.', passwordEditHelp: 'మార్చాల్సిన అవసరం లేకపోతే ఖాళీగా ఉంచండి.', passwordMismatch: 'రెండు పాస్‌వర్డ్‌లు ఒకేలా ఉండాలి.', passwordShort: 'పాస్‌వర్డ్‌లో కనీసం 8 అక్షరాలు ఉండాలి.', save: 'ఖాతా సేవ్ చేయండి', cancel: 'రద్దు', editAccount: 'సవరించండి', disable: 'యాక్సెస్ తొలగించండి', enable: 'యాక్సెస్ ఇవ్వండి',
    deviceLimit: 'అనుమతించిన డివైస్‌లు', deviceLimitHelp: 'ఈ ఖాతా ఒకేసారి ఎన్ని డివైస్‌లలో లాగిన్ కావచ్చో ఎంచుకోండి.', device: 'డివైస్', devices: 'డివైస్‌లు',
    ownMembers: 'మీ సబ్-మెంబర్లు మాత్రమే కనిపిస్తారు.', noUsers: 'ఇంకా వినియోగదారులు లేరు.', saved: 'ఖాతా సేవ్ అయింది. ఈ ఫారమ్‌లో ఇచ్చిన పాస్‌వర్డ్‌తో యూజర్ లాగిన్ అవ్వవచ్చు.',
    commaHelp: 'డేటాబేస్‌లో ఉన్న వార్డులు మరియు బూత్‌లను ఇక్కడ ఎంచుకోండి.', selectOneOrMore: 'ఒకటి లేదా అంతకంటే ఎక్కువ ఎంచుకోండి', noValues: 'ఇంకా విలువలు అందుబాటులో లేవు', noAdmins: 'ముందుగా ఒక అడ్మిన్ ఖాతాను సృష్టించండి.', imageWarning: 'ఖాతా సృష్టించబడింది. చిత్రం సేవ్ కాలేదు; ఈ ఖాతాను సవరించి మళ్లీ చిత్రాన్ని ఎంచుకోండి.',
  },
  en: {
    accountsMetric: 'Accounts', adminsMetric: 'Admins', membersMetric: 'Sub-members', assignedMetric: 'Your members', activeMetric: 'Active accounts',
    create: 'New account', edit: 'Edit account', fullName: 'Full name', mobile: 'Mobile number', email: 'Login email',
    role: 'Role', admin: 'Admin', subMember: 'Sub-member', status: 'Account status', active: 'Active', disabled: 'Disabled',
    profilePhoto: 'Profile photo', banner: 'Admin banner', parentAdmin: 'Parent Admin', wardAccess: 'Allowed wards', boothAccess: 'Allowed booths',
    assignedWard: 'Assigned wards', assignedBooth: 'Assigned booths', permissions: 'Admin permissions', upload: 'PDF upload', editPermission: 'Edit data', download: 'Download', audit: 'Own audit activity',
    password: 'Login password', confirmPassword: 'Confirm password', showPassword: 'Show password', hidePassword: 'Hide password', passwordHelp: 'At least 8 characters. The new account will log in with this password.', passwordEditHelp: 'Leave blank if the password should stay unchanged.', passwordMismatch: 'Both passwords must match.', passwordShort: 'Password must contain at least 8 characters.', save: 'Save account', cancel: 'Cancel', editAccount: 'Edit', disable: 'Remove access', enable: 'Enable access',
    deviceLimit: 'Allowed devices', deviceLimitHelp: 'Choose how many devices can use this account at the same time.', device: 'device', devices: 'devices',
    ownMembers: 'Only your own sub-members are shown.', noUsers: 'There are no users yet.', saved: 'Account saved. The user can log in with the password entered in this form.',
    commaHelp: 'Select the wards and booths available in the database.', selectOneOrMore: 'Select one or more', noValues: 'No values are available yet', noAdmins: 'Create an Admin account first.', imageWarning: 'The account was created, but an image was not saved. Edit this account and select the image again.',
  },
} as const

export function UserManagementPage({ language, session }: UserManagementPageProps) {
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [directoryError, setDirectoryError] = useState<string>()
  const [metricValues, setMetricValues] = useState<UserMetricValues>({})
  const [editingUser, setEditingUser] = useState<DirectoryUser>()
  const [showForm, setShowForm] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [scopeOptions, setScopeOptions] = useState<ScopeOptions>({ wards: [], booths: [], boothsByWard: {} })
  const snapshotVersion = useRef(0)
  const t = pageCopy[language]
  const isSuperAdmin = session.profile.role === 'superAdmin'

  useEffect(() => {
    if (!db) {
      const timer = window.setTimeout(() => {
        setDirectoryError('Firebase is not configured. Check the .env.local file and restart Vite.')
        setLoadingUsers(false)
      }, 0)
      return () => window.clearTimeout(timer)
    }
    const userQuery = isSuperAdmin
      ? query(collection(db, 'users'), orderBy('fullName'))
      : query(collection(db, 'users'), where('parentAdminId', '==', session.uid), where('role', '==', 'subMember'), orderBy('fullName'))

    let active = true
    const unsubscribe = onSnapshot(
      userQuery,
      (snapshot) => {
        const version = ++snapshotVersion.current
        // Firestore can emit an empty cached snapshot before the server result.
        // Keep the loading state until a confirmed result arrives so the empty
        // message does not flash before the users are rendered.
        if (snapshot.metadata.fromCache && snapshot.empty) return
        const profiles = snapshot.docs.map((item) => ({ uid: item.id, ...(item.data() as UserProfile) }))
        void Promise.all(profiles.map(async (profile) => ({
          ...profile,
          profilePhotoUrl: await resolveStorageFileUrl(profile.profilePhotoPath),
          bannerUrl: await resolveStorageFileUrl(profile.bannerPath),
        }))).then((resolved) => {
          if (!active || version !== snapshotVersion.current) return
          setUsers(resolved)
          setDirectoryError(undefined)
          setLoadingUsers(false)
        })
      },
      (error) => {
        setDirectoryError(`User accounts could not be loaded. ${readableFirebaseError(error)}`)
        setLoadingUsers(false)
      },
    )
    return () => { active = false; unsubscribe() }
  }, [isSuperAdmin, session.uid])

  useEffect(() => {
    if (!db) return
    let active = true
    const usersCollection = collection(db, 'users')
    const accountQuery = isSuperAdmin
      ? query(usersCollection, where('role', 'in', ['admin', 'subMember']))
      : query(usersCollection, where('parentAdminId', '==', session.uid))
    const memberQuery = isSuperAdmin
      ? query(usersCollection, where('role', '==', 'subMember'))
      : query(usersCollection, where('parentAdminId', '==', session.uid))
    const metricQueries: Array<[UserMetricKey, Query]> = [
      ['accounts', accountQuery],
      ['members', memberQuery],
      ['active', query(usersCollection, where('status', '==', 'active'))],
    ]
    if (isSuperAdmin) metricQueries.push(['admins', query(usersCollection, where('role', '==', 'admin'))])

    void Promise.all(metricQueries.map(async ([key, metricQuery]) => {
      try {
        const result = await getCountFromServer(metricQuery)
        if (active) setMetricValues((current) => ({ ...current, [key]: result.data().count }))
      } catch {
        if (active) setMetricValues((current) => ({ ...current, [key]: 0 }))
      }
    }))
    return () => { active = false }
  }, [isSuperAdmin, session.uid])

  useEffect(() => {
    let active = true
    void loadVoterFilterOptions().then((options) => {
      if (active) setScopeOptions({ wards: options.wards, booths: options.booths, boothsByWard: options.boothsByWard ?? {} })
    }).catch(() => {
      if (active) setScopeOptions({ wards: [], booths: [], boothsByWard: {} })
    })
    return () => { active = false }
  }, [session.uid])

  const adminOptions = useMemo(() => users.filter((user) => user.role === 'admin'), [users])
  const editableUsers = isSuperAdmin ? users.filter((user) => user.uid !== session.uid) : users

  const refreshScopeOptions = () => {
    void loadVoterFilterOptions().then((options) => setScopeOptions({ wards: options.wards, booths: options.booths, boothsByWard: options.boothsByWard ?? {} })).catch(() => setScopeOptions({ wards: [], booths: [], boothsByWard: {} }))
  }

  const startCreate = () => {
    refreshScopeOptions()
    setEditingUser(undefined)
    setShowForm(true)
  }

  const startEdit = (user: DirectoryUser) => {
    refreshScopeOptions()
    setEditingUser(user)
    setShowForm(true)
  }

  const handleAccess = async (user: DirectoryUser) => {
    try {
      await updateAccount({
        uid: user.uid, fullName: user.fullName, email: user.email, mobile: user.mobile, role: user.role === 'admin' ? 'admin' : 'subMember',
        status: user.status === 'active' ? 'disabled' : 'active', parentAdminId: user.parentAdminId, scope: user.scope,
        permissions: user.permissions, profilePhotoPath: user.profilePhotoPath, bannerPath: user.bannerPath, deviceLimit: user.deviceLimit ?? 1,
      })
    } catch (error) {
      setNotice(readableFirebaseError(error))
    }
  }

  return (
    <section className="user-management grid gap-4 font-sans text-copy">
      <header className="user-management-intro flex justify-end">
        <button className={joinClasses('primary-button', uiClasses.button, uiClasses.primaryButton)} onClick={startCreate} type="button"><Plus size={17} />{t.create}</button>
      </header>

      <UserMetrics isSuperAdmin={isSuperAdmin} language={language} values={metricValues} />

      {!isSuperAdmin ? <p className="form-alert form-alert-info">{t.ownMembers}</p> : null}
      {notice ? <p className="form-alert form-alert-info">{notice}</p> : null}
      {directoryError ? <p className="form-alert form-alert-error">{directoryError}</p> : null}

      {showForm ? (
        <div
          className="user-management-form-backdrop fixed inset-0 z-[80] grid place-items-center bg-slate-950/55 p-3 backdrop-blur-sm"
          onMouseDown={() => { setShowForm(false); setEditingUser(undefined) }}
          role="presentation"
        >
          <section
            aria-labelledby="account-form-title"
            aria-modal="true"
            className="user-management-form-modal w-full max-w-3xl max-h-[calc(100svh-1.5rem)] overflow-y-auto"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <AccountForm
              adminOptions={adminOptions}
              initialUser={editingUser}
              key={editingUser?.uid ?? 'new'}
              language={language}
              onCancel={() => { setShowForm(false); setEditingUser(undefined) }}
              onComplete={(message) => { setNotice(message); setShowForm(false); setEditingUser(undefined) }}
              session={session}
              scopeOptions={scopeOptions}
            />
          </section>
        </div>
      ) : null}

      <div className={joinClasses('user-list-card', uiClasses.card, 'overflow-hidden')}>
        {loadingUsers ? <UserListSkeletons /> : editableUsers.length === 0 ? <p className="user-list-empty">{t.noUsers}</p> : null}
        {editableUsers.map((user) => (
            <article className="user-row bg-surface" key={user.uid}>
            <span className="user-row-avatar">{user.profilePhotoUrl ? <img alt={user.fullName} src={user.profilePhotoUrl} /> : <UserRound size={20} />}</span>
            <div className="user-row-main"><strong>{user.fullName}</strong><span>{user.email} · {user.mobile}</span></div>
            <div className="user-row-details"><span className={`status-pill status-${user.status}`}>{user.status === 'active' ? t.active : t.disabled}</span><span>{user.role === 'admin' ? t.admin : t.subMember}</span><span>{user.deviceLimit ?? 1} {(user.deviceLimit ?? 1) === 1 ? t.device : t.devices}</span></div>
            <div className="user-row-actions">
              <button aria-label={t.editAccount} className={joinClasses(uiClasses.button, uiClasses.secondaryButton, 'min-h-9 text-xs')} onClick={() => startEdit(user)} type="button"><Pencil size={16} />{t.editAccount}</button>
              {isSuperAdmin ? <button className={joinClasses(user.status === 'active' ? 'danger-action' : 'success-action', uiClasses.button, user.status === 'active' ? uiClasses.dangerButton : uiClasses.primaryButton, 'min-h-9 text-xs')} onClick={() => handleAccess(user)} type="button">{user.status === 'active' ? <XCircle size={16} /> : <CheckCircle2 size={16} />}{user.status === 'active' ? t.disable : t.enable}</button> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function UserMetrics({ isSuperAdmin, language, values }: { isSuperAdmin: boolean; language: AppLanguage; values: UserMetricValues }) {
  const t = pageCopy[language]
  const metrics = [
    { key: 'accounts' as const, label: t.accountsMetric, icon: Users },
    ...(isSuperAdmin ? [{ key: 'admins' as const, label: t.adminsMetric, icon: ShieldCheck }] : []),
    { key: 'members' as const, label: isSuperAdmin ? t.membersMetric : t.assignedMetric, icon: UserRound },
    { key: 'active' as const, label: t.activeMetric, icon: CheckCircle2 },
  ]

  return <section aria-label={language === 'te' ? 'ఖాతాల గణాంకాలు' : 'Account metrics'} className="user-metrics grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
    {metrics.map((metric) => {
      const Icon = metric.icon
      const value = values[metric.key]
      return <article className="user-metric-card" key={metric.key}><span className="user-metric-icon"><Icon aria-hidden="true" size={17} /></span><div className="min-w-0"><span>{metric.label}</span>{value === undefined ? <span aria-hidden="true" className="metric-skeleton" /> : <strong>{value.toLocaleString()}</strong>}</div></article>
    })}
  </section>
}

function UserListSkeletons() {
  return <div aria-busy="true" aria-label="Loading user accounts" className="user-list-skeletons">{['one', 'two', 'three'].map((key) => <div className="user-row user-row-skeleton" key={key}><span className="skeleton-circle" /><div className="skeleton-copy"><span /><span /></div><div className="skeleton-pills"><span /><span /></div><div className="skeleton-actions"><span /><span /></div></div>)}</div>
}

type AccountFormProps = {
  adminOptions: DirectoryUser[]
  initialUser?: DirectoryUser
  language: AppLanguage
  onCancel: () => void
  onComplete: (message: string) => void
  session: AppSession
  scopeOptions: ScopeOptions
}

function AccountForm({ adminOptions, initialUser, language, onCancel, onComplete, session, scopeOptions }: AccountFormProps) {
  const t = pageCopy[language]
  const isSuperAdmin = session.profile.role === 'superAdmin'
  const isEditing = Boolean(initialUser)
  const [values, setValues] = useState<AccountFormValues>(() => accountValues(initialUser, isSuperAdmin, session.uid))
  const [profileFile, setProfileFile] = useState<File>()
  const [bannerFile, setBannerFile] = useState<File>()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [imageProgress, setImageProgress] = useState({ profile: 0, banner: 0 })
  const [error, setError] = useState<string>()
  const isAdminAccount = values.role === 'admin'
  const parentScope = useMemo(() => {
    if (isAdminAccount) return undefined
    if (values.parentAdminId === session.uid) return session.profile.scope
    return adminOptions.find((admin) => admin.uid === values.parentAdminId)?.scope
  }, [adminOptions, isAdminAccount, session.profile.scope, session.uid, values.parentAdminId])
  const availableWardOptions = useMemo(() => uniqueOptions(isAdminAccount ? scopeOptions.wards : parentScope?.wardIds ?? [], values.scope.wardIds), [isAdminAccount, parentScope?.wardIds, scopeOptions.wards, values.scope.wardIds])
  const availableBoothOptions = useMemo(() => {
    const allowedBooths = isAdminAccount ? scopeOptions.booths : parentScope?.boothIds ?? []
    if (!values.scope.wardIds.length) return uniqueOptions(allowedBooths, values.scope.boothIds)

    const relatedBooths = values.scope.wardIds.flatMap((ward) => scopeOptions.boothsByWard[ward] ?? [])
    return uniqueOptions(allowedBooths.filter((booth) => relatedBooths.includes(booth)), values.scope.boothIds)
  }, [isAdminAccount, parentScope?.boothIds, scopeOptions.booths, scopeOptions.boothsByWard, values.scope.boothIds, values.scope.wardIds])

  const setField = <Key extends keyof AccountFormValues>(key: Key, value: AccountFormValues[Key]) => setValues((current) => ({ ...current, [key]: value }))
  const setPermission = (key: keyof AccountFormValues['permissions'], checked: boolean) => setValues((current) => ({ ...current, permissions: { ...current.permissions, [key]: checked } }))
  const handleWardChange = (wardIds: string[]) => {
    const allowedBooths = isAdminAccount ? scopeOptions.booths : parentScope?.boothIds ?? []
    const relatedBooths = wardIds.length ? wardIds.flatMap((ward) => scopeOptions.boothsByWard[ward] ?? []) : allowedBooths
    const boothIds = values.scope.boothIds.filter((booth) => relatedBooths.includes(booth))
    setField('scope', { ...values.scope, wardIds, boothIds })
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(undefined)
    if (values.role === 'subMember' && !values.parentAdminId) {
      setError('Select the parent Admin before saving this Sub-member.')
      return
    }
    if (values.scope.wardIds.length === 0) {
      setError('Select at least one ward before saving the account.')
      return
    }
    if (values.role === 'subMember' && values.scope.boothIds.length === 0) {
      setError('Select at least one booth before saving this Sub-member.')
      return
    }
    if (!isEditing && password.length < 8) {
      setError(t.passwordShort)
      return
    }
    if (password && password !== confirmPassword) {
      setError(t.passwordMismatch)
      return
    }

    setIsSaving(true)
    setImageProgress({ profile: profileFile ? 0 : 100, banner: bannerFile ? 0 : 100 })
    try {
      if (isEditing && values.uid) {
        const [profilePhotoPath, bannerPath] = await Promise.all([
          profileFile ? uploadAccountImage(profileFile, 'profile', (progress) => setImageProgress((current) => ({ ...current, profile: progress }))) : Promise.resolve(values.profilePhotoPath),
          bannerFile ? uploadAccountImage(bannerFile, 'banner', (progress) => setImageProgress((current) => ({ ...current, banner: progress }))) : Promise.resolve(values.bannerPath),
        ])
        const payload = { ...values, profilePhotoPath, bannerPath: isAdminAccount ? bannerPath : undefined }
        await updateAccount({ ...payload, uid: values.uid, password: password || undefined })
        onComplete(t.saved)
      } else {
        const created = await createAccount({ ...values, profilePhotoPath: undefined, bannerPath: undefined, password })
        try {
          const [profilePhotoPath, bannerPath] = await Promise.all([
            profileFile ? uploadAccountImage(profileFile, 'profile', (progress) => setImageProgress((current) => ({ ...current, profile: progress }))) : Promise.resolve(undefined),
            isAdminAccount && bannerFile ? uploadAccountImage(bannerFile, 'banner', (progress) => setImageProgress((current) => ({ ...current, banner: progress }))) : Promise.resolve(undefined),
          ])
          if (profilePhotoPath || bannerPath) {
            await updateAccount({ ...values, uid: created.data.uid, profilePhotoPath, bannerPath, password: undefined })
          }
        } catch {
          onComplete(t.imageWarning)
          return
        }
        onComplete(t.saved)
      }
    } catch (saveError) {
      setError(readableFirebaseError(saveError))
    } finally {
      setIsSaving(false)
    }
  }

  const changeImage = (setter: (file: File | undefined) => void) => (event: ChangeEvent<HTMLInputElement>) => setter(event.target.files?.[0])

  return (
    <form className={joinClasses('account-form', uiClasses.card, 'grid gap-4 p-4')} onSubmit={submit}>
      <div className="account-form-heading flex items-center justify-between gap-4"><div><span>{isEditing ? t.edit : t.create}</span><h3 id="account-form-title">{isEditing ? initialUser?.fullName : t.create}</h3></div><ShieldCheck size={22} /></div>
      {error ? <p className="form-alert form-alert-error">{error}</p> : null}
      <div className="account-form-grid">
        {isSuperAdmin && !isEditing ? <label><span>{t.role}</span><select className={uiClasses.select} onChange={(event) => setField('role', event.target.value as AccountFormValues['role'])} value={values.role}><option value="admin">{t.admin}</option><option value="subMember">{t.subMember}</option></select></label> : null}
        <label><span>{t.fullName}</span><input className={uiClasses.input} onChange={(event) => setField('fullName', event.target.value)} required value={values.fullName} /></label>
        <label><span>{t.mobile}</span><input className={uiClasses.input} inputMode="tel" onChange={(event) => setField('mobile', event.target.value)} required value={values.mobile} /></label>
        <label><span>{t.email}</span><input className={uiClasses.input} disabled={isEditing && !isSuperAdmin} onChange={(event) => setField('email', event.target.value)} required type="email" value={values.email} /></label>
        {isSuperAdmin ? <label><span>{t.status}</span><select className={uiClasses.select} onChange={(event) => setField('status', event.target.value as AccountFormValues['status'])} value={values.status}><option value="active">{t.active}</option><option value="disabled">{t.disabled}</option></select></label> : null}
        <label><span>{t.deviceLimit}</span><select className={uiClasses.select} onChange={(event) => setField('deviceLimit', Number(event.target.value))} value={values.deviceLimit}>{[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count} {count === 1 ? t.device : t.devices}</option>)}</select><small>{t.deviceLimitHelp}</small></label>
        <label><span>{t.password}</span><span className="relative block"><input className={joinClasses(uiClasses.input, 'pr-10')} autoComplete="new-password" minLength={8} onChange={(event) => setPassword(event.target.value)} required={!isEditing} type={showPassword ? 'text' : 'password'} value={password} /><button aria-label={showPassword ? t.hidePassword : t.showPassword} aria-pressed={showPassword} className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-nav-active hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={() => setShowPassword((current) => !current)} type="button">{showPassword ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}</button></span><small>{isEditing ? t.passwordEditHelp : t.passwordHelp}</small></label>
        <label><span>{t.confirmPassword}</span><span className="relative block"><input className={joinClasses(uiClasses.input, 'pr-10')} autoComplete="new-password" minLength={8} onChange={(event) => setConfirmPassword(event.target.value)} required={!isEditing} type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} /><button aria-label={showConfirmPassword ? t.hidePassword : t.showPassword} aria-pressed={showConfirmPassword} className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-nav-active hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={() => setShowConfirmPassword((current) => !current)} type="button">{showConfirmPassword ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}</button></span></label>
      </div>

      <div className="image-inputs grid gap-3 tablet:grid-cols-2">
        <ImageInput file={profileFile} label={t.profilePhoto} onChange={changeImage(setProfileFile)} previewUrl={initialUser?.profilePhotoUrl} variant="profile" />
        {isAdminAccount ? <ImageInput file={bannerFile} label={t.banner} onChange={changeImage(setBannerFile)} previewUrl={initialUser?.bannerUrl} variant="banner" /> : null}
      </div>
      {isSaving && (profileFile || bannerFile) ? <div aria-live="polite" className="account-image-progress"><div><span style={{ width: `${Math.round(((profileFile ? imageProgress.profile : 100) + (bannerFile ? imageProgress.banner : 100)) / (Number(Boolean(profileFile)) + Number(Boolean(bannerFile))))}%` }} /></div><small>Uploading images… {Math.round(((profileFile ? imageProgress.profile : 100) + (bannerFile ? imageProgress.banner : 100)) / (Number(Boolean(profileFile)) + Number(Boolean(bannerFile))))}%</small></div> : null}

        {isAdminAccount ? (
        <fieldset className={joinClasses('account-scope', uiClasses.card, 'grid gap-3 p-4')}><legend>{t.wardAccess} & {t.boothAccess}</legend><div className="account-form-grid grid gap-3 tablet:grid-cols-2"><ScopeMultiSelect emptyText={t.noValues} helpText={t.selectOneOrMore} label={t.wardAccess} options={availableWardOptions} selected={values.scope.wardIds} onChange={handleWardChange} placeholder={t.wardAccess} /><ScopeMultiSelect emptyText={t.noValues} helpText={t.selectOneOrMore} label={t.boothAccess} options={availableBoothOptions} selected={values.scope.boothIds} onChange={(boothIds) => setField('scope', { ...values.scope, boothIds })} placeholder={t.boothAccess} /><small>{t.commaHelp}</small></div></fieldset>
      ) : (
        <fieldset className={joinClasses('account-scope', uiClasses.card, 'grid gap-3 p-4')}><legend>{t.parentAdmin}</legend><div className="account-form-grid grid gap-3 tablet:grid-cols-2">
          {isSuperAdmin ? <label><span>{t.parentAdmin}</span><select className={uiClasses.select} onChange={(event) => setValues((current) => ({ ...current, parentAdminId: event.target.value, scope: { wardIds: [], boothIds: [] } }))} required value={values.parentAdminId ?? ''}><option value="">{adminOptions.length ? 'Select Admin' : t.noAdmins}</option>{adminOptions.map((admin) => <option key={admin.uid} value={admin.uid}>{admin.fullName}</option>)}</select></label> : null}
          <ScopeMultiSelect emptyText={t.noValues} helpText={t.selectOneOrMore} label={t.assignedWard} options={availableWardOptions} selected={values.scope.wardIds} onChange={handleWardChange} placeholder={t.assignedWard} />
          <ScopeMultiSelect emptyText={t.noValues} helpText={t.selectOneOrMore} label={t.assignedBooth} options={availableBoothOptions} selected={values.scope.boothIds} onChange={(boothIds) => setField('scope', { ...values.scope, boothIds })} placeholder={t.assignedBooth} />
        </div></fieldset>
      )}

      {isAdminAccount ? <fieldset className={joinClasses('permissions-grid', uiClasses.card, 'grid gap-3 p-4')}><legend>{t.permissions}</legend><CheckBox checked={values.permissions.upload} label={t.upload} onChange={(checked) => setPermission('upload', checked)} /><CheckBox checked={values.permissions.edit} label={t.editPermission} onChange={(checked) => setPermission('edit', checked)} /><CheckBox checked={values.permissions.download} label={t.download} onChange={(checked) => setPermission('download', checked)} /><CheckBox checked={values.permissions.audit} label={t.audit} onChange={(checked) => setPermission('audit', checked)} /></fieldset> : null}

      <div className="account-form-actions flex flex-wrap justify-end gap-2"><button className={joinClasses('secondary-button', uiClasses.button, uiClasses.secondaryButton)} onClick={onCancel} type="button">{t.cancel}</button><button className={joinClasses('primary-button', uiClasses.button, uiClasses.primaryButton)} disabled={isSaving} type="submit">{isSaving ? '…' : t.save}</button></div>
    </form>
  )
}

function ImageInput({ file, label, onChange, previewUrl, variant }: { file?: File; label: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void; previewUrl?: string; variant: 'profile' | 'banner' }) {
  const filePreviewUrl = useMemo(() => file ? URL.createObjectURL(file) : undefined, [file])
  useEffect(() => () => { if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl) }, [filePreviewUrl])
  const imageUrl = filePreviewUrl ?? previewUrl
  return <label className={joinClasses('image-input', `image-input-${variant}`, uiClasses.card, 'cursor-pointer')}>
    <span className={joinClasses('image-input-preview-frame', `image-input-preview-${variant}`)}>{imageUrl ? <img alt={label} className="image-input-preview" src={imageUrl} /> : <span className="image-input-placeholder"><Camera size={18} /></span>}</span>
    <span className="image-input-copy"><strong>{label}</strong><small>{file?.name ?? (previewUrl ? 'Current image' : 'Optional image')}</small></span>
    <span className="image-input-action"><Camera size={15} /></span>
    <input accept="image/png,image/jpeg,image/webp" onChange={onChange} type="file" />
  </label>
}

function CheckBox({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className="permission-option"><input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span>{label}</span></label>
}

function ScopeMultiSelect({ emptyText, helpText, label, options, selected, onChange, placeholder }: { emptyText: string; helpText: string; label: string; options: string[]; selected: string[]; onChange: (values: string[]) => void; placeholder: string }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && !containerRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const toggleValue = (value: string) => onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value])
  return <div className="scope-multi-select grid min-w-0 gap-1" ref={containerRef}>
    <span className="scope-multi-select-label">{label}</span>
    <button aria-expanded={open} className={joinClasses('scope-multi-select-trigger', uiClasses.button, 'min-h-10 justify-between text-left text-sm', Boolean(selected.length) && 'has-value')} onClick={() => setOpen((current) => !current)} type="button"><span>{selected.length ? selected.join(', ') : placeholder}</span><ChevronDown size={15} /></button>
    {open ? <div className={joinClasses('scope-multi-select-options', uiClasses.menu)} role="listbox"><div className="scope-multi-select-help">{options.length ? helpText : emptyText}</div>{options.map((option) => <label className="scope-multi-select-option" key={option}><input checked={selected.includes(option)} onChange={() => toggleValue(option)} type="checkbox" /><span>{option}</span>{selected.includes(option) ? <Check size={14} /> : null}</label>)}</div> : null}
  </div>
}

function accountValues(user: DirectoryUser | undefined, isSuperAdmin: boolean, currentUserId: string): AccountFormValues {
  if (user) return { uid: user.uid, fullName: user.fullName, email: user.email, mobile: user.mobile, role: user.role === 'admin' ? 'admin' : 'subMember', status: user.status, parentAdminId: user.parentAdminId, scope: user.scope, permissions: user.permissions, profilePhotoPath: user.profilePhotoPath, bannerPath: user.bannerPath, deviceLimit: user.deviceLimit ?? 1 }
  return { fullName: '', email: '', mobile: '', role: isSuperAdmin ? 'admin' : 'subMember', status: 'active', parentAdminId: isSuperAdmin ? '' : currentUserId, scope: { wardIds: [], boothIds: [] }, permissions: emptyPermissions, deviceLimit: 1 }
}

function uniqueOptions(...lists: string[][]) { return [...new Set(lists.flat().filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) }
