export const SETTINGS_KEY = 'recordsweb-user-settings-v2'
export const LEGACY_SETTINGS_KEY = 'recordsweb-user-settings-v1'

export const DEFAULT_SETTINGS = {
  interfaceStyle: 'organisation',
  density: 'standard',
  showProfileChip: true,
  showWorklistCounts: true,
  confirmSignOut: true,
  highContrast: false,
  theme: 'light',
  autoLockMinutes: 15,
}

let activeScope = ''
let organisationDefaultInterfaceStyle = 'classic'
let systemThemeMedia = null
let systemThemeListener = null

function cleanInterfaceStyle(value, fallback = 'organisation') {
  return ['organisation', 'classic', 'modern'].includes(value) ? value : fallback
}

function cleanTheme(value) {
  return ['light', 'dark', 'system'].includes(value) ? value : 'light'
}

function cleanDensity(value) {
  return ['compact', 'standard', 'comfortable'].includes(value) ? value : 'standard'
}

function normaliseSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    interfaceStyle: cleanInterfaceStyle(settings.interfaceStyle),
    density: cleanDensity(settings.density),
    theme: cleanTheme(settings.theme),
    autoLockMinutes: Number(settings.autoLockMinutes || DEFAULT_SETTINGS.autoLockMinutes),
    showProfileChip: settings.showProfileChip !== false,
    showWorklistCounts: settings.showWorklistCounts !== false,
    confirmSignOut: settings.confirmSignOut !== false,
    highContrast: Boolean(settings.highContrast),
  }
}

function safeScope(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_.:-]+/g, '_').slice(0, 180)
}

function currentKey() {
  return activeScope ? `${SETTINGS_KEY}:${activeScope}` : SETTINGS_KEY
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}

function findSavedSettings() {
  const scoped = readJson(currentKey())
  if (scoped) return scoped

  // Migrate the old browser/workstation settings once so existing theme,
  // density and sign-out preferences are not lost during the 3.7 upgrade.
  const legacy = readJson(LEGACY_SETTINGS_KEY)
  if (legacy) {
    const migrated = normaliseSettings({ ...legacy, interfaceStyle: legacy.interfaceStyle || 'organisation' })
    localStorage.setItem(currentKey(), JSON.stringify(migrated))
    return migrated
  }

  return null
}

export function getResolvedTheme(settings = getSettings()) {
  const selected = cleanTheme(settings.theme)
  if (selected !== 'system') return selected
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function getResolvedInterfaceStyle(settings = getSettings()) {
  const selected = cleanInterfaceStyle(settings.interfaceStyle)
  if (selected === 'organisation') return organisationDefaultInterfaceStyle
  return selected
}

function attachSystemThemeListener(settings) {
  if (systemThemeMedia && systemThemeListener) {
    try { systemThemeMedia.removeEventListener('change', systemThemeListener) } catch {}
  }
  systemThemeMedia = null
  systemThemeListener = null

  if (settings.theme !== 'system' || typeof window === 'undefined' || !window.matchMedia) return
  systemThemeMedia = window.matchMedia('(prefers-color-scheme: dark)')
  systemThemeListener = () => applySettings(getSettings())
  try { systemThemeMedia.addEventListener('change', systemThemeListener) } catch {}
}

export function getSettings() {
  return normaliseSettings(findSavedSettings() || {})
}

export function applySettings(settings = getSettings()) {
  const next = normaliseSettings(settings)
  const root = document.documentElement
  const interfaceStyle = getResolvedInterfaceStyle(next)
  const resolvedTheme = getResolvedTheme(next)

  root.classList.toggle('rw-interface-modern', interfaceStyle === 'modern')
  root.classList.toggle('rw-interface-classic', interfaceStyle !== 'modern')
  root.classList.toggle('rw-density-compact', next.density === 'compact')
  root.classList.toggle('rw-density-comfortable', next.density === 'comfortable')
  root.classList.toggle('rw-high-contrast', Boolean(next.highContrast))
  root.classList.toggle('rw-dark-mode', resolvedTheme === 'dark')
  root.classList.toggle('rw-theme-system', next.theme === 'system')
  root.dataset.interfaceStyle = interfaceStyle
  root.dataset.theme = resolvedTheme
  root.style.colorScheme = resolvedTheme

  attachSystemThemeListener(next)
  Promise.resolve(window.recordsWebDesktop?.setNativeTheme?.(resolvedTheme)).catch(() => {})
  return next
}

export function activateSettingsScope(scope, options = {}) {
  activeScope = safeScope(scope)
  organisationDefaultInterfaceStyle = options.organisationDefault === 'modern' ? 'modern' : 'classic'
  const settings = getSettings()
  applySettings(settings)
  return settings
}

export function setOrganisationInterfaceDefault(value) {
  organisationDefaultInterfaceStyle = value === 'modern' ? 'modern' : 'classic'
  const settings = getSettings()
  applySettings(settings)
  window.dispatchEvent(new CustomEvent('recordsweb-settings-changed', { detail: settings }))
  return settings
}

export function saveSettings(next) {
  const settings = normaliseSettings(next)
  localStorage.setItem(currentKey(), JSON.stringify(settings))
  applySettings(settings)
  window.dispatchEvent(new CustomEvent('recordsweb-settings-changed', { detail: settings }))
  return settings
}

export function resetSettings() {
  localStorage.removeItem(currentKey())
  const settings = normaliseSettings(DEFAULT_SETTINGS)
  localStorage.setItem(currentKey(), JSON.stringify(settings))
  applySettings(settings)
  window.dispatchEvent(new CustomEvent('recordsweb-settings-changed', { detail: settings }))
  return settings
}
