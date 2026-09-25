import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Clock3, ExternalLink, FileText, Pencil, Plus, Radio, Save, Trash2, UserRound, Car, Gavel, TriangleAlert } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  addPoliceRecordUpdate,
  deletePoliceFpn,
  deletePoliceIncident,
  deletePolicePerson,
  deletePoliceRecord,
  deletePoliceVehicle,
  getPoliceFpn,
  getPoliceIncident,
  getPolicePerson,
  getPoliceRecord,
  getPoliceVehicle,
  listPoliceIncidents,
  listPolicePersons,
  listPoliceRecordUpdates,
  listPoliceVehicles,
  updatePoliceFpn,
  updatePoliceIncident,
  updatePolicePerson,
  updatePoliceRecord,
  updatePoliceVehicle,
} from '../lib/policingService'

const RECORD_LABELS = {
  crime_report: 'Crime Report', intelligence: 'Intelligence', statement: 'Statement', evidence: 'Evidence', arrest: 'Arrest', warrant: 'Warrant', seizure: 'Seizure', custody: 'Custody', bolo: 'BOLO / Wanted', briefing: 'Briefing', dispatch: 'Dispatch',
}

const STATUS_OPTIONS = ['open','active','pending','dispatched','assigned','on_scene','transporting','resolved','closed','cancelled','issued','paid','withdrawn','stolen','seized','wanted','inactive']

function formatDateTime(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}
function inputDateTime(value) {
  if (!value) return ''
  const d = new Date(value); if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function personName(person) { return person ? `${person.last_name || ''}, ${person.first_name || ''}`.replace(/^,\s*/, '').trim() : '' }
function statusLabel(value) { return String(value || 'open').replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase()) }
function titleFor(entityType, record, recordType) {
  if (entityType === 'person') return personName(record) || 'Person record'
  if (entityType === 'vehicle') return record?.registration || 'Vehicle record'
  if (entityType === 'incident') return record?.title || 'Incident'
  if (entityType === 'fpn') return record?.offence || 'Fixed Penalty Notice'
  return record?.title || RECORD_LABELS[recordType] || 'Policing record'
}
function entityMeta(entityType, recordType) {
  if (entityType === 'person') return { label: 'Person record', section: 'PEOPLE', icon: UserRound, kind: 'person', back: '/policing/people' }
  if (entityType === 'vehicle') return { label: 'Vehicle record', section: 'VEHICLES', icon: Car, kind: 'vehicle', back: '/policing/vehicles' }
  if (entityType === 'incident') return { label: 'Incident', section: 'INCIDENTS', icon: Radio, kind: 'incident', back: '/policing/incidents' }
  if (entityType === 'fpn') return { label: 'Fixed Penalty Notice', section: 'ENFORCEMENT', icon: Gavel, kind: 'fpn', back: '/policing/fpns' }
  return { label: RECORD_LABELS[recordType] || 'Policing record', section: recordType === 'dispatch' ? 'DISPATCH' : 'RECORDS', icon: FileText, kind: 'police_record', back: `/policing/records/${recordType}` }
}

function Detail({ label, children, wide = false }) {
  return <div className={`police-detail-field${wide ? ' wide' : ''}`}><span>{label}</span><strong>{children || 'Not recorded'}</strong></div>
}
function LinkedRecord({ to, children }) {
  if (!children) return 'Not linked'
  return <Link className="police-linked-record" to={to} target="_blank" rel="noreferrer">{children}<ExternalLink size={12}/></Link>
}

export default function PolicingRecordDetailPage({ entityType = 'record' }) {
  const { recordId, recordType } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const meta = useMemo(() => entityMeta(entityType, recordType), [entityType, recordType])
  const Icon = meta.icon
  const [record, setRecord] = useState(null)
  const [updates, setUpdates] = useState([])
  const [persons, setPersons] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [incidents, setIncidents] = useState([])
  const [edit, setEdit] = useState(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [updateForm, setUpdateForm] = useState({ update_type: entityType === 'record' && recordType === 'dispatch' ? 'dispatch' : 'note', status: '', unit_callsign: '', message: '' })

  async function fetchRecord() {
    if (entityType === 'person') return getPolicePerson(recordId)
    if (entityType === 'vehicle') return getPoliceVehicle(recordId)
    if (entityType === 'incident') return getPoliceIncident(recordId)
    if (entityType === 'fpn') return getPoliceFpn(recordId)
    return getPoliceRecord(recordId, recordType)
  }

  async function load() {
    setError('')
    try {
      const [row, timeline, p, v, i] = await Promise.all([
        fetchRecord(),
        listPoliceRecordUpdates(meta.kind, recordId),
        listPolicePersons(''),
        listPoliceVehicles(''),
        listPoliceIncidents(''),
      ])
      if (!row) throw new Error('This policing record could not be found or you no longer have access to it.')
      setRecord(row); setEdit(toEditState(row)); setUpdates(timeline); setPersons(p); setVehicles(v); setIncidents(i)
    } catch (e) { setError(e?.message || 'Unable to load policing record.') }
  }

  useEffect(() => { void load() }, [entityType, recordType, recordId])

  function toEditState(row) {
    const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}
    if (entityType === 'person') return { first_name: row.first_name || '', last_name: row.last_name || '', dob: row.dob || '', phone: row.phone || '', address: row.address || '', markers: Array.isArray(row.markers) ? row.markers.join(', ') : '', notes: row.notes || '' }
    if (entityType === 'vehicle') return { registration: row.registration || '', make: row.make || '', model: row.model || '', colour: row.colour || '', status: row.status || 'active', owner_person_id: row.owner_person_id || '', notes: row.notes || '' }
    if (entityType === 'incident') return { title: row.title || '', incident_type: row.incident_type || 'general', priority: row.priority || 'standard', status: row.status || 'open', location: row.location || '', occurred_at: inputDateTime(row.occurred_at), officer_name: row.officer_name || '', person_id: row.person_id || '', vehicle_id: row.vehicle_id || '', summary: row.summary || '' }
    if (entityType === 'fpn') return { offence: row.offence || '', status: row.status || 'issued', location: row.location || '', issued_at: inputDateTime(row.issued_at), penalty_amount: row.penalty_amount ?? 0, points: row.points ?? 0, officer_name: row.officer_name || '', person_id: row.person_id || '', vehicle_id: row.vehicle_id || '', notes: row.notes || '' }
    return {
      title: row.title || '', status: row.status || 'open', occurred_at: inputDateTime(row.occurred_at), details: row.details || '', person_id: row.person_id || '', vehicle_id: row.vehicle_id || '', incident_id: row.incident_id || '',
      call_type: metadata.call_type || '', grade: metadata.grade || '', caller: metadata.caller || '', caller_phone: metadata.caller_phone || '', dispatch_location: metadata.location || '', assigned_units: Array.isArray(metadata.assigned_units) ? metadata.assigned_units.join(', ') : (metadata.assigned_units || ''), radio_channel: metadata.radio_channel || '', outcome: metadata.outcome || '',
    }
  }

  async function saveEdit(e) {
    e.preventDefault(); if (!edit) return
    setBusy(true); setError('')
    try {
      if (entityType === 'person') await updatePolicePerson(recordId, { ...edit, markers: String(edit.markers || '').split(',').map((x) => x.trim()).filter(Boolean) })
      else if (entityType === 'vehicle') await updatePoliceVehicle(recordId, { ...edit, registration: edit.registration.toUpperCase(), owner_person_id: edit.owner_person_id || null })
      else if (entityType === 'incident') await updatePoliceIncident(recordId, { ...edit, person_id: edit.person_id || null, vehicle_id: edit.vehicle_id || null, occurred_at: edit.occurred_at ? new Date(edit.occurred_at).toISOString() : record.occurred_at })
      else if (entityType === 'fpn') await updatePoliceFpn(recordId, { ...edit, person_id: edit.person_id || null, vehicle_id: edit.vehicle_id || null, issued_at: edit.issued_at ? new Date(edit.issued_at).toISOString() : record.issued_at, penalty_amount: Number(edit.penalty_amount || 0), points: Number(edit.points || 0) })
      else {
        const existingMetadata = record?.metadata && typeof record.metadata === 'object' ? record.metadata : {}
        const metadata = recordType === 'dispatch' ? { ...existingMetadata, call_type: edit.call_type, grade: edit.grade, caller: edit.caller, caller_phone: edit.caller_phone, location: edit.dispatch_location, assigned_units: String(edit.assigned_units || '').split(',').map((x) => x.trim()).filter(Boolean), radio_channel: edit.radio_channel, outcome: edit.outcome } : existingMetadata
        await updatePoliceRecord(recordId, { title: edit.title, status: edit.status, details: edit.details, person_id: edit.person_id || null, vehicle_id: edit.vehicle_id || null, incident_id: edit.incident_id || null, occurred_at: edit.occurred_at ? new Date(edit.occurred_at).toISOString() : record.occurred_at, metadata })
      }
      setEditing(false); await load()
    } catch (e2) { setError(e2?.message || 'Unable to save changes.') } finally { setBusy(false) }
  }

  async function addUpdate(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const displayName = session?.profile?.display_name || [session?.profile?.first_name, session?.profile?.last_name].filter(Boolean).join(' ') || session?.profile?.username || 'RecordsWeb staff'
      await addPoliceRecordUpdate({ recordKind: meta.kind, recordId, recordType: entityType === 'record' ? recordType : null, updateType: updateForm.update_type, status: updateForm.status || null, unitCallsign: updateForm.unit_callsign, message: updateForm.message, createdByName: displayName })
      if (updateForm.status && entityType !== 'person') {
        if (entityType === 'vehicle') await updatePoliceVehicle(recordId, { status: updateForm.status })
        else if (entityType === 'incident') await updatePoliceIncident(recordId, { status: updateForm.status })
        else if (entityType === 'fpn') await updatePoliceFpn(recordId, { status: updateForm.status })
        else await updatePoliceRecord(recordId, { status: updateForm.status })
      }
      setUpdateForm({ update_type: entityType === 'record' && recordType === 'dispatch' ? 'dispatch' : 'note', status: '', unit_callsign: '', message: '' }); await load()
    } catch (e2) { setError(e2?.message || 'Unable to add update.') } finally { setBusy(false) }
  }

  async function removeRecord() {
    if (!record) return
    const first = window.confirm(`Delete ${record.reference || meta.label}? This cannot be undone.`)
    if (!first) return
    const second = window.confirm('This will permanently remove the policing record. Continue?')
    if (!second) return
    setBusy(true); setError('')
    try {
      if (entityType === 'person') await deletePolicePerson(recordId)
      else if (entityType === 'vehicle') await deletePoliceVehicle(recordId)
      else if (entityType === 'incident') await deletePoliceIncident(recordId)
      else if (entityType === 'fpn') await deletePoliceFpn(recordId)
      else await deletePoliceRecord(recordId)
      navigate(meta.back, { replace: true })
    } catch (e) { setError(e?.message || 'Unable to delete record.'); setBusy(false) }
  }

  if (error && !record) return <div className="policing-page page-pad compact-pad"><div className="form-error">{error}</div><button onClick={() => navigate(meta.back)}><ArrowLeft size={14}/> Back</button></div>
  if (!record || !edit) return <div className="policing-page page-pad compact-pad"><div className="empty-state">Loading policing record…</div></div>

  const dispatch = entityType === 'record' && recordType === 'dispatch'
  const metadata = record.metadata && typeof record.metadata === 'object' ? record.metadata : {}
  const currentStatus = entityType === 'person' ? 'record' : (record.status || 'open')

  return <div className={`policing-page page-pad compact-pad police-record-detail${dispatch ? ' police-dispatch-detail' : ''}`}>
    <div className="police-record-toolbar">
      <button onClick={() => navigate(meta.back)}><ArrowLeft size={14}/>Back</button>
      <div className="police-record-toolbar-actions">
        <button onClick={() => setEditing((v) => !v)}><Pencil size={14}/>{editing ? 'Cancel editing' : 'Edit record'}</button>
        <button className="police-danger-button" onClick={removeRecord} disabled={busy}><Trash2 size={14}/>Delete</button>
      </div>
    </div>

    <header className="police-record-banner">
      <div className="police-record-banner-icon"><Icon size={26}/></div>
      <div className="police-record-banner-main"><span>POLICING · {meta.section}</span><h1>{titleFor(entityType, record, recordType)}</h1><p>{record.reference || 'No reference'} · Last updated {formatDateTime(record.updated_at)}</p></div>
      <div className={`police-status-badge status-${String(currentStatus).replaceAll('_','-')}`}>{statusLabel(currentStatus)}</div>
    </header>

    {error && <div className="form-error">{error}</div>}

    {dispatch && <section className="police-cad-strip">
      <div><span>CALL TYPE</span><strong>{metadata.call_type || record.title || 'Not specified'}</strong></div>
      <div><span>GRADE</span><strong>{metadata.grade || 'Standard'}</strong></div>
      <div><span>LOCATION</span><strong>{metadata.location || 'Not recorded'}</strong></div>
      <div><span>UNITS</span><strong>{Array.isArray(metadata.assigned_units) && metadata.assigned_units.length ? metadata.assigned_units.join(', ') : 'Unassigned'}</strong></div>
      <div><span>CHANNEL</span><strong>{metadata.radio_channel || 'Not recorded'}</strong></div>
    </section>}

    {editing ? <EditForm entityType={entityType} recordType={recordType} edit={edit} setEdit={setEdit} persons={persons} vehicles={vehicles} incidents={incidents} onSubmit={saveEdit} busy={busy}/> : <RecordDetails entityType={entityType} recordType={recordType} record={record}/>} 

    <div className="police-detail-columns">
      <section className="police-detail-panel police-update-panel">
        <div className="police-panel-heading"><div><span>{dispatch ? 'CAD EVENT LOG' : 'RECORD UPDATES'}</span><h2>{dispatch ? 'Dispatch timeline' : 'Updates & activity'}</h2></div><Clock3 size={18}/></div>
        <div className="police-timeline">
          {updates.map((item) => <div className="police-timeline-item" key={item.id}>
            <span className="police-timeline-dot"/>
            <div className="police-timeline-copy"><div className="police-timeline-head"><strong>{statusLabel(item.update_type || 'Update')}{item.status ? ` · ${statusLabel(item.status)}` : ''}</strong><time>{formatDateTime(item.created_at)}</time></div><p>{item.message}</p><small>{item.unit_callsign ? `${item.unit_callsign} · ` : ''}{item.created_by_name || 'RecordsWeb staff'}</small></div>
          </div>)}
          <div className="police-timeline-item created"><span className="police-timeline-dot"/><div className="police-timeline-copy"><div className="police-timeline-head"><strong>Record created</strong><time>{formatDateTime(record.created_at)}</time></div><p>{record.reference || meta.label} was created in RecordsWeb.</p></div></div>
        </div>
      </section>

      <section className="police-detail-panel police-add-update">
        <div className="police-panel-heading"><div><span>ADD UPDATE</span><h2>{dispatch ? 'Add CAD event' : 'Add record update'}</h2></div><Plus size={18}/></div>
        <form onSubmit={addUpdate} className="police-update-form">
          <label><span>Update type</span><select value={updateForm.update_type} onChange={(e) => setUpdateForm({ ...updateForm, update_type: e.target.value })}>{dispatch && <option value="dispatch">Dispatch update</option>}<option value="note">Operational note</option><option value="unit">Unit update</option><option value="status">Status change</option><option value="location">Location update</option><option value="arrival">On scene</option><option value="clear">Cleared</option></select></label>
          {entityType !== 'person' && <label><span>New status <small>optional</small></span><select value={updateForm.status} onChange={(e) => setUpdateForm({ ...updateForm, status: e.target.value })}><option value="">Do not change</option>{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label>}
          <label><span>Unit / callsign <small>optional</small></span><input value={updateForm.unit_callsign} onChange={(e) => setUpdateForm({ ...updateForm, unit_callsign: e.target.value })} placeholder="e.g. 21-01"/></label>
          <label><span>{dispatch ? 'CAD log entry' : 'Update'}</span><textarea required rows={5} value={updateForm.message} onChange={(e) => setUpdateForm({ ...updateForm, message: e.target.value })} placeholder={dispatch ? 'Unit assigned, caller update, scene update, disposal…' : 'Record an operational update…'}/></label>
          <button className="primary-button" disabled={busy}><Save size={14}/>{busy ? 'Saving…' : 'Add update'}</button>
        </form>
      </section>
    </div>
  </div>
}

function RecordDetails({ entityType, recordType, record }) {
  const metadata = record.metadata && typeof record.metadata === 'object' ? record.metadata : {}
  if (entityType === 'person') return <section className="police-detail-panel"><div className="police-panel-heading"><div><span>PERSON DETAILS</span><h2>Record information</h2></div></div><div className="police-detail-grid"><Detail label="Reference">{record.reference}</Detail><Detail label="Date of birth">{record.dob}</Detail><Detail label="Telephone">{record.phone}</Detail><Detail label="Address" wide>{record.address}</Detail><Detail label="Markers" wide>{Array.isArray(record.markers) && record.markers.length ? <div className="policing-tags">{record.markers.map((x) => <b key={x}>{x}</b>)}</div> : 'None'}</Detail><Detail label="Notes" wide>{record.notes}</Detail><Detail label="Created">{formatDateTime(record.created_at)}</Detail><Detail label="Updated">{formatDateTime(record.updated_at)}</Detail></div></section>
  if (entityType === 'vehicle') return <section className="police-detail-panel"><div className="police-panel-heading"><div><span>VEHICLE DETAILS</span><h2>Vehicle record</h2></div></div><div className="police-detail-grid"><Detail label="Reference">{record.reference}</Detail><Detail label="Registration">{record.registration}</Detail><Detail label="Make">{record.make}</Detail><Detail label="Model">{record.model}</Detail><Detail label="Colour">{record.colour}</Detail><Detail label="Status">{statusLabel(record.status)}</Detail><Detail label="Linked owner" wide>{record.owner ? <LinkedRecord to={`/policing/people/${record.owner.id}`}>{personName(record.owner)} · {record.owner.reference}</LinkedRecord> : 'Not linked'}</Detail><Detail label="Notes" wide>{record.notes}</Detail></div></section>
  if (entityType === 'incident') return <section className="police-detail-panel"><div className="police-panel-heading"><div><span>INCIDENT DETAILS</span><h2>Incident information</h2></div></div><div className="police-detail-grid"><Detail label="Reference">{record.reference}</Detail><Detail label="Incident type">{statusLabel(record.incident_type)}</Detail><Detail label="Priority">{statusLabel(record.priority)}</Detail><Detail label="Status">{statusLabel(record.status)}</Detail><Detail label="Occurred">{formatDateTime(record.occurred_at)}</Detail><Detail label="Officer / unit">{record.officer_name}</Detail><Detail label="Location" wide>{record.location}</Detail><Detail label="Linked person">{record.person ? <LinkedRecord to={`/policing/people/${record.person.id}`}>{personName(record.person)} · {record.person.reference}</LinkedRecord> : 'Not linked'}</Detail><Detail label="Linked vehicle">{record.vehicle ? <LinkedRecord to={`/policing/vehicles/${record.vehicle.id}`}>{record.vehicle.registration} · {record.vehicle.reference}</LinkedRecord> : 'Not linked'}</Detail><Detail label="Summary" wide>{record.summary}</Detail></div></section>
  if (entityType === 'fpn') return <section className="police-detail-panel"><div className="police-panel-heading"><div><span>FPN DETAILS</span><h2>Fixed Penalty Notice</h2></div></div><div className="police-detail-grid"><Detail label="Reference">{record.reference}</Detail><Detail label="Status">{statusLabel(record.status)}</Detail><Detail label="Issued">{formatDateTime(record.issued_at)}</Detail><Detail label="Officer">{record.officer_name}</Detail><Detail label="Penalty">£{Number(record.penalty_amount || 0).toFixed(2)}</Detail><Detail label="Points">{String(record.points ?? 0)}</Detail><Detail label="Offence" wide>{record.offence}</Detail><Detail label="Location" wide>{record.location}</Detail><Detail label="Person">{record.person ? <LinkedRecord to={`/policing/people/${record.person.id}`}>{personName(record.person)} · {record.person.reference}</LinkedRecord> : 'Not linked'}</Detail><Detail label="Vehicle">{record.vehicle ? <LinkedRecord to={`/policing/vehicles/${record.vehicle.id}`}>{record.vehicle.registration} · {record.vehicle.reference}</LinkedRecord> : 'Not linked'}</Detail><Detail label="Notes" wide>{record.notes}</Detail></div></section>
  const dispatch = recordType === 'dispatch'
  return <section className="police-detail-panel"><div className="police-panel-heading"><div><span>{dispatch ? 'CALL DETAILS' : 'RECORD DETAILS'}</span><h2>{RECORD_LABELS[recordType] || 'Policing record'}</h2></div></div><div className="police-detail-grid"><Detail label="Reference">{record.reference}</Detail><Detail label="Status">{statusLabel(record.status)}</Detail><Detail label="Date / time">{formatDateTime(record.occurred_at)}</Detail><Detail label="Record type">{RECORD_LABELS[record.record_type] || statusLabel(record.record_type)}</Detail>{dispatch && <><Detail label="Call type">{metadata.call_type}</Detail><Detail label="Grade">{metadata.grade}</Detail><Detail label="Caller">{metadata.caller}</Detail><Detail label="Caller contact">{metadata.caller_phone}</Detail><Detail label="Location" wide>{metadata.location}</Detail><Detail label="Assigned units" wide>{Array.isArray(metadata.assigned_units) ? metadata.assigned_units.join(', ') : metadata.assigned_units}</Detail><Detail label="Radio channel">{metadata.radio_channel}</Detail><Detail label="Outcome">{metadata.outcome}</Detail></>}<Detail label="Linked person">{record.person ? <LinkedRecord to={`/policing/people/${record.person.id}`}>{personName(record.person)} · {record.person.reference}</LinkedRecord> : 'Not linked'}</Detail><Detail label="Linked vehicle">{record.vehicle ? <LinkedRecord to={`/policing/vehicles/${record.vehicle.id}`}>{record.vehicle.registration} · {record.vehicle.reference}</LinkedRecord> : 'Not linked'}</Detail><Detail label="Linked incident">{record.incident ? <LinkedRecord to={`/policing/incidents/${record.incident.id}`}>{record.incident.reference} · {record.incident.title}</LinkedRecord> : 'Not linked'}</Detail><Detail label="Details" wide>{record.details}</Detail></div></section>
}

function EditForm({ entityType, recordType, edit, setEdit, persons, vehicles, incidents, onSubmit, busy }) {
  const set = (key, value) => setEdit({ ...edit, [key]: value })
  const dispatch = entityType === 'record' && recordType === 'dispatch'
  return <form className="policing-form police-detail-edit" onSubmit={onSubmit}><div className="police-panel-heading"><div><span>EDIT RECORD</span><h2>Amend details</h2></div></div><div className="policing-form-grid">
    {entityType === 'person' && <><label><span>First name</span><input required value={edit.first_name} onChange={(e) => set('first_name', e.target.value)}/></label><label><span>Last name</span><input required value={edit.last_name} onChange={(e) => set('last_name', e.target.value)}/></label><label><span>Date of birth</span><input type="date" value={edit.dob} onChange={(e) => set('dob', e.target.value)}/></label><label><span>Telephone</span><input value={edit.phone} onChange={(e) => set('phone', e.target.value)}/></label><label className="wide"><span>Address</span><input value={edit.address} onChange={(e) => set('address', e.target.value)}/></label><label className="wide"><span>Markers</span><input value={edit.markers} onChange={(e) => set('markers', e.target.value)}/></label><label className="wide"><span>Notes</span><textarea rows={4} value={edit.notes} onChange={(e) => set('notes', e.target.value)}/></label></>}
    {entityType === 'vehicle' && <><label><span>Registration</span><input required value={edit.registration} onChange={(e) => set('registration', e.target.value)}/></label><label><span>Status</span><select value={edit.status} onChange={(e) => set('status', e.target.value)}>{['active','stolen','seized','wanted','inactive'].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label><label><span>Make</span><input value={edit.make} onChange={(e) => set('make', e.target.value)}/></label><label><span>Model</span><input value={edit.model} onChange={(e) => set('model', e.target.value)}/></label><label><span>Colour</span><input value={edit.colour} onChange={(e) => set('colour', e.target.value)}/></label><label><span>Owner</span><select value={edit.owner_person_id} onChange={(e) => set('owner_person_id', e.target.value)}><option value="">Not linked</option>{persons.map((p) => <option key={p.id} value={p.id}>{personName(p)} · {p.reference}</option>)}</select></label><label className="wide"><span>Notes</span><textarea rows={4} value={edit.notes} onChange={(e) => set('notes', e.target.value)}/></label></>}
    {entityType === 'incident' && <><label className="wide"><span>Title</span><input required value={edit.title} onChange={(e) => set('title', e.target.value)}/></label><label><span>Type</span><input value={edit.incident_type} onChange={(e) => set('incident_type', e.target.value)}/></label><label><span>Priority</span><select value={edit.priority} onChange={(e) => set('priority', e.target.value)}><option value="standard">Standard</option><option value="priority">Priority</option><option value="immediate">Immediate</option></select></label><label><span>Status</span><select value={edit.status} onChange={(e) => set('status', e.target.value)}>{STATUS_OPTIONS.slice(0,10).map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label><label><span>Date / time</span><input type="datetime-local" value={edit.occurred_at} onChange={(e) => set('occurred_at', e.target.value)}/></label><label><span>Officer / unit</span><input value={edit.officer_name} onChange={(e) => set('officer_name', e.target.value)}/></label><label className="wide"><span>Location</span><input value={edit.location} onChange={(e) => set('location', e.target.value)}/></label><RelationSelect label="Person" value={edit.person_id} setValue={(v) => set('person_id', v)} rows={persons} format={(p) => `${personName(p)} · ${p.reference}`}/><RelationSelect label="Vehicle" value={edit.vehicle_id} setValue={(v) => set('vehicle_id', v)} rows={vehicles} format={(v) => `${v.registration} · ${v.reference}`}/><label className="wide"><span>Summary</span><textarea rows={5} required value={edit.summary} onChange={(e) => set('summary', e.target.value)}/></label></>}
    {entityType === 'fpn' && <><label className="wide"><span>Offence</span><input required value={edit.offence} onChange={(e) => set('offence', e.target.value)}/></label><label><span>Status</span><select value={edit.status} onChange={(e) => set('status', e.target.value)}>{['issued','paid','withdrawn','cancelled'].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label><label><span>Issued</span><input type="datetime-local" value={edit.issued_at} onChange={(e) => set('issued_at', e.target.value)}/></label><label><span>Penalty (£)</span><input type="number" min="0" step="0.01" value={edit.penalty_amount} onChange={(e) => set('penalty_amount', e.target.value)}/></label><label><span>Points</span><input type="number" min="0" max="12" value={edit.points} onChange={(e) => set('points', e.target.value)}/></label><label><span>Officer</span><input value={edit.officer_name} onChange={(e) => set('officer_name', e.target.value)}/></label><label className="wide"><span>Location</span><input value={edit.location} onChange={(e) => set('location', e.target.value)}/></label><RelationSelect label="Person" value={edit.person_id} setValue={(v) => set('person_id', v)} rows={persons} format={(p) => `${personName(p)} · ${p.reference}`}/><RelationSelect label="Vehicle" value={edit.vehicle_id} setValue={(v) => set('vehicle_id', v)} rows={vehicles} format={(v) => `${v.registration} · ${v.reference}`}/><label className="wide"><span>Notes</span><textarea rows={4} value={edit.notes} onChange={(e) => set('notes', e.target.value)}/></label></>}
    {entityType === 'record' && <><label className="wide"><span>Title / subject</span><input required value={edit.title} onChange={(e) => set('title', e.target.value)}/></label><label><span>Status</span><select value={edit.status} onChange={(e) => set('status', e.target.value)}>{STATUS_OPTIONS.slice(0,10).map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label><label><span>Date / time</span><input type="datetime-local" value={edit.occurred_at} onChange={(e) => set('occurred_at', e.target.value)}/></label>{dispatch && <><label><span>Call type</span><input value={edit.call_type} onChange={(e) => set('call_type', e.target.value)} placeholder="RTC, concern for safety…"/></label><label><span>Grade</span><select value={edit.grade} onChange={(e) => set('grade', e.target.value)}><option value="">Standard</option><option>Immediate</option><option>Priority</option><option>Scheduled</option></select></label><label><span>Caller</span><input value={edit.caller} onChange={(e) => set('caller', e.target.value)}/></label><label><span>Caller contact</span><input value={edit.caller_phone} onChange={(e) => set('caller_phone', e.target.value)}/></label><label className="wide"><span>Dispatch location</span><input value={edit.dispatch_location} onChange={(e) => set('dispatch_location', e.target.value)}/></label><label className="wide"><span>Assigned units <small>comma separated</small></span><input value={edit.assigned_units} onChange={(e) => set('assigned_units', e.target.value)}/></label><label><span>Radio channel</span><input value={edit.radio_channel} onChange={(e) => set('radio_channel', e.target.value)}/></label><label><span>Outcome / disposal</span><input value={edit.outcome} onChange={(e) => set('outcome', e.target.value)}/></label></>}<RelationSelect label="Person" value={edit.person_id} setValue={(v) => set('person_id', v)} rows={persons} format={(p) => `${personName(p)} · ${p.reference}`}/><RelationSelect label="Vehicle" value={edit.vehicle_id} setValue={(v) => set('vehicle_id', v)} rows={vehicles} format={(v) => `${v.registration} · ${v.reference}`}/><label className="wide"><span>Incident</span><select value={edit.incident_id} onChange={(e) => set('incident_id', e.target.value)}><option value="">Not linked</option>{incidents.map((i) => <option key={i.id} value={i.id}>{i.reference} · {i.title}</option>)}</select></label><label className="wide"><span>Details</span><textarea required rows={6} value={edit.details} onChange={(e) => set('details', e.target.value)}/></label></>}
  </div><div className="policing-form-actions"><button type="submit" className="primary-button" disabled={busy}><Save size={14}/>{busy ? 'Saving…' : 'Save changes'}</button></div></form>
}

function RelationSelect({ label, value, setValue, rows, format }) {
  return <label><span>{label}</span><select value={value} onChange={(e) => setValue(e.target.value)}><option value="">Not linked</option>{rows.map((row) => <option key={row.id} value={row.id}>{format(row)}</option>)}</select></label>
}
