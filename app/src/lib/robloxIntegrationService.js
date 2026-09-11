import { supabase, supabaseConfigured } from './supabase'

async function invokeRobloxAdmin(body) {
  if (!supabaseConfigured || !supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.functions.invoke('recordsweb-roblox-admin', { body })
  if (error) {
    let message = error.message || 'RecordsWeb Roblox integration service failed.'
    try {
      const response = error.context
      if (response && typeof response.clone === 'function') {
        const payload = await response.clone().json()
        if (payload?.error) message = payload.error
        else if (payload?.message) message = payload.message
      }
    } catch {}
    if (/non-2xx/i.test(message)) {
      message = 'RecordsWeb Roblox integration returned an error. Check that the recordsweb-roblox-admin Edge Function is deployed.'
    }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export async function getRobloxIntegration() {
  return invokeRobloxAdmin({ action: 'status' })
}

export async function saveRobloxIntegration({ enabled, universeId, placeIds, displayNameMode, displayDurationSeconds, patientIdentityEnabled }) {
  return invokeRobloxAdmin({
    action: 'save',
    enabled: Boolean(enabled),
    universe_id: String(universeId || '').trim(),
    place_ids: Array.isArray(placeIds) ? placeIds : [],
    display_name_mode: String(displayNameMode || 'first_name_last_initial'),
    display_duration_seconds: Number(displayDurationSeconds) || 12,
    patient_identity_enabled: patientIdentityEnabled !== false,
  })
}

export async function generateRobloxConnectionCode() {
  return invokeRobloxAdmin({ action: 'generate-key' })
}

export async function revokeRobloxConnectionCode() {
  return invokeRobloxAdmin({ action: 'revoke-key' })
}
