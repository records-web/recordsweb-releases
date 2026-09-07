const INSTALLATION_STORAGE_KEY = 'recordsweb-installation-v1'
const ORGANISATION_CODE_PATTERN = /^[A-Z]{2}\.[A-Z]{2}$/

function safeLocalStorageRead() {
  try {
    return JSON.parse(localStorage.getItem(INSTALLATION_STORAGE_KEY) || 'null') || {}
  } catch {
    return {}
  }
}

function readDesktopInstallation() {
  try {
    return window.recordsWebDesktop?.getInstallConfigSync?.() || {}
  } catch {
    return {}
  }
}

export function normaliseOrganisationCode(value) {
  const clean = String(value || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, '')
    .toUpperCase()
  return ORGANISATION_CODE_PATTERN.test(clean) ? clean : ''
}

const desktopInstallation = typeof window !== 'undefined' ? readDesktopInstallation() : {}
const browserInstallation = typeof window !== 'undefined' ? safeLocalStorageRead() : {}
const environmentCode = normaliseOrganisationCode(import.meta.env.VITE_RECORDSWEB_ORG_CODE || '')

let currentOrganisationCode = normaliseOrganisationCode(
  desktopInstallation.organisationCode || environmentCode || browserInstallation.organisationCode || '',
)
let currentSource = currentOrganisationCode
  ? (desktopInstallation.organisationCode ? 'installer' : environmentCode ? 'environment' : 'local')
  : 'unconfigured'

export function getInstalledOrganisationCode() {
  return currentOrganisationCode
}

export function getInstalledOrganisationSuffix() {
  return currentOrganisationCode ? `@${currentOrganisationCode}` : ''
}

export function getInstallationNamespace() {
  return (currentOrganisationCode || 'unconfigured').toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

export function getInstallationState() {
  return {
    configured: Boolean(currentOrganisationCode),
    organisationCode: currentOrganisationCode,
    suffix: getInstalledOrganisationSuffix(),
    source: currentSource,
  }
}

export function isValidOrganisationCode(value) {
  return Boolean(normaliseOrganisationCode(value))
}

export async function saveInstalledOrganisationCode(value) {
  const organisationCode = normaliseOrganisationCode(value)
  if (!organisationCode) {
    throw new Error('Organisation extension must contain four letters in the format @XX.XX.')
  }

  if (typeof window !== 'undefined') {
    const desktop = window.recordsWebDesktop
    if (desktop?.setInstallConfig) {
      const result = await desktop.setInstallConfig({ organisationCode })
      if (result?.ok === false) throw new Error(result?.message || 'Unable to save the RecordsWeb organisation extension.')
      currentSource = 'desktop'
    } else {
      currentSource = 'local'
    }

    try {
      localStorage.setItem(INSTALLATION_STORAGE_KEY, JSON.stringify({ organisationCode }))
    } catch {}
  }

  currentOrganisationCode = organisationCode
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('recordsweb-installation-changed', {
      detail: getInstallationState(),
    }))
  }
  return getInstallationState()
}

export function getDemoOrganisationId(code = currentOrganisationCode) {
  const safe = normaliseOrganisationCode(code) || 'GW.HC'
  return `recordsweb-demo-${safe.toLowerCase().replace('.', '-')}`
}

export { INSTALLATION_STORAGE_KEY, ORGANISATION_CODE_PATTERN }
