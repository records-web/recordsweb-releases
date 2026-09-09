import { supabase, supabaseConfigured } from './supabase'

export const PLATFORM_OPERATOR_EMAIL_FORMAT = 'gus.farnsworth@XX.XX'
export const PLATFORM_OPERATOR_EMAIL_PATTERN = /^gus\.farnsworth@[a-z]{2}\.[a-z]{2}$/i

function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export function isPlatformOperator(userOrSession) {
  const user = userOrSession?.user || userOrSession
  return PLATFORM_OPERATOR_EMAIL_PATTERN.test(normaliseEmail(user?.email))
}

export async function getPlatformOperatorSession() {
  if (!supabaseConfigured || !supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data?.session || null
}

export async function verifyPlatformOperator() {
  if (!supabaseConfigured || !supabase) return false
  const { data, error } = await supabase.rpc('recordsweb_is_platform_operator')
  if (error) {
    if (/recordsweb_is_platform_operator|does not exist|schema cache/i.test(error.message || '')) {
      throw new Error('Platform management is not configured in Supabase. Run the RecordsWeb platform-management migration.')
    }
    throw new Error(error.message || 'Unable to verify platform management access.')
  }
  return data === true
}

export async function signInPlatformOperator({ email, password }) {
  if (!supabaseConfigured || !supabase) throw new Error('Supabase is not configured for this RecordsWeb website.')
  const requestedEmail = normaliseEmail(email)
  if (!PLATFORM_OPERATOR_EMAIL_PATTERN.test(requestedEmail)) {
    throw new Error(`Platform operator accounts must use the reserved ${PLATFORM_OPERATOR_EMAIL_FORMAT} format.`)
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: requestedEmail,
    password: String(password || ''),
  })
  if (error) throw new Error('Unable to sign in with that platform operator account.')

  if (!isPlatformOperator(data?.user)) {
    await supabase.auth.signOut().catch(() => {})
    throw new Error('This account is not a RecordsWeb platform operator account.')
  }

  let serverAuthorised = false
  try {
    serverAuthorised = await verifyPlatformOperator()
  } catch (err) {
    await supabase.auth.signOut().catch(() => {})
    throw err
  }
  if (!serverAuthorised) {
    await supabase.auth.signOut().catch(() => {})
    throw new Error('This platform operator account is not assigned to its matching active RecordsWeb organisation.')
  }

  return data?.session || null
}

export async function signOutPlatformOperator() {
  if (supabase) await supabase.auth.signOut()
}

function normalisePlatformState(row = {}) {
  return {
    enabled: Boolean(row?.enabled),
    message: String(row?.message || 'RecordsWeb is currently unavailable while scheduled maintenance is being carried out.'),
    estimated_end_at: row?.estimated_end_at || null,
    enabled_at: row?.enabled_at || null,
    enabled_by_name: String(row?.enabled_by_name || ''),
    updated_at: row?.updated_at || null,
  }
}

export async function getPlatformMaintenanceState() {
  if (!supabaseConfigured || !supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('recordsweb_public_platform_state')
  if (error) throw new Error(error.message || 'Unable to load platform maintenance state.')
  return normalisePlatformState(Array.isArray(data) ? data[0] : data)
}

export async function setPlatformMaintenance({ enabled, message, estimatedEndAt = null }) {
  if (!supabaseConfigured || !supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('recordsweb_set_platform_maintenance', {
    p_enabled: Boolean(enabled),
    p_message: String(message || '').trim() || null,
    p_estimated_end_at: estimatedEndAt || null,
  })
  if (error) {
    if (/permission|access denied|not authorised|not authorized/i.test(error.message || '')) {
      throw new Error('This account is not authorised to change RecordsWeb platform maintenance.')
    }
    throw new Error(error.message || 'Unable to update RecordsWeb platform maintenance.')
  }
  return normalisePlatformState(Array.isArray(data) ? data[0] : data)
}

export async function listPlatformReleases() {
  if (!supabaseConfigured || !supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('recordsweb_operator_list_releases')
  if (error) throw new Error(error.message || 'Unable to load RecordsWeb releases.')
  return Array.isArray(data) ? data : []
}

export async function publishPlatformRelease({ version, channel = 'stable', releaseNotes = '', active = true }) {
  if (!supabaseConfigured || !supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('recordsweb_operator_publish_release', {
    p_version: String(version || '').trim(),
    p_channel: String(channel || 'stable').trim(),
    p_release_notes: String(releaseNotes || '').trim() || null,
    p_active: Boolean(active),
  })
  if (error) throw new Error(error.message || 'Unable to publish RecordsWeb release.')
  return data
}

export async function setPlatformReleaseActive(id, active) {
  if (!supabaseConfigured || !supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('recordsweb_operator_set_release_active', {
    p_release_id: id,
    p_active: Boolean(active),
  })
  if (error) throw new Error(error.message || 'Unable to update release status.')
  return data
}
