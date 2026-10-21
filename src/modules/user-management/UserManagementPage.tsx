import { Camera, Check, CheckCircle2, ChevronDown, Pencil, Plus, ShieldCheck, UserRound, XCircle } from 'lucide-react'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { db } from '../../lib/firebase'
import type { AppLanguage } from '../app-shell/types'
import { joinClasses, uiClasses } from '../app-shell/ui'
import './user-management.css'
import { createAccount, readableFirebaseError, resolveStorageFileUrl, updateAccount, uploadAccountImage } from '../auth/firebase-auth'
import { emptyPermissions, type AccountFormValues, type AppSession, type UserProfile } from '../auth/types'
import { loadVoterFilterOptions } from '../voter-register/voter-service'

type DirectoryUser = UserProfile & { uid: string; profilePhotoUrl?: string; bannerUrl?: string }

type UserManagementPageProps = {
  language: AppLanguage
  session: AppSession
}

const pageCopy = {
  te: {
    label: 'ఖాతాల నిర్వహణ', title: 'వినియోగదారుల నిర్వహణ', description: 'మీ పాత్రకు అనుగుణంగా ఖాతాలను సృష్టించండి మరియు నిర్వహించండి.',
    create: 'కొత్త ఖాతా', edit: 'ఖాతా సవరించండి', fullName: 'పూర్తి పేరు', mobile: 'మొబైల్ నంబర్', email: 'లాగిన్ ఇమెయిల్',
    role: 'పాత్ర', admin: 'అడ్మిన్', subMember: 'సబ్-మెంబర్', status: 'ఖాతా స్థితి', active: 'యాక్టివ్', disabled: 'డిసేబుల్',
    profilePhoto: 'ప్రొఫైల్ ఫోటో', banner: 'అడ్మిన్ బ్యానర్', parentAdmin: 'పేరెంట్ అడ్మిన్', wardAccess: 'అనుమతించిన వార్డులు', boothAccess: 'అనుమతించిన బూత్‌లు',
    assignedWard: 'కేటాయించిన వార్డులు', assignedBooth: 'కేటాయించిన బూత్‌లు', permissions: 'అడ్మిన్ అనుమతులు', upload: 'PDF అప్‌లోడ్', editPermission: 'డేటా సవరింపు', download: 'డౌన్‌లోడ్', audit: 'సొంత ఆడిట్ కార్యకలాపాలు',
    password: 'లాగిన్ పాస్‌వర్డ్', confirmPassword: 'పాస్‌వర్డ్ నిర్ధారించండి', passwordHelp: 'కనీసం 8 అక్షరాలు. సృష్టించిన ఖాతా ఇదే పాస్‌వర్డ్‌తో లాగిన్ అవుతుంది.', passwordEditHelp: 'మార్చాల్సిన అవసరం లేకపోతే ఖాళీగా ఉంచండి.', passwordMismatch: 'రెండు పాస్‌వర్డ్‌లు ఒకేలా ఉండాలి.', passwordShort: 'పాస్‌వర్డ్‌లో కనీసం 8 అక్షరాలు ఉండాలి.', save: 'ఖాతా సేవ్ చేయండి', cancel: 'రద్దు', editAccount: 'సవరించండి', disable: 'యాక్సెస్ తొలగించండి', enable: 'యాక్సెస్ ఇవ్వండి',
    deviceLimit: 'అనుమతించిన డివైస్‌లు', deviceLimitHelp: 'ఈ ఖాతా ఒకేసారి ఎన్ని డివైస్‌లలో లాగిన్ కావచ్చో ఎంచుకోండి.', device: 'డివైస్', devices: 'డివైస్‌లు',
    ownMembers: 'మీ సబ్-మెంబర్లు మాత్రమే కనిపిస్తారు.', noUsers: 'ఇంకా వినియోగదారులు లేరు.', saved: 'ఖాతా సేవ్ అయింది. ఈ ఫారమ్‌లో ఇచ్చిన పాస్‌వర్డ్‌తో యూజర్ లాగిన్ అవ్వవచ్చు.',
    commaHelp: 'డేటాబేస్‌లో ఉన్న వార్డులు మరియు బూత్‌లను ఇక్కడ ఎంచుకోండి.', selectOneOrMore: 'ఒకటి లేదా అంతకంటే ఎక్కువ ఎంచుకోండి', noValues: 'ఇంకా విలువలు అందుబాటులో లేవు', noAdmins: 'ముందుగా ఒక అడ్మిన్ ఖాతాను సృష్టించండి.', imageWarning: 'ఖాతా సృష్టించబడింది. చిత్రం సేవ్ కాలేదు; ఈ ఖాతాను సవరించి మళ్లీ చిత్రాన్ని ఎంచుకోండి.',
  },
  en: {
    label: 'Account management', title: 'User management', description: 'Create and manage accounts within your role.',
    create: 'New account', edit: 'Edit account', fullName: 'Full name', mobile: 'Mobile number', email: 'Login email',
    role: 'Role', admin: 'Admin', subMember: 'Sub-member', status: 'Account status', active: 'Active', disabled: 'Disabled',
    profilePhoto: 'Profile photo', banner: 'Admin banner', parentAdmin: 'Parent Admin', wardAccess: 'Allowed wards', boothAccess: 'Allowed booths',
    assignedWard: 'Assigned wards', assignedBooth: 'Assigned booths', permissions: 'Admin permissions', upload: 'PDF upload', editPermission: 'Edit data', download: 'Download', audit: 'Own audit activity',
    password: 'Login password', confirmPassword: 'Confirm password', passwordHelp: 'At least 8 characters. The new account will log in with this password.', passwordEditHelp: 'Leave blank if the password should stay unchanged.', passwordMismatch: 'Both passwords must match.', passwordShort: 'Password must contain at least 8 characters.', save: 'Save account', cancel: 'Cancel', editAccount: 'Edit', disable: 'Remove access', enable: 'Enable access',
    deviceLimit: 'Allowed devices', deviceLimitHelp: 'Choose how many devices can use this account at the same time.', device: 'device', devices: 'devices',
    ownMembers: 'Only your own sub-members are shown.', noUsers: 'There are no users yet.', saved: 'Account saved. The user can log in with the password entered in this form.',
    commaHelp: 'Select the wards and booths available in the database.', selectOneOrMore: 'Select one or more', noValues: 'No values are available yet', noAdmins: 'Create an Admin account first.', imageWarning: 'The account was created, but an image was not saved. Edit this account and select the image again.',
  },
} as const

export function UserManagementPage({ language, session }: UserManagementPageProps) {
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [directoryError, setDirectoryError] = useState<string>()
  const [editingUser, setEditingUser] = useState<DirectoryUser>()
  const [showForm, setShowForm] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [scopeOptions, setScopeOptions] = useState({ wards: [] as string[], booths: [] as string[] })
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
        const profiles = snapshot.docs.map((item) => ({ uid: item.id, ...(item.data() as UserProfile) }))
        void Promise.all(profiles.map(async (profile) => ({
          ...profile,
          profilePhotoUrl: await resolveStorageFileUrl(profile.profilePhotoPath),
          bannerUrl: await resolveStorageFileUrl(profile.bannerPath),
        }))).then((resolved) => {
          if (!active) return
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
    let active = true
    void loadVoterFilterOptions().then((options) => {
      if (active) setScopeOptions({ wards: options.wards, booths: options.booths })
    }).catch(() => {
      if (active) setScopeOptions({ wards: [], booths: [] })
    })
    return () => { active = false }
  }, [session.uid])

  const adminOptions = useMemo(() => users.filter((user) => user.role === 'admin'), [users])
  const editableUsers = isSuperAdmin ? users.filter((user) => user.uid !== session.uid) : users

  const refreshScopeOptions = () => {
    void loadVoterFilterOptions().then((options) => setScopeOptions({ wards: options.wards, booths: options.booths })).catch(() => setScopeOptions({ wards: [], booths: [] }))
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
      <header className="page-intro user-management-intro flex items-start justify-between gap-4">
        <div>
          <p>{t.label}</p><h2>{t.title}</h2><span>{t.description}</span>
        </div>
        <button className={joinClasses('primary-button', uiClasses.button, uiClasses.primaryButton)} onClick={startCreate} type="button"><Plus size={17} />{t.create}</button>
      </header>

      {!isSuperAdmin ? <p className="form-alert form-alert-info">{t.ownMembers}</p> : null}
      {notice ? <p className="form-alert form-alert-info">{notice}</p> : null}
      {directoryError ? <p className="form-alert form-alert-error">{directoryError}</p> : null}

      {showForm ? (
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
      ) : null}

      <div className={joinClasses('user-list-card', uiClasses.card, 'overflow-hidden')}>
        {loadingUsers ? <p aria-live="polite" className="user-list-loading"><span aria-hidden="true" className="loading-dots">•••</span>{language === 'te' ? 'వినియోగదారుల వివరాలు లోడ్ అవుతున్నాయి…' : 'Loading user accounts…'}</p> : editableUsers.length === 0 ? <p className="user-list-empty">{t.noUsers}</p> : null}
        {editableUsers.map((user) => (
            <article className="user-row bg-surface" key={user.uid}>
            {user.bannerUrl ? <img alt="" className="user-row-banner" src={user.bannerUrl} /> : null}
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

type AccountFormProps = {
  adminOptions: DirectoryUser[]
  initialUser?: DirectoryUser
  language: AppLanguage
  onCancel: () => void
  onComplete: (message: string) => void
  session: AppSession
  scopeOptions: { wards: string[]; booths: string[] }
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
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string>()
  const isAdminAccount = values.role === 'admin'
  const parentScope = useMemo(() => {
    if (isAdminAccount) return undefined
    if (values.parentAdminId === session.uid) return session.profile.scope
    return adminOptions.find((admin) => admin.uid === values.parentAdminId)?.scope
  }, [adminOptions, isAdminAccount, session.profile.scope, session.uid, values.parentAdminId])
  const availableWardOptions = useMemo(() => uniqueOptions(isAdminAccount ? scopeOptions.wards : parentScope?.wardIds ?? [], values.scope.wardIds), [isAdminAccount, parentScope?.wardIds, scopeOptions.wards, values.scope.wardIds])
  const availableBoothOptions = useMemo(() => uniqueOptions(isAdminAccount ? scopeOptions.booths : parentScope?.boothIds ?? [], values.scope.boothIds), [isAdminAccount, parentScope?.boothIds, scopeOptions.booths, values.scope.boothIds])

  const setField = <Key extends keyof AccountFormValues>(key: Key, value: AccountFormValues[Key]) => setValues((current) => ({ ...current, [key]: value }))
  const setPermission = (key: keyof AccountFormValues['permissions'], checked: boolean) => setValues((current) => ({ ...current, permissions: { ...current.permissions, [key]: checked } }))

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
    try {
      if (isEditing && values.uid) {
        const [profilePhotoPath, bannerPath] = await Promise.all([
          profileFile ? uploadAccountImage(profileFile, 'profile') : Promise.resolve(values.profilePhotoPath),
          bannerFile ? uploadAccountImage(bannerFile, 'banner') : Promise.resolve(values.bannerPath),
        ])
        const payload = { ...values, profilePhotoPath, bannerPath: isAdminAccount ? bannerPath : undefined }
        await updateAccount({ ...payload, uid: values.uid, password: password || undefined })
        onComplete(t.saved)
      } else {
        const created = await createAccount({ ...values, profilePhotoPath: undefined, bannerPath: undefined, password })
        try {
          const [profilePhotoPath, bannerPath] = await Promise.all([
            profileFile ? uploadAccountImage(profileFile, 'profile') : Promise.resolve(undefined),
            isAdminAccount && bannerFile ? uploadAccountImage(bannerFile, 'banner') : Promise.resolve(undefined),
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
      <div className="account-form-heading flex items-center justify-between gap-4"><div><span>{isEditing ? t.edit : t.create}</span><h3>{isEditing ? initialUser?.fullName : t.create}</h3></div><ShieldCheck size={22} /></div>
      {error ? <p className="form-alert form-alert-error">{error}</p> : null}
      <div className="account-form-grid">
        {isSuperAdmin && !isEditing ? <label><span>{t.role}</span><select className={uiClasses.select} onChange={(event) => setField('role', event.target.value as AccountFormValues['role'])} value={values.role}><option value="admin">{t.admin}</option><option value="subMember">{t.subMember}</option></select></label> : null}
        <label><span>{t.fullName}</span><input className={uiClasses.input} onChange={(event) => setField('fullName', event.target.value)} required value={values.fullName} /></label>
        <label><span>{t.mobile}</span><input className={uiClasses.input} inputMode="tel" onChange={(event) => setField('mobile', event.target.value)} required value={values.mobile} /></label>
        <label><span>{t.email}</span><input className={uiClasses.input} disabled={isEditing && !isSuperAdmin} onChange={(event) => setField('email', event.target.value)} required type="email" value={values.email} /></label>
        {isSuperAdmin ? <label><span>{t.status}</span><select className={uiClasses.select} onChange={(event) => setField('status', event.target.value as AccountFormValues['status'])} value={values.status}><option value="active">{t.active}</option><option value="disabled">{t.disabled}</option></select></label> : null}
        <label><span>{t.deviceLimit}</span><select className={uiClasses.select} onChange={(event) => setField('deviceLimit', Number(event.target.value))} value={values.deviceLimit}>{[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count} {count === 1 ? t.device : t.devices}</option>)}</select><small>{t.deviceLimitHelp}</small></label>
        <label><span>{t.password}</span><input className={uiClasses.input} autoComplete={isEditing ? 'new-password' : 'new-password'} minLength={8} onChange={(event) => setPassword(event.target.value)} required={!isEditing} type="password" value={password} /><small>{isEditing ? t.passwordEditHelp : t.passwordHelp}</small></label>
        <label><span>{t.confirmPassword}</span><input className={uiClasses.input} autoComplete="new-password" minLength={8} onChange={(event) => setConfirmPassword(event.target.value)} required={!isEditing} type="password" value={confirmPassword} /></label>
      </div>

      <div className="image-inputs grid gap-3 tablet:grid-cols-2">
        <ImageInput file={profileFile} label={t.profilePhoto} onChange={changeImage(setProfileFile)} previewUrl={initialUser?.profilePhotoUrl} />
        {isAdminAccount ? <ImageInput file={bannerFile} label={t.banner} onChange={changeImage(setBannerFile)} previewUrl={initialUser?.bannerUrl} /> : null}
      </div>

        {isAdminAccount ? (
        <fieldset className={joinClasses('account-scope', uiClasses.card, 'grid gap-3 p-4')}><legend>{t.wardAccess} & {t.boothAccess}</legend><div className="account-form-grid grid gap-3 tablet:grid-cols-2"><ScopeMultiSelect emptyText={t.noValues} helpText={t.selectOneOrMore} label={t.wardAccess} options={availableWardOptions} selected={values.scope.wardIds} onChange={(wardIds) => setField('scope', { ...values.scope, wardIds })} placeholder={t.wardAccess} /><ScopeMultiSelect emptyText={t.noValues} helpText={t.selectOneOrMore} label={t.boothAccess} options={availableBoothOptions} selected={values.scope.boothIds} onChange={(boothIds) => setField('scope', { ...values.scope, boothIds })} placeholder={t.boothAccess} /><small>{t.commaHelp}</small></div></fieldset>
      ) : (
        <fieldset className={joinClasses('account-scope', uiClasses.card, 'grid gap-3 p-4')}><legend>{t.parentAdmin}</legend><div className="account-form-grid grid gap-3 tablet:grid-cols-2">
          {isSuperAdmin ? <label><span>{t.parentAdmin}</span><select className={uiClasses.select} onChange={(event) => setValues((current) => ({ ...current, parentAdminId: event.target.value, scope: { wardIds: [], boothIds: [] } }))} required value={values.parentAdminId ?? ''}><option value="">{adminOptions.length ? 'Select Admin' : t.noAdmins}</option>{adminOptions.map((admin) => <option key={admin.uid} value={admin.uid}>{admin.fullName}</option>)}</select></label> : null}
          <ScopeMultiSelect emptyText={t.noValues} helpText={t.selectOneOrMore} label={t.assignedWard} options={availableWardOptions} selected={values.scope.wardIds} onChange={(wardIds) => setField('scope', { ...values.scope, wardIds })} placeholder={t.assignedWard} />
          <ScopeMultiSelect emptyText={t.noValues} helpText={t.selectOneOrMore} label={t.assignedBooth} options={availableBoothOptions} selected={values.scope.boothIds} onChange={(boothIds) => setField('scope', { ...values.scope, boothIds })} placeholder={t.assignedBooth} />
        </div></fieldset>
      )}

      {isAdminAccount ? <fieldset className={joinClasses('permissions-grid', uiClasses.card, 'grid gap-3 p-4')}><legend>{t.permissions}</legend><CheckBox checked={values.permissions.upload} label={t.upload} onChange={(checked) => setPermission('upload', checked)} /><CheckBox checked={values.permissions.edit} label={t.editPermission} onChange={(checked) => setPermission('edit', checked)} /><CheckBox checked={values.permissions.download} label={t.download} onChange={(checked) => setPermission('download', checked)} /><CheckBox checked={values.permissions.audit} label={t.audit} onChange={(checked) => setPermission('audit', checked)} /></fieldset> : null}

      <div className="account-form-actions flex flex-wrap justify-end gap-2"><button className={joinClasses('secondary-button', uiClasses.button, uiClasses.secondaryButton)} onClick={onCancel} type="button">{t.cancel}</button><button className={joinClasses('primary-button', uiClasses.button, uiClasses.primaryButton)} disabled={isSaving} type="submit">{isSaving ? '…' : t.save}</button></div>
    </form>
  )
}

function ImageInput({ file, label, onChange, previewUrl }: { file?: File; label: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void; previewUrl?: string }) {
  return <label className={joinClasses('image-input', uiClasses.card, 'cursor-pointer')}>{previewUrl ? <img alt="" className="image-input-preview" src={previewUrl} /> : <span className={joinClasses('image-input-icon', uiClasses.iconBadge)}><Camera size={18} /></span>}<span><strong>{label}</strong><small>{file?.name ?? (previewUrl ? 'Current image' : 'Optional image')}</small></span><input accept="image/png,image/jpeg,image/webp" onChange={onChange} type="file" /></label>
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
