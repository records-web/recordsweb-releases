const INSTALLATION_STORAGE_KEY = 'recordsweb-web-organisation-v1'
const ORGANISATION_CODE_PATTERN = /^[A-Z]{2}\.[A-Z]{2}$/

function safeLocalStorageRead() {
  try {
    return JSON.parse(localStorage.getItem(INSTALLATION_STORAGE_KEY) || 'null') || {}
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

const browserInstallation = typeof window !== 'undefined' ? safeLocalStorageRead() : {}
const environmentCode = normaliseOrganisationCode(import.meta.env.VITE_RECORDSWEB_ORG_CODE || '')

let currentOrganisationCode = normaliseOrganisationCode(
  browserInstallation.organisationCode || environmentCode || '',
)
let currentSource = currentOrganisationCode
  ? (browserInstallation.organisationCode ? 'browser' : 'environment')
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
    try {
      localStorage.setItem(INSTALLATION_STORAGE_KEY, JSON.stringify({ organisationCode }))
    } catch {
      throw new Error('This browser could not save the RecordsWeb organisation selection. Check that site storage is enabled.')
    }
  }

  currentOrganisationCode = organisationCode
  currentSource = 'browser'

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
