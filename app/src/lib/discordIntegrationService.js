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

export async function saveDiscordIntegration({ guildId, channelId, maintenanceNotifications = true, loginDmEnabled = true }) {
  return invokeDiscord({
    action: 'save-integration',
    guild_id: String(guildId || '').trim(),
    channel_id: String(channelId || '').trim(),
    maintenance_notifications: Boolean(maintenanceNotifications),
    login_dm_enabled: Boolean(loginDmEnabled),
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

export async function broadcastDiscordMaintenance({ enabled, message, estimatedEndAt = null, enabledByName = '' }) {
  return invokeDiscord({
    action: 'broadcast-maintenance',
    enabled: Boolean(enabled),
    message: String(message || '').trim(),
    estimated_end_at: estimatedEndAt || null,
    enabled_by_name: String(enabledByName || '').trim(),
  })
}
