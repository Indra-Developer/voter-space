import { Eye, EyeOff, Info, KeyRound, Mail, MessageCircle, Phone, ShieldCheck, UserCog, UsersRound, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import logoAsset from '../../assets/voter-space-logo.jpg'
import { firebaseConfigured } from '../../lib/firebase'
import type { AppLanguage } from '../app-shell/types'
import { isDeviceLimitError, readableFirebaseError, signInForRole } from './firebase-auth'
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
    roleHint: 'మీ యాక్సెస్ స్థాయిని ఎంచుకోండి',
    secure: 'సురక్షితమైన పాత్ర ఆధారిత యాక్సెస్',
    workspace: 'మీ ఓటర్ డేటా వర్క్‌స్పేస్',
    aboutUs: 'మా గురించి',
    contactUs: 'మమ్మల్ని సంప్రదించండి',
    aboutTitle: 'వోటర్ స్పేస్ గురించి',
    aboutText: 'వోటర్ స్పేస్ వార్డు మరియు బూత్ వారీగా ఓటర్ సమాచారాన్ని ఒకే చోట నిర్వహించడానికి రూపొందించిన సురక్షితమైన వర్క్‌స్పేస్. PDFల నుండి ఓటర్ రికార్డులను భద్రపరచి, వెతకడం, సరిచూడడం మరియు అవసరమైన సమాచారాన్ని ఎగుమతి చేయడం సులభం చేస్తుంది. సూపర్ అడ్మిన్, అడ్మిన్ మరియు సబ్-మెంబర్‌లకు వారి బాధ్యతకు తగిన యాక్సెస్ మాత్రమే లభిస్తుంది.',
    contactTitle: 'వోటర్ స్పేస్‌ను సంప్రదించండి',
    contactText: 'సహాయం కావాలంటే ఫోన్, వాట్సాప్ లేదా ఇమెయిల్ ద్వారా మమ్మల్ని సంప్రదించండి.',
    call: 'కాల్ చేయండి',
    whatsapp: 'వాట్సాప్ చేయండి',
    emailUs: 'ఇమెయిల్ పంపండి',
    close: 'మూసివేయండి',
    alreadyLoggedIn: 'ఈ ఖాతా ఇప్పటికే మరో డివైస్‌లో లాగిన్ అయి ఉంది.',
    loginHere: 'ఇతర డివైస్‌ను లాగ్ అవుట్ చేసి ఇక్కడ లాగిన్ అవ్వండి',
    loginHereHint: 'ఇది ఇతర డివైస్‌లలోని ఈ ఖాతా సెషన్‌ను ముగిస్తుంది.',
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
    roleHint: 'Select your access level',
    secure: 'Secure role-based access',
    workspace: 'Your voter data workspace',
    aboutUs: 'About us',
    contactUs: 'Contact us',
    aboutTitle: 'About Voter Space',
    aboutText: 'Voter Space is a secure workspace for managing voter information by ward and booth in one place. It helps teams store voter records from PDFs, search and review information, and export the data when needed. Super Admins, Admins, and Sub-members get access according to their responsibilities.',
    contactTitle: 'Contact Voter Space',
    contactText: 'If you need help, contact us by phone, WhatsApp, or email.',
    call: 'Call us',
    whatsapp: 'WhatsApp us',
    emailUs: 'Email us',
    close: 'Close',
    alreadyLoggedIn: 'This account is already logged in on another device.',
    loginHere: 'Log out other device and login here',
    loginHereHint: 'This will end this account’s session on the other device.',
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
  const [infoPanel, setInfoPanel] = useState<'about' | 'contact' | null>(null)
  const [error, setError] = useState<string>()
  const [hideSessionMessage, setHideSessionMessage] = useState(false)
  const [deviceBlocked, setDeviceBlocked] = useState(false)
  const t = loginCopy[language]

  const sessionMessage = hideSessionMessage ? undefined : message
  const visibleError = error ?? (sessionMessage === 'DEVICE_SESSION_ENDED' ? t.alreadyLoggedIn : sessionMessage)

  const login = async (forceDeviceLogin: boolean) => {
    setError(undefined)
    setHideSessionMessage(true)
    setDeviceBlocked(false)
    setIsSubmitting(true)
    try {
      await signInForRole(email, password, selectedRole, forceDeviceLogin)
    } catch (signInError) {
      const blocked = isDeviceLimitError(signInError)
      setDeviceBlocked(blocked)
      setError(blocked ? t.alreadyLoggedIn : readableFirebaseError(signInError))
    } finally {
      setIsSubmitting(false)
    }
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void login(false)
  }

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <aside className="auth-showcase">
          <div className="auth-showcase-top"><span>{t.workspace}</span><ShieldCheck size={18} /></div>
          <img alt="Voter Space" className="auth-showcase-logo" src={logoAsset} />
          <div className="auth-showcase-copy"><p>VOTER SPACE</p><h2>{t.welcome}</h2><span>{t.description}</span></div>
          <div className="auth-showcase-points"><div><span className="auth-point-icon"><ShieldCheck size={16} /></span><div><strong>{t.secure}</strong><span>{t.roles.superAdmin.description}</span></div></div><div><span className="auth-point-icon"><UsersRound size={16} /></span><div><strong>{t.roleHint}</strong><span>{t.roles.subMember.description}</span></div></div></div>
        </aside>

        <section className="auth-panel">
          <header className="auth-heading">
            <div className="auth-brand"><img alt="" className="auth-brand-logo" src={logoAsset} /><strong>వోటర్ స్పేస్</strong></div>
          <select aria-label="Language" value={language} onChange={(event) => onLanguageChange(event.target.value as AppLanguage)}>
            <option value="te">తెలుగు</option>
            <option value="en">English</option>
          </select>
          </header>

        <div className="auth-intro">
          <p>{t.signInAs}</p>
          <h1>{t.welcome}</h1>
          <span>{t.description}</span>
        </div>

        <div className="login-role-heading"><strong>{t.signInAs}</strong><span>{t.roleHint}</span></div>
        <div className="login-role-grid" aria-label={t.signInAs}>
          {roles.map(({ role, icon: Icon }) => (
            <button
              aria-pressed={selectedRole === role}
              className={selectedRole === role ? 'is-selected' : ''}
              key={role}
              onClick={() => setSelectedRole(role)}
              type="button"
            >
              <span className="login-role-icon"><Icon size={19} /></span>
              <span className="login-role-copy"><strong>{t.roles[role].title}</strong><span>{t.roles[role].description}</span></span>
              <span aria-hidden="true" className="login-role-selected">{selectedRole === role ? '✓' : ''}</span>
            </button>
          ))}
        </div>

        {!firebaseConfigured ? <p className="form-alert form-alert-error">{t.firebaseMissing}</p> : null}
        {visibleError ? <p className="form-alert form-alert-error">{visibleError}</p> : null}
        {deviceBlocked ? <div className="login-device-takeover"><span>{t.loginHereHint}</span><button disabled={isSubmitting} onClick={() => void login(true)} type="button">{isSubmitting ? '…' : t.loginHere}</button></div> : null}

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
          <button className="primary-button login-submit" disabled={isSubmitting || !firebaseConfigured} type="submit">
            {isSubmitting ? '…' : t.signIn}
          </button>
        </form>
          <div className="auth-login-footer"><ShieldCheck size={15} /><span>{t.secure}</span></div>
          <div className="auth-support-links">
            <button onClick={() => setInfoPanel('about')} type="button"><Info size={15} />{t.aboutUs}</button>
            <button onClick={() => setInfoPanel('contact')} type="button"><Phone size={15} />{t.contactUs}</button>
          </div>
        </section>
      </div>

      {infoPanel ? (
        <div aria-label={infoPanel === 'about' ? t.aboutTitle : t.contactTitle} className="auth-info-backdrop" onClick={() => setInfoPanel(null)} role="presentation">
          <section aria-modal="true" className="auth-info-dialog" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="auth-info-heading">
              <div><span>{infoPanel === 'about' ? t.aboutUs : t.contactUs}</span><h2>{infoPanel === 'about' ? t.aboutTitle : t.contactTitle}</h2></div>
              <button aria-label={t.close} className="auth-info-close" onClick={() => setInfoPanel(null)} type="button"><X size={19} /></button>
            </div>
            <p>{infoPanel === 'about' ? t.aboutText : t.contactText}</p>
            {infoPanel === 'contact' ? (
              <div className="auth-contact-actions">
                <a href="tel:+919963638746"><Phone size={17} /><span><strong>{t.call}</strong><small>9963638746</small></span></a>
                <a href="https://wa.me/919963638746" rel="noreferrer" target="_blank"><MessageCircle size={17} /><span><strong>{t.whatsapp}</strong><small>9963638746</small></span></a>
                <a href="mailto:info@voterspace.in"><Mail size={17} /><span><strong>{t.emailUs}</strong><small>info@voterspace.in</small></span></a>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  )
}
