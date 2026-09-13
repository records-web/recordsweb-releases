import { supabase, supabaseConfigured } from './supabase'
import { recordAudit } from './auditService'

const DEMO_CODE = 'DEMO01'
const DEMO_LINKS_KEY = 'recordsweb-shared-care-demo-links-v1'
const DEMO_PATIENT_LINKS_KEY = 'recordsweb-shared-care-demo-patient-links-v1'
const DEMO_TRANSFERS_KEY = 'recordsweb-shared-care-transfers-v1'
const DEMO_WORKSPACE_MESSAGES_KEY = 'recordsweb-shared-care-workspace-messages-v1'
const DEMO_WORKSPACE_TASKS_KEY = 'recordsweb-shared-care-workspace-tasks-v1'

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

export async function createSharedCareTransfer({ sharedPatientLinkId, sourcePatientId, targetOrganisationId, targetPatientId, transferType, summary, payload = {}, workspaceId = null, patientThreadId = null }) {
  const row = {
    shared_patient_link_id: sharedPatientLinkId,
    source_patient_id: sourcePatientId,
    target_organisation_id: targetOrganisationId,
    target_patient_id: targetPatientId,
    transfer_type: transferType || 'clinical_update',
    summary: String(summary || '').trim(),
    payload,
    status: 'sent',
    workspace_id: workspaceId || null,
    patient_thread_id: patientThreadId || null,
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
  if (status === 'acknowledged') patch.acknowledged_at = now
  if (status === 'actioned') patch.actioned_at = now
  if (!supabaseConfigured) {
    const rows = demoRead(DEMO_TRANSFERS_KEY)
    const index = rows.findIndex((row) => row.id === transferId)
    if (index < 0) throw new Error('Transfer record not found.')
    rows[index] = { ...rows[index], ...patch, updated_at: now }
    demoWrite(DEMO_TRANSFERS_KEY, rows)
    return rows[index]
  }
  await rpc('recordsweb_shared_care_update_transfer_status', { p_transfer_id: transferId, p_status: status })
  const { data, error } = await supabase.from('recordsweb_shared_care_transfers').select('*').eq('id', transferId).maybeSingle()
  if (error) throw error
  await recordAudit({ action: `shared_care.transfer.${status}`, entityType: 'shared_care_transfer', entityId: transferId, patientId: data?.target_patient_id || data?.source_patient_id || null, description: `Marked Shared Care transfer as ${status}.` }).catch(() => {})
  return data || { id: transferId, status, ...patch }
}

function demoWorkspaceOverview() {
  const links = demoRead(DEMO_LINKS_KEY).filter((row) => row.status === 'active')
  if (!links.length) return { workspace: null, members: [], links: [], counts: { messages: 0, openTasks: 0, handovers: 0 } }
  const members = [{ organisationId: 'demo-local', name: 'Demo RecordsWeb Community', code: 'DEMO01', mode: 'general_practice', current: true }]
  for (const link of links) {
    if (!members.some((m) => m.organisationId === link.partner_organisation_id)) {
      members.push({ organisationId: link.partner_organisation_id, name: link.partner_name || 'Demo Partner Community', code: link.partner_code || 'PARTNER', mode: link.partner_mode || 'hospital', current: false })
    }
  }
  const messages = demoRead(DEMO_WORKSPACE_MESSAGES_KEY)
  const tasks = demoRead(DEMO_WORKSPACE_TASKS_KEY)
  const transfers = demoRead(DEMO_TRANSFERS_KEY)
  return {
    workspace: { id: 'demo-shared-care-workspace', name: 'Shared Care Network', currentOrganisationId: 'demo-local', createdAt: new Date().toISOString() },
    members,
    links: links.map((row) => ({ linkId: row.link_id, organisationAId: 'demo-local', organisationBId: row.partner_organisation_id, status: row.status })),
    counts: { messages: messages.filter((x) => !x.patient_thread_id).length, openTasks: tasks.filter((x) => !['completed','cancelled'].includes(x.status)).length, handovers: transfers.length },
  }
}

export async function getSharedCareWorkspaceOverview() {
  if (!supabaseConfigured) return demoWorkspaceOverview()
  return rpc('recordsweb_shared_care_workspace_overview')
}

export async function getSharedCarePatientWorkspace(patientId) {
  if (!supabaseConfigured) {
    const overview = demoWorkspaceOverview()
    if (!overview.workspace) return null
    return {
      workspaceId: overview.workspace.id,
      threadId: `demo-thread-${patientId}`,
      currentOrganisationId: 'demo-local',
      members: [{ organisationId: 'demo-local', organisationName: 'Demo RecordsWeb Community', organisationCode: 'DEMO01', organisationMode: 'general_practice', patientId, current: true }],
    }
  }
  return rpc('recordsweb_shared_care_patient_workspace', { p_patient_id: patientId })
}

export async function listSharedCareWorkspaceMessages(workspaceId, patientThreadId = null) {
  if (!workspaceId) return []
  if (!supabaseConfigured) {
    return demoRead(DEMO_WORKSPACE_MESSAGES_KEY)
      .filter((row) => row.workspace_id === workspaceId && (patientThreadId ? row.patient_thread_id === patientThreadId : !row.patient_thread_id))
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  }
  return rpc('recordsweb_shared_care_workspace_messages', {
    p_workspace_id: workspaceId,
    p_patient_thread_id: patientThreadId,
    p_limit: 250,
  })
}

export async function postSharedCareWorkspaceMessage(workspaceId, { patientThreadId = null, body, messageType = 'discussion', referenceType = null, referenceId = null } = {}) {
  const clean = String(body || '').trim()
  if (!clean) throw new Error('Enter a message.')
  if (!workspaceId) throw new Error('Shared Care workspace is unavailable.')
  if (!supabaseConfigured) {
    const rows = demoRead(DEMO_WORKSPACE_MESSAGES_KEY)
    const created = {
      id: `demo-message-${Date.now()}`,
      workspace_id: workspaceId,
      patient_thread_id: patientThreadId,
      message_type: messageType,
      body: clean,
      reference_type: referenceType,
      reference_id: referenceId,
      source_organisation_id: 'demo-local',
      source_organisation_name: 'Demo RecordsWeb Community',
      source_organisation_code: 'DEMO01',
      source_organisation_mode: 'general_practice',
      author_name: 'Demo Clinical User',
      author_role: 'Clinician',
      created_at: new Date().toISOString(),
    }
    rows.unshift(created); demoWrite(DEMO_WORKSPACE_MESSAGES_KEY, rows); return created.id
  }
  const id = await rpc('recordsweb_shared_care_post_message', {
    p_workspace_id: workspaceId,
    p_patient_thread_id: patientThreadId,
    p_body: clean,
    p_message_type: messageType,
    p_reference_type: referenceType,
    p_reference_id: referenceId,
  })
  await recordAudit({ action: 'shared_care.workspace.message.sent', entityType: 'shared_care_message', entityId: id, description: patientThreadId ? 'Posted a patient Shared Care workspace message.' : 'Posted a Shared Care workspace message.', metadata: { workspace_id: workspaceId, patient_thread_id: patientThreadId, message_type: messageType } }).catch(() => {})
  return id
}

export async function listSharedCareWorkspaceTasks(workspaceId, { patientThreadId = null, includeCompleted = false } = {}) {
  if (!workspaceId) return []
  if (!supabaseConfigured) {
    return demoRead(DEMO_WORKSPACE_TASKS_KEY)
      .filter((row) => row.workspace_id === workspaceId && (!patientThreadId || row.patient_thread_id === patientThreadId) && (includeCompleted || !['completed','cancelled'].includes(row.status)))
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  }
  return rpc('recordsweb_shared_care_workspace_tasks', {
    p_workspace_id: workspaceId,
    p_patient_thread_id: patientThreadId,
    p_include_completed: includeCompleted,
  })
}

export async function createSharedCareWorkspaceTask(workspaceId, { patientThreadId = null, targetOrganisationId, title, details = '', priority = 'Routine', dueAt = null } = {}) {
  if (!workspaceId) throw new Error('Shared Care workspace is unavailable.')
  if (!targetOrganisationId) throw new Error('Choose a receiving organisation.')
  if (!String(title || '').trim()) throw new Error('Enter a task title.')
  if (!supabaseConfigured) {
    const rows = demoRead(DEMO_WORKSPACE_TASKS_KEY)
    const created = {
      id: `demo-workspace-task-${Date.now()}`,
      workspace_id: workspaceId,
      patient_thread_id: patientThreadId,
      source_organisation_id: 'demo-local',
      source_organisation_name: 'Demo RecordsWeb Community',
      target_organisation_id: targetOrganisationId,
      target_organisation_name: 'Demo Partner Community',
      title: String(title).trim(), details: String(details || '').trim(), priority, due_at: dueAt,
      status: 'open', created_by_name: 'Demo Clinical User', created_at: new Date().toISOString(),
    }
    rows.unshift(created); demoWrite(DEMO_WORKSPACE_TASKS_KEY, rows); return created.id
  }
  const id = await rpc('recordsweb_shared_care_create_workspace_task', {
    p_workspace_id: workspaceId,
    p_patient_thread_id: patientThreadId,
    p_target_organisation_id: targetOrganisationId,
    p_title: String(title).trim(),
    p_details: String(details || '').trim() || null,
    p_priority: priority,
    p_due_at: dueAt,
  })
  await recordAudit({ action: 'shared_care.workspace.task.created', entityType: 'shared_care_task', entityId: id, description: 'Created a cross-organisation Shared Care task.', metadata: { workspace_id: workspaceId, patient_thread_id: patientThreadId, target_organisation_id: targetOrganisationId, priority } }).catch(() => {})
  return id
}

export async function updateSharedCareWorkspaceTaskStatus(taskId, status) {
  if (!supabaseConfigured) {
    const rows = demoRead(DEMO_WORKSPACE_TASKS_KEY)
    const index = rows.findIndex((row) => row.id === taskId)
    if (index < 0) throw new Error('Shared Care task not found.')
    rows[index] = { ...rows[index], status, updated_at: new Date().toISOString(), ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}), ...(status === 'accepted' ? { accepted_at: new Date().toISOString() } : {}) }
    demoWrite(DEMO_WORKSPACE_TASKS_KEY, rows)
    return status
  }
  const result = await rpc('recordsweb_shared_care_update_workspace_task', { p_task_id: taskId, p_status: status })
  await recordAudit({ action: `shared_care.workspace.task.${status}`, entityType: 'shared_care_task', entityId: taskId, description: `Marked Shared Care task as ${status}.` }).catch(() => {})
  return result
}

export async function listSharedCareWorkspaceTransfers(workspaceId, patientThreadId = null) {
  if (!workspaceId) return []
  if (!supabaseConfigured) {
    return demoRead(DEMO_TRANSFERS_KEY).filter((row) => (!patientThreadId || row.patient_thread_id === patientThreadId))
  }
  return rpc('recordsweb_shared_care_workspace_transfers', { p_workspace_id: workspaceId, p_patient_thread_id: patientThreadId })
}

