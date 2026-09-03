import React, { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { listForPatient } from '../lib/dataService'

const tabs = [
  ['Summary', ''],
  ['Consultations', 'consultations'],
  ['Medication', 'medication'],
  ['Problems', 'problems'],
  ['Investigations', 'investigations'],
  ['Care History', 'care-history'],
  ['Diary', 'diary'],
  ['Documents', 'documents'],
  ['Referrals', 'referrals'],
]

function ageFromDob(dob) {
  if (!dob) return ''
  const birth = new Date(dob)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return `${age}y`
}

export default function PatientHeader({ patient }) {
  const [alerts, setAlerts] = useState([])
  useEffect(() => {
    let live = true
    if (!patient?.id) { setAlerts([]); return () => { live = false } }
    listForPatient('patient_alerts', patient.id, 'created_at').then((rows) => { if (live) setAlerts(rows.filter((row) => row.active !== false)) }).catch(() => { if (live) setAlerts([]) })
    return () => { live = false }
  }, [patient?.id])
  if (!patient) return <div className="patient-header patient-header-loading">Loading patient…</div>
  const base = `/patients/${patient.id}`
  const displayName = `${patient.last_name?.toUpperCase()}, ${patient.first_name} (${patient.title || ''})`

  return (
    <>
      <div className="patient-header">
        <div className="patient-status">{patient.status || 'Active'}</div>
        <div className="patient-name">{displayName}</div>
        <div className="patient-meta"><span>Born</span><strong>{new Date(patient.dob).toLocaleDateString('en-GB')}</strong><small>({ageFromDob(patient.dob)})</small></div>
        <div className="patient-meta"><span>Gender</span><strong>{patient.gender || patient.sex}</strong></div>
        <div className="patient-meta"><span>NHS No.</span><strong>{patient.nhs_number || '—'}</strong></div>
        <div className="patient-meta patient-gp"><span>Usual GP</span><strong>{patient.usual_gp || 'Not assigned'}</strong></div>
      </div>
      <nav className="patient-tabs">
        {tabs.map(([label, path]) => (
          <NavLink key={label} end={!path} to={`${base}${path ? `/${path}` : ''}`} className={({ isActive }) => isActive ? 'active' : ''}>
            {label}
          </NavLink>
        ))}
      </nav>
      {alerts.length > 0 && <div className="patient-clinical-alert-strip"><AlertTriangle size={14}/><strong>Clinical alert:</strong><span>{alerts.slice(0,3).map((alert)=>alert.message).join(' · ')}</span>{alerts.length>3&&<em>+{alerts.length-3} more</em>}</div>}
    </>
  )
}
