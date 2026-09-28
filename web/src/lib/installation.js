const INSTALLATION_STORAGE_KEY = 'recordsweb-web-organisation-v1'
const ORGANISATION_CODE_PATTERN = /^[A-Z0-9]{2}\.[A-Z0-9]{2}$/
const ORGANISATION_SUBDOMAIN_PATTERN = /^[a-z0-9]{2}-[a-z0-9]{2}$/

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

export function getOrganisationCodeFromHostname(hostname = typeof window !== 'undefined' ? window.location.hostname : '') {
  const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '')
  const suffix = '.recordsweb.org'
  if (!host.endsWith(suffix)) return ''
  const label = host.slice(0, -suffix.length)
  if (!ORGANISATION_SUBDOMAIN_PATTERN.test(label)) return ''
  return normaliseOrganisationCode(label.replace('-', '.'))
}

export function getOrganisationPortalUrl(value, path = '/') {
  const code = normaliseOrganisationCode(value)
  if (!code) return ''
  const subdomain = code.toLowerCase().replace('.', '-')
  const cleanPath = String(path || '/').startsWith('/') ? String(path || '/') : `/${path}`
  return `https://${subdomain}.recordsweb.org${cleanPath}`
}

const browserInstallation = typeof window !== 'undefined' ? safeLocalStorageRead() : {}
const environmentCode = normaliseOrganisationCode(import.meta.env.VITE_RECORDSWEB_ORG_CODE || '')
const hostnameCode = typeof window !== 'undefined' ? getOrganisationCodeFromHostname() : ''

let currentOrganisationCode = normaliseOrganisationCode(
  hostnameCode || browserInstallation.organisationCode || environmentCode || '',
)
let currentSource = currentOrganisationCode
  ? (hostnameCode ? 'subdomain' : browserInstallation.organisationCode ? 'browser' : 'environment')
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
    dedicatedPortal: currentSource === 'subdomain' && ORGANISATION_CODE_PATTERN.test(currentOrganisationCode),
  }
}

export function isValidOrganisationCode(value) {
  return Boolean(normaliseOrganisationCode(value))
}

export async function saveInstalledOrganisationCode(value) {
  const organisationCode = normaliseOrganisationCode(value)
  if (!organisationCode) {
    throw new Error('Organisation code must use the RecordsWeb format @XX.XX, using letters or numbers (for example @GW.HS or @UH.S1).')
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

export {
  INSTALLATION_STORAGE_KEY,
  ORGANISATION_CODE_PATTERN,
  ORGANISATION_SUBDOMAIN_PATTERN,
}
