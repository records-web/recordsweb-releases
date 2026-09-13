import { supabase, supabaseConfigured } from './supabase'
import { assertBillingWriteAllowed } from './billingAccess'
import { recordAudit } from './auditService'
import { getInstallationNamespace } from './installation'

const EPISODES_KEY = `recordsweb-care-episodes-v1-${getInstallationNamespace()}`
const WORK_KEY = `recordsweb-care-work-items-v1-${getInstallationNamespace()}`

function readLocal(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocal(key, rows) {
  localStorage.setItem(key, JSON.stringify(rows))
}

function missingMigration(error) {
  const text = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return error?.code === '42P01' || error?.code === 'PGRST205' || text.includes('does not exist') || text.includes('schema cache')
}

function migrationError() {
  return new Error('RecordsWeb 3.5.0 care workspace tables are not installed yet. Run supabase/recordsweb-3.5.0-care-workspaces.sql, then refresh RecordsWeb.')
}

function localInsert(key, payload) {
  const rows = readLocal(key)
  const row = {
    id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...payload,
  }
  rows.unshift(row)
  writeLocal(key, rows)
  return row
}

function localUpdate(key, id, patch) {
  const rows = readLocal(key)
  const index = rows.findIndex((row) => row.id === id)
  if (index < 0) throw new Error('Record not found.')
  rows[index] = { ...rows[index], ...patch, updated_at: new Date().toISOString() }
  writeLocal(key, rows)
  return rows[index]
}

export function careModeLabel(mode) {
  if (mode === 'hospital') return 'Secondary Care (Hospital)'
  if (mode === 'ambulance') return 'Ambulance / PHEM'
  return 'Primary Care (GP)'
}

export async function listCareEpisodes(mode, { activeOnly = false } = {}) {
  if (!supabaseConfigured) {
    return readLocal(EPISODES_KEY)
      .filter((row) => row.care_mode === mode && (!activeOnly || !['discharged', 'closed'].includes(row.status)))
      .sort((a, b) => String(b.started_at || b.created_at || '').localeCompare(String(a.started_at || a.created_at || '')))
  }
  let query = supabase.from('recordsweb_care_episodes').select('*').eq('care_mode', mode).order('started_at', { ascending: false })
  if (activeOnly) query = query.not('status', 'in', '(discharged,closed)')
  const { data, error } = await query
  if (error) {
    if (missingMigration(error)) throw migrationError()
    throw error
  }
  return data || []
}

export async function createCareEpisode(mode, payload) {
  assertBillingWriteAllowed('create a care episode')
  const now = new Date().toISOString()
  const clean = {
    care_mode: mode,
    episode_type: mode === 'hospital' ? 'hospital_admission' : 'ambulance_incident',
    status: mode === 'hospital' ? 'admitted' : 'mobilised',
    priority: mode === 'ambulance' ? 'C2' : 'Routine',
    started_at: now,
    observations: [],
    treatments: [],
    ...payload,
  }
  if (!clean.reference) {
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 12)
    clean.reference = mode === 'hospital' ? `ADM-${stamp}` : `CAD-${stamp}`
  }
  let row
  if (!supabaseConfigured) row = localInsert(EPISODES_KEY, clean)
  else {
    const { data, error } = await supabase.from('recordsweb_care_episodes').insert(clean).select().single()
    if (error) {
      if (missingMigration(error)) throw migrationError()
      throw error
    }
    row = data
  }
  await recordAudit({ action: `care.${mode}.episode.created`, entityType: 'care_episode', entityId: row.id, patientId: row.patient_id || null, description: `Created ${mode === 'hospital' ? 'hospital admission' : 'ambulance incident'} ${row.reference}.` }).catch(() => {})
  return row
}

export async function updateCareEpisode(id, patch) {
  assertBillingWriteAllowed('update a care episode')
  const clean = { ...patch }
  if (['discharged', 'closed'].includes(clean.status) && !clean.ended_at) clean.ended_at = new Date().toISOString()
  let row
  if (!supabaseConfigured) row = localUpdate(EPISODES_KEY, id, clean)
  else {
    const { data, error } = await supabase.from('recordsweb_care_episodes').update(clean).eq('id', id).select().single()
    if (error) {
      if (missingMigration(error)) throw migrationError()
      throw error
    }
    row = data
  }
  await recordAudit({ action: 'care.episode.updated', entityType: 'care_episode', entityId: id, patientId: row?.patient_id || null, description: `Updated care episode ${row?.reference || id}.` }).catch(() => {})
  return row
}

export async function addEpisodeObservation(episode, observation) {
  const rows = Array.isArray(episode?.observations) ? episode.observations : []
  return updateCareEpisode(episode.id, { observations: [...rows, { id: crypto.randomUUID?.() || `${Date.now()}`, recorded_at: new Date().toISOString(), ...observation }] })
}

export async function addEpisodeTreatment(episode, treatment) {
  const rows = Array.isArray(episode?.treatments) ? episode.treatments : []
  return updateCareEpisode(episode.id, { treatments: [...rows, { id: crypto.randomUUID?.() || `${Date.now()}`, recorded_at: new Date().toISOString(), ...treatment }] })
}

export async function listCareWorkItems(mode, { includeCompleted = false } = {}) {
  if (!supabaseConfigured) {
    return readLocal(WORK_KEY)
      .filter((row) => row.care_mode === mode && (includeCompleted || row.status !== 'completed'))
      .sort((a, b) => String(a.due_at || '9999').localeCompare(String(b.due_at || '9999')))
  }
  let query = supabase.from('recordsweb_care_work_items').select('*').eq('care_mode', mode).order('due_at', { ascending: true, nullsFirst: false })
  if (!includeCompleted) query = query.neq('status', 'completed')
  const { data, error } = await query
  if (error) {
    if (missingMigration(error)) throw migrationError()
    throw error
  }
  return data || []
}

export async function createCareWorkItem(mode, payload) {
  assertBillingWriteAllowed('create a work item')
  const clean = { care_mode: mode, status: 'open', priority: 'Routine', ...payload }
  let row
  if (!supabaseConfigured) row = localInsert(WORK_KEY, clean)
  else {
    const { data, error } = await supabase.from('recordsweb_care_work_items').insert(clean).select().single()
    if (error) {
      if (missingMigration(error)) throw migrationError()
      throw error
    }
    row = data
  }
  await recordAudit({ action: 'care.work_item.created', entityType: 'care_work_item', entityId: row.id, patientId: row.patient_id || null, description: `Created work item: ${row.title}.` }).catch(() => {})
  return row
}

export async function updateCareWorkItem(id, patch) {
  assertBillingWriteAllowed('update a work item')
  let row
  if (!supabaseConfigured) row = localUpdate(WORK_KEY, id, patch)
  else {
    const { data, error } = await supabase.from('recordsweb_care_work_items').update(patch).eq('id', id).select().single()
    if (error) {
      if (missingMigration(error)) throw migrationError()
      throw error
    }
    row = data
  }
  await recordAudit({ action: 'care.work_item.updated', entityType: 'care_work_item', entityId: id, patientId: row?.patient_id || null, description: `Updated work item: ${row?.title || id}.` }).catch(() => {})
  return row
}
