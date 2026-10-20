import { auth } from '../../lib/firebase'

export async function requestSourcePdfDownload(sourcePdfId: string) {
  const user = auth?.currentUser
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION ?? 'asia-south1'
  if (!user || !projectId) throw new Error('Please sign in again before downloading this PDF.')

  const idToken = await user.getIdToken()
  const endpoint = `https://${region}-${projectId}.cloudfunctions.net/downloadSourcePdf?sourcePdfId=${encodeURIComponent(sourcePdfId)}`
  const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${idToken}` } })
  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as { error?: string } | undefined
    throw new Error(body?.error || `The original PDF download failed (${response.status}).`)
  }
  return response.blob()
}

export function startBrowserDownload(file: Blob, fileName?: string) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  if (fileName) link.download = fileName
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
