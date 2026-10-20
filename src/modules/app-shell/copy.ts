import type { AppLanguage, AppTheme, NavigationKey, UserRole } from './types'

type AppCopy = {
  appName: string
  appNameEnglish: string
  nav: Record<NavigationKey, string>
  mobile: Record<'dashboard' | 'register' | 'upload' | 'library' | 'settings', string>
  actions: {
    closeMenu: string
    openMenu: string
    language: string
    theme: string
    profile: string
    back: string
    tryAgain: string
    signOut: string
  }
  themes: Record<AppTheme, string>
  roles: Record<UserRole, string>
  profile: {
    unavailable: string
    banner: string
    photo: string
  }
  states: {
    loading: { title: string; description: string }
    empty: { title: string; description: string }
    error: { title: string; description: string }
  }
  page: {
    section: string
    dashboardTitle: string
    dashboardDescription: string
    moduleTitle: string
    moduleDescription: string
  }
}

export const copy: Record<AppLanguage, AppCopy> = {
  te: {
    appName: 'వోటర్ స్పేస్',
    appNameEnglish: 'Voter Space',
    nav: {
      dashboard: 'డ్యాష్‌బోర్డ్',
      register: 'ఓటర్ రిజిస్టర్',
      upload: 'PDF అప్‌లోడ్',
      library: 'PDF లైబ్రరీ',
      users: 'వినియోగదారుల నిర్వహణ',
      audit: 'ఆడిట్ లాగ్‌లు',
      settings: 'సెట్టింగులు',
    },
    mobile: {
      dashboard: 'హోమ్',
      register: 'రిజిస్టర్',
      upload: 'అప్‌లోడ్',
      library: 'PDFలు',
      settings: 'ప్రొఫైల్',
    },
    actions: {
      closeMenu: 'మెను మూసివేయండి',
      openMenu: 'మెను తెరవండి',
      language: 'భాష',
      theme: 'థీమ్',
      profile: 'ప్రొఫైల్',
      back: 'వెనక్కి వెళ్లండి',
      tryAgain: 'మళ్లీ ప్రయత్నించండి',
      signOut: 'లాగ్ అవుట్',
    },
    themes: { green: 'ఆకుపచ్చ', sky: 'ఆకాశ నీలం', dark: 'డార్క్' },
    roles: { superAdmin: 'సూపర్ అడ్మిన్', admin: 'అడ్మిన్', subMember: 'సబ్-మెంబర్' },
    profile: {
      unavailable: 'లాగిన్ అయిన తర్వాత మీ ప్రొఫైల్ వివరాలు ఇక్కడ కనిపిస్తాయి.',
      banner: 'బ్యానర్',
      photo: 'ప్రొఫైల్ ఫోటో',
    },
    states: {
      loading: { title: 'లోడ్ అవుతోంది…', description: 'దయచేసి కొద్దిసేపు వేచి ఉండండి.' },
      empty: { title: 'డేటా ఇంకా అందుబాటులో లేదు', description: 'డేటా కనెక్ట్ చేసిన తర్వాత అది ఇక్కడ కనిపిస్తుంది.' },
      error: { title: 'ఏదో తప్పు జరిగింది', description: 'దయచేసి మళ్లీ ప్రయత్నించండి.' },
    },
    page: {
      section: 'వోటర్ స్పేస్',
      dashboardTitle: 'మీ వర్క్‌స్పేస్',
      dashboardDescription: 'మీ ప్రొఫైల్, భాష, మరియు థీమ్ సెట్టింగులు సిద్ధంగా ఉన్నాయి.',
      moduleTitle: 'స్క్రీన్ సిద్ధంగా ఉంది',
      moduleDescription: 'ఈ భాగానికి సంబంధించిన డేటా తదుపరి మాడ్యూల్‌లో జోడించబడుతుంది.',
    },
  },
  en: {
    appName: 'Voter Space',
    appNameEnglish: 'వోటర్ స్పేస్',
    nav: {
      dashboard: 'Dashboard',
      register: 'Voter Register',
      upload: 'PDF Upload',
      library: 'PDF Library',
      users: 'User Management',
      audit: 'Audit Logs',
      settings: 'Settings',
    },
    mobile: { dashboard: 'Home', register: 'Register', upload: 'Upload', library: 'PDFs', settings: 'Profile' },
    actions: {
      closeMenu: 'Close menu',
      openMenu: 'Open menu',
      language: 'Language',
      theme: 'Theme',
      profile: 'Profile',
      back: 'Go back',
      tryAgain: 'Try again',
      signOut: 'Sign out',
    },
    themes: { green: 'Green', sky: 'Sky blue', dark: 'Dark' },
    roles: { superAdmin: 'Super Admin', admin: 'Admin', subMember: 'Sub-member' },
    profile: {
      unavailable: 'Your profile information will appear here after you sign in.',
      banner: 'Banner',
      photo: 'Profile photo',
    },
    states: {
      loading: { title: 'Loading…', description: 'Please wait for a moment.' },
      empty: { title: 'No data is available yet', description: 'It will appear here when data is connected.' },
      error: { title: 'Something went wrong', description: 'Please try again.' },
    },
    page: {
      section: 'Voter Space',
      dashboardTitle: 'Your workspace',
      dashboardDescription: 'Your profile, language, and theme settings are ready.',
      moduleTitle: 'Screen is ready',
      moduleDescription: 'Data for this section will be added in the next module.',
    },
  },
}
