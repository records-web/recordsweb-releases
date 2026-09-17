const INSTALL_KEY = 'recordsweb-device-install-id-v1'

function randomHex(bytes = 24) {
  const data = new Uint8Array(bytes)
  crypto.getRandomValues(data)
  return Array.from(data).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function getRecordsWebDeviceIdentity() {
  // Desktop: the Electron preload should expose only a SHA-256 hardware/device
  // hash. Raw machine IDs or serial numbers are never sent to the renderer.
  try {
    if (window?.recordsWebDesktop?.getDeviceIdentity) {
      const desktop = await window.recordsWebDesktop.getDeviceIdentity()
      if (desktop?.hash) {
        return {
          hash: String(desktop.hash).toLowerCase(),
          name: desktop.name || 'RecordsWeb Desktop',
          platform: desktop.platform || navigator.platform || 'Desktop',
          source: 'desktop-machine-id',
        }
      }
    }
  } catch (error) {
    console.warn('RecordsWeb desktop device identity unavailable:', error)
  }

  // Browser: use an installation-scoped random identifier rather than invasive
  // canvas/font/browser fingerprinting. Clearing site data intentionally resets it.
  let installId = ''
  try {
    installId = localStorage.getItem(INSTALL_KEY) || ''
    if (!installId) {
      installId = randomHex(32)
      localStorage.setItem(INSTALL_KEY, installId)
    }
  } catch {
    installId = randomHex(32)
  }

  return {
    hash: await sha256(`recordsweb-browser:${installId}`),
    name: 'Browser installation',
    platform: navigator.platform || 'Web',
    source: 'browser-install-id',
  }
}
