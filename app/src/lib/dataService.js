import { supabase, supabaseConfigured } from './supabase'
import { verifyDemoPrescribingPin, validatePrescribingPin } from './prescribingSecurity'
import { recordAudit } from './auditService'
import { recordDocumentVersion } from './documentVersions'
import { archiveDeletedRecord } from './deletedItems'
import { getInstallationNamespace } from './installation'
import { assertBillingWriteAllowed } from './billingAccess'

import {
  demoPatients,
  demoProblems,
  demoMedications,
  demoConsultations,
  demoDiary,
  demoDocuments,
  demoInvestigations,
  demoReferrals,
  demoAppointments,
  demoStaffReports,
  demoStaffJobs,
  demoStaffNotices,
  demoOrganisationNotepad,
  demoOrganisationNews,
  ORGANISATION,
} from './demoData'

const DEMO_DB_KEY = `recordsweb-demo-database-v3-${getInstallationNamespace()}`
const seedDb = () => ({
  patients: structuredClone(demoPatients),
  problems: structuredClone(demoProblems),
  medications: structuredClone(demoMedications),
  medication_events: [],
  consultations: structuredClone(demoConsultations),
  diary_tasks: structuredClone(demoDiary),
  patient_alerts: [],
  documents: structuredClone(demoDocuments),
  investigations: structuredClone(demoInvestigations),
  referrals: structuredClone(demoReferrals),
  appointments: structuredClone(demoAppointments),
  staff_reports: structuredClone(demoStaffReports),
  staff_jobs: structuredClone(demoStaffJobs),
  staff_notices: structuredClone(demoStaffNotices),
  organisation_notepad: structuredClone(demoOrganisationNotepad),
  organisation_news: structuredClone(demoOrganisationNews),
})

function getDemoDb() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEMO_DB_KEY) || 'null')
    if (parsed && typeof parsed === 'object') return { ...seedDb(), ...parsed }
  } catch {}
  const db = seedDb()
  localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db))
  return db
}

function saveDemoDb(db) {
  localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db))
}

function demoRows(table) {
  return getDemoDb()[table] || []
}

function demoInsert(table, row) {
  const db = getDemoDb()
  if (!db[table]) throw new Error(`Unsupported demo table: ${table}`)
  const created = {
    id: `demo-${table}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    created_at: new Date().toISOString(),
    ...row,
  }
  db[table].unshift(created)
  saveDemoDb(db)
  return created
}

function demoUpdate(table, id, patch) {
  const db = getDemoDb()
  const index = (db[table] || []).findIndex((row) => row.id === id)
  if (index < 0) throw new Error('Record not found.')
  db[table][index] = { ...db[table][index], ...patch, updated_at: new Date().toISOString() }
  saveDemoDb(db)
  return db[table][index]
}


function demoDelete(table, id) {
  const db = getDemoDb()
  const before = (db[table] || []).length
  db[table] = (db[table] || []).filter((row) => row.id !== id)
  if (db[table].length === before) throw new Error('Record not found.')
  saveDemoDb(db)
}

export function resetDemoClinicalData() {
  const db = seedDb()
  saveDemoDb(db)
  return db
}


function formatNhsNumber(digits) {
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
}

function generateNhsNumberCandidate() {
  // RecordsWeb generates a persistent NHS-style identifier for this prototype.
  // It is not checked against NHS Personal Demographics Service (PDS).
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const firstNine = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10))
    const weighted = firstNine.reduce((sum, digit, index) => sum + digit * (10 - index), 0)
    let checkDigit = 11 - (weighted % 11)
    if (checkDigit === 11) checkDigit = 0
    if (checkDigit === 10) continue
    return formatNhsNumber(`${firstNine.join('')}${checkDigit}`)
  }
  throw new Error('Unable to generate a patient NHS number. Please try again.')
}

function generateUniqueDemoNhsNumber(patients) {
  const existing = new Set(patients.map((patient) => String(patient.nhs_number || '').replace(/\s/g, '')))
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = generateNhsNumberCandidate()
    if (!existing.has(candidate.replace(/\s/g, ''))) return candidate
  }
  throw new Error('Unable to generate a unique patient NHS number. Please try again.')
}

export async function listPatients(search = '') {
  if (!supabaseConfigured) {
    const rows = demoRows('patients')
    const needle = search.trim().toLowerCase()
    if (!needle) return [...rows].sort((a, b) => a.last_name.localeCompare(b.last_name))
    return rows.filter((p) => `${p.first_name} ${p.last_name} ${p.nhs_number || ''} ${p.emis_number || ''} ${p.address || ''}`.toLowerCase().includes(needle))
  }

  let query = supabase.from('patients').select('*').order('last_name')
  if (search.trim()) {
    const safe = search.trim().replace(/[%_,()]/g, '')
    query = query.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,nhs_number.ilike.%${safe}%,emis_number.ilike.%${safe}%`)
  }
  const { data, error } = await query.limit(100)
  if (error) throw error
  return data
}

export async function getPatient(patientId) {
  if (!supabaseConfigured) return demoRows('patients').find((p) => p.id === patientId) || null
  const { data, error } = await supabase.from('patients').select('*').eq('id', patientId).single()
  if (error) throw error
  return data
}

export async function createPatient(payload) {
  assertBillingWriteAllowed('register a patient')
  const cleanPayload = { ...payload }
  delete cleanPayload.nhs_number
  let created
  if (!supabaseConfigured) {
    const patients = demoRows('patients')
    const nextNumber = String(Math.max(...patients.map((patient) => Number(patient.emis_number) || 0), 0) + 1)
    const nhsNumber = generateUniqueDemoNhsNumber(patients)
    created = demoInsert('patients', { organisation_id: ORGANISATION.id, status: 'Active', emis_number: nextNumber, nhs_number: nhsNumber, ...cleanPayload })
  } else {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const nhsNumber = generateNhsNumberCandidate()
      const { data, error } = await supabase.from('patients').insert({ status: 'Active', nhs_number: nhsNumber, ...cleanPayload }).select().single()
      if (!error) { created = data; break }
      if (error.code !== '23505') throw error
    }
    if (!created) throw new Error('Unable to generate a unique patient NHS number. Please try again.')
  }
  await recordAudit({ action:'patient.registered', entityType:'patient', entityId:created.id, patientId:created.id, description:'Registered patient record.' })
  return created
}

export async function updatePatient(patientId, payload) {
  assertBillingWriteAllowed('change patient demographics')
  let data
  if (!supabaseConfigured) data = demoUpdate('patients', patientId, payload)
  else { const result = await supabase.from('patients').update(payload).eq('id', patientId).select().single(); if (result.error) throw result.error; data=result.data }
  await recordAudit({ action:'patient.demographics.updated', entityType:'patient', entityId:patientId, patientId, description:'Updated patient demographic record.' })
  return data
}

export async function listForPatient(table, patientId, orderColumn = 'created_at', ascending = false) {
  if (!supabaseConfigured) {
    return demoRows(table).filter((r) => r.patient_id === patientId).sort((a, b) => {
      const av = a[orderColumn] || ''
      const bv = b[orderColumn] || ''
      return ascending ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
  }
  const { data, error } = await supabase.from(table).select('*').eq('patient_id', patientId).order(orderColumn, { ascending })
  if (error) throw error
  return data
}

export async function createForPatient(table, patientId, payload) {
  assertBillingWriteAllowed('create clinical records')
  let data
  if (!supabaseConfigured) data = demoInsert(table, { patient_id: patientId, ...payload })
  else {
    const result = await supabase.from(table).insert({ patient_id: patientId, ...payload }).select().single()
    if (result.error) throw result.error
    data = result.data
  }
  await recordAudit({ action: 'clinical.record.created', entityType: table, entityId: data?.id, patientId, description: `Created ${table.replaceAll('_', ' ')} record.` })
  if (table === 'documents') await recordDocumentVersion(data)
  return data
}

export async function updateForPatient(table, id, payload) {
  assertBillingWriteAllowed('change clinical records')
  let data
  if (!supabaseConfigured) data = demoUpdate(table, id, payload)
  else {
    const result = await supabase.from(table).update(payload).eq('id', id).select().single()
    if (result.error) throw result.error
    data = result.data
  }
  await recordAudit({ action: 'clinical.record.updated', entityType: table, entityId: id, patientId: data?.patient_id || null, description: `Updated ${table.replaceAll('_', ' ')} record.` })
  if (table === 'documents') await recordDocumentVersion(data)
  return data
}


export async function getFitNotePdfBlob(documentId, storagePath = null) {
  if (!documentId) throw new Error('Missing fit note document information.')
  if (!supabaseConfigured) return null

  let path = storagePath
  if (!path) {
    const { data: row, error: rowError } = await supabase
      .from('fit_note_pdfs')
      .select('storage_path')
      .eq('document_id', documentId)
      .maybeSingle()
    if (rowError) throw rowError
    path = row?.storage_path || null
  }
  if (!path) return null

  const { data, error } = await supabase.storage
    .from('recordsweb-documents')
    .download(path)
  if (error) throw error
  return data
}

export async function lockFitNoteDocument(documentId) {
  assertBillingWriteAllowed('sign or lock a fit note')
  if (!documentId) throw new Error('Missing fit note document information.')
  if (!supabaseConfigured) {
    return demoUpdate('documents', documentId, {
      immutable: true,
      status: 'Signed',
      locked_at: new Date().toISOString(),
    })
  }

  const { data, error } = await supabase.rpc('recordsweb_lock_fit_note', {
    p_document_id: documentId,
  })
  if (error) throw error
  await recordAudit({
    action: 'document.fit_note.locked',
    entityType: 'documents',
    entityId: documentId,
    patientId: data?.patient_id || null,
    description: 'Fit note signed/issued and locked against further editing.',
  })
  return data
}

export async function archiveFitNotePdf(patientId, documentId, base64Pdf) {
  assertBillingWriteAllowed('store clinical documents')
  if (!base64Pdf || !documentId || !patientId) throw new Error('Missing fit note PDF information.')
  if (!supabaseConfigured) return { storage_path: null, demo: true }

  let bytes
  try {
    const binary = atob(base64Pdf)
    bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  } catch {
    throw new Error('The generated fit note PDF could not be prepared for secure storage.')
  }

  const storagePath = `${ORGANISATION.id}/${patientId}/fit-notes/${documentId}.pdf`
  const { error: uploadError } = await supabase.storage
    .from('recordsweb-documents')
    .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true, cacheControl: '0' })
  if (uploadError) throw uploadError

  const { data: fileRow, error: rowError } = await supabase
    .from('fit_note_pdfs')
    .upsert({
      document_id: documentId,
      patient_id: patientId,
      storage_path: storagePath,
      mime_type: 'application/pdf',
      file_size: bytes.byteLength,
    }, { onConflict: 'document_id' })
    .select()
    .single()
  if (rowError) throw rowError

  const { error: documentError } = await supabase
    .from('documents')
    .update({ storage_path: storagePath })
    .eq('id', documentId)
  if (documentError) throw documentError

  return fileRow
}

export async function createConsultation(patientId, payload, problemOptions = {}) {
  assertBillingWriteAllowed('create consultations')
  const existingProblemId = problemOptions?.existingProblemId || null
  const newProblemName = String(problemOptions?.newProblemName || '').trim().slice(0, 240)
  const newProblemDescription = String(problemOptions?.newProblemDescription || '').trim().slice(0, 1000)
  const newProblemSignificance = String(problemOptions?.newProblemSignificance || '').trim().slice(0, 40)

  if (!supabaseConfigured) {
    let problem = null
    if (existingProblemId) {
      problem = demoRows('problems').find((row) => row.id === existingProblemId && row.patient_id === patientId) || null
    } else if (newProblemName) {
      problem = demoRows('problems').find((row) => row.patient_id === patientId && String(row.name || '').trim().toLowerCase() === newProblemName.toLowerCase() && String(row.status || 'Active').toLowerCase() !== 'inactive') || null
      if (!problem) {
        problem = demoInsert('problems', {
          patient_id: patientId,
          name: newProblemName,
          onset_date: new Date().toISOString().slice(0, 10),
          status: 'Active',
          significance: newProblemSignificance || 'Minor',
          notes: newProblemDescription || 'Created automatically from a RecordsWeb consultation.',
        })
      }
    }
    const consultation = demoInsert('consultations', { patient_id: patientId, ...payload, problem_id: problem?.id || existingProblemId || null })
    await recordAudit({ action: 'consultation.created', entityType: 'consultations', entityId: consultation.id, patientId, description: problem ? `Created consultation linked to problem: ${problem.name}.` : 'Created consultation.' })
    return consultation
  }

  const { data, error } = await supabase.rpc('recordsweb_create_consultation_with_problem', {
    p_patient_id: patientId,
    p_payload: payload,
    p_existing_problem_id: existingProblemId,
    p_new_problem_name: newProblemName || null,
    p_new_problem_notes: newProblemDescription || null,
    p_new_problem_significance: newProblemSignificance || null,
  })
  if (error) {
    if (error.code === 'PGRST202' || /recordsweb_create_consultation_with_problem/i.test(error.message || '')) {
      throw new Error('The consultation/problem workflow is not installed in Supabase. Run supabase/recordsweb-3.2.9-problem-catalogue.sql after the 3.2.8 medication workflow migration.')
    }
    throw new Error(error.message || 'Unable to save consultation.')
  }
  await recordAudit({ action: 'consultation.created', entityType: 'consultations', entityId: data?.id, patientId, description: newProblemName && !existingProblemId ? `Created consultation and new problem: ${newProblemName}.` : 'Created consultation.' })
  return data
}

export async function updateConsultation(id, payload) {
  return updateForPatient('consultations', id, payload)
}

async function saveMedicationWithPin(patientId, medicationId, payload, pin) {
  assertBillingWriteAllowed('change medication records')
  const cleanPin = validatePrescribingPin(pin)
  if (!supabaseConfigured) {
    await verifyDemoPrescribingPin(cleanPin)
    const data = medicationId
      ? demoUpdate('medications', medicationId, payload)
      : demoInsert('medications', { patient_id: patientId, ...payload })
    await recordAudit({ action: medicationId ? 'medication.updated' : 'medication.created', entityType: 'medications', entityId: data?.id || medicationId, patientId, description: medicationId ? 'Medication changed after prescribing PIN authorisation.' : 'Medication added after prescribing PIN authorisation.' })
    return data
  }

  const { data, error } = await supabase.rpc('recordsweb_save_medication', {
    p_patient_id: patientId,
    p_medication_id: medicationId || null,
    p_payload: payload,
    p_pin: cleanPin,
  })
  if (error) {
    if (error.code === 'PGRST202' || /recordsweb_save_medication/i.test(error.message || '')) {
      throw new Error('Prescribing PIN security is not installed in Supabase. Run supabase/recordsweb-2.6.2.sql.')
    }
    throw new Error(error.message || 'Unable to save medication.')
  }
  await recordAudit({ action: medicationId ? 'medication.updated' : 'medication.created', entityType: 'medications', entityId: data?.id || medicationId, patientId, description: medicationId ? 'Medication changed after prescribing PIN authorisation.' : 'Medication added after prescribing PIN authorisation.' })
  return data
}

export async function createMedication(patientId, payload, pin) {
  return saveMedicationWithPin(patientId, null, payload, pin)
}

export async function updateMedication(id, patientId, payload, pin) {
  return saveMedicationWithPin(patientId, id, payload, pin)
}


export async function getMedicationHistory(patientId, medication) {
  const medicationName = String(medication?.name || '').trim()
  const fallbackCount = Math.max(1, Number(medication?.prescription_count || 1))
  if (!medicationName) return { prescriptionCount: fallbackCount, events: [] }

  if (!supabaseConfigured) {
    const events = demoRows('medication_events')
      .filter((row) => row.patient_id === patientId && String(row.medication_name || '').trim().toLowerCase() === medicationName.toLowerCase())
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    const rows = demoRows('medications').filter((row) => row.patient_id === patientId && String(row.name || '').trim().toLowerCase() === medicationName.toLowerCase())
    const prescriptionCount = Math.max(fallbackCount, ...rows.map((row) => Number(row.prescription_count || 1)), 1)
    return { prescriptionCount, events }
  }

  const { data, error } = await supabase
    .from('medication_events')
    .select('*')
    .eq('patient_id', patientId)
    .eq('medication_name', medicationName)
    .order('created_at', { ascending: false })
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205' || /medication_events/i.test(error.message || '')) {
      throw new Error('Medication history is not installed in Supabase. Run supabase/recordsweb-3.2.8-medication-consultation-workflow.sql.')
    }
    throw error
  }
  const events = data || []
  const issueEvents = events.filter((row) => row.event_type === 'prescribed' || row.event_type === 'reauthorised').length
  return { prescriptionCount: Math.max(fallbackCount, issueEvents || 0), events }
}

export async function cancelMedication(medicationId, patientId, reason) {
  assertBillingWriteAllowed('cancel medication courses')
  const cleanReason = String(reason || '').trim()
  if (cleanReason.length < 3) throw new Error('Enter a reason for cancelling this medication course.')

  if (!supabaseConfigured) {
    const medication = demoRows('medications').find((row) => row.id === medicationId && row.patient_id === patientId)
    if (!medication) throw new Error('Medication record was not found.')
    const now = new Date().toISOString()
    const updated = demoUpdate('medications', medicationId, {
      active: false,
      cancelled_at: now,
      cancellation_reason: cleanReason,
      cancelled_by: 'Current clinician',
      updated_at: now,
    })
    demoInsert('medication_events', {
      patient_id: patientId,
      medication_id: medicationId,
      medication_name: medication.name,
      event_type: 'cancelled',
      reason: cleanReason,
      clinician_name: 'Current clinician',
      prescribing_pin_used: false,
    })
    await recordAudit({ action: 'medication.cancelled', entityType: 'medications', entityId: medicationId, patientId, description: `Medication course cancelled. Reason: ${cleanReason}` })
    return updated
  }

  const { data, error } = await supabase.rpc('recordsweb_cancel_medication', {
    p_patient_id: patientId,
    p_medication_id: medicationId,
    p_reason: cleanReason,
  })
  if (error) {
    if (error.code === 'PGRST202' || /recordsweb_cancel_medication/i.test(error.message || '')) {
      throw new Error('Medication course actions are not installed in Supabase. Run supabase/recordsweb-3.2.8-medication-consultation-workflow.sql.')
    }
    throw new Error(error.message || 'Unable to cancel medication course.')
  }
  await recordAudit({ action: 'medication.cancelled', entityType: 'medications', entityId: medicationId, patientId, description: `Medication course cancelled. Reason: ${cleanReason}` })
  return data
}

export async function reauthoriseMedication(medicationId, patientId, pin) {
  assertBillingWriteAllowed('re-authorise medication')
  const cleanPin = validatePrescribingPin(pin)

  if (!supabaseConfigured) {
    await verifyDemoPrescribingPin(cleanPin)
    const medication = demoRows('medications').find((row) => row.id === medicationId && row.patient_id === patientId)
    if (!medication) throw new Error('Medication record was not found.')
    const now = new Date().toISOString()
    const nextCount = Math.max(1, Number(medication.prescription_count || 1)) + 1
    const updated = demoUpdate('medications', medicationId, {
      active: true,
      prescription_count: nextCount,
      last_issue_date: now.slice(0, 10),
      last_reauthorised_at: now,
      cancellation_reason: null,
      cancelled_at: null,
      cancelled_by: null,
      updated_at: now,
    })
    demoInsert('medication_events', {
      patient_id: patientId,
      medication_id: medicationId,
      medication_name: medication.name,
      event_type: 'reauthorised',
      clinician_name: 'Current clinician',
      prescribing_pin_used: true,
    })
    await recordAudit({ action: 'medication.reauthorised', entityType: 'medications', entityId: medicationId, patientId, description: 'Medication re-authorised after prescribing PIN confirmation.' })
    return updated
  }

  const { data, error } = await supabase.rpc('recordsweb_reauthorise_medication', {
    p_patient_id: patientId,
    p_medication_id: medicationId,
    p_pin: cleanPin,
  })
  if (error) {
    if (error.code === 'PGRST202' || /recordsweb_reauthorise_medication/i.test(error.message || '')) {
      throw new Error('Medication re-authorisation is not installed in Supabase. Run supabase/recordsweb-3.2.8-medication-consultation-workflow.sql.')
    }
    throw new Error(error.message || 'Unable to re-authorise medication.')
  }
  await recordAudit({ action: 'medication.reauthorised', entityType: 'medications', entityId: medicationId, patientId, description: 'Medication re-authorised after prescribing PIN confirmation.' })
  return data
}

export async function listAppointments(date) {
  if (!supabaseConfigured) {
    return demoRows('appointments').filter((a) => !date || a.starts_at.startsWith(date)).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  }
  let query = supabase.from('appointments').select('*, patients(first_name,last_name,title,nhs_number)').order('starts_at')
  if (date) query = query.gte('starts_at', `${date}T00:00:00`).lt('starts_at', `${date}T23:59:59.999`)
  const { data, error } = await query
  if (error) throw error
  return data.map((x) => ({ ...x, patient_name: x.patients ? `${x.patients.last_name.toUpperCase()}, ${x.patients.first_name} (${x.patients.title || ''})` : '', patient_nhs_number: x.patients?.nhs_number || '' }))
}

export async function createAppointment(payload) {
  assertBillingWriteAllowed('create appointments')
  let data
  if (!supabaseConfigured) data = demoInsert('appointments', payload)
  else {
    const { patient_name: _patientName, patient_nhs_number: _patientNhsNumber, ...dbPayload } = payload
    const result = await supabase.from('appointments').insert(dbPayload).select().single()
    if (result.error) throw result.error
    data = result.data
  }
  await recordAudit({ action: 'appointment.created', entityType: 'appointments', entityId: data?.id, patientId: data?.patient_id || payload.patient_id, description: 'Appointment created.' })
  return data
}

export async function updateAppointment(id, payload) {
  assertBillingWriteAllowed('change appointments')
  let data
  if (!supabaseConfigured) data = demoUpdate('appointments', id, payload)
  else {
    const { patient_name: _patientName, patient_nhs_number: _patientNhsNumber, patients: _patients, ...dbPayload } = payload
    const result = await supabase.from('appointments').update(dbPayload).eq('id', id).select().single()
    if (result.error) throw result.error
    data = result.data
  }
  await recordAudit({ action: 'appointment.updated', entityType: 'appointments', entityId: id, patientId: data?.patient_id || payload.patient_id, description: 'Appointment updated.' })
  return data
}

export async function listStaffReports() {
  if (!supabaseConfigured) return [...demoRows('staff_reports')].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')))
  const { data, error } = await supabase.from('staff_reports').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createStaffReport(payload) {
  assertBillingWriteAllowed('create staff reports')
  if (!supabaseConfigured) return demoInsert('staff_reports', { status: 'Open', ...payload })
  const { data, error } = await supabase.from('staff_reports').insert({ status: 'Open', ...payload }).select().single()
  if (error) throw error
  return data
}

export async function updateStaffReport(id, payload) {
  assertBillingWriteAllowed('change staff reports')
  if (!supabaseConfigured) return demoUpdate('staff_reports', id, payload)
  const { data, error } = await supabase.from('staff_reports').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function listStaffJobs() {
  if (!supabaseConfigured) return [...demoRows('staff_jobs')].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')))
  const { data, error } = await supabase.from('staff_jobs').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createStaffJob(payload) {
  assertBillingWriteAllowed('create staff jobs')
  if (!supabaseConfigured) return demoInsert('staff_jobs', { status: 'Open', ...payload })
  const { data, error } = await supabase.from('staff_jobs').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateStaffJob(id, payload) {
  assertBillingWriteAllowed('change staff jobs')
  if (!supabaseConfigured) return demoUpdate('staff_jobs', id, payload)
  const { data, error } = await supabase.from('staff_jobs').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function listStaffNotices() {
  if (!supabaseConfigured) return [...demoRows('staff_notices')].sort((a,b)=>String(b.published_at||b.created_at||'').localeCompare(String(a.published_at||a.created_at||'')))
  const { data, error } = await supabase.from('staff_notices').select('*').order('published_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createStaffNotice(payload) {
  assertBillingWriteAllowed('create staff notices')
  if (!supabaseConfigured) return demoInsert('staff_notices', { active: true, ...payload })
  const { data, error } = await supabase.from('staff_notices').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateStaffNotice(id, payload) {
  assertBillingWriteAllowed('change staff notices')
  if (!supabaseConfigured) return demoUpdate('staff_notices', id, payload)
  const { data, error } = await supabase.from('staff_notices').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function listOrganisationNotepad() {
  if (!supabaseConfigured) return [...demoRows('organisation_notepad')].sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))
  const { data, error } = await supabase.from('organisation_notepad').select('*').order('updated_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createOrganisationNotepadEntry(payload) {
  assertBillingWriteAllowed('create notepad entries')
  if (!supabaseConfigured) return demoInsert('organisation_notepad', payload)
  const { data, error } = await supabase.from('organisation_notepad').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateOrganisationNotepadEntry(id, payload) {
  assertBillingWriteAllowed('change notepad entries')
  if (!supabaseConfigured) return demoUpdate('organisation_notepad', id, payload)
  const { data, error } = await supabase.from('organisation_notepad').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteOrganisationNotepadEntry(id) {
  assertBillingWriteAllowed('delete notepad entries')
  if (!supabaseConfigured) {
    const snapshot = demoRows('organisation_notepad').find((row) => row.id === id)
    if (snapshot) await archiveDeletedRecord('organisation_notepad', snapshot)
    return demoDelete('organisation_notepad', id)
  }
  const { data: snapshot } = await supabase.from('organisation_notepad').select('*').eq('id', id).maybeSingle()
  if (snapshot) await archiveDeletedRecord('organisation_notepad', snapshot)
  const { error } = await supabase.from('organisation_notepad').delete().eq('id', id)
  if (error) throw error
  await recordAudit({ action: 'content.deleted', entityType: 'organisation_notepad', entityId: id, description: 'Deleted organisation notepad entry (recoverable).' })
}

export async function listOrganisationNews() {
  if (!supabaseConfigured) return [...demoRows('organisation_news')].sort((a, b) => String(b.published_at || b.created_at || '').localeCompare(String(a.published_at || a.created_at || '')))
  const { data, error } = await supabase.from('organisation_news').select('*').order('published_at', { ascending: false }).order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createOrganisationNews(payload) {
  assertBillingWriteAllowed('publish organisation news')
  if (!supabaseConfigured) return demoInsert('organisation_news', { active: true, ...payload })
  const { data, error } = await supabase.from('organisation_news').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateOrganisationNews(id, payload) {
  assertBillingWriteAllowed('change organisation news')
  if (!supabaseConfigured) return demoUpdate('organisation_news', id, payload)
  const { data, error } = await supabase.from('organisation_news').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteOrganisationNews(id) {
  assertBillingWriteAllowed('delete organisation news')
  if (!supabaseConfigured) {
    const snapshot = demoRows('organisation_news').find((row) => row.id === id)
    if (snapshot) await archiveDeletedRecord('organisation_news', snapshot)
    return demoDelete('organisation_news', id)
  }
  const { data: snapshot } = await supabase.from('organisation_news').select('*').eq('id', id).maybeSingle()
  if (snapshot) await archiveDeletedRecord('organisation_news', snapshot)
  const { error } = await supabase.from('organisation_news').delete().eq('id', id)
  if (error) throw error
  await recordAudit({ action: 'content.deleted', entityType: 'organisation_news', entityId: id, description: 'Deleted organisation news item (recoverable).' })
}

