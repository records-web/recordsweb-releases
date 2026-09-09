import { supabase, supabaseConfigured } from './supabase'

const DEMO_KEY = 'recordsweb-demo-platform-maintenance-v1'
const DEFAULT_MESSAGE = 'RecordsWeb is currently unavailable while scheduled maintenance is being carried out.'

export const DEFAULT_MAINTENANCE_STATE = {
  organisation_code: 'PLATFORM',
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

  const { data, error } = await supabase.rpc('recordsweb_public_platform_state')
  if (error) {
    if (/recordsweb_public_platform_state|does not exist|schema cache/i.test(error.message || '')) {
      return { ...DEFAULT_MAINTENANCE_STATE, setup_required: true }
    }
    throw error
  }

  const row = Array.isArray(data) ? data[0] : data
  return normaliseState(row || {})
}

// Deliberately unavailable to community clients. Platform-wide maintenance is
// managed only from the restricted RecordsWeb website operator area.
export async function setMaintenanceMode() {
  throw new Error('Platform maintenance can only be changed from the RecordsWeb website operator management area.')
}

export function subscribeToMaintenance(callback) {
  if (typeof callback !== 'function') return () => {}

  if (!supabaseConfigured || !supabase) {
    const onChange = (event) => callback(normaliseState(event?.detail || readDemoState()))
    window.addEventListener('recordsweb-maintenance-changed', onChange)
    return () => window.removeEventListener('recordsweb-maintenance-changed', onChange)
  }

  const channel = supabase
    .channel('recordsweb-platform-maintenance')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'recordsweb_platform_state',
      filter: 'id=eq.global',
    }, (payload) => {
      const next = payload?.new
      if (next && Object.keys(next).length) {
        callback(normaliseState({
          organisation_code: 'PLATFORM',
          enabled: next.maintenance_enabled,
          message: next.maintenance_message,
          estimated_end_at: next.maintenance_estimated_end_at,
          enabled_at: next.maintenance_enabled_at,
          enabled_by_name: next.maintenance_enabled_by_name,
          updated_at: next.updated_at,
        }))
      }
    })
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}
