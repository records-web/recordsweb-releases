import { ORGANISATION, updateRuntimeOrganisation } from './demoData'
import { getInstalledOrganisationCode } from './installation'
import { supabase, supabaseConfigured } from './supabase'

export const ORGANISATION_SETTINGS_KEY = `recordsweb-organisation-settings-v3-${(getInstalledOrganisationCode() || 'unconfigured').toLowerCase()}`
export const BRANDING_BUCKET = 'recordsweb-branding'

export const DEFAULT_ORGANISATION_SETTINGS = {
  organisationId: ORGANISATION.id,
  organisationName: ORGANISATION.name,
  organisationCode: ORGANISATION.org_code,
  systemMode: ORGANISATION.system_mode || 'general_practice',
  defaultLocation: ORGANISATION.default_location || 'Main Site',
  active: true,
  primaryColor: '#0f6fbd',
  navigationColor: '#cfe7f8',
  patientBannerColor: '#753b0d',
  logoPath: '',
  logoUrl: '',
  logoFileName: '',
  logoUpdatedAt: '',
  // Used only by local demo mode. Supabase mode stores logos in Storage.
  logoDataUrl: '',
}

function cleanHex(value, fallback) {
  const candidate = String(value || '').trim()
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toLowerCase() : fallback
}

function shadeHex(hex, amount = -22) {
  const safe = cleanHex(hex, '#0f6fbd').slice(1)
  const number = parseInt(safe, 16)
  const r = Math.max(0, Math.min(255, (number >> 16) + amount))
  const g = Math.max(0, Math.min(255, ((number >> 8) & 0xff) + amount))
  const b = Math.max(0, Math.min(255, (number & 0xff) + amount))
  return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')}`
}

function publicLogoUrl(path, updatedAt = '') {
  if (!path || !supabaseConfigured) return ''
  const { data } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(path)
  const url = data?.publicUrl || ''
  if (!url) return ''
  return updatedAt ? `${url}?v=${encodeURIComponent(updatedAt)}` : url
}

export function normaliseOrganisationSettings(settings = {}) {
  const logoDataUrl = typeof settings.logoDataUrl === 'string' ? settings.logoDataUrl : ''
  const logoUrl = typeof settings.logoUrl === 'string' ? settings.logoUrl : logoDataUrl
  return {
    ...DEFAULT_ORGANISATION_SETTINGS,
    ...settings,
    organisationId: String(settings.organisationId || DEFAULT_ORGANISATION_SETTINGS.organisationId || ''),
    organisationName: String(settings.organisationName || DEFAULT_ORGANISATION_SETTINGS.organisationName || ''),
    organisationCode: String(settings.organisationCode || DEFAULT_ORGANISATION_SETTINGS.organisationCode || ''),
    systemMode: settings.systemMode === 'hospital' ? 'hospital' : 'general_practice',
    defaultLocation: String(settings.defaultLocation || DEFAULT_ORGANISATION_SETTINGS.defaultLocation || 'Main Site'),
    active: settings.active !== false,
    primaryColor: cleanHex(settings.primaryColor, DEFAULT_ORGANISATION_SETTINGS.primaryColor),
    navigationColor: cleanHex(settings.navigationColor, DEFAULT_ORGANISATION_SETTINGS.navigationColor),
    patientBannerColor: cleanHex(settings.patientBannerColor, DEFAULT_ORGANISATION_SETTINGS.patientBannerColor),
    logoPath: typeof settings.logoPath === 'string' ? settings.logoPath : '',
    logoUrl,
    logoFileName: typeof settings.logoFileName === 'string' ? settings.logoFileName : '',
    logoUpdatedAt: typeof settings.logoUpdatedAt === 'string' ? settings.logoUpdatedAt : '',
    logoDataUrl,
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
  // Never persist temporary blob: preview URLs.
  const cacheable = {
    ...next,
    logoUrl: next.logoUrl.startsWith('blob:') ? '' : next.logoUrl,
  }
  localStorage.setItem(ORGANISATION_SETTINGS_KEY, JSON.stringify(cacheable))
  return next
}

export function applyOrganisationSettings(settings = getCachedOrganisationSettings()) {
  const next = normaliseOrganisationSettings(settings)
  const root = document.documentElement
  root.style.setProperty('--rw-brand', next.primaryColor)
  root.style.setProperty('--rw-brand-dark', shadeHex(next.primaryColor, -28))
  root.style.setProperty('--rw-navigation', next.navigationColor)
  root.style.setProperty('--patient', next.patientBannerColor)
  root.style.setProperty('--rw-patient-dark', shadeHex(next.patientBannerColor, -22))
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
  if (!organisationCode) throw new Error('This RecordsWeb installation has not been assigned an organisation extension.')

  if (!supabaseConfigured) {
    updateRuntimeOrganisation({
      org_code: organisationCode,
      name: settings.organisationName || ORGANISATION.name,
      system_mode: settings.systemMode || 'general_practice',
      default_location: settings.defaultLocation || 'Main Site',
    })
    return settings
  }

  const { data, error } = await supabase.rpc('recordsweb_public_organisation_config', {
    p_organisation_code: organisationCode,
  })

  if (error) {
    if (/recordsweb_public_organisation_config|does not exist|schema cache/i.test(error.message || '')) {
      throw new Error('Multi-organisation support is not installed in Supabase. Run supabase/recordsweb-3.1.9-multi-organisation.sql.')
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

  const path = row.logo_path || ''
  const updatedAt = row.logo_updated_at || ''
  const legacyDataUrl = !path && row.logo_data_url ? row.logo_data_url : ''

  settings = publishSettings({
    organisationId: row.id,
    organisationName: row.name || organisationCode,
    organisationCode: row.org_code || organisationCode,
    systemMode: row.system_mode || 'general_practice',
    defaultLocation: row.default_location || 'Main Site',
    active: row.active !== false,
    primaryColor: row.primary_color || DEFAULT_ORGANISATION_SETTINGS.primaryColor,
    navigationColor: row.navigation_color || DEFAULT_ORGANISATION_SETTINGS.navigationColor,
    patientBannerColor: row.patient_banner_color || DEFAULT_ORGANISATION_SETTINGS.patientBannerColor,
    logoPath: path,
    logoUrl: path ? publicLogoUrl(path, updatedAt) : legacyDataUrl,
    logoFileName: row.logo_file_name || '',
    logoUpdatedAt: updatedAt,
    logoDataUrl: legacyDataUrl,
  })
  return settings
}

function logoExtension(file) {
  if (file?.type === 'image/png') return 'png'
  if (file?.type === 'image/jpeg') return 'jpg'
  if (file?.type === 'image/webp') return 'webp'
  throw new Error('Logo must be a PNG, JPEG or WebP image.')
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Unable to read that logo file.'))
    reader.readAsDataURL(file)
  })
}

async function removeStorageLogo(path) {
  if (!path || !supabaseConfigured) return
  const { error } = await supabase.storage.from(BRANDING_BUCKET).remove([path])
  if (error && !/not found/i.test(error.message || '')) throw error
}

export async function saveOrganisationSettings(settings, options = {}) {
  const next = normaliseOrganisationSettings(settings)
  const logoFile = options.logoFile || null
  const removeLogo = Boolean(options.removeLogo)

  if (!supabaseConfigured) {
    let logoDataUrl = next.logoDataUrl || next.logoUrl || ''
    if (logoFile) logoDataUrl = await fileToDataUrl(logoFile)
    if (removeLogo) logoDataUrl = ''
    return publishSettings({
      ...next,
      logoPath: '',
      logoUrl: logoDataUrl,
      logoDataUrl,
      logoFileName: removeLogo ? '' : (logoFile?.name || next.logoFileName),
      logoUpdatedAt: logoFile ? new Date().toISOString() : next.logoUpdatedAt,
    })
  }

  let logoPath = next.logoPath || ''
  let logoFileName = next.logoFileName || ''
  let logoUpdatedAt = next.logoUpdatedAt || ''
  const previousPath = next.logoPath || ''

  if (logoFile) {
    const ext = logoExtension(logoFile)
    const organisationId = next.organisationId || ORGANISATION.id
    const uploadedPath = `${organisationId}/logo.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(BRANDING_BUCKET)
      .upload(uploadedPath, logoFile, {
        upsert: true,
        contentType: logoFile.type,
        cacheControl: '3600',
      })
    if (uploadError) throw uploadError

    if (previousPath && previousPath !== uploadedPath) {
      await removeStorageLogo(previousPath)
    }

    logoPath = uploadedPath
    logoFileName = logoFile.name
    logoUpdatedAt = new Date().toISOString()
  } else if (removeLogo) {
    await removeStorageLogo(previousPath)
    logoPath = ''
    logoFileName = ''
    logoUpdatedAt = new Date().toISOString()
  }

  const { error } = await supabase
    .from('organisations')
    .update({
      primary_color: next.primaryColor,
      navigation_color: next.navigationColor,
      patient_banner_color: next.patientBannerColor,
      logo_path: logoPath || null,
      logo_file_name: logoFileName || null,
      logo_updated_at: logoUpdatedAt || null,
      // Clear the old database-embedded image whenever branding is saved.
      logo_data_url: null,
    })
    .eq('org_code', getInstalledOrganisationCode())
  if (error) throw error

  return publishSettings({
    ...next,
    logoPath,
    logoUrl: logoPath ? publicLogoUrl(logoPath, logoUpdatedAt) : '',
    logoFileName,
    logoUpdatedAt,
    logoDataUrl: '',
  })
}

export async function resetOrganisationSettings() {
  const current = await loadOrganisationSettings().catch(() => getCachedOrganisationSettings())
  return saveOrganisationSettings({
    ...DEFAULT_ORGANISATION_SETTINGS,
    organisationId: current.organisationId,
    organisationName: current.organisationName,
    organisationCode: current.organisationCode,
    systemMode: current.systemMode,
    defaultLocation: current.defaultLocation,
    active: current.active,
  }, {
    removeLogo: Boolean(current.logoPath || current.logoUrl || current.logoDataUrl),
  })
}
