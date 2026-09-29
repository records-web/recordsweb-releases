import { supabase, supabaseConfigured } from './supabase'
import { assertBillingWriteAllowed } from './billingAccess'
import { recordAudit } from './auditService'

const DEMO_KEY = 'recordsweb-ro-school-demo-v1'

export const SCHOOL_ATTENDANCE_MARKS = Object.freeze([
  { code: 'P', label: 'Present', present: true },
  { code: 'L', label: 'Late', present: true },
  { code: 'I', label: 'Illness', present: false },
  { code: 'M', label: 'Medical / dental', present: false },
  { code: 'C', label: 'Authorised circumstances', present: false },
  { code: 'R', label: 'Religious observance', present: false },
  { code: 'E', label: 'Suspended / excluded', present: false },
  { code: 'N', label: 'Reason not yet provided', present: false },
  { code: 'O', label: 'Unauthorised absence', present: false },
  { code: 'X', label: 'Not required to attend', present: false },
])

export const SCHOOL_PRESENT_CODES = new Set(SCHOOL_ATTENDANCE_MARKS.filter((item) => item.present).map((item) => item.code))

function demoDb() {
  try {
    const value = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null')
    if (value && typeof value === 'object') return { pupils: [], classes: [], memberships: [], registers: [], marks: [], timetable: [], ...value }
  } catch {}
  return { pupils: [], classes: [], memberships: [], registers: [], marks: [], timetable: [] }
}

function saveDemo(db) { localStorage.setItem(DEMO_KEY, JSON.stringify(db)) }
function id() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}` }
function now() { return new Date().toISOString() }
function cleanSearch(value) { return String(value || '').trim().replace(/[%_,()]/g, '') }
function schoolRef(prefix = 'PUP') { return `${prefix}-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}` }

export async function listSchoolPupils(search = '') {
  if (!supabaseConfigured) {
    const q = String(search || '').trim().toLowerCase()
    return demoDb().pupils.filter((row) => !q || `${row.admission_number} ${row.first_name} ${row.last_name} ${row.preferred_name || ''} ${row.form_group || ''} ${row.year_group || ''}`.toLowerCase().includes(q))
  }
  let query = supabase.from('school_pupils').select('*').eq('status', 'active').order('last_name').order('first_name').limit(1000)
  const q = cleanSearch(search)
  if (q) query = query.or(`admission_number.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,preferred_name.ilike.%${q}%,form_group.ilike.%${q}%,year_group.ilike.%${q}%`)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function getSchoolPupil(pupilId) {
  if (!supabaseConfigured) return demoDb().pupils.find((row) => String(row.id) === String(pupilId)) || null
  const { data, error } = await supabase.from('school_pupils').select('*').eq('id', pupilId).maybeSingle()
  if (error) throw error
  return data
}

export async function createSchoolPupil(payload) {
  assertBillingWriteAllowed('create a Ro-School pupil record')
  let row
  if (!supabaseConfigured) {
    const db = demoDb()
    row = { id: id(), admission_number: schoolRef('PUP'), status: 'active', created_at: now(), updated_at: now(), ...payload }
    db.pupils.push(row); saveDemo(db)
  } else {
    const result = await supabase.from('school_pupils').insert(payload).select().single()
    if (result.error) throw result.error
    row = result.data
  }
  await recordAudit({ action: 'school.pupil.created', entityType: 'school_pupil', entityId: row.id, description: `Created Ro-School pupil ${row.admission_number || ''}.` })
  return row
}

export async function updateSchoolPupil(pupilId, patch) {
  assertBillingWriteAllowed('update a Ro-School pupil record')
  let row
  if (!supabaseConfigured) {
    const db = demoDb(); const index = db.pupils.findIndex((item) => String(item.id) === String(pupilId)); if (index < 0) throw new Error('Pupil not found.')
    db.pupils[index] = { ...db.pupils[index], ...patch, updated_at: now() }; row = db.pupils[index]; saveDemo(db)
  } else {
    const result = await supabase.from('school_pupils').update(patch).eq('id', pupilId).select().single()
    if (result.error) throw result.error
    row = result.data
  }
  await recordAudit({ action: 'school.pupil.updated', entityType: 'school_pupil', entityId: pupilId, description: `Updated Ro-School pupil ${row.admission_number || ''}.` })
  return row
}

export async function listSchoolClasses() {
  if (!supabaseConfigured) return demoDb().classes.filter((row) => row.active !== false).sort((a,b) => String(a.code).localeCompare(String(b.code)))
  const { data, error } = await supabase.from('school_classes').select('*').eq('active', true).order('code').limit(500)
  if (error) throw error
  return data || []
}

export async function createSchoolClass(payload) {
  assertBillingWriteAllowed('create a Ro-School class')
  let row
  if (!supabaseConfigured) {
    const db = demoDb(); row = { id: id(), active: true, created_at: now(), updated_at: now(), ...payload }; db.classes.push(row); saveDemo(db)
  } else {
    const result = await supabase.from('school_classes').insert(payload).select().single()
    if (result.error) throw result.error
    row = result.data
  }
  await recordAudit({ action: 'school.class.created', entityType: 'school_class', entityId: row.id, description: `Created Ro-School class ${row.code || row.name || ''}.` })
  return row
}

export async function getSchoolClassMembers(classId) {
  if (!classId) return []
  if (!supabaseConfigured) {
    const db = demoDb(); const ids = new Set(db.memberships.filter((row) => String(row.class_id) === String(classId)).map((row) => String(row.pupil_id)))
    return db.pupils.filter((row) => ids.has(String(row.id)) && row.status !== 'left').sort((a,b) => String(a.last_name).localeCompare(String(b.last_name)))
  }
  const { data, error } = await supabase.from('school_class_members').select('pupil:school_pupils(*)').eq('class_id', classId)
  if (error) throw error
  return (data || []).map((row) => row.pupil).filter(Boolean).sort((a,b) => String(a.last_name).localeCompare(String(b.last_name)))
}

export async function setSchoolClassMembers(classId, pupilIds = []) {
  assertBillingWriteAllowed('update Ro-School class membership')
  const uniqueIds = [...new Set(pupilIds.map(String).filter(Boolean))]
  if (!supabaseConfigured) {
    const db = demoDb(); db.memberships = db.memberships.filter((row) => String(row.class_id) !== String(classId))
    uniqueIds.forEach((pupilId) => db.memberships.push({ id: id(), class_id: classId, pupil_id: pupilId, created_at: now() })); saveDemo(db)
  } else {
    const deletion = await supabase.from('school_class_members').delete().eq('class_id', classId)
    if (deletion.error) throw deletion.error
    if (uniqueIds.length) {
      const insertion = await supabase.from('school_class_members').insert(uniqueIds.map((pupil_id) => ({ class_id: classId, pupil_id })))
      if (insertion.error) throw insertion.error
    }
  }
  await recordAudit({ action: 'school.class.members.updated', entityType: 'school_class', entityId: classId, description: `Updated Ro-School class membership (${uniqueIds.length} pupils).` })
}

export async function getSchoolRegister({ date, sessionType, classId = null, formGroup = '', periodLabel = '' }) {
  if (!supabaseConfigured) {
    const db = demoDb()
    const register = db.registers.find((row) => row.register_date === date && row.session_type === sessionType && String(row.class_id || '') === String(classId || '') && String(row.form_group || '') === String(formGroup || '') && String(row.period_label || '') === String(periodLabel || '')) || null
    if (!register) return null
    return { ...register, marks: db.marks.filter((mark) => String(mark.register_id) === String(register.id)) }
  }
  let query = supabase.from('school_registers').select('*, marks:school_register_marks(*)').eq('register_date', date).eq('session_type', sessionType)
  classId ? query = query.eq('class_id', classId) : query = query.is('class_id', null)
  formGroup ? query = query.eq('form_group', formGroup) : query = query.eq('form_group', '')
  periodLabel ? query = query.eq('period_label', periodLabel) : query = query.eq('period_label', '')
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data
}

async function ensureSchoolRegister({ date, sessionType, classId = null, formGroup = '', periodLabel = '', takenByName = '' }) {
  const existing = await getSchoolRegister({ date, sessionType, classId, formGroup, periodLabel })
  if (existing) return existing
  if (!supabaseConfigured) {
    const db = demoDb(); const row = { id: id(), register_date: date, session_type: sessionType, class_id: classId || null, form_group: formGroup || '', period_label: periodLabel || '', status: 'open', taken_by_name: takenByName || '', created_at: now(), updated_at: now() }; db.registers.push(row); saveDemo(db); return { ...row, marks: [] }
  }
  const result = await supabase.from('school_registers').insert({ register_date: date, session_type: sessionType, class_id: classId || null, form_group: formGroup || '', period_label: periodLabel || '', taken_by_name: takenByName || '' }).select().single()
  if (result.error) throw result.error
  return { ...result.data, marks: [] }
}

export async function saveSchoolRegister({ date, sessionType, classId = null, formGroup = '', periodLabel = '', marks = [], completed = false, takenByName = '' }) {
  assertBillingWriteAllowed('save a Ro-School register')
  const register = await ensureSchoolRegister({ date, sessionType, classId, formGroup, periodLabel, takenByName })
  const cleanMarks = marks.map((mark) => ({
    register_id: register.id,
    pupil_id: mark.pupil_id,
    mark_code: String(mark.mark_code || 'N').toUpperCase(),
    minutes_late: Math.max(0, Number(mark.minutes_late || 0)),
    note: String(mark.note || '').trim() || null,
  }))
  if (!supabaseConfigured) {
    const db = demoDb(); db.marks = db.marks.filter((row) => String(row.register_id) !== String(register.id)); cleanMarks.forEach((row) => db.marks.push({ id: id(), ...row, marked_at: now() }))
    const index = db.registers.findIndex((row) => String(row.id) === String(register.id)); if (index >= 0) db.registers[index] = { ...db.registers[index], status: completed ? 'completed' : 'open', taken_by_name: takenByName || db.registers[index].taken_by_name, taken_at: completed ? now() : db.registers[index].taken_at, updated_at: now() }
    saveDemo(db)
  } else {
    if (cleanMarks.length) {
      const result = await supabase.from('school_register_marks').upsert(cleanMarks, { onConflict: 'register_id,pupil_id' })
      if (result.error) throw result.error
    }
    const result = await supabase.from('school_registers').update({ status: completed ? 'completed' : 'open', taken_by_name: takenByName || null, taken_at: completed ? now() : null }).eq('id', register.id)
    if (result.error) throw result.error
  }
  await recordAudit({ action: completed ? 'school.register.completed' : 'school.register.saved', entityType: 'school_register', entityId: register.id, description: `${completed ? 'Completed' : 'Saved'} ${sessionType} Ro-School register for ${date}.` })
  return register.id
}

export async function listSchoolRegisters({ from, to } = {}) {
  if (!supabaseConfigured) {
    return demoDb().registers.filter((row) => (!from || row.register_date >= from) && (!to || row.register_date <= to)).sort((a,b) => `${b.register_date}${b.created_at}`.localeCompare(`${a.register_date}${a.created_at}`))
  }
  let query = supabase.from('school_registers').select('*, class:school_classes(id,code,name,subject)').order('register_date', { ascending: false }).order('created_at', { ascending: false }).limit(1000)
  if (from) query = query.gte('register_date', from)
  if (to) query = query.lte('register_date', to)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function listSchoolAttendanceSummary({ from, to } = {}) {
  const pupils = await listSchoolPupils('')
  let marks = []
  if (!supabaseConfigured) {
    const db = demoDb(); const validRegisterIds = new Set(db.registers.filter((row) => (!from || row.register_date >= from) && (!to || row.register_date <= to) && row.status === 'completed').map((row) => String(row.id)))
    marks = db.marks.filter((row) => validRegisterIds.has(String(row.register_id)))
  } else {
    let query = supabase.from('school_register_marks').select('pupil_id,mark_code,register:school_registers!inner(register_date,status)').eq('register.status', 'completed')
    if (from) query = query.gte('register.register_date', from)
    if (to) query = query.lte('register.register_date', to)
    const result = await query.limit(10000)
    if (result.error) throw result.error
    marks = result.data || []
  }
  const byPupil = new Map()
  for (const mark of marks) {
    const key = String(mark.pupil_id); const current = byPupil.get(key) || { sessions: 0, present: 0, late: 0, authorised: 0, unauthorised: 0 }
    current.sessions += 1
    if (SCHOOL_PRESENT_CODES.has(mark.mark_code)) current.present += 1
    if (mark.mark_code === 'L') current.late += 1
    if (['I','M','C','R','E'].includes(mark.mark_code)) current.authorised += 1
    if (['N','O'].includes(mark.mark_code)) current.unauthorised += 1
    byPupil.set(key, current)
  }
  return pupils.map((pupil) => {
    const stats = byPupil.get(String(pupil.id)) || { sessions: 0, present: 0, late: 0, authorised: 0, unauthorised: 0 }
    return { ...pupil, ...stats, attendance_percent: stats.sessions ? Math.round((stats.present / stats.sessions) * 1000) / 10 : null }
  })
}

export async function listSchoolTimetable() {
  if (!supabaseConfigured) {
    const db = demoDb(); return db.timetable.map((row) => ({ ...row, class: db.classes.find((item) => String(item.id) === String(row.class_id)) || null })).sort((a,b) => Number(a.weekday) - Number(b.weekday) || Number(a.period_number) - Number(b.period_number))
  }
  const { data, error } = await supabase.from('school_timetable_entries').select('*, class:school_classes(id,code,name,subject,year_group)').order('weekday').order('period_number').limit(1000)
  if (error) throw error
  return data || []
}

export async function createSchoolTimetableEntry(payload) {
  assertBillingWriteAllowed('create a Ro-School timetable entry')
  let row
  if (!supabaseConfigured) {
    const db = demoDb(); row = { id: id(), created_at: now(), ...payload }; db.timetable.push(row); saveDemo(db)
  } else {
    const result = await supabase.from('school_timetable_entries').insert(payload).select().single()
    if (result.error) throw result.error
    row = result.data
  }
  await recordAudit({ action: 'school.timetable.created', entityType: 'school_timetable', entityId: row.id, description: 'Created Ro-School timetable entry.' })
  return row
}

export async function deleteSchoolTimetableEntry(entryId) {
  assertBillingWriteAllowed('delete a Ro-School timetable entry')
  if (!supabaseConfigured) {
    const db = demoDb(); db.timetable = db.timetable.filter((row) => String(row.id) !== String(entryId)); saveDemo(db)
  } else {
    const { error } = await supabase.from('school_timetable_entries').delete().eq('id', entryId)
    if (error) throw error
  }
  await recordAudit({ action: 'school.timetable.deleted', entityType: 'school_timetable', entityId: entryId, description: 'Deleted Ro-School timetable entry.' })
}

export async function getSchoolDashboard() {
  const today = new Date().toISOString().slice(0, 10)
  const [pupils, classes, registers, summary] = await Promise.all([
    listSchoolPupils(''),
    listSchoolClasses(),
    listSchoolRegisters({ from: today, to: today }),
    listSchoolAttendanceSummary({ from: today, to: today }),
  ])
  const marked = summary.reduce((sum, row) => sum + row.sessions, 0)
  const present = summary.reduce((sum, row) => sum + row.present, 0)
  return {
    pupils: pupils.length,
    classes: classes.length,
    registers: registers.length,
    completedRegisters: registers.filter((row) => row.status === 'completed').length,
    present,
    marked,
    attendancePercent: marked ? Math.round((present / marked) * 1000) / 10 : null,
  }
}
