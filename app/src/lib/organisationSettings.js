import { ORGANISATION, updateRuntimeOrganisation } from './demoData'
import { getInstalledOrganisationCode } from './installation'
import { supabase, supabaseConfigured } from './supabase'

export const ORGANISATION_SETTINGS_KEY = `recordsweb-organisation-settings-v3-${(getInstalledOrganisationCode() || 'unconfigured').toLowerCase()}`

// RecordsWeb branding is product-owned and deliberately identical for every
// organisation. Organisation records can still provide their name, code,
// deployment mode and location, but they cannot replace the RecordsWeb logo or
// recolour the clinical interface.
export const RECORDSWEB_BRAND = Object.freeze({
  primaryColor: '#0f6fbd',
  navigationColor: '#cfe7f8',
  patientBannerColor: '#753b0d',
})

export const DEFAULT_ORGANISATION_SETTINGS = {
  organisationId: ORGANISATION.id,
  organisationName: ORGANISATION.name,
  organisationCode: ORGANISATION.org_code,
  systemMode: ORGANISATION.system_mode || 'general_practice',
  defaultLocation: ORGANISATION.default_location || 'Main Site',
  active: true,
  ...RECORDSWEB_BRAND,
  logoPath: '',
  logoUrl: '',
  logoFileName: '',
  logoUpdatedAt: '',
  logoDataUrl: '',
}

function shadeHex(hex, amount = -22) {
  const safe = String(hex || '#0f6fbd').replace('#', '')
  const number = parseInt(safe, 16)
  const r = Math.max(0, Math.min(255, (number >> 16) + amount))
  const g = Math.max(0, Math.min(255, ((number >> 8) & 0xff) + amount))
  const b = Math.max(0, Math.min(255, (number & 0xff) + amount))
  return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')}`
}

export function normaliseOrganisationSettings(settings = {}) {
  return {
    ...DEFAULT_ORGANISATION_SETTINGS,
    organisationId: String(settings.organisationId || DEFAULT_ORGANISATION_SETTINGS.organisationId || ''),
    organisationName: String(settings.organisationName || DEFAULT_ORGANISATION_SETTINGS.organisationName || ''),
    organisationCode: String(settings.organisationCode || DEFAULT_ORGANISATION_SETTINGS.organisationCode || ''),
    systemMode: settings.systemMode === 'hospital' ? 'hospital' : 'general_practice',
    defaultLocation: String(settings.defaultLocation || DEFAULT_ORGANISATION_SETTINGS.defaultLocation || 'Main Site'),
    active: settings.active !== false,
    ...RECORDSWEB_BRAND,
    // Organisation imagery is intentionally ignored. The supplied RecordsWeb
    // assets are rendered directly by the interface instead.
    logoPath: '',
    logoUrl: '',
    logoFileName: '',
    logoUpdatedAt: '',
    logoDataUrl: '',
  }
}

export function getCachedOrganisationSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(ORGANISATION_SETTINGS_KEY) || 'null')
    return normaliseOrganisationSettings(saved || {})
  } catch {
    return { ...DEFAULT_ORGANISATION_SETTINGS }
  }
}

function cacheOrganisationSettings(settings) {
  const next = normaliseOrganisationSettings(settings)
  localStorage.setItem(ORGANISATION_SETTINGS_KEY, JSON.stringify(next))
  return next
}

export function applyOrganisationSettings(settings = getCachedOrganisationSettings()) {
  const next = normaliseOrganisationSettings(settings)
  const root = document.documentElement
  root.style.setProperty('--rw-brand', RECORDSWEB_BRAND.primaryColor)
  root.style.setProperty('--rw-brand-dark', shadeHex(RECORDSWEB_BRAND.primaryColor, -28))
  root.style.setProperty('--rw-navigation', RECORDSWEB_BRAND.navigationColor)
  root.style.setProperty('--patient', RECORDSWEB_BRAND.patientBannerColor)
  root.style.setProperty('--rw-patient-dark', shadeHex(RECORDSWEB_BRAND.patientBannerColor, -22))
  return next
}

function publishSettings(settings) {
  const next = cacheOrganisationSettings(settings)
  applyOrganisationSettings(next)
  window.dispatchEvent(new CustomEvent('recordsweb-organisation-settings-changed', { detail: next }))
  return next
}

export async function loadOrganisationSettings() {
  let settings = getCachedOrganisationSettings()
  applyOrganisationSettings(settings)

  const organisationCode = getInstalledOrganisationCode()
  if (!organisationCode) throw new Error('This RecordsWeb installation has not selected an organisation extension.')

  if (!supabaseConfigured) {
    updateRuntimeOrganisation({
      org_code: organisationCode,
      name: settings.organisationName || ORGANISATION.name,
      system_mode: settings.systemMode || 'general_practice',
      default_location: settings.defaultLocation || 'Main Site',
    })
    return publishSettings({
      ...settings,
      organisationCode,
      organisationName: settings.organisationName || ORGANISATION.name,
    })
  }

  const { data, error } = await supabase.rpc('recordsweb_public_organisation_config', {
    p_organisation_code: organisationCode,
  })

  if (error) {
    if (/recordsweb_public_organisation_config|does not exist|schema cache/i.test(error.message || '')) {
      throw new Error('Multi-organisation support is not installed in Supabase. Run the RecordsWeb multi-organisation migration.')
    }
    throw error
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.id || row?.active === false) {
    throw new Error(`The organisation extension @${organisationCode} is not registered or is not active in RecordsWeb.`)
  }

  updateRuntimeOrganisation({
    id: row.id,
    org_code: row.org_code || organisationCode,
    name: row.name || organisationCode,
    system_mode: row.system_mode || 'general_practice',
    default_location: row.default_location || 'Main Site',
  })

  settings = publishSettings({
    organisationId: row.id,
    organisationName: row.name || organisationCode,
    organisationCode: row.org_code || organisationCode,
    systemMode: row.system_mode || 'general_practice',
    defaultLocation: row.default_location || 'Main Site',
    active: row.active !== false,
  })
  return settings
}

export async function saveOrganisationSettings() {
  throw new Error('RecordsWeb branding is centrally managed and cannot be changed by an organisation.')
}

export async function resetOrganisationSettings() {
  return publishSettings(getCachedOrganisationSettings())
}
