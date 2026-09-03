const COMMON_PASSWORDS = new Set([
  'password123', 'password1', 'qwerty123', 'letmein123', 'welcome123',
  'recordsweb1', 'groveway123', 'changeme123', 'admin12345', '1234567890',
])

export function validateRecordsWebPassword(password, username = '') {
  const value = String(password || '')
  if (value.length < 10) return 'Password must contain at least 10 characters.'
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Password must contain at least one letter and one number.'
  if (/^\s|\s$/.test(value)) return 'Password cannot start or end with a space.'
  if (COMMON_PASSWORDS.has(value.toLowerCase())) return 'Choose a less common password.'
  const local = String(username || '').split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase()
  if (local.length >= 5 && value.replace(/[^a-z0-9]/gi, '').toLowerCase().includes(local)) {
    return 'Password must not contain your RecordsWeb username.'
  }
  return ''
}

export function assertRecordsWebPassword(password, username = '') {
  const error = validateRecordsWebPassword(password, username)
  if (error) throw new Error(error)
  return String(password)
}
