export const SETTINGS_KEY = 'recordsweb-user-settings-v1'

export const DEFAULT_SETTINGS = {
  density: 'standard',
  showProfileChip: true,
  showWorklistCounts: true,
  confirmSignOut: true,
  highContrast: false,
  theme: 'light',
  autoLockMinutes: 15,
}

export function getSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')
    return { ...DEFAULT_SETTINGS, ...(saved || {}) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function applySettings(settings = getSettings()) {
  const root = document.documentElement
  root.classList.toggle('rw-density-compact', settings.density === 'compact')
  root.classList.toggle('rw-high-contrast', Boolean(settings.highContrast))
  root.classList.toggle('rw-dark-mode', settings.theme === 'dark')
  root.style.colorScheme = settings.theme === 'dark' ? 'dark' : 'light'
  return settings
}

export function saveSettings(next) {
  const settings = { ...DEFAULT_SETTINGS, ...next }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  applySettings(settings)
  window.dispatchEvent(new CustomEvent('recordsweb-settings-changed', { detail: settings }))
  return settings
}

export function resetSettings() {
  localStorage.removeItem(SETTINGS_KEY)
  return saveSettings(DEFAULT_SETTINGS)
}
