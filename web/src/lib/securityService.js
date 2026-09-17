import { supabase, supabaseConfigured } from './supabase'
import { getRecordsWebDeviceIdentity } from './deviceIdentity'

const SECURITY_SESSION_KEY = 'recordsweb-security-session-id'

function getSecuritySessionId() {
  try { return sessionStorage.getItem(SECURITY_SESSION_KEY) || '' } catch { return '' }
}
function setSecuritySessionId(value) {
  try {
    if (value) sessionStorage.setItem(SECURITY_SESSION_KEY, value)
    else sessionStorage.removeItem(SECURITY_SESSION_KEY)
  } catch {}
}

async function invokeSecurity(body, { authenticated = true } = {}) {
  if (!supabaseConfigured || !supabase) return { ok: true, demo: true }
  const device = await getRecordsWebDeviceIdentity()
  const sessionId = getSecuritySessionId()
  const { data, error } = await supabase.functions.invoke('recordsweb-security', {
    body: { ...body, deviceHash: device.hash, sessionId },
    headers: {
      'x-recordsweb-device': device.hash,
      ...(sessionId ? { 'x-recordsweb-session': sessionId } : {}),
    },
  })
  if (error) {
    let message = error.message || 'RecordsWeb security service failed.'
    try {
      const payload = await error.context?.clone?.().json?.()
      if (payload?.error) message = payload.error
      else if (payload?.message) message = payload.message
    } catch {}
    const wrapped = new Error(message)
    wrapped.code = data?.code
    throw wrapped
  }
  if (data?.error) {
    const wrapped = new Error(data.error)
    wrapped.code = data.code
    throw wrapped
  }
  return data
}

export async function preflightLogin({ email, organisationCode }) {
  return invokeSecurity({ action: 'preflight-login', email, organisationCode }, { authenticated: false })
}

export async function recordLoginResult({ email, organisationCode, success, userId = null, failureCode = null }) {
  return invokeSecurity({ action: 'login-result', email, organisationCode, success, userId, failureCode }, { authenticated: false }).catch(() => null)
}

export async function registerSecuritySession({ appVersion = '', deviceName = '' } = {}) {
  const device = await getRecordsWebDeviceIdentity()
  const result = await invokeSecurity({
    action: 'register-session',
    appVersion,
    deviceName: deviceName || device.name,
    platform: device.platform,
  })
  if (result?.session?.id) setSecuritySessionId(result.session.id)
  return result
}

export async function heartbeatSecuritySession() {
  return invokeSecurity({ action: 'session-heartbeat' })
}

export async function listMySecuritySessions() {
  const result = await invokeSecurity({ action: 'list-my-sessions' })
  return result.sessions || []
}

export async function revokeMySecuritySession(targetSessionId, reason = 'user_revoked') {
  const result = await invokeSecurity({ action: 'revoke-session', targetSessionId, reason })
  if (targetSessionId === getSecuritySessionId()) setSecuritySessionId('')
  return result
}

export async function recordPatientAccess({ patientId, section = 'summary', accessType = 'view', reason = '', metadata = {} }) {
  return invokeSecurity({ action: 'record-access', patientId, section, accessType, reason, metadata })
}

export async function requestBreakGlass({ patientId, reason }) {
  return invokeSecurity({ action: 'break-glass', patientId, reason })
}

export async function setSecurityPin(pin) {
  return invokeSecurity({ action: 'set-security-pin', pin })
}

export async function performStepUp({ pin, purpose }) {
  return invokeSecurity({ action: 'step-up', pin, purpose })
}

export async function startDiscordLinkVerification({ patientId, discordUserId }) {
  return invokeSecurity({ action: 'discord-link-start', patientId, discordUserId })
}

export async function confirmDiscordLinkVerification({ challengeId, code }) {
  return invokeSecurity({ action: 'discord-link-confirm', challengeId, code })
}

export async function getPlatformSecurityOverview() {
  return invokeSecurity({ action: 'platform-security-overview' })
}

export async function listPlatformBans() {
  const result = await invokeSecurity({ action: 'platform-list-bans' })
  return result.bans || []
}

export async function createPlatformBan(payload) {
  return invokeSecurity({ action: 'platform-create-ban', ...payload })
}

export async function revokePlatformBan(banId, reason) {
  return invokeSecurity({ action: 'platform-revoke-ban', banId, reason })
}

export async function startPlatformSupportSession({ organisationId, reason, reference = '' }) {
  return invokeSecurity({ action: 'platform-start-support-session', organisationId, reason, reference })
}

export async function endPlatformSupportSession(supportSessionId) {
  return invokeSecurity({ action: 'platform-end-support-session', supportSessionId })
}

export { getSecuritySessionId, setSecuritySessionId }

export async function requireSecurityStepUp(purpose, message = 'Enter your 6-digit RecordsWeb Security PIN to continue.') {
  const pin = window.prompt(message)
  if (pin == null) throw new Error('Security verification was cancelled.')
  if (!/^\d{6}$/.test(String(pin).trim())) throw new Error('Security PIN must contain exactly 6 digits.')
  return performStepUp({ pin: String(pin).trim(), purpose })
}
