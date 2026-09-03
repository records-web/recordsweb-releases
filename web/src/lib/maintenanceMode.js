import { ORGANISATION } from './demoData'
import { supabase, supabaseConfigured } from './supabase'

const DEMO_KEY = 'recordsweb-demo-maintenance-v1'
const DEFAULT_MESSAGE = 'RecordsWeb is currently unavailable while scheduled maintenance is being carried out.'

export const DEFAULT_MAINTENANCE_STATE = {
  organisation_code: ORGANISATION.org_code,
  enabled: false,
  message: DEFAULT_MESSAGE,
  estimated_end_at: null,
  enabled_at: null,
  enabled_by_name: '',
  updated_at: null,
}

function normaliseState(value = {}) {
  return {
    ...DEFAULT_MAINTENANCE_STATE,
    ...value,
    enabled: Boolean(value?.enabled),
    message: String(value?.message || DEFAULT_MESSAGE).trim() || DEFAULT_MESSAGE,
    estimated_end_at: value?.estimated_end_at || null,
    enabled_at: value?.enabled_at || null,
    enabled_by_name: String(value?.enabled_by_name || ''),
    updated_at: value?.updated_at || null,
  }
}

function readDemoState() {
  try {
    return normaliseState(JSON.parse(localStorage.getItem(DEMO_KEY) || '{}'))
  } catch {
    return { ...DEFAULT_MAINTENANCE_STATE }
  }
}

function writeDemoState(value) {
  const next = normaliseState(value)
  localStorage.setItem(DEMO_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('recordsweb-maintenance-changed', { detail: next }))
  return next
}

export async function loadMaintenanceState() {
  if (!supabaseConfigured || !supabase) return readDemoState()

  const { data, error } = await supabase.rpc('recordsweb_public_maintenance_state', {
    p_organisation_code: ORGANISATION.org_code,
  })

  if (error) {
    // A missing migration must never brick the sign-in screen. Management will
    // see a clear setup error when they open the maintenance panel.
    if (/recordsweb_public_maintenance_state|does not exist|schema cache/i.test(error.message || '')) {
      return { ...DEFAULT_MAINTENANCE_STATE, setup_required: true }
    }
    throw error
  }

  const row = Array.isArray(data) ? data[0] : data
  return normaliseState(row || {})
}

export async function setMaintenanceMode({ enabled, message, estimatedEndAt = null, actorName = '' }) {
  const cleanMessage = String(message || DEFAULT_MESSAGE).trim().slice(0, 500) || DEFAULT_MESSAGE

  if (!supabaseConfigured || !supabase) {
    return writeDemoState({
      ...readDemoState(),
      enabled: Boolean(enabled),
      message: cleanMessage,
      estimated_end_at: estimatedEndAt || null,
      enabled_at: enabled ? new Date().toISOString() : null,
      enabled_by_name: actorName || 'Management user',
      updated_at: new Date().toISOString(),
    })
  }

  const { data, error } = await supabase.rpc('recordsweb_set_maintenance', {
    p_enabled: Boolean(enabled),
    p_message: cleanMessage,
    p_estimated_end_at: estimatedEndAt || null,
  })
  if (error) {
    if (/recordsweb_set_maintenance|does not exist|schema cache/i.test(error.message || '')) {
      throw new Error('System maintenance is not installed in Supabase. Run supabase/recordsweb-3.1.0.sql first.')
    }
    throw new Error(error.message || 'Unable to update maintenance mode.')
  }
  return normaliseState(Array.isArray(data) ? data[0] : data)
}

export function subscribeToMaintenance(callback) {
  if (typeof callback !== 'function') return () => {}

  if (!supabaseConfigured || !supabase) {
    const onChange = (event) => callback(normaliseState(event?.detail || readDemoState()))
    window.addEventListener('recordsweb-maintenance-changed', onChange)
    return () => window.removeEventListener('recordsweb-maintenance-changed', onChange)
  }

  const channel = supabase
    .channel(`recordsweb-maintenance-${ORGANISATION.org_code}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'system_maintenance',
      filter: `organisation_code=eq.${ORGANISATION.org_code}`,
    }, (payload) => {
      const next = payload?.new
      if (next && Object.keys(next).length) callback(normaliseState(next))
    })
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}
