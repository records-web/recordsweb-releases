import { createClient } from '@supabase/supabase-js'
import { DEFAULT_DEMO_ACCOUNTS, ORGANISATION } from './demoData'
import { buildStaffDisplayName, normaliseRoles } from './staffOptions'
import { assertRecordsWebPassword } from './passwordPolicy'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && anonKey)

// RecordsWeb deliberately never restores a previous authentication session.
// Remove the legacy app session and this project's old Supabase auth token if a
// previous build stored one, then keep the new client memory-only.
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('recordsweb-session-v2')
    if (url) {
      const projectRef = new URL(url).hostname.split('.')[0]
      localStorage.removeItem(`sb-${projectRef}-auth-token`)
    }
  } catch {}
}

export const supabase = supabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null


async function invokeRecordsWebAdmin(body) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data, error } = await supabase.functions.invoke('recordsweb-admin', { body })

  if (error) {
    let message = error.message || 'RecordsWeb administration service failed.'
    try {
      const response = error.context
      if (response && typeof response.clone === 'function') {
        const payload = await response.clone().json()
        if (payload?.error) message = payload.error
        else if (payload?.message) message = payload.message
      }
    } catch {}

    if (/non-2xx/i.test(message)) {
      message = 'RecordsWeb administration service returned an error. Check that the recordsweb-admin Edge Function is deployed and that your signed-in profile has Management access.'
    }
    throw new Error(message)
  }

  if (data?.error) throw new Error(data.error)
  return data
}

async function auditAccountEvent(event) {
  try { const { recordAudit } = await import('./auditService'); return await recordAudit(event) } catch { return null }
}

export async function publicAdminAction(body) {
  if (!supabase) throw new Error('Supabase is not configured.')
  return invokeRecordsWebAdmin(body)
}

export async function checkAdminService() {
  if (!supabase) return { ok: true, demo: true }
  return invokeRecordsWebAdmin({ action: 'health' })
}

const DEMO_ACCOUNTS_KEY = 'recordsweb-demo-accounts-v2'

export function normaliseLoginName(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  const withDomain = trimmed.includes('@') ? trimmed : `${trimmed}@GW.HC`
  const [local, domain] = withDomain.split('@')
  if (!local || !domain || domain.toLowerCase() !== 'gw.hc') return withDomain
  return `${local.toLowerCase()}@GW.HC`
}

function normaliseAccount(account) {
  const roles = normaliseRoles(account.roles, account.role || 'Patient Coordinator')
  const role = roles.includes(account.role) ? account.role : roles[0]
  return { ...account, title: account.title || '', roles, role }
}

function getDemoAccounts() {
  try {
    const saved = JSON.parse(localStorage.getItem(DEMO_ACCOUNTS_KEY) || '[]')
    const merged = DEFAULT_DEMO_ACCOUNTS.map(normaliseAccount)
    for (const raw of saved) {
      const account = normaliseAccount(raw)
      const index = merged.findIndex((x) => x.id === account.id || x.username.toLowerCase() === account.username.toLowerCase())
      if (index >= 0) merged[index] = account
      else merged.push(account)
    }
    return merged
  } catch {
    return DEFAULT_DEMO_ACCOUNTS.map(normaliseAccount)
  }
}

function saveDemoAccounts(accounts) {
  localStorage.setItem(DEMO_ACCOUNTS_KEY, JSON.stringify(accounts.filter((account) => {
    const defaultAccount = DEFAULT_DEMO_ACCOUNTS.find((item) => item.id === account.id)
    return !defaultAccount || JSON.stringify(normaliseAccount(account)) !== JSON.stringify(normaliseAccount(defaultAccount))
  })))
}

const LOGIN_GUARD_KEY = 'recordsweb-login-guard-v1'
const LOGIN_MAX_FAILURES = 5
const LOGIN_LOCK_MS = 10 * 60 * 1000

function readLoginGuard() {
  try { return JSON.parse(localStorage.getItem(LOGIN_GUARD_KEY) || '{}') } catch { return {} }
}
function saveLoginGuard(value) { localStorage.setItem(LOGIN_GUARD_KEY, JSON.stringify(value)) }
function loginGuardKey(email) { return String(email || '').toLowerCase() }
function checkLoginGuard(email) {
  const all = readLoginGuard(); const entry = all[loginGuardKey(email)]
  if (!entry?.locked_until) return
  const remaining = new Date(entry.locked_until).getTime() - Date.now()
  if (remaining <= 0) { delete all[loginGuardKey(email)]; saveLoginGuard(all); return }
  const minutes = Math.ceil(remaining / 60000)
  throw new Error(`Too many unsuccessful sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`)
}
function noteLoginFailure(email) {
  const all = readLoginGuard(); const key = loginGuardKey(email); const previous = all[key] || { failures: 0 }
  const failures = Number(previous.failures || 0) + 1
  all[key] = failures >= LOGIN_MAX_FAILURES ? { failures, locked_until: new Date(Date.now() + LOGIN_LOCK_MS).toISOString() } : { failures }
  saveLoginGuard(all)
}
function clearLoginFailures(email) { const all = readLoginGuard(); delete all[loginGuardKey(email)]; saveLoginGuard(all) }

export async function signInRecordsWeb({ username, password }) {
  const email = normaliseLoginName(username)
  if (!email.toLowerCase().endsWith('@gw.hc')) {
    throw new Error('Use your Grove Way Health Centre login in the format first.last@GW.HC.')
  }
  checkLoginGuard(email)

  if (!supabase) {
    const account = getDemoAccounts().find((a) => a.username.toLowerCase() === email.toLowerCase())
    if (!account || account.password !== password) { noteLoginFailure(email); throw new Error('Incorrect username or password.') }
    if (!account.active) {
      const reason = String(account.disabled_reason || '').trim()
      throw new Error(reason ? `This RecordsWeb account has been disabled. Reason: ${reason}` : 'This RecordsWeb account has been disabled.')
    }
    clearLoginFailures(email)
    const { password: _password, ...profile } = account
    await auditAccountEvent({ action: 'account.login', entityType: 'profile', entityId: account.id, description: 'Signed in to RecordsWeb.' })
    return { user: { id: account.id, email }, profile }
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email: email.toLowerCase(), password })
  if (error) { noteLoginFailure(email); throw new Error('Incorrect username or password.') }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*, organisations(*)')
    .eq('id', data.user.id)
    .single()

  if (profileError) { await supabase.auth.signOut(); throw profileError }
  if (!profile.active) {
    const reason = String(profile.disabled_reason || '').trim()
    await supabase.auth.signOut()
    throw new Error(reason ? `This RecordsWeb account has been disabled. Reason: ${reason}` : 'This RecordsWeb account has been disabled.')
  }
  if (profile.organisations?.org_code?.toLowerCase() !== ORGANISATION.org_code.toLowerCase()) {
    await supabase.auth.signOut()
    throw new Error('This account is not registered to Grove Way Health Centre.')
  }
  clearLoginFailures(email)
  try {
    const { error: markLoginError } = await supabase.rpc('recordsweb_mark_login')
    if (markLoginError) console.warn('RecordsWeb login marker unavailable:', markLoginError.message)
  } catch (markLoginError) {
    console.warn('RecordsWeb login marker failed:', markLoginError)
  }
  await auditAccountEvent({ action: 'account.login', entityType: 'profile', entityId: data.user.id, description: 'Signed in to RecordsWeb.' })
  return { user: data.user, profile: normaliseAccount(profile) }
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut()
}

export async function listAccounts() {
  if (!supabase) {
    return getDemoAccounts().map(({ password: _password, ...account }) => account)
  }
  const { data, error } = await supabase.from('profiles').select('*, organisations(name, org_code)').order('display_name')
  if (error) throw error
  return (data || []).map(normaliseAccount)
}

export async function createAccount(payload) {
  const username = normaliseLoginName(payload.username)
  if (!username.toLowerCase().endsWith('@gw.hc')) throw new Error('Account usernames must end in @GW.HC.')
  assertRecordsWebPassword(payload.password, username)
  const roles = normaliseRoles(payload.roles, payload.role || 'Patient Coordinator')
  const role = roles.includes(payload.role) ? payload.role : roles[0]
  const title = String(payload.title || '').trim()

  if (!supabase) {
    const accounts = getDemoAccounts()
    if (accounts.some((a) => a.username.toLowerCase() === username.toLowerCase())) throw new Error('That RecordsWeb username already exists.')
    const account = {
      id: `demo-account-${Date.now()}`,
      username,
      password: payload.password,
      password_history: [payload.password],
      title,
      first_name: payload.first_name,
      last_name: payload.last_name,
      display_name: buildStaffDisplayName({ title, first_name: payload.first_name, last_name: payload.last_name }),
      role,
      roles,
      is_management: Boolean(payload.is_management),
      active: true,
      must_change_password: true,
      organisation_id: ORGANISATION.id,
      organisation_name: ORGANISATION.name,
      created_at: new Date().toISOString(),
    }
    accounts.push(account)
    saveDemoAccounts(accounts)
    const { password: _password, ...safe } = account
    return safe
  }

  const data = await invokeRecordsWebAdmin({ action: 'create', ...payload, title, roles, role, username })
  return normaliseAccount(data.profile)
}

export async function updateAccount(userId, payload) {
  const roles = normaliseRoles(payload.roles, payload.role || 'Patient Coordinator')
  const role = roles.includes(payload.role) ? payload.role : roles[0]
  const patch = {
    title: String(payload.title || '').trim(),
    first_name: String(payload.first_name || '').trim(),
    last_name: String(payload.last_name || '').trim(),
    role,
    roles,
    is_management: Boolean(payload.is_management),
  }
  patch.display_name = buildStaffDisplayName(patch)

  if (!patch.first_name || !patch.last_name) throw new Error('First and last name are required.')

  if (!supabase) {
    const accounts = getDemoAccounts()
    const index = accounts.findIndex((account) => account.id === userId)
    if (index < 0) throw new Error('Account not found.')
    accounts[index] = { ...accounts[index], ...patch, updated_at: new Date().toISOString() }
    saveDemoAccounts(accounts)
    const { password: _password, ...safe } = accounts[index]
    return safe
  }

  const data = await invokeRecordsWebAdmin({ action: 'update-profile', user_id: userId, ...patch })
  return normaliseAccount(data.profile)
}

export async function setAccountActive(userId, active, reason = '') {
  const cleanReason = String(reason || '').trim()
  if (!active && !cleanReason) throw new Error('Enter a reason for disabling this account.')

  if (!supabase) {
    const now = new Date().toISOString()
    const accounts = getDemoAccounts().map((a) => a.id === userId
      ? {
          ...a,
          active,
          disabled_reason: active ? null : cleanReason,
          disabled_at: active ? null : now,
          disabled_by: active ? null : 'demo-manager',
          force_logout_at: active ? a.force_logout_at : now,
        }
      : a)
    saveDemoAccounts(accounts)
    return true
  }
  await invokeRecordsWebAdmin({ action: 'set-active', user_id: userId, active, reason: cleanReason })
  return true
}

export async function forceLogoutAccount(userId) {
  if (!supabase) {
    const now = new Date().toISOString()
    const accounts = getDemoAccounts().map((a) => a.id === userId ? { ...a, force_logout_at: now } : a)
    saveDemoAccounts(accounts)
    return true
  }
  await invokeRecordsWebAdmin({ action: 'force-logout', user_id: userId })
  return true
}

export async function getOwnAccountAccessState(userId) {
  if (!userId) return null
  if (!supabase) {
    const account = getDemoAccounts().find((item) => item.id === userId)
    return account ? {
      active: Boolean(account.active),
      disabled_reason: account.disabled_reason || '',
      force_logout_at: account.force_logout_at || null,
    } : null
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('active,disabled_reason,force_logout_at')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

export function subscribeToOwnAccountAccess(userId, onChange) {
  if (!supabase || !userId) return () => {}
  const channel = supabase
    .channel(`recordsweb-account-access-${userId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'profiles',
      filter: `id=eq.${userId}`,
    }, (payload) => onChange?.(payload.new))
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}

export async function resetAccountPassword(userId, password) {
  assertRecordsWebPassword(password)
  if (!supabase) {
    const accounts = getDemoAccounts()
    const index = accounts.findIndex((a) => a.id === userId)
    if (index < 0) throw new Error('Account not found.')
    const history = [...new Set([...(accounts[index].password_history || []), accounts[index].password].filter(Boolean))]
    if (history.includes(password)) throw new Error('Choose a temporary password this user has not used recently.')
    accounts[index] = { ...accounts[index], password, password_history: [...history, password].slice(-5), must_change_password: true }
    saveDemoAccounts(accounts)
    return true
  }
  await invokeRecordsWebAdmin({ action: 'reset-password', user_id: userId, password })
  return true
}

export async function demoRecoverPassword(userId, password) {
  assertRecordsWebPassword(password)
  const accounts = getDemoAccounts()
  const index = accounts.findIndex((a) => a.id === userId)
  if (index < 0) throw new Error('Account not found.')
  const history = [...new Set([...(accounts[index].password_history || []), accounts[index].password].filter(Boolean))]
  if (history.includes(password)) throw new Error('Choose a password you have not used recently.')
  accounts[index] = { ...accounts[index], password, password_history: [...history, password].slice(-5), must_change_password: false, password_changed_at: new Date().toISOString() }
  saveDemoAccounts(accounts)
  return true
}

export async function verifyCurrentPassword(username, password) {
  const email = normaliseLoginName(username)
  if (!supabase) {
    const account = getDemoAccounts().find((a) => a.username.toLowerCase() === email.toLowerCase())
    if (!account || account.password !== password) throw new Error('Password is incorrect.')
    return true
  }
  const { error } = await supabase.auth.signInWithPassword({ email: email.toLowerCase(), password })
  if (error) throw new Error('Password is incorrect.')
  return true
}

export async function changeOwnPassword({ username, currentPassword, newPassword }) {
  const email = normaliseLoginName(username)
  if (!email) throw new Error('Unable to determine the signed-in username.')
  if (!currentPassword) throw new Error('Enter your current password.')
  assertRecordsWebPassword(newPassword, email)

  if (!supabase) {
    const accounts = getDemoAccounts()
    const index = accounts.findIndex((a) => a.username.toLowerCase() === email.toLowerCase())
    if (index < 0 || accounts[index].password !== currentPassword) throw new Error('Current password is incorrect.')
    const history = [...new Set([...(accounts[index].password_history || []), accounts[index].password].filter(Boolean))]
    if (history.includes(newPassword)) throw new Error('Choose a password you have not used recently.')
    accounts[index] = { ...accounts[index], password: newPassword, password_history: [...history, newPassword].slice(-5), must_change_password: false, password_changed_at: new Date().toISOString() }
    saveDemoAccounts(accounts)
    await auditAccountEvent({ action: 'account.password.changed', entityType: 'profile', entityId: accounts[index].id, description: 'Password changed.' })
    return true
  }

  await invokeRecordsWebAdmin({ action: 'change-own-password', current_password: currentPassword, new_password: newPassword })
  return true
}
