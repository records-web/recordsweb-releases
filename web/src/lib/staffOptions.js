export const STAFF_TITLES = [
  '',
  'Mr',
  'Mrs',
  'Miss',
  'Ms',
  'Mx',
  'Dr',
  'Prof',
]

export const PRIMARY_CARE_STAFF_ROLES = [
  'GP Partner',
  'Practice Manager',
  'Assistant Manager',
  'General Practitioner',
  'GP Registrar (GPST2-3)',
  'GP Registrar (GPST1)',
  'Medical Student',
  'Lead Nurse',
  'Advanced Clinical Practitioner',
  'Clinical Pharmacist',
  'General Practice Nurse',
  'Nurse Associate',
  'Healthcare Assistant',
  'Patient Coordinator',
]

export const SECONDARY_CARE_STAFF_ROLES = [
  'Chief Executive Officer',
  'Deputy Chief Executive Officer',
  'Chief Operations Officer',
  'Medical Director',
  'Director of Nursing',
  'Consultant',
  'Registrar (ST4-ST9)',
  'Charge Nurse',
  'Staff Nurse',
]

export const AMBULANCE_STAFF_ROLES = [
  'PHEM Consultant',
  'PHEM Doctor',
  'Critical Care Paramedic',
  'Advanced Paramedic',
  'Paramedic',
  'Emergency Medical Technician',
  'Emergency Care Assistant',
  'Dispatcher',
  'Clinical Team Leader',
  'Operations Manager',
]

// RecordsWeb Policing uses British-style police ranks and operational roles.
// These are deliberately separate from Clinical organisation roles.
export const POLICING_STAFF_ROLES = [
  'Chief Constable',
  'Deputy Chief Constable',
  'Assistant Chief Constable',
  'Chief Superintendent',
  'Superintendent',
  'Chief Inspector',
  'Inspector',
  'Sergeant',
  'Police Constable',
  'Detective Chief Superintendent',
  'Detective Superintendent',
  'Detective Chief Inspector',
  'Detective Inspector',
  'Detective Sergeant',
  'Detective Constable',
  'Special Constable',
  'Police Community Support Officer',
  'Custody Sergeant',
  'Detention Officer',
  'Control Room Operator',
  'Police Staff',
]

export const STAFF_ROLES = PRIMARY_CARE_STAFF_ROLES
export const CLINICAL_STAFF_ROLES = [...new Set([...PRIMARY_CARE_STAFF_ROLES, ...SECONDARY_CARE_STAFF_ROLES, ...AMBULANCE_STAFF_ROLES])]
export const ALL_STAFF_ROLES = [...new Set([...CLINICAL_STAFF_ROLES, ...POLICING_STAFF_ROLES])]

export function getClinicalStaffRoles(systemMode = 'general_practice') {
  if (systemMode === 'hospital') return SECONDARY_CARE_STAFF_ROLES
  if (systemMode === 'ambulance') return AMBULANCE_STAFF_ROLES
  return PRIMARY_CARE_STAFF_ROLES
}

export function getStaffRoles(systemMode = 'general_practice', product = 'clinical') {
  if (product === 'policing') return POLICING_STAFF_ROLES
  return getClinicalStaffRoles(systemMode)
}

export function getDefaultStaffRole(systemMode = 'general_practice', product = 'clinical') {
  if (product === 'policing') return 'Police Constable'
  if (systemMode === 'hospital') return 'Consultant'
  if (systemMode === 'ambulance') return 'Paramedic'
  return 'Patient Coordinator'
}

export function buildStaffDisplayName({ title = '', first_name = '', last_name = '' }) {
  return [title, first_name, last_name].map((value) => String(value || '').trim()).filter(Boolean).join(' ')
}

export function normaliseRoles(roles, fallbackRole = 'Patient Coordinator', systemMode = null, product = null) {
  const allowed = product
    ? getStaffRoles(systemMode || 'general_practice', product)
    : systemMode
      ? getClinicalStaffRoles(systemMode)
      : ALL_STAFF_ROLES
  const defaultRole = product
    ? getDefaultStaffRole(systemMode || 'general_practice', product)
    : systemMode
      ? getDefaultStaffRole(systemMode)
      : 'Patient Coordinator'
  const fallback = allowed.includes(fallbackRole) ? fallbackRole : defaultRole
  const source = Array.isArray(roles) ? roles : []
  const clean = [...new Set(source
    .map((role) => String(role || '').trim())
    .filter((role) => allowed.includes(role)))]
  return clean.length ? clean : [fallback]
}
