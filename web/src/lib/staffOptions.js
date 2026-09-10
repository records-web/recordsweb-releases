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
]

export const STAFF_ROLES = PRIMARY_CARE_STAFF_ROLES
export const ALL_STAFF_ROLES = [...new Set([...PRIMARY_CARE_STAFF_ROLES, ...SECONDARY_CARE_STAFF_ROLES])]

export function getStaffRoles(systemMode = 'general_practice') {
  return systemMode === 'hospital' ? SECONDARY_CARE_STAFF_ROLES : PRIMARY_CARE_STAFF_ROLES
}

export function getDefaultStaffRole(systemMode = 'general_practice') {
  return systemMode === 'hospital' ? 'Consultant' : 'Patient Coordinator'
}

export function buildStaffDisplayName({ title = '', first_name = '', last_name = '' }) {
  return [title, first_name, last_name].map((value) => String(value || '').trim()).filter(Boolean).join(' ')
}

export function normaliseRoles(roles, fallbackRole = 'Patient Coordinator', systemMode = null) {
  const allowed = systemMode ? getStaffRoles(systemMode) : ALL_STAFF_ROLES
  const defaultRole = systemMode ? getDefaultStaffRole(systemMode) : 'Patient Coordinator'
  const fallback = allowed.includes(fallbackRole) ? fallbackRole : defaultRole
  const source = Array.isArray(roles) ? roles : []
  const clean = [...new Set(source
    .map((role) => String(role || '').trim())
    .filter((role) => allowed.includes(role)))]
  return clean.length ? clean : [fallback]
}
