const LIVEKIT_GLOBAL_TIMEOUT_MS = 12000

export async function getLiveKitClient() {
  if (typeof window === 'undefined') throw new Error('LiveKit is only available in a browser or the RecordsWeb desktop app.')
  if (window.LivekitClient) return window.LivekitClient

  const started = Date.now()
  while (Date.now() - started < LIVEKIT_GLOBAL_TIMEOUT_MS) {
    await new Promise((resolve) => window.setTimeout(resolve, 80))
    if (window.LivekitClient) return window.LivekitClient
  }

  throw new Error('The LiveKit client could not be loaded. Check your internet connection and RecordsWeb Content Security Policy.')
}
