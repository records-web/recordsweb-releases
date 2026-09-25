import { supabase, supabaseConfigured } from './supabase'
import { assertBillingWriteAllowed } from './billingAccess'
import { recordAudit } from './auditService'

const DEMO_KEY = 'recordsweb-policing-demo-v1'
const RECORD_TYPES = new Set(['crime_report','intelligence','statement','evidence','arrest','warrant','seizure','custody','bolo','briefing','dispatch'])

function demoDb() {
  try {
    const value = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null')
    if (value && typeof value === 'object') return { persons: [], vehicles: [], incidents: [], fpns: [], records: [], ...value }
  } catch {}
  return { persons: [], vehicles: [], incidents: [], fpns: [], records: [] }
}

function saveDemo(db) { localStorage.setItem(DEMO_KEY, JSON.stringify(db)) }
function demoInsert(bucket, payload, prefix) {
  const db = demoDb()
  const created = { id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, reference: `${prefix}-${String(Date.now()).slice(-7)}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...payload }
  db[bucket].unshift(created); saveDemo(db); return created
}
function cleanSearch(value) { return String(value || '').trim().replace(/[%_,()]/g, '') }

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
  if (!supabaseConfigured) {
    const db = demoDb(); const index = db.incidents.findIndex((r) => r.id === id); if (index < 0) throw new Error('Incident not found.')
    db.incidents[index] = { ...db.incidents[index], ...patch, updated_at: new Date().toISOString() }; saveDemo(db); return db.incidents[index]
  }
  const { data, error } = await supabase.from('police_incidents').update(patch).eq('id', id).select().single()
  if (error) throw error
  await recordAudit({ action: 'policing.incident.updated', entityType: 'police_incident', entityId: id, description: `Updated incident ${data.reference || ''}.` })
  return data
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

export async function listPoliceRecords(recordType, search = '') {
  if (!RECORD_TYPES.has(recordType)) throw new Error('Unsupported policing register.')
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

export async function createPoliceRecord(recordType, payload) {
  if (!RECORD_TYPES.has(recordType)) throw new Error('Unsupported policing register.')
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
