import React, { useEffect, useState } from 'react'
import { AlertTriangle, ChevronRight, Plus } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import PatientHeader from '../components/PatientHeader'
import Panel from '../components/Panel'
import ClinicalToolbar from '../components/ClinicalToolbar'
import { getPatient, listForPatient } from '../lib/dataService'

export default function PatientSummaryPage() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const [patient, setPatient] = useState(null)
  const [data, setData] = useState({ problems: [], medications: [], consultations: [], diary: [], alerts: [] })

  useEffect(() => {
    Promise.all([
      getPatient(patientId),
      listForPatient('problems', patientId, 'onset_date'),
      listForPatient('medications', patientId, 'last_issue_date'),
      listForPatient('consultations', patientId, 'date'),
      listForPatient('diary_tasks', patientId, 'due_date', true),
      listForPatient('patient_alerts', patientId, 'created_at').catch(() => []),
    ]).then(([p, problems, medications, consultations, diary, alerts]) => { setPatient(p); setData({ problems, medications, consultations, diary, alerts }) })
  }, [patientId])

  return (
    <div>
      <ClinicalToolbar actions={[
        { label: 'New consultation', icon: 'consult', onClick: () => navigate(`/patients/${patientId}/consultations/new`) },
        { label: 'Add medication', icon: 'medication', onClick: () => navigate(`/patients/${patientId}/medication?add=1`) },
        { label: 'Book appointment', icon: 'appointment', groupStart: true, onClick: () => navigate(`/appointments?patient=${patientId}`) },
        { label: 'Print', icon: 'print', groupStart: true, onClick: () => window.print() },
        { label: 'Search record', icon: 'search', onClick: () => navigate(`/patients/${patientId}/consultations`) },
      ]} />
      <PatientHeader patient={patient} />
      <div className="summary-grid page-pad compact-pad">
        <div className="summary-column">
          <Panel title="Record sharing"><p className="muted">There are no other organisations contributing to the shared record.</p><strong>Data entered by this organisation</strong><p className="muted">Current organisation records are shown below.</p></Panel>
          <Panel title="Problems" count={data.problems.length} actions={<button className="link-button" onClick={() => navigate(`/patients/${patientId}/problems`)}>View all</button>}>
            <table className="compact-table"><thead><tr><th>Active problems</th><th>Onset date</th></tr></thead><tbody>{data.problems.slice(0, 6).map((x) => <tr key={x.id}><td className={x.status === 'Active' ? 'clinical-green' : ''}>{x.name}</td><td>{x.onset_date ? new Date(x.onset_date).toLocaleDateString('en-GB') : '—'}</td></tr>)}</tbody></table>
          </Panel>
          <Panel title="Medication" count={data.medications.length} actions={<button className="link-button" onClick={() => navigate(`/patients/${patientId}/medication`)}>View all</button>}>
            <div className="inline-records"><strong>Acute Meds</strong>{data.medications.filter((x) => x.type === 'Acute Meds' || x.type === 'Acute').map((x) => <span key={x.id}>{x.name}</span>)}</div>
            <div className="inline-records"><strong>Repeat</strong>{data.medications.filter((x) => x.type === 'Repeat').map((x) => <span key={x.id}>{x.name}</span>)}</div>
            <div className="inline-records"><strong>Long Term Meds</strong>{data.medications.filter((x) => x.type === 'Long Term Meds' || x.type === 'Repeat dispensing').map((x) => <span key={x.id}>{x.name}</span>)}</div>
          </Panel>
          <Panel title="Allergies" count={0}><div className="empty-state">No allergy information recorded.</div></Panel>
        </div>

        <div className="summary-column">
          <Panel title="Diary" count={data.diary.length}>
            <h4 className="section-label">Overdue tasks</h4>
            {data.diary.slice(0, 5).map((x) => <div className="diary-row" key={x.id}><span>{x.title}</span><time>{x.due_date ? new Date(x.due_date).toLocaleDateString('en-GB') : ''}</time></div>)}
            <h4 className="section-label">Clinical alerts</h4>
            {data.alerts.filter((x)=>x.active!==false).length ? data.alerts.filter((x)=>x.active!==false).slice(0,5).map((x)=><div className="diary-row" key={x.id}><span>{x.message}</span><time>{x.severity||'Warning'}</time></div>) : <div className="empty-state">No clinical alerts recorded.</div>}
          </Panel>
          <Panel title="Recent activity" count={data.consultations.length} actions={<button className="link-button" onClick={() => navigate(`/patients/${patientId}/consultations`)}>More <ChevronRight size={14} /></button>}>
            {data.consultations.slice(0, 5).map((x) => <div className="activity-row" key={x.id}><div><strong>{x.clinician}</strong><span>{x.location}</span></div><time>{new Date(x.date).toLocaleDateString('en-GB')}</time></div>)}
          </Panel>
          <Panel title="Health status">
            <div className="empty-state">No health status observations recorded.</div>
          </Panel>
          <div className="floating-alerts"><header>{patient ? `${patient.last_name?.toUpperCase()}, ${patient.first_name}` : 'Patient'} <Plus size={14} /></header>{data.diary.slice(0, 5).map((x) => <div key={x.id}><AlertTriangle size={15} /><span>{x.title}</span></div>)}</div>
        </div>
      </div>
    </div>
  )
}
