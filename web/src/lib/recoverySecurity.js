import { supabase, supabaseConfigured, normaliseLoginName, publicAdminAction, listAccounts, demoRecoverPassword } from './supabase'

const DEMO_KEY = 'recordsweb-demo-recovery-v1'
function readDemo() { try { return JSON.parse(localStorage.getItem(DEMO_KEY) || '{}') } catch { return {} } }
function writeDemo(value) { localStorage.setItem(DEMO_KEY, JSON.stringify(value)) }
function validateCode(code) { const clean = String(code || '').trim(); if (!/^\d{6}$/.test(clean)) throw new Error('Recovery code must contain exactly 6 digits.'); return clean }

export async function hasRecoveryCode(userId) {
  if (!supabaseConfigured || !supabase) return Boolean(readDemo()[userId]?.code)
  const { data, error } = await supabase.rpc('recordsweb_has_recovery_code')
  if (error) {
    if (/recordsweb_has_recovery_code/i.test(error.message || '')) throw new Error('Account recovery is not installed in Supabase. Run supabase/recordsweb-2.7.0.sql.')
    throw error
  }
  return Boolean(data)
}

export async function setRecoveryCode({ userId, newCode, currentCode = '' }) {
  const next = validateCode(newCode)
  if (!supabaseConfigured || !supabase) {
    const data = readDemo(); const existing = data[userId]
    if (existing?.code && validateCode(currentCode) !== existing.code) throw new Error('Current recovery code is incorrect.')
    data[userId] = { code: next, updated_at: new Date().toISOString() }; writeDemo(data); return true
  }
  const { error } = await supabase.rpc('recordsweb_set_recovery_code', { p_new_code: next, p_current_code: currentCode || null })
  if (error) throw new Error(error.message || 'Unable to update recovery code.')
  return true
}

export async function usernameReminder({ firstName, lastName, recoveryCode }) {
  const code = validateCode(recoveryCode)
  if (!firstName.trim() || !lastName.trim()) throw new Error('Enter your first and last name.')
  if (!supabaseConfigured || !supabase) {
    const accounts = await listAccounts()
    const recovery = readDemo()
    const matches = accounts.filter((a) => String(a.first_name || '').toLowerCase() === firstName.trim().toLowerCase() && String(a.last_name || '').toLowerCase() === lastName.trim().toLowerCase() && recovery[a.id]?.code === code)
    if (matches.length !== 1) throw new Error('The details could not be verified. Contact Management if you cannot recover your username.')
    return matches[0].username
  }
  const data = await publicAdminAction({ action: 'username-reminder', first_name: firstName.trim(), last_name: lastName.trim(), recovery_code: code })
  return data.username
}

export async function recoverPassword({ username, recoveryCode, newPassword }) {
  const code = validateCode(recoveryCode)
  const login = normaliseLoginName(username)
  if (!supabaseConfigured || !supabase) {
    const accounts = await listAccounts(); const account = accounts.find((a) => a.username.toLowerCase() === login.toLowerCase())
    if (!account || readDemo()[account.id]?.code !== code) throw new Error('The username or recovery code is incorrect.')
    await demoRecoverPassword(account.id, newPassword)
    return true
  }
  await publicAdminAction({ action: 'recover-password', username: login, recovery_code: code, new_password: newPassword })
  return true
}
