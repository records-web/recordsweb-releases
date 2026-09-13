import React, { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { listForPatient } from '../lib/dataService'
import { listSharedCarePatientLinks } from '../lib/sharedCareService'
import { useAuth } from '../contexts/AuthContext'

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
  const { session } = useAuth()
  const mode = session?.profile?.organisation_mode || 'general_practice'
  const [alerts, setAlerts] = useState([])
  const [sharedCareCount, setSharedCareCount] = useState(0)

  useEffect(() => {
    let live = true
    if (!patient?.id) { setAlerts([]); setSharedCareCount(0); return () => { live = false } }
    listForPatient('patient_alerts', patient.id, 'created_at').then((rows) => { if (live) setAlerts(rows.filter((row) => row.active !== false)) }).catch(() => { if (live) setAlerts([]) })
    listSharedCarePatientLinks(patient.id).then((rows) => { if (live) setSharedCareCount(Array.isArray(rows) ? rows.length : 0) }).catch(() => { if (live) setSharedCareCount(0) })
    return () => { live = false }
  }, [patient?.id])

  const tabs = useMemo(() => {
    if (!patient?.id) return []
    const base = `/patients/${patient.id}`
    if (mode === 'hospital') {
      return [
        ['Patient Summary', base, true],
        ['Clinical Notes', `${base}/consultations`],
        ['Medicines', `${base}/medication`],
        ['Problems', `${base}/problems`],
        ['Results', `${base}/investigations`],
        ['Admissions', `/hospital/admissions?patient=${encodeURIComponent(patient.id)}`],
        ['Documents', `${base}/documents`],
        ['Discharge', `/hospital/discharge?patient=${encodeURIComponent(patient.id)}`],
        ['Shared Care', `${base}/shared-care`],
      ]
    }
    if (mode === 'ambulance') {
      return [
        ['Patient Summary', base, true],
        ['ePCR / Incidents', `/ambulance/incidents?patient=${encodeURIComponent(patient.id)}`],
        ['Medicines', `${base}/medication`],
        ['Medical History', `${base}/problems`],
        ['Previous Care', `${base}/care-history`],
        ['Documents', `${base}/documents`],
        ['Handover', `/ambulance/handover?patient=${encodeURIComponent(patient.id)}`],
        ['Shared Care', `${base}/shared-care`],
      ]
    }
    return [
      ['Summary', base, true],
      ['Consultations', `${base}/consultations`],
      ['Medication', `${base}/medication`],
      ['Problems', `${base}/problems`],
      ['Investigations', `${base}/investigations`],
      ['Care History', `${base}/care-history`],
      ['Diary', `${base}/diary`],
      ['Documents', `${base}/documents`],
      ['Referrals', `${base}/referrals`],
      ['Shared Care', `${base}/shared-care`],
    ]
  }, [mode, patient?.id])

  if (!patient) return <div className="patient-header patient-header-loading">Loading patient…</div>
  const displayName = `${patient.last_name?.toUpperCase()}, ${patient.first_name} (${patient.title || ''})`

  return (
    <>
      <div className={`patient-header patient-header-${mode}`}>
        <div className="patient-status">{patient.status || 'Active'}</div>
        <div className="patient-name"><span>{displayName}</span>{sharedCareCount > 0 && <span className="patient-shared-care-badge">Shared Care {sharedCareCount}</span>}</div>
        <div className="patient-meta"><span>Born</span><strong>{new Date(patient.dob).toLocaleDateString('en-GB')}</strong><small>({ageFromDob(patient.dob)})</small></div>
        <div className="patient-meta"><span>Gender</span><strong>{patient.gender || patient.sex}</strong></div>
        <div className="patient-meta"><span>NHS No.</span><strong>{patient.nhs_number || '—'}</strong></div>
        <div className="patient-meta patient-gp"><span>{mode === 'hospital' ? 'Usual GP' : mode === 'ambulance' ? 'Registered GP' : 'Usual GP'}</span><strong>{patient.usual_gp || 'Not assigned'}</strong></div>
      </div>
      <nav className={`patient-tabs patient-tabs-${mode}`}>
        {tabs.map(([label, to, end]) => (
          <NavLink key={label} end={Boolean(end)} to={to} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>
        ))}
      </nav>
      {alerts.length > 0 && <div className="patient-clinical-alert-strip"><AlertTriangle size={14}/><strong>Clinical alert:</strong><span>{alerts.slice(0,3).map((alert)=>alert.message).join(' · ')}</span>{alerts.length>3&&<em>+{alerts.length-3} more</em>}</div>}
    </>
  )
}
