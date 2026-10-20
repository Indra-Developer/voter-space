import { useEffect, useState } from 'react'
import { subscribeToSession } from './firebase-auth'
import type { AppSession } from './types'

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut'; message?: string }
  | { status: 'signedIn'; session: AppSession }

export function useSession() {
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  useEffect(() => {
    return subscribeToSession((event) => {
      if (event.state === 'signedIn') {
        setState({ status: 'signedIn', session: event.session })
        return
      }
      if (event.state === 'error') {
        setState({ status: 'signedOut', message: event.message })
        return
      }
      if (event.state === 'profileMissing') {
        setState({ status: 'signedOut', message: 'This login does not have a Voter Space profile yet.' })
        return
      }
      setState({ status: 'signedOut', message: event.message })
    })
  }, [])

  return state
}
