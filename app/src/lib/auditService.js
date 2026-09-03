import { supabase, supabaseConfigured } from './supabase'
import { ORGANISATION } from './demoData'

const DEMO_AUDIT_KEY = 'recordsweb-demo-audit-v1'

function getDemoAudit() {
  try { return JSON.parse(localStorage.getItem(DEMO_AUDIT_KEY) || '[]') } catch { return [] }
}
function saveDemoAudit(rows) { localStorage.setItem(DEMO_AUDIT_KEY, JSON.stringify(rows.slice(0, 3000))) }

export async function recordAudit({ action, entityType = '', entityId = null, patientId = null, description = '', metadata = {} }) {
  if (!action) return null
  if (!supabaseConfigured || !supabase) {
    const rows = getDemoAudit()
    const actor = (() => { try { return JSON.parse(sessionStorage.getItem('recordsweb-demo-audit-actor') || '{}') } catch { return {} } })()
    const row = {
      id: `demo-audit-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      organisation_id: ORGANISATION.id,
      actor_id: actor.id || 'demo-user',
      actor_name: actor.name || 'Demo user',
      actor_role: actor.role || 'Staff',
      patient_id: patientId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      description,
      metadata,
      created_at: new Date().toISOString(),
    }
    rows.unshift(row); saveDemoAudit(rows); return row
  }
  const { data, error } = await supabase.from('audit_log').insert({
    action,
    entity_type: entityType || null,
    entity_id: entityId || null,
    patient_id: patientId || null,
    description: description || null,
    metadata: metadata || {},
  }).select().single()
  if (error) {
    // Auditing should never prevent the clinical action from completing if a migration
    // has not yet been installed, but the error is surfaced in developer tools.
    console.warn('RecordsWeb audit event could not be written:', error.message)
    return null
  }
  return data
}

export function setDemoAuditActor(profile = {}, user = {}) {
  try {
    sessionStorage.setItem('recordsweb-demo-audit-actor', JSON.stringify({
      id: user?.id || profile?.id,
      name: profile?.display_name || profile?.username || 'Demo user',
      role: profile?.role || 'Staff',
    }))
  } catch {}
}

export async function listAuditLog({ search = '', action = '', patientId = '', actorId = '', limit = 500 } = {}) {
  if (!supabaseConfigured || !supabase) {
    const needle = search.trim().toLowerCase()
    return getDemoAudit().filter((row) => {
      if (action && row.action !== action) return false
      if (patientId && row.patient_id !== patientId) return false
      if (actorId && row.actor_id !== actorId) return false
      if (needle && !`${row.actor_name} ${row.actor_role} ${row.action} ${row.entity_type} ${row.description}`.toLowerCase().includes(needle)) return false
      return true
    }).slice(0, limit)
  }
  let query = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit)
  if (action) query = query.eq('action', action)
  if (patientId) query = query.eq('patient_id', patientId)
  if (actorId) query = query.eq('actor_id', actorId)
  if (search.trim()) {
    const safe = search.trim().replace(/[%_,()]/g, '')
    query = query.or(`actor_name.ilike.%${safe}%,actor_role.ilike.%${safe}%,action.ilike.%${safe}%,description.ilike.%${safe}%`)
  }
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function listMyAccountActivity(limit = 12) {
  if (!supabaseConfigured || !supabase) return getDemoAudit().filter((row) => row.action.startsWith('account.')).slice(0, limit)
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user?.id) return []
  const { data, error } = await supabase.from('audit_log').select('*').eq('actor_id', auth.user.id).like('action', 'account.%').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data || []
}
