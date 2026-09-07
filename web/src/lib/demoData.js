import { getDemoOrganisationId, getInstalledOrganisationCode } from './installation'

const installedCode = getInstalledOrganisationCode() || 'GW.HC'

export const ORGANISATION = {
  id: getDemoOrganisationId(installedCode),
  org_code: installedCode,
  name: installedCode === 'GW.HC' ? 'Grove Way Health Centre' : `RecordsWeb Organisation ${installedCode}`,
  system_mode: 'general_practice',
  default_location: installedCode === 'GW.HC' ? 'Main Building' : 'Main Site',
}

export function updateRuntimeOrganisation(patch = {}) {
  if (patch.id) ORGANISATION.id = patch.id
  if (patch.org_code) ORGANISATION.org_code = patch.org_code
  if (patch.name) ORGANISATION.name = patch.name
  if (patch.system_mode) ORGANISATION.system_mode = patch.system_mode
  if (patch.default_location) ORGANISATION.default_location = patch.default_location
  return ORGANISATION
}

export const DEFAULT_DEMO_ACCOUNTS = [
  {
    id: 'demo-manager',
    username: installedCode === 'GW.HC' ? 'manager.grove@GW.HC' : `manager.recordsweb@${installedCode}`,
    password: 'demo',
    first_name: 'RecordsWeb',
    last_name: 'Manager',
    display_name: 'RecordsWeb Manager',
    role: 'Practice Manager',
    roles: ['Practice Manager'],
    title: '',
    is_management: true,
    active: true,
    organisation_id: ORGANISATION.id,
    organisation_name: ORGANISATION.name,
    organisation_code: ORGANISATION.org_code,
  },
]

export const demoUser = DEFAULT_DEMO_ACCOUNTS[0]

export const demoPatients = []
export const demoProblems = []
export const demoMedications = []
export const demoConsultations = []
export const demoDiary = []
export const demoDocuments = []
export const demoInvestigations = []
export const demoReferrals = []
export const demoAppointments = []
export const demoStaffReports = []
export const demoStaffJobs = []
export const demoStaffNotices = []
export const demoOrganisationNotepad = []
export const demoOrganisationNews = []
