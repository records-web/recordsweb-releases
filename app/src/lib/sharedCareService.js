import { supabase, supabaseConfigured } from './supabase'
import { recordAudit } from './auditService'

const DEMO_CODE = 'DEMO01'
const DEMO_LINKS_KEY = 'recordsweb-shared-care-demo-links-v1'
const DEMO_PATIENT_LINKS_KEY = 'recordsweb-shared-care-demo-patient-links-v1'
const DEMO_TRANSFERS_KEY = 'recordsweb-shared-care-transfers-v1'

function normaliseCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

function demoRead(key, fallback = []) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '')
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function demoWrite(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

export function sharedCareModeLabel(mode) {
  if (mode === 'hospital') return 'Secondary Care (Hospital)'
  if (mode === 'ambulance') return 'Ambulance / PHEM'
  return 'Primary Care (GP)'
}

export const SHARED_CARE_PERMISSION_OPTIONS = [
  ['problems', 'Problems'],
  ['medications', 'Medication'],
  ['consultations', 'Consultations'],
  ['investigations', 'Investigations'],
  ['documents', 'Documents'],
  ['referrals', 'Referrals'],
  ['care_history', 'Care history'],
  ['alerts', 'Clinical alerts'],
]

export async function getSharedCareCode() {
  if (!supabaseConfigured) return DEMO_CODE
  return rpc('recordsweb_shared_care_get_code')
}

export async function listSharedCareLinks() {
  if (!supabaseConfigured) return demoRead(DEMO_LINKS_KEY)
  return rpc('recordsweb_shared_care_list_links')
}

export async function requestSharedCareLink(code) {
  const clean = normaliseCode(code)
  if (clean.length !== 6) throw new Error('Enter the six-character Shared Care code.')
  if (!supabaseConfigured) {
    const rows = demoRead(DEMO_LINKS_KEY)
    rows.unshift({
      link_id: `demo-${Date.now()}`,
      status: 'pending',
      partner_organisation_id: 'demo-partner',
      partner_code: clean,
      partner_name: 'Demo Partner Community',
      partner_mode: 'hospital',
      requested_by_us: true,
      created_at: new Date().toISOString(),
      approved_at: null,
      updated_at: new Date().toISOString(),
      outbound_permissions: Object.fromEntries(SHARED_CARE_PERMISSION_OPTIONS.map(([key]) => [key, true])),
      inbound_permissions: Object.fromEntries(SHARED_CARE_PERMISSION_OPTIONS.map(([key]) => [key, true])),
    })
    demoWrite(DEMO_LINKS_KEY, rows)
    return rows[0].link_id
  }
  return rpc('recordsweb_shared_care_request', { p_code: clean })
}

export async function respondSharedCareLink(linkId, decision) {
  if (!supabaseConfigured) {
    const rows = demoRead(DEMO_LINKS_KEY).map((row) => row.link_id === linkId ? { ...row, status: decision === 'approve' ? 'active' : 'declined', approved_at: decision === 'approve' ? new Date().toISOString() : null, updated_at: new Date().toISOString() } : row)
    demoWrite(DEMO_LINKS_KEY, rows)
    return decision === 'approve' ? 'active' : 'declined'
  }
  return rpc('recordsweb_shared_care_respond', { p_link_id: linkId, p_decision: decision })
}

export async function setSharedCareLinkStatus(linkId, status) {
  if (!supabaseConfigured) {
    const rows = demoRead(DEMO_LINKS_KEY).map((row) => row.link_id === linkId ? { ...row, status, updated_at: new Date().toISOString() } : row)
    demoWrite(DEMO_LINKS_KEY, rows)
    return status
  }
  return rpc('recordsweb_shared_care_set_status', { p_link_id: linkId, p_status: status })
}

export async function updateSharedCarePermissions(linkId, permissions) {
  if (!supabaseConfigured) {
    const rows = demoRead(DEMO_LINKS_KEY).map((row) => row.link_id === linkId ? { ...row, outbound_permissions: permissions, updated_at: new Date().toISOString() } : row)
    demoWrite(DEMO_LINKS_KEY, rows)
    return permissions
  }
  return rpc('recordsweb_shared_care_update_permissions', { p_link_id: linkId, p_permissions: permissions })
}

export async function listSharedCarePatientCandidates(patientId) {
  if (!supabaseConfigured) return []
  return rpc('recordsweb_shared_care_patient_candidates', { p_patient_id: patientId })
}

export async function linkSharedCarePatient(sharedCareLinkId, localPatientId, remotePatientId) {
  if (!supabaseConfigured) {
    const rows = demoRead(DEMO_PATIENT_LINKS_KEY)
    const id = `demo-patient-link-${Date.now()}`
    rows.unshift({ id, shared_care_link_id: sharedCareLinkId, local_patient_id: localPatientId, remote_patient_id: remotePatientId })
    demoWrite(DEMO_PATIENT_LINKS_KEY, rows)
    return id
  }
  return rpc('recordsweb_shared_care_link_patient', {
    p_shared_care_link_id: sharedCareLinkId,
    p_local_patient_id: localPatientId,
    p_remote_patient_id: remotePatientId,
  })
}

export async function unlinkSharedCarePatient(sharedPatientLinkId) {
  if (!supabaseConfigured) {
    demoWrite(DEMO_PATIENT_LINKS_KEY, demoRead(DEMO_PATIENT_LINKS_KEY).filter((row) => row.id !== sharedPatientLinkId))
    return true
  }
  return rpc('recordsweb_shared_care_unlink_patient', { p_shared_patient_link_id: sharedPatientLinkId })
}

export async function listSharedCarePatientLinks(patientId) {
  if (!supabaseConfigured) return []
  return rpc('recordsweb_shared_care_list_patient_links', { p_patient_id: patientId })
}

export async function getSharedCarePatientSnapshot(sharedPatientLinkId) {
  if (!supabaseConfigured) return null
  return rpc('recordsweb_shared_care_patient_snapshot', { p_shared_patient_link_id: sharedPatientLinkId })
}


export async function listSharedCareTransfers(patientId) {
  if (!supabaseConfigured) return demoRead(DEMO_TRANSFERS_KEY).filter((row) => row.source_patient_id === patientId || row.target_patient_id === patientId)
  const { data, error } = await supabase
    .from('recordsweb_shared_care_transfers')
    .select('*')
    .or(`source_patient_id.eq.${patientId},target_patient_id.eq.${patientId}`)
    .order('created_at', { ascending: false })
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205' || String(error.message || '').toLowerCase().includes('schema cache')) {
      throw new Error('RecordsWeb 3.5.0 Shared Care transfer tables are not installed yet. Run supabase/recordsweb-3.5.0-care-workspaces.sql, then refresh RecordsWeb.')
    }
    throw error
  }
  return data || []
}

export async function createSharedCareTransfer({ sharedPatientLinkId, sourcePatientId, targetOrganisationId, targetPatientId, transferType, summary, payload = {} }) {
  const row = {
    shared_patient_link_id: sharedPatientLinkId,
    source_patient_id: sourcePatientId,
    target_organisation_id: targetOrganisationId,
    target_patient_id: targetPatientId,
    transfer_type: transferType || 'clinical_update',
    summary: String(summary || '').trim(),
    payload,
    status: 'sent',
  }
  if (!row.summary) throw new Error('Enter a handover or transfer summary.')
  if (!supabaseConfigured) {
    const rows = demoRead(DEMO_TRANSFERS_KEY)
    const created = { id: `demo-transfer-${Date.now()}`, source_organisation_id: 'demo-local', created_at: new Date().toISOString(), ...row }
    rows.unshift(created); demoWrite(DEMO_TRANSFERS_KEY, rows); return created
  }
  const { data, error } = await supabase.from('recordsweb_shared_care_transfers').insert(row).select().single()
  if (error) throw error
  await recordAudit({ action: 'shared_care.transfer.sent', entityType: 'shared_care_transfer', entityId: data?.id, patientId: sourcePatientId, description: `Sent ${transferType || 'clinical_update'} transfer of care.`, metadata: { target_organisation_id: targetOrganisationId } }).catch(() => {})
  return data
}

export async function updateSharedCareTransferStatus(transferId, status) {
  const patch = { status }
  const now = new Date().toISOString()
  if (status === 'received') patch.received_at = now
  if (status === 'viewed') patch.viewed_at = now
  if (status === 'actioned') patch.actioned_at = now
  if (!supabaseConfigured) {
    const rows = demoRead(DEMO_TRANSFERS_KEY)
    const index = rows.findIndex((row) => row.id === transferId)
    if (index < 0) throw new Error('Transfer record not found.')
    rows[index] = { ...rows[index], ...patch, updated_at: now }
    demoWrite(DEMO_TRANSFERS_KEY, rows)
    return rows[index]
  }
  const { data, error } = await supabase.from('recordsweb_shared_care_transfers').update(patch).eq('id', transferId).select().single()
  if (error) throw error
  await recordAudit({ action: `shared_care.transfer.${status}`, entityType: 'shared_care_transfer', entityId: transferId, patientId: data?.target_patient_id || data?.source_patient_id || null, description: `Marked Shared Care transfer as ${status}.` }).catch(() => {})
  return data
}
