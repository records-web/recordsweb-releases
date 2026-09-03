import React from 'react'
import { BriefcaseBusiness, CalendarDays, FileText, Pill, Search, Stethoscope, UserCog, UsersRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Panel from '../components/Panel'
import OrganisationNewsPanel from '../components/home/OrganisationNewsPanel'
import OrganisationNotepadPanel from '../components/home/OrganisationNotepadPanel'
import { useAuth } from '../contexts/AuthContext'

export default function HomePage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const profile = session?.profile || {}

  const quickItems = [
    ['Patient search', Search, '/patients'],
    ['Consultations', Stethoscope, '/patients'],
    ['Medication', Pill, '/patients'],
    ['Documents', FileText, '/patients'],
    ['Appointment Book', CalendarDays, '/appointments'],
    ['Registration', UsersRound, '/registration'],
    ['Staff Area', BriefcaseBusiness, '/staff-area'],
  ]
  if (profile.is_management) quickItems.push(['Management', UserCog, '/management'])

  return (
    <div className="home-grid emis-home-grid home-workspace-fill">
      <Panel title="Quick Launch Menu" className="quick-launch-panel">
        <div className="quick-launch-list">
          {quickItems.map(([label, Icon, path]) => <button key={label} onClick={() => navigate(path)}><Icon size={17} /><span>{label}</span></button>)}
        </div>
      </Panel>

      <OrganisationNotepadPanel />
      <OrganisationNewsPanel />
    </div>
  )
}
