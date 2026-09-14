import { supabase, supabaseConfigured } from './supabase'

async function invokeDiscord(body) {
  if (!supabaseConfigured || !supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.functions.invoke('recordsweb-discord', { body })
  if (error) {
    let message = error.message || 'RecordsWeb Discord service failed.'
    try {
      const response = error.context
      if (response && typeof response.clone === 'function') {
        const payload = await response.clone().json()
        if (payload?.error) message = payload.error
        else if (payload?.message) message = payload.message
      }
    } catch {}
    if (/non-2xx/i.test(message)) message = 'RecordsWeb Discord service returned an error. Check that the recordsweb-discord Edge Function is deployed.'
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data || {}
}

export async function loadDiscordIntegration() {
  return invokeDiscord({ action: 'status' })
}

export async function discoverDiscordServer(guildId) {
  return invokeDiscord({ action: 'discover-server', guild_id: String(guildId || '').trim() })
}

export async function saveDiscordIntegration({ guildId, channelId, maintenanceNotifications = true, loginDmEnabled = true, platformAnnouncementsEnabled = true }) {
  return invokeDiscord({
    action: 'save-integration',
    guild_id: String(guildId || '').trim(),
    channel_id: String(channelId || '').trim(),
    maintenance_notifications: Boolean(maintenanceNotifications),
    login_dm_enabled: Boolean(loginDmEnabled),
    platform_announcements_enabled: Boolean(platformAnnouncementsEnabled),
  })
}

export async function disconnectDiscordIntegration() {
  return invokeDiscord({ action: 'disconnect' })
}

export async function sendDiscordTest() {
  return invokeDiscord({ action: 'send-test' })
}

export async function sendDiscordLoginDetails({ userId, temporaryPassword, resetPassword = false }) {
  return invokeDiscord({
    action: 'send-login-dm',
    user_id: String(userId || '').trim(),
    temporary_password: String(temporaryPassword || ''),
    reset_password: Boolean(resetPassword),
  })
}


export async function sendPatientPrescriptionDm({ patientId, medicationId, eventType = 'issued' }) {
  return invokeDiscord({
    action: 'send-patient-prescription-dm',
    patient_id: String(patientId || '').trim(),
    medication_id: String(medicationId || '').trim(),
    event_type: String(eventType || 'issued').trim(),
  })
}

export async function sendPatientFitNoteDm({ patientId, documentId, resend = false }) {
  return invokeDiscord({
    action: 'send-patient-fit-note-dm',
    patient_id: String(patientId || '').trim(),
    document_id: String(documentId || '').trim(),
    resend: Boolean(resend),
  })
}

export async function broadcastDiscordMaintenance({ enabled, message, estimatedEndAt = null, enabledByName = '' }) {
  return invokeDiscord({
    action: 'broadcast-maintenance',
    enabled: Boolean(enabled),
    message: String(message || '').trim(),
    estimated_end_at: estimatedEndAt || null,
    enabled_by_name: String(enabledByName || '').trim(),
  })
}

export async function getPlatformDiscordOverview() {
  return invokeDiscord({ action: 'platform-overview' })
}

export async function listPlatformDiscordIntegrations() {
  return invokeDiscord({ action: 'platform-integrations' })
}

export async function listPlatformDiscordLogs(limit = 250) {
  return invokeDiscord({ action: 'platform-logs', limit: Number(limit) || 250 })
}

export async function runPlatformDiscordHealthCheck() {
  return invokeDiscord({ action: 'platform-health-check' })
}

export async function sendPlatformDiscordTest(organisationId) {
  return invokeDiscord({ action: 'platform-send-test', organisation_id: String(organisationId || '').trim() })
}

export async function sendPlatformDiscordBroadcast({ type = 'announcement', severity = 'info', title, message, scope = 'all', modes = [], organisationIds = [], affectedServices = [], startsAt = null, endsAt = null }) {
  return invokeDiscord({
    action: 'platform-broadcast',
    broadcast_type: String(type || 'announcement'),
    severity: String(severity || 'info'),
    title: String(title || '').trim(),
    message: String(message || '').trim(),
    target_scope: String(scope || 'all'),
    target_modes: Array.isArray(modes) ? modes : [],
    target_organisation_ids: Array.isArray(organisationIds) ? organisationIds : [],
    affected_services: Array.isArray(affectedServices) ? affectedServices : [],
    starts_at: startsAt || null,
    ends_at: endsAt || null,
  })
}

export async function retryPlatformDiscordBroadcast(broadcastId) {
  return invokeDiscord({ action: 'platform-retry-broadcast', broadcast_id: String(broadcastId || '').trim() })
}
