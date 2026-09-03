import { ORGANISATION } from './demoData'
import { supabase, supabaseConfigured } from './supabase'

export const ORGANISATION_SETTINGS_KEY = 'recordsweb-organisation-settings-v2'
export const BRANDING_BUCKET = 'recordsweb-branding'

export const DEFAULT_ORGANISATION_SETTINGS = {
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

  if (!supabaseConfigured) return settings

  const { data, error } = await supabase
    .from('organisations')
    .select('primary_color,navigation_color,patient_banner_color,logo_path,logo_file_name,logo_updated_at,logo_data_url')
    .eq('org_code', ORGANISATION.org_code)
    .single()

  if (error) throw error

  const path = data.logo_path || ''
  const updatedAt = data.logo_updated_at || ''
  const legacyDataUrl = !path && data.logo_data_url ? data.logo_data_url : ''

  settings = publishSettings({
    primaryColor: data.primary_color || DEFAULT_ORGANISATION_SETTINGS.primaryColor,
    navigationColor: data.navigation_color || DEFAULT_ORGANISATION_SETTINGS.navigationColor,
    patientBannerColor: data.patient_banner_color || DEFAULT_ORGANISATION_SETTINGS.patientBannerColor,
    logoPath: path,
    logoUrl: path ? publicLogoUrl(path, updatedAt) : legacyDataUrl,
    logoFileName: data.logo_file_name || '',
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
    const uploadedPath = `${ORGANISATION.id}/logo.${ext}`
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
    .eq('org_code', ORGANISATION.org_code)
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
  return saveOrganisationSettings(DEFAULT_ORGANISATION_SETTINGS, {
    removeLogo: Boolean(current.logoPath || current.logoUrl || current.logoDataUrl),
  })
}
