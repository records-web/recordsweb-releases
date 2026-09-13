import React, { useEffect, useMemo, useState } from 'react'
import { BedDouble, ClipboardPlus, DoorOpen, FileClock, RefreshCw, Search, Stethoscope, UserRoundCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Panel from '../components/Panel'
import { listPatients } from '../lib/dataService'
import { createCareEpisode, listCareEpisodes, updateCareEpisode } from '../lib/careWorkspaceService'

const STATUS_OPTIONS = [
  ['admitted', 'Admitted'],
  ['review_due', 'Review due'],
  ['awaiting_results', 'Awaiting results'],
  ['discharge_planned', 'Discharge planned'],
  ['discharged', 'Discharged'],
]

function patientName(patient) {
  return patient ? `${patient.last_name?.toUpperCase() || ''}, ${patient.first_name || ''}`.trim().replace(/^,\s*/, '') : 'Patient not linked'
}

export default function HospitalWorkspacePage({ view = 'dashboard' }) {
  const navigate = useNavigate()
  const [episodes, setEpisodes] = useState([])
  const [patients, setPatients] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(view === 'admissions')
  const [form, setForm] = useState({ patient_id: '', presenting_complaint: '', ward: 'Acute Medical Unit', bed: '', assigned_clinician: '' })

  async function load() {
    setBusy(true); setError('')
    try {
      const [episodeRows, patientRows] = await Promise.all([listCareEpisodes('hospital'), listPatients('')])
      setEpisodes(episodeRows); setPatients(patientRows)
    } catch (err) { setError(err?.message || 'Unable to load the hospital workspace.') }
    finally { setBusy(false) }
  }

  useEffect(() => { load() }, [])

  const patientMap = useMemo(() => new Map(patients.map((patient) => [patient.id, patient])), [patients])
  const active = episodes.filter((row) => row.status !== 'discharged')
  const due = active.filter((row) => row.status === 'review_due').length
  const awaiting = active.filter((row) => row.status === 'awaiting_results').length
  const discharge = active.filter((row) => row.status === 'discharge_planned').length

  async function createAdmission(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await createCareEpisode('hospital', form)
      setForm({ patient_id: '', presenting_complaint: '', ward: 'Acute Medical Unit', bed: '', assigned_clinician: '' })
      setShowForm(false)
      await load()
    } catch (err) { setError(err?.message || 'Unable to create the admission.') }
    finally { setBusy(false) }
  }

  async function changeStatus(row, status) {
    setBusy(true); setError('')
    try { await updateCareEpisode(row.id, { status }); await load() }
    catch (err) { setError(err?.message || 'Unable to update the admission.') }
    finally { setBusy(false) }
  }

  const title = view === 'ward' ? 'Ward Board' : view === 'admissions' ? 'Admissions' : view === 'discharge' ? 'Discharge' : 'Hospital Operations'
  const rows = view === 'discharge' ? active.filter((row) => ['discharge_planned', 'awaiting_results', 'review_due', 'admitted'].includes(row.status)) : view === 'admissions' ? episodes : active

  return (
    <div className="care-workspace care-workspace-hospital page-pad compact-pad">
      <div className="care-workspace-heading">
        <div><span>SECONDARY CARE</span><h1>{title}</h1><p>Episode-based hospital workflow for admissions, ward activity, clinical review and discharge.</p></div>
        <div className="care-heading-actions"><button onClick={load} disabled={busy}><RefreshCw size={14}/>Refresh</button><button className="primary-button" onClick={() => setShowForm((value) => !value)}><ClipboardPlus size={14}/>New admission</button></div>
      </div>
      {error && <div className="form-error">{error}</div>}

      <div className="care-stat-grid">
        <article><BedDouble size={20}/><div><strong>{active.length}</strong><span>Current inpatients</span></div></article>
        <article><Stethoscope size={20}/><div><strong>{due}</strong><span>Reviews due</span></div></article>
        <article><FileClock size={20}/><div><strong>{awaiting}</strong><span>Awaiting results</span></div></article>
        <article><DoorOpen size={20}/><div><strong>{discharge}</strong><span>Discharges planned</span></div></article>
      </div>

      {showForm && (
        <Panel title="Create hospital admission">
          <form className="care-inline-form" onSubmit={createAdmission}>
            <label><span>Patient *</span><select value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })} required><option value="">Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patientName(patient)} · {patient.nhs_number || 'No NHS number'}</option>)}</select></label>
            <label><span>Reason for admission *</span><input value={form.presenting_complaint} onChange={(e) => setForm({ ...form, presenting_complaint: e.target.value })} required /></label>
            <label><span>Ward</span><input value={form.ward} onChange={(e) => setForm({ ...form, ward: e.target.value })} /></label>
            <label><span>Bed</span><input value={form.bed} onChange={(e) => setForm({ ...form, bed: e.target.value })} placeholder="AMU-12" /></label>
            <label><span>Consultant / clinician</span><input value={form.assigned_clinician} onChange={(e) => setForm({ ...form, assigned_clinician: e.target.value })} /></label>
            <div className="care-form-actions"><button type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>Create admission</button></div>
          </form>
        </Panel>
      )}

      {view === 'dashboard' && (
        <div className="care-dashboard-shortcuts">
          <button onClick={() => navigate('/hospital/ward-board')}><BedDouble size={17}/><strong>Ward Board</strong><span>Current beds and inpatient status</span></button>
          <button onClick={() => navigate('/hospital/admissions')}><ClipboardPlus size={17}/><strong>Admissions</strong><span>Create and review episodes</span></button>
          <button onClick={() => navigate('/hospital/discharge')}><DoorOpen size={17}/><strong>Discharge</strong><span>Plan and complete discharge</span></button>
          <button onClick={() => navigate('/work-queue')}><UserRoundCheck size={17}/><strong>Clinical Work Queue</strong><span>Reviews, results and tasks</span></button>
        </div>
      )}

      <Panel title={view === 'discharge' ? 'Discharge workload' : 'Current hospital episodes'} count={rows.length}>
        {!rows.length ? <div className="empty-state">No hospital episodes are currently recorded.</div> : (
          <div className="hospital-ward-board">
            <div className="hospital-board-head"><span>Bed</span><span>Patient</span><span>Reason / episode</span><span>Clinician</span><span>Status</span><span>Actions</span></div>
            {rows.map((row) => {
              const patient = patientMap.get(row.patient_id)
              return <div className="hospital-board-row" key={row.id}>
                <strong>{row.bed || '—'}</strong>
                <button className="care-patient-link" onClick={() => row.patient_id && navigate(`/patients/${row.patient_id}`)}>{patientName(patient)}<small>{patient?.nhs_number || 'No linked NHS number'}</small></button>
                <div><strong>{row.presenting_complaint || 'Hospital admission'}</strong><small>{row.reference} · {row.ward || 'Ward not set'}</small></div>
                <span>{row.assigned_clinician || 'Unassigned'}</span>
                <select value={row.status} disabled={busy} onChange={(e) => changeStatus(row, e.target.value)}>{STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
                <div className="care-row-actions"><button onClick={() => row.patient_id && navigate(`/patients/${row.patient_id}`)}><Search size={13}/>Record</button>{row.status !== 'discharged' && <button onClick={() => changeStatus(row, 'discharged')}><DoorOpen size={13}/>Discharge</button>}</div>
              </div>
            })}
          </div>
        )}
      </Panel>
    </div>
  )
}
