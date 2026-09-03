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

export const STAFF_ROLES = [
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

export function buildStaffDisplayName({ title = '', first_name = '', last_name = '' }) {
  return [title, first_name, last_name].map((value) => String(value || '').trim()).filter(Boolean).join(' ')
}

export function normaliseRoles(roles, fallbackRole = 'Patient Coordinator') {
  const fallback = STAFF_ROLES.includes(fallbackRole) ? fallbackRole : 'Patient Coordinator'
  const source = Array.isArray(roles) ? roles : []
  const clean = [...new Set(source
    .map((role) => String(role || '').trim())
    .filter((role) => STAFF_ROLES.includes(role)))]
  return clean.length ? clean : [fallback]
}
