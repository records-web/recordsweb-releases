export const ORGANISATION = {
  id: 'grove-way-health-centre',
  org_code: 'GW.HC',
  name: 'Grove Way Health Centre',
}

export const DEFAULT_DEMO_ACCOUNTS = [
  {
    id: 'demo-manager',
    username: 'manager.grove@GW.HC',
    password: 'demo',
    first_name: 'Practice',
    last_name: 'Manager',
    display_name: 'Practice Manager',
    role: 'Practice Manager',
    roles: ['Practice Manager'],
    title: '',
    is_management: true,
    active: true,
    organisation_id: ORGANISATION.id,
    organisation_name: ORGANISATION.name,
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
