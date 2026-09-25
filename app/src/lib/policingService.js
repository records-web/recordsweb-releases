import { supabase, supabaseConfigured } from './supabase'
import { assertBillingWriteAllowed } from './billingAccess'
import { recordAudit } from './auditService'

const DEMO_KEY = 'recordsweb-policing-demo-v1'
export const POLICE_RECORD_TYPES = new Set(['crime_report','intelligence','statement','evidence','arrest','warrant','seizure','custody','bolo','briefing','dispatch'])

function demoDb() {
  try {
    const value = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null')
    if (value && typeof value === 'object') return { persons: [], vehicles: [], incidents: [], fpns: [], records: [], updates: [], ...value }
  } catch {}
  return { persons: [], vehicles: [], incidents: [], fpns: [], records: [], updates: [] }
}

function saveDemo(db) { localStorage.setItem(DEMO_KEY, JSON.stringify(db)) }
function demoInsert(bucket, payload, prefix) {
  const db = demoDb()
  const created = { id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, reference: `${prefix}-${String(Date.now()).slice(-7)}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...payload }
  db[bucket].unshift(created); saveDemo(db); return created
}
function demoUpdate(bucket, id, patch) {
  const db = demoDb(); const index = db[bucket].findIndex((r) => String(r.id) === String(id)); if (index < 0) throw new Error('Record not found.')
  db[bucket][index] = { ...db[bucket][index], ...patch, updated_at: new Date().toISOString() }; saveDemo(db); return db[bucket][index]
}
function demoDelete(bucket, id) {
  const db = demoDb(); const before = db[bucket].length; db[bucket] = db[bucket].filter((r) => String(r.id) !== String(id));
  db.updates = db.updates.filter((r) => String(r.record_id) !== String(id)); saveDemo(db); return before !== db[bucket].length
}
function demoGet(bucket, id) { return demoDb()[bucket].find((r) => String(r.id) === String(id)) || null }
function cleanSearch(value) { return String(value || '').trim().replace(/[%_,()]/g, '') }
function requireRecordType(recordType) { if (!POLICE_RECORD_TYPES.has(recordType)) throw new Error('Unsupported policing register.') }

export async function listPolicePersons(search = '') {
  if (!supabaseConfigured) {
    const q = String(search || '').trim().toLowerCase()
    return demoDb().persons.filter((r) => !q || `${r.reference} ${r.first_name} ${r.last_name} ${r.address || ''}`.toLowerCase().includes(q))
  }
  let query = supabase.from('police_persons').select('*').order('updated_at', { ascending: false }).limit(200)
  const q = cleanSearch(search)
  if (q) query = query.or(`reference.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,address.ilike.%${q}%`)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function getPolicePerson(id) {
  if (!supabaseConfigured) return demoGet('persons', id)
  const { data, error } = await supabase.from('police_persons').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function createPolicePerson(payload) {
  assertBillingWriteAllowed('create a policing person record')
  let data
  if (!supabaseConfigured) data = demoInsert('persons', payload, 'PER')
  else {
    const result = await supabase.from('police_persons').insert(payload).select().single()
    if (result.error) throw result.error
    data = result.data
  }
  await recordAudit({ action: 'policing.person.created', entityType: 'police_person', entityId: data.id, description: `Created policing person ${data.reference || ''}.` })
  return data
}

export async function updatePolicePerson(id, patch) {
  assertBillingWriteAllowed('update a policing person record')
  const data = !supabaseConfigured ? demoUpdate('persons', id, patch) : (await supabase.from('police_persons').update(patch).eq('id', id).select().single())
  if (supabaseConfigured && data.error) throw data.error
  const row = supabaseConfigured ? data.data : data
  await recordAudit({ action: 'policing.person.updated', entityType: 'police_person', entityId: id, description: `Updated policing person ${row?.reference || ''}.` })
  return row
}

export async function deletePolicePerson(id) {
  assertBillingWriteAllowed('delete a policing person record')
  if (!supabaseConfigured) demoDelete('persons', id)
  else {
    const { error } = await supabase.from('police_persons').delete().eq('id', id)
    if (error) throw error
  }
  await recordAudit({ action: 'policing.person.deleted', entityType: 'police_person', entityId: id, description: 'Deleted policing person record.' })
}

export async function listPoliceVehicles(search = '') {
  if (!supabaseConfigured) {
    const q = String(search || '').trim().toLowerCase()
    return demoDb().vehicles.filter((r) => !q || `${r.reference} ${r.registration} ${r.make || ''} ${r.model || ''}`.toLowerCase().includes(q))
  }
  let query = supabase.from('police_vehicles').select('*, owner:police_persons!police_vehicles_owner_person_id_fkey(id,reference,first_name,last_name)').order('updated_at', { ascending: false }).limit(200)
  const q = cleanSearch(search)
  if (q) query = query.or(`reference.ilike.%${q}%,registration.ilike.%${q}%,make.ilike.%${q}%,model.ilike.%${q}%`)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function getPoliceVehicle(id) {
  if (!supabaseConfigured) {
    const row = demoGet('vehicles', id); if (!row) return null
    const owner = row.owner_person_id ? demoGet('persons', row.owner_person_id) : null
    return { ...row, owner }
  }
  const { data, error } = await supabase.from('police_vehicles').select('*, owner:police_persons!police_vehicles_owner_person_id_fkey(id,reference,first_name,last_name)').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function createPoliceVehicle(payload) {
  assertBillingWriteAllowed('create a policing vehicle record')
  let data
  if (!supabaseConfigured) data = demoInsert('vehicles', payload, 'VEH')
  else {
    const result = await supabase.from('police_vehicles').insert(payload).select().single()
    if (result.error) throw result.error
    data = result.data
  }
  await recordAudit({ action: 'policing.vehicle.created', entityType: 'police_vehicle', entityId: data.id, description: `Created vehicle ${data.registration || data.reference || ''}.` })
  return data
}

export async function updatePoliceVehicle(id, patch) {
  assertBillingWriteAllowed('update a policing vehicle record')
  const result = !supabaseConfigured ? demoUpdate('vehicles', id, patch) : await supabase.from('police_vehicles').update(patch).eq('id', id).select().single()
  if (supabaseConfigured && result.error) throw result.error
  const row = supabaseConfigured ? result.data : result
  await recordAudit({ action: 'policing.vehicle.updated', entityType: 'police_vehicle', entityId: id, description: `Updated vehicle ${row?.registration || row?.reference || ''}.` })
  return row
}

export async function deletePoliceVehicle(id) {
  assertBillingWriteAllowed('delete a policing vehicle record')
  if (!supabaseConfigured) demoDelete('vehicles', id)
  else { const { error } = await supabase.from('police_vehicles').delete().eq('id', id); if (error) throw error }
  await recordAudit({ action: 'policing.vehicle.deleted', entityType: 'police_vehicle', entityId: id, description: 'Deleted policing vehicle record.' })
}

export async function listPoliceIncidents(search = '') {
  if (!supabaseConfigured) {
    const q = String(search || '').trim().toLowerCase()
    return demoDb().incidents.filter((r) => !q || `${r.reference} ${r.title} ${r.location || ''} ${r.summary || ''}`.toLowerCase().includes(q))
  }
  let query = supabase.from('police_incidents').select('*, person:police_persons(id,reference,first_name,last_name), vehicle:police_vehicles(id,reference,registration)').order('occurred_at', { ascending: false }).limit(200)
  const q = cleanSearch(search)
  if (q) query = query.or(`reference.ilike.%${q}%,title.ilike.%${q}%,location.ilike.%${q}%,summary.ilike.%${q}%`)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function getPoliceIncident(id) {
  if (!supabaseConfigured) {
    const row = demoGet('incidents', id); if (!row) return null
    return { ...row, person: row.person_id ? demoGet('persons', row.person_id) : null, vehicle: row.vehicle_id ? demoGet('vehicles', row.vehicle_id) : null }
  }
  const { data, error } = await supabase.from('police_incidents').select('*, person:police_persons(id,reference,first_name,last_name), vehicle:police_vehicles(id,reference,registration)').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function createPoliceIncident(payload) {
  assertBillingWriteAllowed('create a policing incident')
  let data
  if (!supabaseConfigured) data = demoInsert('incidents', payload, 'INC')
  else {
    const result = await supabase.from('police_incidents').insert(payload).select().single()
    if (result.error) throw result.error
    data = result.data
  }
  await recordAudit({ action: 'policing.incident.created', entityType: 'police_incident', entityId: data.id, description: `Created incident ${data.reference || ''}.` })
  return data
}

export async function updatePoliceIncident(id, patch) {
  assertBillingWriteAllowed('update a policing incident')
  const result = !supabaseConfigured ? demoUpdate('incidents', id, patch) : await supabase.from('police_incidents').update(patch).eq('id', id).select().single()
  if (supabaseConfigured && result.error) throw result.error
  const row = supabaseConfigured ? result.data : result
  await recordAudit({ action: 'policing.incident.updated', entityType: 'police_incident', entityId: id, description: `Updated incident ${row?.reference || ''}.` })
  return row
}

export async function deletePoliceIncident(id) {
  assertBillingWriteAllowed('delete a policing incident')
  if (!supabaseConfigured) demoDelete('incidents', id)
  else { const { error } = await supabase.from('police_incidents').delete().eq('id', id); if (error) throw error }
  await recordAudit({ action: 'policing.incident.deleted', entityType: 'police_incident', entityId: id, description: 'Deleted policing incident.' })
}

export async function listPoliceFpns(search = '') {
  if (!supabaseConfigured) {
    const q = String(search || '').trim().toLowerCase()
    return demoDb().fpns.filter((r) => !q || `${r.reference} ${r.offence} ${r.location || ''}`.toLowerCase().includes(q))
  }
  let query = supabase.from('police_fpns').select('*, person:police_persons(id,reference,first_name,last_name), vehicle:police_vehicles(id,reference,registration)').order('issued_at', { ascending: false }).limit(200)
  const q = cleanSearch(search)
  if (q) query = query.or(`reference.ilike.%${q}%,offence.ilike.%${q}%,location.ilike.%${q}%,officer_name.ilike.%${q}%`)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function getPoliceFpn(id) {
  if (!supabaseConfigured) {
    const row = demoGet('fpns', id); if (!row) return null
    return { ...row, person: row.person_id ? demoGet('persons', row.person_id) : null, vehicle: row.vehicle_id ? demoGet('vehicles', row.vehicle_id) : null }
  }
  const { data, error } = await supabase.from('police_fpns').select('*, person:police_persons(id,reference,first_name,last_name), vehicle:police_vehicles(id,reference,registration)').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function createPoliceFpn(payload) {
  assertBillingWriteAllowed('issue a fixed penalty notice')
  let data
  if (!supabaseConfigured) data = demoInsert('fpns', payload, 'FPN')
  else {
    const result = await supabase.from('police_fpns').insert(payload).select().single()
    if (result.error) throw result.error
    data = result.data
  }
  await recordAudit({ action: 'policing.fpn.issued', entityType: 'police_fpn', entityId: data.id, description: `Issued FPN ${data.reference || ''}.` })
  return data
}

export async function updatePoliceFpn(id, patch) {
  assertBillingWriteAllowed('update a fixed penalty notice')
  const result = !supabaseConfigured ? demoUpdate('fpns', id, patch) : await supabase.from('police_fpns').update(patch).eq('id', id).select().single()
  if (supabaseConfigured && result.error) throw result.error
  const row = supabaseConfigured ? result.data : result
  await recordAudit({ action: 'policing.fpn.updated', entityType: 'police_fpn', entityId: id, description: `Updated FPN ${row?.reference || ''}.` })
  return row
}

export async function deletePoliceFpn(id) {
  assertBillingWriteAllowed('delete a fixed penalty notice')
  if (!supabaseConfigured) demoDelete('fpns', id)
  else { const { error } = await supabase.from('police_fpns').delete().eq('id', id); if (error) throw error }
  await recordAudit({ action: 'policing.fpn.deleted', entityType: 'police_fpn', entityId: id, description: 'Deleted Fixed Penalty Notice.' })
}

export async function listPoliceRecords(recordType, search = '') {
  requireRecordType(recordType)
  if (!supabaseConfigured) {
    const q = String(search || '').trim().toLowerCase()
    return demoDb().records.filter((r) => r.record_type === recordType && (!q || `${r.reference} ${r.title} ${r.details || ''}`.toLowerCase().includes(q)))
  }
  let query = supabase.from('police_records').select('*, person:police_persons(id,reference,first_name,last_name), vehicle:police_vehicles(id,reference,registration), incident:police_incidents(id,reference,title)').eq('record_type', recordType).order('occurred_at', { ascending: false }).limit(200)
  const q = cleanSearch(search)
  if (q) query = query.or(`reference.ilike.%${q}%,title.ilike.%${q}%,details.ilike.%${q}%`)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function getPoliceRecord(id, recordType = '') {
  if (recordType) requireRecordType(recordType)
  if (!supabaseConfigured) {
    const row = demoGet('records', id); if (!row || (recordType && row.record_type !== recordType)) return null
    return { ...row, person: row.person_id ? demoGet('persons', row.person_id) : null, vehicle: row.vehicle_id ? demoGet('vehicles', row.vehicle_id) : null, incident: row.incident_id ? demoGet('incidents', row.incident_id) : null }
  }
  let query = supabase.from('police_records').select('*, person:police_persons(id,reference,first_name,last_name), vehicle:police_vehicles(id,reference,registration), incident:police_incidents(id,reference,title)').eq('id', id)
  if (recordType) query = query.eq('record_type', recordType)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data
}

export async function createPoliceRecord(recordType, payload) {
  requireRecordType(recordType)
  assertBillingWriteAllowed('create a policing record')
  let data
  if (!supabaseConfigured) data = demoInsert('records', { record_type: recordType, ...payload }, recordType.slice(0, 3).toUpperCase())
  else {
    const result = await supabase.from('police_records').insert({ record_type: recordType, ...payload }).select().single()
    if (result.error) throw result.error
    data = result.data
  }
  await recordAudit({ action: `policing.${recordType}.created`, entityType: 'police_record', entityId: data.id, description: `Created ${recordType.replaceAll('_', ' ')} ${data.reference || ''}.` })
  return data
}

export async function updatePoliceRecord(id, patch) {
  assertBillingWriteAllowed('update a policing record')
  const result = !supabaseConfigured ? demoUpdate('records', id, patch) : await supabase.from('police_records').update(patch).eq('id', id).select().single()
  if (supabaseConfigured && result.error) throw result.error
  const row = supabaseConfigured ? result.data : result
  await recordAudit({ action: `policing.${row?.record_type || 'record'}.updated`, entityType: 'police_record', entityId: id, description: `Updated policing record ${row?.reference || ''}.` })
  return row
}

export async function deletePoliceRecord(id) {
  assertBillingWriteAllowed('delete a policing record')
  if (!supabaseConfigured) demoDelete('records', id)
  else { const { error } = await supabase.from('police_records').delete().eq('id', id); if (error) throw error }
  await recordAudit({ action: 'policing.record.deleted', entityType: 'police_record', entityId: id, description: 'Deleted policing record.' })
}

export async function listPoliceRecordUpdates(recordKind, recordId) {
  if (!supabaseConfigured) return demoDb().updates.filter((r) => r.record_kind === recordKind && String(r.record_id) === String(recordId)).sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
  const { data, error } = await supabase.from('police_record_updates').select('*').eq('record_kind', recordKind).eq('record_id', recordId).order('created_at', { ascending: false }).limit(500)
  if (error) throw error
  return data || []
}

export async function addPoliceRecordUpdate({ recordKind, recordId, recordType = null, updateType = 'note', status = null, unitCallsign = '', message, createdByName = '', metadata = {} }) {
  assertBillingWriteAllowed('add a policing record update')
  const payload = { record_kind: recordKind, record_id: recordId, record_type: recordType || null, update_type: updateType || 'note', status: status || null, unit_callsign: unitCallsign || null, message: String(message || '').trim(), created_by_name: createdByName || null, metadata: metadata || {} }
  if (!payload.message) throw new Error('Enter an update before saving.')
  let data
  if (!supabaseConfigured) data = demoInsert('updates', payload, 'UPD')
  else {
    const result = await supabase.from('police_record_updates').insert(payload).select().single()
    if (result.error) throw result.error
    data = result.data
  }
  await recordAudit({ action: 'policing.record.update_added', entityType: recordKind, entityId: recordId, description: `Added policing update: ${payload.message.slice(0, 160)}` })
  return data
}

export async function getPolicingDashboardCounts() {
  if (!supabaseConfigured) {
    const db = demoDb()
    return { persons: db.persons.length, vehicles: db.vehicles.length, incidents: db.incidents.filter((r) => !['closed','resolved'].includes(r.status)).length, fpns: db.fpns.length, wanted: db.records.filter((r) => ['warrant','bolo'].includes(r.record_type) && r.status !== 'closed').length }
  }
  const queries = await Promise.all([
    supabase.from('police_persons').select('*', { count: 'exact', head: true }),
    supabase.from('police_vehicles').select('*', { count: 'exact', head: true }),
    supabase.from('police_incidents').select('*', { count: 'exact', head: true }).not('status', 'in', '(closed,resolved)'),
    supabase.from('police_fpns').select('*', { count: 'exact', head: true }),
    supabase.from('police_records').select('*', { count: 'exact', head: true }).in('record_type', ['warrant','bolo']).neq('status', 'closed'),
  ])
  for (const q of queries) if (q.error) throw q.error
  return { persons: queries[0].count || 0, vehicles: queries[1].count || 0, incidents: queries[2].count || 0, fpns: queries[3].count || 0, wanted: queries[4].count || 0 }
}
