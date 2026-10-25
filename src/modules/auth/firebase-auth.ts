import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage'
import { auth, db, firebaseConfigured, functions, storage } from '../../lib/firebase'
import { cachedRequest, clearRequestCache } from '../../lib/request-cache'
import type { AppSession, LoginRole, UserProfile } from './types'

type SessionEvent =
  | { state: 'signedOut'; message?: string }
  | { state: 'profileMissing' }
  | { state: 'signedIn'; session: AppSession }
  | { state: 'error'; message: string }

type CreateAccountRequest = {
  fullName: string
  email: string
  mobile: string
  role: 'admin' | 'subMember'
  status: 'active' | 'disabled'
  parentAdminId?: string
  scope: { wardIds: string[]; boothIds: string[] }
  permissions: { upload: boolean; edit: boolean; download: boolean; audit: boolean; reports: boolean }
  profilePhotoPath?: string
  bannerPath?: string
  deviceLimit: number
  password: string
}

type UpdateAccountRequest = Omit<CreateAccountRequest, 'password'> & { uid: string; password?: string }

type DeviceSessionResponse = { sessionToken: string; deviceLimit: number; activeDevices: number }
const deviceIdStorageKey = 'voter-space-device-id'
const deviceSessionStoragePrefix = 'voter-space-device-session:'
const heartbeatIntervalMs = 60 * 1000
let interactiveLoginAttempt: Promise<void> | undefined

function requireFirebase() {
  if (!firebaseConfigured || !auth || !db || !functions || !storage) {
    throw new Error('Firebase is not configured. Add the VITE_FIREBASE values before continuing.')
  }
  return { auth, db, functions, storage }
}

function profileFromFirestore(data: unknown): UserProfile {
  const profile = (data && typeof data === 'object' ? data : {}) as UserProfile
  return {
    ...profile,
    permissions: {
      upload: Boolean(profile.permissions?.upload),
      edit: Boolean(profile.permissions?.edit),
      download: profile.permissions?.download !== false,
      audit: Boolean(profile.permissions?.audit),
      reports: Boolean(profile.permissions?.reports),
    },
  }
}

export async function resolveStorageFileUrl(path?: string) {
  if (!path) return undefined
  return cachedRequest(`storage-url:${path}`, async () => {
    if (!storage) return undefined
    try {
      return await getDownloadURL(ref(storage, path))
    } catch {
      return undefined
    }
  }, { ttlMs: 15 * 60 * 1000 })
}

export function subscribeToSession(onChange: (event: SessionEvent) => void) {
  const firebaseAuth = auth
  const firestore = db
  if (!firebaseConfigured || !firebaseAuth || !firestore) {
    onChange({ state: 'signedOut' })
    return () => undefined
  }

  let unsubscribeProfile: () => void = () => {}
  let stopHeartbeat: () => void = () => {}
  let signOutMessage: string | undefined
  const unsubscribeAuth = onAuthStateChanged(firebaseAuth, (user) => {
    unsubscribeProfile()
    stopHeartbeat()
    if (!user) {
      onChange({ state: 'signedOut', message: signOutMessage })
      signOutMessage = undefined
      return
    }

    unsubscribeProfile = onSnapshot(
      doc(firestore, 'users', user.uid),
      async (snapshot) => {
        if (!snapshot.exists()) {
          signOutMessage = 'This login does not have a Voter Space profile yet.'
          void signOut(firebaseAuth)
          onChange({ state: 'profileMissing' })
          return
        }

        const profile = profileFromFirestore(snapshot.data())
        if (profile.status !== 'active') {
          signOutMessage = 'This account is disabled. Please contact the Super Admin.'
          void signOut(firebaseAuth)
          onChange({ state: 'error', message: 'This account is disabled. Please contact the Super Admin.' })
          return
        }
        try {
          if (interactiveLoginAttempt) await interactiveLoginAttempt
          if (firebaseAuth.currentUser?.uid !== user.uid) return
          await ensureDeviceSession(user.uid, profile)
        } catch (error) {
          signOutMessage = deviceSessionMessage(error)
          clearStoredDeviceSession(user.uid)
          await signOut(firebaseAuth)
          onChange({ state: 'signedOut', message: signOutMessage })
          return
        }
        stopHeartbeat()
        stopHeartbeat = startDeviceHeartbeat(user.uid, profile, async (error) => {
          signOutMessage = deviceSessionMessage(error)
          clearStoredDeviceSession(user.uid)
          await signOut(firebaseAuth)
          onChange({ state: 'signedOut', message: signOutMessage })
        })
        const [profilePhotoUrl, bannerUrl] = await Promise.all([
          resolveStorageFileUrl(profile.profilePhotoPath),
          resolveStorageFileUrl(profile.bannerPath),
        ])
        onChange({ state: 'signedIn', session: { uid: user.uid, profile, profilePhotoUrl, bannerUrl } })
      },
      () => onChange({ state: 'error', message: 'Your user profile could not be loaded.' }),
    )
  })

  return () => {
    stopHeartbeat()
    unsubscribeProfile()
    unsubscribeAuth()
  }
}

export function signInForRole(email: string, password: string, expectedRole: LoginRole, forceDeviceLogin = false) {
  const attempt = performRoleSignIn(email, password, expectedRole, forceDeviceLogin)
  interactiveLoginAttempt = attempt
  void attempt.then(
    () => { if (interactiveLoginAttempt === attempt) interactiveLoginAttempt = undefined },
    () => { if (interactiveLoginAttempt === attempt) interactiveLoginAttempt = undefined },
  )
  return attempt
}

async function performRoleSignIn(email: string, password: string, expectedRole: LoginRole, forceDeviceLogin: boolean) {
  const client = requireFirebase()
  const credential = await signInWithEmailAndPassword(client.auth, email.trim(), password)
  const profileSnapshot = await getDoc(doc(client.db, 'users', credential.user.uid))

  if (!profileSnapshot.exists()) {
    await signOut(client.auth)
    throw new Error('This login does not have a Voter Space profile yet.')
  }

  const profile = profileFromFirestore(profileSnapshot.data())
  if (profile.status !== 'active') {
    await signOut(client.auth)
    throw new Error('This account is disabled. Please contact the Super Admin.')
  }

  if (profile.role !== expectedRole) {
    await signOut(client.auth)
    throw new Error(`Please use the ${roleName(profile.role)} login.`)
  }

  try {
    await claimAndStoreDeviceSession(credential.user.uid, profile, forceDeviceLogin)
  } catch (error) {
    clearStoredDeviceSession(credential.user.uid)
    await signOut(client.auth)
    throw error
  }
}

export async function signOutUser() {
  if (!auth) return
  const uid = auth.currentUser?.uid
  if (uid && functions) {
    const sessionToken = localStorage.getItem(deviceSessionKey(uid))
    if (sessionToken) {
      const release = httpsCallable<{ deviceId: string; sessionToken: string }, { released: boolean }>(functions, 'releaseDeviceSession')
      await release({ deviceId: getDeviceId(), sessionToken }).catch(() => undefined)
    }
    clearStoredDeviceSession(uid)
  }
  await signOut(auth)
  clearRequestCache()
}

export async function uploadAccountImage(file: File, kind: 'profile' | 'banner', onProgress?: (progress: number) => void) {
  const client = requireFirebase()
  const user = client.auth.currentUser
  if (!user) throw new Error('Please sign in again before uploading an image.')

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80)
  const requestId = crypto.randomUUID()
  const path = `user-media/${user.uid}/${requestId}/${kind}-${safeName}`
  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(ref(client.storage, path), file, { contentType: file.type })
    task.on('state_changed', (snapshot) => {
      onProgress?.(snapshot.totalBytes ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0)
    }, reject, resolve)
  })
  onProgress?.(100)
  return path
}

export async function updateOwnProfileMedia(payload: { profilePhotoPath?: string; bannerPath?: string }) {
  const client = requireFirebase()
  const updateMedia = httpsCallable<typeof payload, { uid: string }>(client.functions, 'updateOwnProfileMedia')
  return updateMedia(payload)
}

export async function createAccount(payload: CreateAccountRequest) {
  const client = requireFirebase()
  const createUserAccount = httpsCallable<CreateAccountRequest, { uid: string }>(client.functions, 'createUserAccount')
  return createUserAccount(payload)
}

export async function updateAccount(payload: UpdateAccountRequest) {
  const client = requireFirebase()
  const updateUserAccount = httpsCallable<UpdateAccountRequest, { uid: string }>(client.functions, 'updateUserAccount')
  return updateUserAccount(payload)
}

export async function deleteAccount(uid: string) {
  const client = requireFirebase()
  const deleteUserAccount = httpsCallable<{ uid: string }, { uid: string }>(client.functions, 'deleteUserAccount')
  return deleteUserAccount({ uid })
}

export async function sendAccountPasswordReset(email: string) {
  const client = requireFirebase()
  await sendPasswordResetEmail(client.auth, email)
}

export async function recordPasswordReset(userId: string) {
  const client = requireFirebase()
  const logPasswordResetRequest = httpsCallable<{ userId: string }, { userId: string }>(client.functions, 'logPasswordResetRequest')
  await logPasswordResetRequest({ userId })
}

async function claimAndStoreDeviceSession(uid: string, profile: UserProfile, force: boolean) {
  if (profile.role === 'superAdmin') return
  const client = requireFirebase()
  const claim = httpsCallable<{ deviceId: string; deviceLabel: string; force: boolean }, DeviceSessionResponse>(client.functions, 'claimDeviceSession')
  const response = await claim({ deviceId: getDeviceId(), deviceLabel: describeDevice(), force })
  localStorage.setItem(deviceSessionKey(uid), response.data.sessionToken)
}

async function ensureDeviceSession(uid: string, profile: UserProfile) {
  if (profile.role === 'superAdmin') return
  const client = requireFirebase()
  const sessionToken = localStorage.getItem(deviceSessionKey(uid))
  if (!sessionToken) {
    await claimAndStoreDeviceSession(uid, profile, false)
    return
  }
  const heartbeat = httpsCallable<{ deviceId: string; sessionToken: string }, { active: boolean }>(client.functions, 'heartbeatDeviceSession')
  try {
    await heartbeat({ deviceId: getDeviceId(), sessionToken })
  } catch (error) {
    if (!isEndedDeviceSession(error)) throw error
    clearStoredDeviceSession(uid)
    await claimAndStoreDeviceSession(uid, profile, false)
  }
}

function startDeviceHeartbeat(uid: string, profile: UserProfile, onRejected: (error: unknown) => void | Promise<void>) {
  if (profile.role === 'superAdmin') return () => undefined
  let running = false
  const timer = window.setInterval(() => {
    if (running) return
    running = true
    void ensureDeviceSession(uid, profile).catch((error) => {
      if (isDeviceLimitError(error) || isEndedDeviceSession(error)) return onRejected(error)
      return undefined
    }).finally(() => { running = false })
  }, heartbeatIntervalMs)
  return () => window.clearInterval(timer)
}

function getDeviceId() {
  const saved = localStorage.getItem(deviceIdStorageKey)
  if (saved && /^[a-zA-Z0-9-]{12,100}$/.test(saved)) return saved
  const created = crypto.randomUUID()
  localStorage.setItem(deviceIdStorageKey, created)
  return created
}

function describeDevice() {
  const agent = navigator.userAgent
  if (/android/i.test(agent)) return 'Android device'
  if (/iphone|ipad|ipod/i.test(agent)) return 'Apple mobile device'
  if (/windows/i.test(agent)) return 'Windows device'
  if (/macintosh/i.test(agent)) return 'Mac device'
  if (/linux/i.test(agent)) return 'Linux device'
  return 'Web browser'
}

function deviceSessionKey(uid: string) {
  return `${deviceSessionStoragePrefix}${uid}`
}

function clearStoredDeviceSession(uid: string) {
  localStorage.removeItem(deviceSessionKey(uid))
}

function firebaseErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''
}

function firebaseErrorReason(error: unknown) {
  if (!error || typeof error !== 'object' || !('details' in error)) return ''
  const details = (error as { details?: unknown }).details
  return details && typeof details === 'object' && 'reason' in details ? String((details as { reason?: unknown }).reason ?? '') : ''
}

export function isDeviceLimitError(error: unknown) {
  return firebaseErrorReason(error) === 'device-limit' || firebaseErrorCode(error) === 'functions/resource-exhausted' || (error instanceof Error && error.message.includes('already logged in on another device'))
}

function isEndedDeviceSession(error: unknown) {
  return firebaseErrorReason(error) === 'device-session-ended' || (firebaseErrorCode(error) === 'functions/failed-precondition' && error instanceof Error && error.message.includes('device session'))
}

function deviceSessionMessage(error: unknown) {
  if (isDeviceLimitError(error) || isEndedDeviceSession(error)) return 'DEVICE_SESSION_ENDED'
  return readableFirebaseError(error)
}

function roleName(role: LoginRole) {
  if (role === 'superAdmin') return 'Super Admin'
  if (role === 'subMember') return 'Sub-member'
  return 'Admin'
}

export function readableFirebaseError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.'
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''
  if (message.includes('auth/invalid-credential')) return 'Email or password is not correct.'
  if (code === 'auth/email-already-in-use' || message.includes('auth/email-already-in-use')) return 'An account already exists with this email.'
  if (message.includes('auth/too-many-requests')) return 'Too many attempts. Please wait and try again.'
  if (isDeviceLimitError(error)) return 'This account is already logged in on another device.'
  if (code === 'functions/permission-denied' || message.includes('functions/permission-denied')) return 'You do not have permission for this action.'
  if (code === 'functions/unauthenticated' || message.includes('functions/unauthenticated')) return 'Your login has expired. Please sign in again.'
  if (code === 'functions/invalid-argument' || message.includes('functions/invalid-argument')) return message.replace(/^FirebaseError:\s*/i, '')
  if (code === 'functions/failed-precondition' || message.includes('functions/failed-precondition')) return message.replace(/^FirebaseError:\s*/i, '')
  if (code === 'functions/already-exists' || message.includes('functions/already-exists')) return 'An account already exists with this email.'
  if (code === 'functions/internal' || message.includes('INTERNAL')) return 'Firebase server error. Deploy the latest Functions and try again.'
  if (message.includes('permission-denied')) return 'You do not have permission for this action.'
  return message
}
