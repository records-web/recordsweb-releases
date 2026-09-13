import { recordAudit } from './auditService'

export const LICENSED_ACTION_ERROR = 'You are not licensed to preform this action, this is an audited action'

export const PRESCRIBER_ROLES = [
  'GP Partner',
  'General Practitioner',
  'GP Registrar (GPST2-3)',
  'GP Registrar (GPST1)',
  'Advanced Clinical Practitioner',
  'Medical Director',
  'Consultant',
  'Registrar (ST4-ST9)',
  'PHEM Consultant',
  'PHEM Doctor',
]

export const FIT_NOTE_ISSUER_ROLES = [
  ...PRESCRIBER_ROLES,
  'Lead Nurse',
  'General Practice Nurse',
  'Director of Nursing',
  'Charge Nurse',
  'Staff Nurse',
]

function profileRoles(profile = {}) {
  return [...new Set([
    profile.role,
    ...(Array.isArray(profile.roles) ? profile.roles : []),
  ].map((role) => String(role || '').trim()).filter(Boolean))]
}

function hasAnyRole(profile, allowedRoles) {
  const roles = profileRoles(profile)
  return roles.some((role) => allowedRoles.includes(role))
}

export function canPrescribeMedication(profile = {}) {
  return hasAnyRole(profile, PRESCRIBER_ROLES)
}

export function canIssueFitNote(profile = {}) {
  return hasAnyRole(profile, FIT_NOTE_ISSUER_ROLES)
}

export async function auditDeniedClinicalAction({ action, patientId = null, profile = {}, source = '' } = {}) {
  return recordAudit({
    action: 'clinical.licensed_action.denied',
    entityType: 'clinical_permission',
    patientId,
    description: LICENSED_ACTION_ERROR,
    metadata: {
      requested_action: action || 'restricted_clinical_action',
      source: source || null,
      active_role: profile.role || null,
      assigned_roles: profileRoles(profile),
    },
  })
}
