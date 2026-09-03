import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Check, ChevronDown, Clock3, FileText, Pencil, Plus, Search, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Panel from '../components/Panel'
import ModalPortal from '../components/ModalPortal'
import { createAppointment, listAppointments, listPatients, updateAppointment } from '../lib/dataService'
import { listMessageStaff } from '../lib/staffMessaging'

const SLOT_STATES = {
  Booked: { code: '', label: 'Booked' },
  Arrived: { code: 'A', label: 'Patient in reception' },
  'Sent in': { code: 'S', label: 'Patient in consulting room' },
  Left: { code: 'L', label: 'Consultation concluded / patient left' },
  'Walked out': { code: 'W', label: 'Patient walked out before being seen' },
  Cancelled: { code: '', label: 'Cancelled' },
}

const APPOINTMENT_TYPE_GROUPS = [
  {
    label: 'Clinical / GP / ACP',
    values: ['Urgent F2F', 'Routine F2F', 'Medication Review', 'Results', 'Mental Health', 'Long-Term Condition', 'Fit Note', 'Referral/Follow-up'],
  },
  {
    label: 'Nurse',
    values: ['Nurse - Chronic Disease Review', 'Nurse - Asthma Review', 'Nurse - COPD Review', 'Nurse - Diabetes Review', 'Nurse - Cervical Screening', 'Nurse - Wound Care', 'Nurse - Vaccination', 'Nurse - Blood Test', 'Nurse - B12 Injection'],
  },
  {
    label: 'HCA',
    values: ['HCA - Blood Test', 'HCA - Blood Pressure', 'HCA - ECG', 'HCA - NHS Health Check', 'HCA - New Patient Check', 'HCA - Weight Check', 'HCA - Urine Test', 'HCA - Phlebotomy', 'HCA - Observations'],
  },
]

function normaliseStatus(status) {
  if (status === 'In consultation') return 'Sent in'
  if (status === 'Completed') return 'Left'
  if (status === 'Did not attend') return 'Walked out'
  return SLOT_STATES[status] ? status : 'Booked'
}

function formatClinician(staffMember) {
  if (!staffMember) return ''
  const named = [staffMember.title, staffMember.first_name, staffMember.last_name].filter(Boolean).join(' ').trim()
  return named || staffMember.display_name || staffMember.username || 'Clinical User'
}

function titleCaseFallback(value) {
  const raw = String(value || '').trim()
  if (!raw) return '—'
  if (/[A-Z]/.test(raw.slice(1))) return raw
  return raw.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function displayClinician(value, staff) {
  const needle = String(value || '').trim().toLowerCase()
  if (!needle) return '—'
  const match = staff.find((member) => {
    const candidates = [
      formatClinician(member),
      member.display_name,
      member.username,
      [member.first_name, member.last_name].filter(Boolean).join(' '),
    ]
    return candidates.some((candidate) => String(candidate || '').trim().toLowerCase() === needle)
  })
  return match ? formatClinician(match) : titleCaseFallback(value)
}


function formatWaitDuration(startedAt, nowMs) {
  if (!startedAt) return '—'
  const started = new Date(startedAt).getTime()
  if (!Number.isFinite(started)) return '—'
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - started) / 1000))
  const hours = Math.floor(elapsedSeconds / 3600)
  const minutes = Math.floor((elapsedSeconds % 3600) / 60)
  const seconds = elapsedSeconds % 60
  const pad = (value) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

function waitUrgencyClass(startedAt, nowMs) {
  if (!startedAt) return ''
  const elapsedMinutes = (nowMs - new Date(startedAt).getTime()) / 60000
  if (elapsedMinutes >= 20) return 'wait-critical'
  if (elapsedMinutes >= 10) return 'wait-warning'
  return 'wait-normal'
}

function formatNhsNumber(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 10) return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6)}`
  return value || '—'
}

export default function AppointmentBookPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [date,setDate]=useState(params.get('date') || new Date().toISOString().slice(0,10))
  const [rows,setRows]=useState([])
  const [patients,setPatients]=useState([])
  const [staff,setStaff]=useState([])
  const [editing,setEditing]=useState(null)
  const [contextMenu,setContextMenu]=useState(null)
  const [error,setError]=useState('')
  const [nowMs,setNowMs]=useState(()=>Date.now())

  async function load(){
    setError('')
    try {
      const [a,p,s]=await Promise.all([listAppointments(date),listPatients(),listMessageStaff()])
      setRows(a);setPatients(p);setStaff(s)
    } catch (err) { setError(err.message || 'Unable to load appointments.') }
  }
  useEffect(()=>{load()},[date])
  useEffect(()=>{const timer=window.setInterval(()=>setNowMs(Date.now()),1000);return()=>window.clearInterval(timer)},[])

  useEffect(() => {
    const patientId = params.get('patient')
    if (!patientId || patients.length === 0 || editing) return
    const p = patients.find((x) => x.id === patientId)
    if (!p) return
    setEditing({ patient_id: p.id, patient_name: `${p.last_name.toUpperCase()}, ${p.first_name} (${p.title || ''})`, starts_at: `${date}T09:00` })
    const next = new URLSearchParams(params)
    next.delete('patient')
    setParams(next, { replace: true })
  }, [patients, params, editing, date, setParams])

  async function setSlotStatus(row, status) {
    try {
      const wait_started_at = status === 'Arrived' ? (row.wait_started_at || new Date().toISOString()) : null
      await updateAppointment(row.id, { status, wait_started_at })
      setContextMenu(null)
      await load()
    } catch (err) { setError(err.message || 'Unable to update appointment status.') }
  }

  return <div className="page-pad workspace-page">
    <div className="page-title-row"><div><h1>Appointment Book</h1><p>Clinic schedule for Grove Way Health Centre.</p></div><button className="primary-button" onClick={()=>setEditing({starts_at:`${date}T09:00`})}><Plus size={15}/> Book appointment</button></div>
    {error && <div className="form-error">{error}</div>}
    <Panel title="Appointment Book"><div className="appointment-toolbar"><label>Date<input type="date" value={date} onChange={(e)=>setDate(e.target.value)}/></label><span><CalendarDays size={15}/>{rows.length} appointments</span><div className="appointment-status-key"><span><b>A</b> Reception</span><span><b>S</b> Consulting room</span><span><b>L</b> Left</span><span><b>W</b> Walked out</span></div></div>
      <div className="appointment-book">
        <div className="appointment-row appointment-head"><span>State</span><span>Time</span><span>Patient</span><span>NHS No</span><span>Type</span><span>Clinician</span><span>Room</span><span>Wait</span><span>Status</span></div>
        {rows.length===0?<div className="empty-state">No appointments booked for this date.</div>:rows.map((row)=>{
          const status=normaliseStatus(row.status)
          const state=SLOT_STATES[status]
          return <button className="appointment-row" key={row.id} onClick={()=>setEditing({...row,status})} onContextMenu={(event)=>{event.preventDefault();setContextMenu({row:{...row,status},x:event.clientX,y:event.clientY})}}>
            <span className={`slot-state slot-state-${state.code.toLowerCase() || 'blank'}`}>{state.code}</span>
            <span><Clock3 size={13}/>{new Date(row.starts_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}<small>{row.duration_minutes} min</small></span>
            <span><strong>{row.patient_name||'Unknown patient'}</strong></span><span>{formatNhsNumber(row.patient_nhs_number || patients.find((patient)=>patient.id===row.patient_id)?.nhs_number)}</span><span>{row.appointment_type}</span><span>{displayClinician(row.clinician, staff)}</span><span>{row.room||'—'}</span><span className={`appointment-wait ${status==='Arrived'?waitUrgencyClass(row.wait_started_at,nowMs):''}`}>{status==='Arrived'?formatWaitDuration(row.wait_started_at,nowMs):'—'}</span><span className={`status-pill ${status.toLowerCase().replaceAll(' ', '-')}`}>{state.label}</span>
          </button>
        })}
      </div>
    </Panel>
    {editing && <AppointmentModal appointment={editing} patients={patients} staff={staff} onClose={()=>setEditing(null)} onSave={async(payload)=>{const previousStatus=normaliseStatus(editing.status||'Booked');const nextStatus=normaliseStatus(payload.status||'Booked');const wait_started_at=nextStatus==='Arrived'?(previousStatus==='Arrived'&&editing.wait_started_at?editing.wait_started_at:new Date().toISOString()):null;const nextPayload={...payload,wait_started_at};if(editing.id)await updateAppointment(editing.id,nextPayload);else await createAppointment(nextPayload);setEditing(null);await load()}}/>}
    {contextMenu && <AppointmentContextMenu data={contextMenu} onClose={()=>setContextMenu(null)} onMedicalRecord={()=>{const patientId=contextMenu.row.patient_id;setContextMenu(null);if(patientId)navigate(`/patients/${patientId}`)}} onEdit={()=>{setEditing(contextMenu.row);setContextMenu(null)}} onStatus={(status)=>setSlotStatus(contextMenu.row,status)}/>} 
  </div>
}

function AppointmentContextMenu({ data, onClose, onMedicalRecord, onEdit, onStatus }) {
  const ref=useRef(null)
  useEffect(()=>{const close=(e)=>{if(!ref.current?.contains(e.target))onClose()};window.addEventListener('mousedown',close);window.addEventListener('blur',onClose);return()=>{window.removeEventListener('mousedown',close);window.removeEventListener('blur',onClose)}},[onClose])
  const menuLeft = Math.max(8, Math.min(data.x, window.innerWidth - 305))
  const menuTop = Math.max(8, Math.min(data.y, window.innerHeight - 285))
  return <div ref={ref} className="appointment-context-menu" style={{left:menuLeft,top:menuTop}}>
    <button onClick={onMedicalRecord}><FileText size={14}/><span>View Medical Record</span></button>
    <button onClick={onEdit}><Pencil size={14}/><span>Edit appointment…</span></button>
    <div className="context-separator"/>
    <strong>Change slot status</strong>
    <button onClick={()=>onStatus('Arrived')}><b>A</b><span>Mark patient arrived</span></button>
    <button onClick={()=>onStatus('Sent in')}><b>S</b><span>Send patient in</span></button>
    <button onClick={()=>onStatus('Walked out')}><b>W</b><span>Patient walked out</span></button>
    <button onClick={()=>onStatus('Left')}><b>L</b><span>Consultation concluded / patient left</span></button>
    <button className="clear-slot-status" onClick={()=>onStatus('Booked')}><X size={14}/><span>Cancel slot status</span></button>
  </div>
}

function AppointmentModal({appointment,patients,staff,onClose,onSave}){
  const initialClinician = displayClinician(appointment.clinician, staff) === '—' ? '' : displayClinician(appointment.clinician, staff)
  const [form,setForm]=useState({patient_id:appointment.patient_id||'',patient_name:appointment.patient_name||'',starts_at:toLocalInput(appointment.starts_at||new Date().toISOString()),duration_minutes:appointment.duration_minutes||10,clinician:initialClinician,appointment_type:appointment.appointment_type||'Routine F2F',status:normaliseStatus(appointment.status||'Booked'),room:appointment.room||'',notes:appointment.notes||''})
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [nowMs,setNowMs]=useState(()=>Date.now())
  function patientChanged(id){const p=patients.find((x)=>x.id===id);setForm({...form,patient_id:id,patient_name:p?`${p.last_name.toUpperCase()}, ${p.first_name} (${p.title||''})`:''})}
  async function save(){setSaving(true);setError('');try{await onSave({...form,starts_at:new Date(form.starts_at).toISOString(),duration_minutes:Number(form.duration_minutes)||10})}catch(err){setError(err.message||'Unable to save appointment.');setSaving(false)}}
  return <ModalPortal onClose={onClose} ariaLabel={appointment.id ? 'Edit appointment' : 'Book appointment'}><div className="records-modal appointment-modal"><header><div><strong>{appointment.id?'Edit appointment':'Book appointment'}</strong><span>Grove Way Health Centre</span></div><button type="button" onClick={onClose}><X size={18}/></button></header><div className="records-form-grid"><label>Patient<select autoFocus value={form.patient_id} onChange={(e)=>patientChanged(e.target.value)}><option value="">Select patient</option>{patients.map((p)=><option key={p.id} value={p.id}>{p.last_name.toUpperCase()}, {p.first_name}</option>)}</select></label><label>Date and time<input type="datetime-local" value={form.starts_at} onChange={(e)=>setForm({...form,starts_at:e.target.value})}/></label><label>Duration (minutes)<input type="number" min="5" step="5" value={form.duration_minutes} onChange={(e)=>setForm({...form,duration_minutes:e.target.value})}/></label><label>Clinician<ClinicianPicker staff={staff} value={form.clinician} onChange={(clinician)=>setForm({...form,clinician})}/></label><label>Appointment type<select value={form.appointment_type} onChange={(e)=>setForm({...form,appointment_type:e.target.value})}>{APPOINTMENT_TYPE_GROUPS.map((group)=><optgroup key={group.label} label={group.label}>{group.values.map((value)=><option key={value} value={value}>{value}</option>)}</optgroup>)}</select></label><label>Room<input value={form.room} onChange={(e)=>setForm({...form,room:e.target.value})} placeholder="Allocate on the day if required"/></label><label>Status<select value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})}><option value="Booked">Booked</option><option value="Arrived">A — Patient in reception</option><option value="Sent in">S — Patient in consulting room</option><option value="Left">L — Consultation concluded / patient left</option><option value="Walked out">W — Walked out before being seen</option><option value="Cancelled">Cancelled</option></select></label><label className="span-two">Reason for appointment<textarea value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} placeholder="Reception can enter the reason for the appointment here."/></label></div>{error&&<div className="form-error modal-error">{error}</div>}<footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={saving||!form.patient_id||!form.clinician.trim()} onClick={save}>{saving?'Saving…':'Save appointment'}</button></footer></div></ModalPortal>
}

function ClinicianPicker({ staff, value, onChange }) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => { setQuery(value || '') }, [value])
  useEffect(() => {
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])

  const options = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return staff
      .map((member) => ({ member, name: formatClinician(member) }))
      .filter(({ member, name }) => !needle || `${name} ${member.role || ''} ${(member.roles || []).join(' ')} ${member.username || ''}`.toLowerCase().includes(needle))
      .slice(0, 40)
  }, [staff, query])

  function select(name) {
    onChange(name)
    setQuery(name)
    setOpen(false)
  }

  return <div className="clinician-picker" ref={ref}>
    <div className="clinician-picker-input"><Search size={13}/><input value={query} onFocus={()=>setOpen(true)} onChange={(event)=>{setQuery(event.target.value);onChange('');setOpen(true)}} placeholder="Search clinician by name or role"/><button type="button" onClick={()=>setOpen((current)=>!current)} title="Show clinicians"><ChevronDown size={13}/></button></div>
    {open && <div className="clinician-picker-menu">{options.length === 0 ? <div className="clinician-picker-empty">No clinicians match that search.</div> : options.map(({member,name})=><button type="button" key={member.id} className={value===name?'selected':''} onClick={()=>select(name)}><span><strong>{name}</strong><small>{member.role || 'Staff'}</small></span>{value===name&&<Check size={14}/>}</button>)}</div>}
  </div>
}

function toLocalInput(value){const d=new Date(value);const pad=(n)=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`}
