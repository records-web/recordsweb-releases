import React, { useEffect, useMemo, useState } from 'react'
import { Activity, Ambulance, ClipboardPlus, HeartPulse, MapPin, RefreshCw, Send, Siren, Stethoscope, UserPlus } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Panel from '../components/Panel'
import { listPatients } from '../lib/dataService'
import { addEpisodeObservation, addEpisodeTreatment, createCareEpisode, listCareEpisodes, updateCareEpisode } from '../lib/careWorkspaceService'
import QuickPatientRegistrationModal from '../components/QuickPatientRegistrationModal'
import { useAuth } from '../contexts/AuthContext'

const STATUS_OPTIONS = [
  ['mobilised', 'Mobilised'],
  ['on_scene', 'On scene'],
  ['assessing', 'Assessing'],
  ['treating', 'Treating'],
  ['conveying', 'Conveying'],
  ['handover', 'Handover'],
  ['closed', 'Closed'],
]

function patientName(patient) {
  return patient ? `${patient.last_name?.toUpperCase() || ''}, ${patient.first_name || ''}`.trim().replace(/^,\s*/, '') : 'Unidentified / not linked'
}

export default function AmbulanceWorkspacePage({ view = 'dashboard' }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { session } = useAuth()
  const organisationName = session?.profile?.organisation_name || 'Ambulance / PHEM'
  const patientFilter = params.get('patient') || ''
  const [episodes, setEpisodes] = useState([])
  const [patients, setPatients] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(view === 'incidents')
  const [showPatientModal, setShowPatientModal] = useState(false)
  const [form, setForm] = useState({ patient_id: '', priority: 'C2', presenting_complaint: '', location: '', unit_call_sign: '' })
  const [observation, setObservation] = useState({ hr: '', rr: '', spo2: '', bp: '', gcs: '15' })
  const [treatment, setTreatment] = useState('')

  async function load() {
    setBusy(true); setError('')
    try {
      const [episodeRows, patientRows] = await Promise.all([listCareEpisodes('ambulance'), listPatients('')])
      setEpisodes(episodeRows); setPatients(patientRows)
      if (!selectedId && episodeRows.length) setSelectedId(episodeRows.find((row) => row.status !== 'closed')?.id || episodeRows[0].id)
    } catch (err) { setError(err?.message || 'Unable to load the ambulance workspace.') }
    finally { setBusy(false) }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (patientFilter) { setForm((current) => ({ ...current, patient_id: patientFilter })); if (view === 'incidents') setShowForm(true) } }, [patientFilter, view])
  useEffect(() => { if (patientFilter && episodes.length) { const match = episodes.find((row) => row.patient_id === patientFilter && row.status !== 'closed') || episodes.find((row) => row.patient_id === patientFilter); if (match) setSelectedId(match.id) } }, [patientFilter, episodes])
  const patientMap = useMemo(() => new Map(patients.map((patient) => [patient.id, patient])), [patients])
  const active = episodes.filter((row) => row.status !== 'closed')
  const visibleActive = patientFilter ? active.filter((row) => row.patient_id === patientFilter) : active
  const selectedCandidate = episodes.find((row) => row.id === selectedId) || null
  const selected = selectedCandidate && (!patientFilter || selectedCandidate.patient_id === patientFilter) ? selectedCandidate : null
  const onScene = active.filter((row) => ['on_scene', 'assessing', 'treating'].includes(row.status)).length
  const conveying = active.filter((row) => ['conveying', 'handover'].includes(row.status)).length

  async function createIncident(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const created = await createCareEpisode('ambulance', form)
      setSelectedId(created.id)
      setForm({ patient_id: '', priority: 'C2', presenting_complaint: '', location: '', unit_call_sign: '' })
      setShowForm(false)
      await load()
    } catch (err) { setError(err?.message || 'Unable to create the incident.') }
    finally { setBusy(false) }
  }

  async function patchEpisode(id, patch) {
    setBusy(true); setError('')
    try { await updateCareEpisode(id, patch); await load() }
    catch (err) { setError(err?.message || 'Unable to update the incident.') }
    finally { setBusy(false) }
  }

  async function recordObservation(event) {
    event.preventDefault(); if (!selected) return
    setBusy(true); setError('')
    try { await addEpisodeObservation(selected, observation); setObservation({ hr: '', rr: '', spo2: '', bp: '', gcs: '15' }); await load() }
    catch (err) { setError(err?.message || 'Unable to record observations.') }
    finally { setBusy(false) }
  }

  async function recordTreatment(event) {
    event.preventDefault(); if (!selected || !treatment.trim()) return
    setBusy(true); setError('')
    try { await addEpisodeTreatment(selected, { text: treatment.trim() }); setTreatment(''); await load() }
    catch (err) { setError(err?.message || 'Unable to record treatment.') }
    finally { setBusy(false) }
  }

  const title = view === 'incidents' ? 'Active Incidents' : view === 'handover' ? 'Handover & Pre-alert' : 'Ambulance Operations'
  const handoverRows = visibleActive.filter((row) => ['conveying', 'handover'].includes(row.status))

  return (
    <div className="care-workspace care-workspace-ambulance page-pad compact-pad">
      <div className="care-workspace-heading">
        <div><span>AMBULANCE / PHEM</span><h1>{title}</h1><p>Incident-first workflow for mobilisation, assessment, treatment, conveyance and transfer of care.</p></div>
        <div className="care-heading-actions"><button className="care-secondary-button" onClick={load} disabled={busy}><RefreshCw size={14}/>Refresh</button><button className="care-secondary-button" onClick={() => setShowPatientModal(true)}><UserPlus size={14}/>New patient</button><button className="primary-button" onClick={() => setShowForm((value) => !value)}><ClipboardPlus size={14}/>New incident</button></div>
      </div>
      {error && <div className="form-error">{error}</div>}

      <div className="care-stat-grid ambulance-stats">
        <article><Siren size={20}/><div><strong>{active.length}</strong><span>Active incidents</span></div></article>
        <article><MapPin size={20}/><div><strong>{onScene}</strong><span>On scene</span></div></article>
        <article><Ambulance size={20}/><div><strong>{conveying}</strong><span>Conveying / handover</span></div></article>
        <article><HeartPulse size={20}/><div><strong>{active.filter((row) => ['C1', 'C2'].includes(row.priority)).length}</strong><span>High-priority cases</span></div></article>
      </div>

      {showForm && (
        <Panel title="Create ambulance incident">
          <form className="care-inline-form" onSubmit={createIncident}>
            <label><span>Patient</span><select value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })}><option value="">Unidentified / not linked</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patientName(patient)} · {patient.nhs_number || 'No NHS number'}</option>)}</select><button className="care-inline-patient-button" type="button" onClick={() => setShowPatientModal(true)}><UserPlus size={12}/>Create / link new patient</button></label>
            <label><span>Priority *</span><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option>C1</option><option>C2</option><option>C3</option><option>C4</option><option>PHEM</option></select></label>
            <label><span>Presenting complaint *</span><input value={form.presenting_complaint} onChange={(e) => setForm({ ...form, presenting_complaint: e.target.value })} required /></label>
            <label><span>Incident location *</span><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required /></label>
            <label><span>Unit / call sign</span><input value={form.unit_call_sign} onChange={(e) => setForm({ ...form, unit_call_sign: e.target.value })} placeholder="RW21" /></label>
            <div className="care-form-actions"><button className="care-secondary-button" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>Create incident</button></div>
          </form>
        </Panel>
      )}

      {view === 'dashboard' && (
        <div className="care-dashboard-shortcuts ambulance-shortcuts">
          <button onClick={() => navigate('/ambulance/incidents')}><Siren size={17}/><strong>Active Incidents</strong><span>Mobilisation and current cases</span></button>
          <button onClick={() => navigate('/ambulance/incidents')}><Activity size={17}/><strong>ePCR</strong><span>Observations and treatment timeline</span></button><button onClick={() => setShowPatientModal(true)}><UserPlus size={17}/><strong>New Patient</strong><span>Create and link a patient record</span></button>
          <button onClick={() => navigate('/ambulance/handover')}><Send size={17}/><strong>Handover</strong><span>Destination, pre-alert and transfer</span></button>
          <button onClick={() => navigate('/work-queue')}><Stethoscope size={17}/><strong>Clinical Work Queue</strong><span>Incomplete records and review tasks</span></button>
        </div>
      )}

      {view === 'handover' ? (
        <Panel title="Conveyance and handover" count={handoverRows.length}>
          {!handoverRows.length ? <div className="empty-state">No incidents are currently conveying or awaiting handover.</div> : <div className="ambulance-handover-list">{handoverRows.map((row) => {
            const patient = patientMap.get(row.patient_id)
            return <article key={row.id}><header><div><strong>{row.reference}</strong><span>{row.priority} · {patientName(patient)}</span></div><span className={`care-priority priority-${String(row.priority || '').toLowerCase()}`}>{row.status.replaceAll('_', ' ')}</span></header><div className="ambulance-handover-grid"><label><span>Destination</span><input value={row.destination || ''} onChange={(e) => setEpisodes((current) => current.map((item) => item.id === row.id ? { ...item, destination: e.target.value } : item))} onBlur={(e) => patchEpisode(row.id, { destination: e.target.value })} placeholder="Receiving hospital / department" /></label><label><span>ETA (minutes)</span><input type="number" min="0" value={row.eta_minutes ?? ''} onChange={(e) => setEpisodes((current) => current.map((item) => item.id === row.id ? { ...item, eta_minutes: e.target.value } : item))} onBlur={(e) => patchEpisode(row.id, { eta_minutes: e.target.value ? Number(e.target.value) : null })} /></label></div><p>{row.presenting_complaint || 'No presenting complaint recorded.'}</p><div className="care-row-actions">{row.patient_id && <button onClick={() => navigate(`/patients/${row.patient_id}/shared-care`)}>Shared Care handover</button>}<button className="primary-button" onClick={() => patchEpisode(row.id, { status: row.status === 'handover' ? 'closed' : 'handover' })}>{row.status === 'handover' ? 'Complete handover' : 'Mark at handover'}</button></div></article>
          })}</div>}
        </Panel>
      ) : (
        <div className="ambulance-incident-layout">
          <Panel title={patientFilter ? "Patient incident list" : "Incident list"} count={visibleActive.length}>
            {!visibleActive.length ? <div className="empty-state">{patientFilter ? 'No ambulance incidents are recorded for this patient.' : 'No active ambulance incidents are recorded.'}</div> : <div className="ambulance-incident-list">{visibleActive.map((row) => {
              const patient = patientMap.get(row.patient_id)
              return <button key={row.id} className={selectedId === row.id ? 'active' : ''} onClick={() => setSelectedId(row.id)}><div><strong>{row.reference}</strong><span>{row.priority} · {row.unit_call_sign || 'Unit not set'}</span></div><b>{row.presenting_complaint || 'Incident'}</b><small>{patientName(patient)} · {row.location || 'Location not recorded'}</small><span className="incident-status">{row.status.replaceAll('_', ' ')}</span></button>
            })}</div>}
          </Panel>

          <Panel title="Electronic Patient Care Record">
            {!selected ? <div className="empty-state">Select an active incident to open its ePCR.</div> : <div className="epcr-card">
              <div className="epcr-header"><div><span>{selected.reference}</span><h2>{selected.presenting_complaint || 'Ambulance incident'}</h2><p>{patientName(patientMap.get(selected.patient_id))} · {selected.location || 'Location not recorded'}</p></div><select value={selected.status} disabled={busy} onChange={(e) => patchEpisode(selected.id, { status: e.target.value })}>{STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              <div className="epcr-section"><header><strong>Observations</strong><span>{selected.observations?.length || 0}</span></header><div className="epcr-observation-table"><div><b>Time</b><b>HR</b><b>RR</b><b>SpO₂</b><b>BP</b><b>GCS</b></div>{(selected.observations || []).map((row) => <div key={row.id}><span>{new Date(row.recorded_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span><span>{row.hr || '—'}</span><span>{row.rr || '—'}</span><span>{row.spo2 || '—'}</span><span>{row.bp || '—'}</span><span>{row.gcs || '—'}</span></div>)}</div><form className="epcr-observation-form" onSubmit={recordObservation}>{Object.entries({hr:'HR',rr:'RR',spo2:'SpO₂',bp:'BP',gcs:'GCS'}).map(([key,label]) => <label key={key}><span>{label}</span><input value={observation[key]} onChange={(e) => setObservation({ ...observation, [key]: e.target.value })} /></label>)}<button className="primary-button" disabled={busy}>Record</button></form></div>
              <div className="epcr-section"><header><strong>Treatment / intervention timeline</strong><span>{selected.treatments?.length || 0}</span></header><div className="epcr-treatment-list">{(selected.treatments || []).map((row) => <div key={row.id}><time>{new Date(row.recorded_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</time><span>{row.text}</span></div>)}</div><form className="epcr-treatment-form" onSubmit={recordTreatment}><input value={treatment} onChange={(e) => setTreatment(e.target.value)} placeholder="Medication, procedure or clinical intervention" /><button className="primary-button" disabled={busy}>Add treatment</button></form></div>
              {selected.patient_id && <div className="care-row-actions"><button onClick={() => navigate(`/patients/${selected.patient_id}`)}>Open patient record</button><button onClick={() => navigate(`/patients/${selected.patient_id}/shared-care`)}>Shared Care</button></div>}
            </div>}
          </Panel>
        </div>
      )}
          {showPatientModal && <QuickPatientRegistrationModal mode="ambulance" organisationName={organisationName} onClose={() => setShowPatientModal(false)} onCreated={(patient) => { setPatients((current) => [patient, ...current.filter((row) => row.id !== patient.id)]); setForm((current) => ({ ...current, patient_id: patient.id })); setShowPatientModal(false); setShowForm(true) }} />}
    </div>
  )
}
