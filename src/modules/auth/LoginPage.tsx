import { Eye, EyeOff, KeyRound, Mail, ShieldCheck, UserCog, UsersRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { firebaseConfigured } from '../../lib/firebase'
import type { AppLanguage } from '../app-shell/types'
import { readableFirebaseError, signInForRole } from './firebase-auth'
import type { LoginRole } from './types'

type LoginPageProps = {
  language: AppLanguage
  message?: string
  onLanguageChange: (language: AppLanguage) => void
}

const loginCopy = {
  te: {
    welcome: 'వోటర్ స్పేస్‌కు స్వాగతం',
    description: 'మీ ఖాతా పాత్రను ఎంచుకుని సురక్షితంగా లాగిన్ అవ్వండి.',
    email: 'లాగిన్ ఇమెయిల్',
    password: 'పాస్‌వర్డ్',
    signIn: 'లాగిన్ అవ్వండి',
    signInAs: 'లాగిన్ రకం',
    firebaseMissing: 'Firebase సెట్టింగులు ఇంకా జోడించలేదు. .env.local లో VITE_FIREBASE వివరాలు ఇవ్వండి.',
    roles: {
      superAdmin: { title: 'సూపర్ అడ్మిన్', description: 'అన్ని వార్డులు, ఖాతాలు మరియు అనుమతులు' },
      admin: { title: 'అడ్మిన్', description: 'అనుమతించిన వార్డులు మరియు సబ్-మెంబర్లు' },
      subMember: { title: 'సబ్-మెంబర్', description: 'కేటాయించిన వార్డు మరియు బూత్ మాత్రమే' },
    },
  },
  en: {
    welcome: 'Welcome to Voter Space',
    description: 'Choose your account type and sign in securely.',
    email: 'Login email',
    password: 'Password',
    signIn: 'Sign in',
    signInAs: 'Login type',
    firebaseMissing: 'Firebase settings are not ready. Add VITE_FIREBASE values to .env.local.',
    roles: {
      superAdmin: { title: 'Super Admin', description: 'All wards, accounts, and permissions' },
      admin: { title: 'Admin', description: 'Allowed wards and sub-members' },
      subMember: { title: 'Sub-member', description: 'Assigned ward and booth only' },
    },
  },
} as const

const roles: Array<{ role: LoginRole; icon: typeof ShieldCheck }> = [
  { role: 'superAdmin', icon: ShieldCheck },
  { role: 'admin', icon: UserCog },
  { role: 'subMember', icon: UsersRound },
]

export function LoginPage({ language, message, onLanguageChange }: LoginPageProps) {
  const [selectedRole, setSelectedRole] = useState<LoginRole>('superAdmin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(message)
  const t = loginCopy[language]

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(undefined)
    setIsSubmitting(true)
    try {
      await signInForRole(email, password, selectedRole)
    } catch (signInError) {
      setError(readableFirebaseError(signInError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <header className="auth-heading">
          <div className="auth-brand"><span>VS</span><strong>వోటర్ స్పేస్</strong></div>
          <select aria-label="Language" value={language} onChange={(event) => onLanguageChange(event.target.value as AppLanguage)}>
            <option value="te">తెలుగు</option>
            <option value="en">English</option>
          </select>
        </header>

        <div className="auth-intro">
          <p>VOTER SPACE</p>
          <h1>{t.welcome}</h1>
          <span>{t.description}</span>
        </div>

        <div className="login-role-grid" aria-label={t.signInAs}>
          {roles.map(({ role, icon: Icon }) => (
            <button
              className={selectedRole === role ? 'is-selected' : ''}
              key={role}
              onClick={() => setSelectedRole(role)}
              type="button"
            >
              <Icon size={19} />
              <strong>{t.roles[role].title}</strong>
              <span>{t.roles[role].description}</span>
            </button>
          ))}
        </div>

        {!firebaseConfigured ? <p className="form-alert form-alert-error">{t.firebaseMissing}</p> : null}
        {error ? <p className="form-alert form-alert-error">{error}</p> : null}

        <form className="login-form" onSubmit={submit}>
          <label>
            <span>{t.email}</span>
            <div className="field-with-icon"><Mail size={17} /><input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></div>
          </label>
          <label>
            <span>{t.password}</span>
            <div className="field-with-icon">
              <KeyRound size={17} />
              <input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type={showPassword ? 'text' : 'password'} value={password} />
              <button aria-label="Show or hide password" onClick={() => setShowPassword((show) => !show)} type="button">
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          <button className="primary-button" disabled={isSubmitting || !firebaseConfigured} type="submit">
            {isSubmitting ? '…' : t.signIn}
          </button>
        </form>
      </section>
    </main>
  )
}
