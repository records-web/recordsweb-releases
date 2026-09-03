import React, { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardList, Plus, Search, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import Panel from '../components/Panel'
import { createWorkflowTask, listPatients, listWorkflowTasks, updateWorkflowTask } from '../lib/dataService'

export default function WorkflowManagerPage() {
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState([])
  const [patients, setPatients] = useState([])
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    setError('')
    try {
      const [tasks, pts] = await Promise.all([listWorkflowTasks(), listPatients()])
      setRows(tasks); setPatients(pts)
    } catch (err) { setError(err.message || 'Unable to load workflow.') }
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    const patientId = params.get('patient')
    if (!patientId || patients.length === 0 || editing) return
    const p = patients.find((x) => x.id === patientId)
    if (!p) return
    setEditing({ patient_id: p.id, patient_name: `${p.last_name.toUpperCase()}, ${p.first_name} (${p.title || ''})` })
    const next = new URLSearchParams(params)
    next.delete('patient')
    setParams(next, { replace: true })
  }, [patients, params, editing, setParams])

  const filtered = useMemo(() => rows.filter((x) => JSON.stringify(x).toLowerCase().includes(filter.toLowerCase())), [rows, filter])

  return <div className="page-pad workspace-page">
    <div className="page-title-row"><div><h1>Workflow Manager</h1><p>Tasks, results and administrative work for Grove Way Health Centre.</p></div><button className="primary-button" onClick={() => setEditing({})}><Plus size={15}/> New task</button></div>
    {error && <div className="form-error">{error}</div>}
    <Panel title="Workflow"><div className="workspace-toolbar"><div className="search-field"><Search size={16}/><input placeholder="Search workflow" value={filter} onChange={(e)=>setFilter(e.target.value)}/></div><span>{filtered.filter((x)=>x.status !== 'Complete').length} open</span></div>
      <div className="workflow-table">
        <div className="workflow-row workflow-head"><span>Due</span><span>Task</span><span>Patient</span><span>Assigned to</span><span>Priority</span><span>Status</span></div>
        {filtered.length === 0 ? <div className="empty-state">No workflow tasks found.</div> : filtered.map((row) => <button className="workflow-row" key={row.id} onClick={() => setEditing(row)}><span>{formatDateTime(row.due_at)}</span><span><ClipboardList size={14}/><strong>{row.title}</strong><small>{row.category || 'General'}</small></span><span>{row.patient_name || '—'}</span><span>{row.assigned_to || '—'}</span><span>{row.priority}</span><span className={`status-pill ${String(row.status).toLowerCase().replace(/\s/g,'-')}`}>{row.status}</span></button>)}
      </div>
    </Panel>
    {editing && <TaskModal task={editing} patients={patients} onClose={() => setEditing(null)} onSave={async (payload) => { if (editing.id) await updateWorkflowTask(editing.id,payload); else await createWorkflowTask(payload); setEditing(null); await load() }} />}
  </div>
}

function TaskModal({ task, patients, onClose, onSave }) {
  const [form,setForm] = useState({
    title:task.title||'', patient_id:task.patient_id||'', patient_name:task.patient_name||'', assigned_to:task.assigned_to||'',
    due_at:toLocalInput(task.due_at || new Date(Date.now()+3600000).toISOString()), priority:task.priority||'Normal', status:task.status||'Open', category:task.category||'General',
  })
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  function setPatient(id) { const p=patients.find((x)=>x.id===id); setForm({...form,patient_id:id,patient_name:p?`${p.last_name.toUpperCase()}, ${p.first_name} (${p.title||''})`:''}) }
  async function save(){setSaving(true);setError('');try{await onSave({...form,due_at:new Date(form.due_at).toISOString()})}catch(err){setError(err.message||'Unable to save workflow task.');setSaving(false)}}
  return <div className="modal-backdrop"><div className="records-modal"><header><div><strong>{task.id?'Edit workflow task':'New workflow task'}</strong><span>Workflow Manager</span></div><button onClick={onClose}><X size={18}/></button></header><div className="records-form-grid"><label>Task<input value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})}/></label><label>Patient<select value={form.patient_id} onChange={(e)=>setPatient(e.target.value)}><option value="">No patient</option>{patients.map((p)=><option key={p.id} value={p.id}>{p.last_name.toUpperCase()}, {p.first_name}</option>)}</select></label><label>Assigned to<input value={form.assigned_to} onChange={(e)=>setForm({...form,assigned_to:e.target.value})}/></label><label>Due<input type="datetime-local" value={form.due_at} onChange={(e)=>setForm({...form,due_at:e.target.value})}/></label><label>Category<select value={form.category} onChange={(e)=>setForm({...form,category:e.target.value})}><option>General</option><option>Results</option><option>Documents</option><option>Medication</option><option>Referrals</option></select></label><label>Priority<select value={form.priority} onChange={(e)=>setForm({...form,priority:e.target.value})}><option>Low</option><option>Normal</option><option>High</option></select></label><label>Status<select value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})}><option>Open</option><option>In progress</option><option>Complete</option></select></label></div>{error&&<div className="form-error modal-error">{error}</div>}<footer><button className="secondary-button" onClick={onClose}>Cancel</button>{task.id && form.status!=='Complete' && <button className="secondary-button" onClick={()=>setForm({...form,status:'Complete'})}><CheckCircle2 size={14}/> Mark complete</button>}<button className="primary-button" disabled={saving||!form.title.trim()} onClick={save}>{saving?'Saving…':'Save task'}</button></footer></div></div>
}

function toLocalInput(value){const d=new Date(value);const pad=(n)=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`}
function formatDateTime(value){return value?new Date(value).toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'}):'—'}
