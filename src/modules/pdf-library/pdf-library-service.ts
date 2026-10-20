import { httpsCallable } from 'firebase/functions'
import { functions } from '../../lib/firebase'

export async function requestSourcePdfDownload(sourcePdfId: string) {
  if (!functions) throw new Error('Firebase is not configured.')
  const call = httpsCallable<{ sourcePdfId: string }, { url: string; expiresAt: string }>(functions, 'getSourcePdfDownloadUrl')
  return (await call({ sourcePdfId })).data
}

export function startBrowserDownload(url: string, fileName?: string) {
  const link = document.createElement('a')
  link.href = url
  if (fileName) link.download = fileName
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
}
