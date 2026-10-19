import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, db, firebaseConfigured, functions, storage } from '../../lib/firebase'
import type { AppSession, LoginRole, UserProfile } from './types'

type SessionEvent =
  | { state: 'signedOut' }
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
  permissions: { upload: boolean; edit: boolean; download: boolean; audit: boolean }
  profilePhotoPath?: string
  bannerPath?: string
  password: string
}

type UpdateAccountRequest = Omit<CreateAccountRequest, 'password'> & { uid: string; password?: string }

function requireFirebase() {
  if (!firebaseConfigured || !auth || !db || !functions || !storage) {
    throw new Error('Firebase is not configured. Add the VITE_FIREBASE values before continuing.')
  }
  return { auth, db, functions, storage }
}

function profileFromFirestore(data: unknown): UserProfile {
  return data as UserProfile
}

export async function resolveStorageFileUrl(path?: string) {
  if (!path || !storage) return undefined
  try {
    return await getDownloadURL(ref(storage, path))
  } catch {
    return undefined
  }
}

export function subscribeToSession(onChange: (event: SessionEvent) => void) {
  const firebaseAuth = auth
  const firestore = db
  if (!firebaseConfigured || !firebaseAuth || !firestore) {
    onChange({ state: 'signedOut' })
    return () => undefined
  }

  let unsubscribeProfile: () => void = () => {}
  const unsubscribeAuth = onAuthStateChanged(firebaseAuth, (user) => {
    unsubscribeProfile()
    if (!user) {
      onChange({ state: 'signedOut' })
      return
    }

    unsubscribeProfile = onSnapshot(
      doc(firestore, 'users', user.uid),
      async (snapshot) => {
        if (!snapshot.exists()) {
          void signOut(firebaseAuth)
          onChange({ state: 'profileMissing' })
          return
        }

        const profile = profileFromFirestore(snapshot.data())
        if (profile.status !== 'active') {
          void signOut(firebaseAuth)
          onChange({ state: 'error', message: 'This account is disabled. Please contact the Super Admin.' })
          return
        }
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
    unsubscribeProfile()
    unsubscribeAuth()
  }
}

export async function signInForRole(email: string, password: string, expectedRole: LoginRole) {
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
}

export async function signOutUser() {
  if (auth) await signOut(auth)
}

export async function uploadAccountImage(file: File, kind: 'profile' | 'banner') {
  const client = requireFirebase()
  const user = client.auth.currentUser
  if (!user) throw new Error('Please sign in again before uploading an image.')

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80)
  const requestId = crypto.randomUUID()
  const path = `user-media/${user.uid}/${requestId}/${kind}-${safeName}`
  await uploadBytes(ref(client.storage, path), file, { contentType: file.type })
  return path
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

export async function sendAccountPasswordReset(email: string) {
  const client = requireFirebase()
  await sendPasswordResetEmail(client.auth, email)
}

export async function recordPasswordReset(userId: string) {
  const client = requireFirebase()
  const logPasswordResetRequest = httpsCallable<{ userId: string }, { userId: string }>(client.functions, 'logPasswordResetRequest')
  await logPasswordResetRequest({ userId })
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
  if (code === 'functions/permission-denied' || message.includes('functions/permission-denied')) return 'You do not have permission for this action.'
  if (code === 'functions/unauthenticated' || message.includes('functions/unauthenticated')) return 'Your login has expired. Please sign in again.'
  if (code === 'functions/invalid-argument' || message.includes('functions/invalid-argument')) return message.replace(/^FirebaseError:\s*/i, '')
  if (code === 'functions/failed-precondition' || message.includes('functions/failed-precondition')) return message.replace(/^FirebaseError:\s*/i, '')
  if (code === 'functions/already-exists' || message.includes('functions/already-exists')) return 'An account already exists with this email.'
  if (code === 'functions/internal' || message.includes('INTERNAL')) return 'Firebase server error. Deploy the latest Functions and try again.'
  if (message.includes('permission-denied')) return 'You do not have permission for this action.'
  return message
}
