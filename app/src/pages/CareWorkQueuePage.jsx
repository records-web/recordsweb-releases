import React, { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock3, ListTodo, Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Panel from '../components/Panel'
import { useAuth } from '../contexts/AuthContext'
import { listPatients } from '../lib/dataService'
import { careModeLabel, createCareWorkItem, listCareWorkItems, updateCareWorkItem } from '../lib/careWorkspaceService'
import { getSharedCareWorkspaceOverview, listSharedCareWorkspaceTasks, updateSharedCareWorkspaceTaskStatus } from '../lib/sharedCareService'

const MODE_CATEGORIES = {
  general_practice: ['Results review', 'Document', 'Medication request', 'Follow-up', 'Admin task'],
  hospital: ['Clinical review', 'Investigation result', 'Medication task', 'Discharge task', 'Referral'],
  ambulance: ['Incomplete ePCR', 'Clinical review', 'Handover follow-up', 'Incident completion', 'Equipment / operational'],
}

export default function CareWorkQueuePage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const mode = session?.profile?.organisation_mode || 'general_practice'
  const [rows, setRows] = useState([])
  const [patients, setPatients] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [sharedOverview, setSharedOverview] = useState(null)
  const [sharedRows, setSharedRows] = useState([])
  const [form, setForm] = useState({ patient_id: '', category: MODE_CATEGORIES[mode]?.[0] || 'Task', title: '', priority: 'Routine', due_at: '' })

  async function load() {
    setBusy(true); setError('')
    try {
      const [items, patientRows, workspaceOverview] = await Promise.all([
        listCareWorkItems(mode, { includeCompleted: showCompleted }),
        listPatients(''),
        getSharedCareWorkspaceOverview().catch(() => null),
      ])
      setRows(items); setPatients(patientRows); setSharedOverview(workspaceOverview)
      if (workspaceOverview?.workspace?.id) {
        const sharedItems = await listSharedCareWorkspaceTasks(workspaceOverview.workspace.id, { includeCompleted: showCompleted }).catch(() => [])
        setSharedRows(Array.isArray(sharedItems) ? sharedItems : [])
      } else setSharedRows([])
    } catch (err) { setError(err?.message || 'Unable to load the clinical work queue.') }
    finally { setBusy(false) }
  }

  useEffect(() => { load() }, [mode, showCompleted])
  useEffect(() => { setForm((current) => ({ ...current, category: MODE_CATEGORIES[mode]?.[0] || 'Task' })) }, [mode])

  const patientMap = useMemo(() => new Map(patients.map((patient) => [patient.id, patient])), [patients])
  const urgent = rows.filter((row) => row.status !== 'completed' && ['Urgent', 'Immediate'].includes(row.priority)).length
  const overdue = rows.filter((row) => row.status !== 'completed' && row.due_at && new Date(row.due_at) < new Date()).length

  async function createItem(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await createCareWorkItem(mode, { ...form, due_at: form.due_at ? new Date(form.due_at).toISOString() : null })
      setForm({ patient_id: '', category: MODE_CATEGORIES[mode]?.[0] || 'Task', title: '', priority: 'Routine', due_at: '' })
      setShowForm(false); await load()
    } catch (err) { setError(err?.message || 'Unable to create the work item.') }
    finally { setBusy(false) }
  }

  async function complete(row) {
    setBusy(true); setError('')
    try { await updateCareWorkItem(row.id, { status: 'completed', completed_at: new Date().toISOString() }); await load() }
    catch (err) { setError(err?.message || 'Unable to complete the work item.') }
    finally { setBusy(false) }
  }


  async function updateSharedTask(row, status) {
    setBusy(true); setError('')
    try { await updateSharedCareWorkspaceTaskStatus(row.id, status); await load() }
    catch (err) { setError(err?.message || 'Unable to update the Shared Care task.') }
    finally { setBusy(false) }
  }

  return (
    <div className="care-workspace page-pad compact-pad">
      <div className="care-workspace-heading">
        <div><span>WORK QUEUE · {careModeLabel(mode).toUpperCase()}</span><h1>Clinical Work Queue</h1><p>Own, prioritise and complete work that needs action across the organisation.</p></div>
        <div className="care-heading-actions"><button onClick={load} disabled={busy}><RefreshCw size={14}/>Refresh</button><button className="primary-button" onClick={() => setShowForm((value) => !value)}><Plus size={14}/>New item</button></div>
      </div>
      {error && <div className="form-error">{error}</div>}

      <div className="care-stat-grid work-queue-stats">
        <article><ListTodo size={20}/><div><strong>{rows.filter((row) => row.status !== 'completed').length}</strong><span>Open items</span></div></article>
        <article><TriangleAlert size={20}/><div><strong>{urgent}</strong><span>Urgent / immediate</span></div></article>
        <article><Clock3 size={20}/><div><strong>{overdue}</strong><span>Overdue</span></div></article>
        <article><CheckCircle2 size={20}/><div><strong>{rows.filter((row) => row.status === 'completed').length}</strong><span>Completed in view</span></div></article>
      </div>

      {showForm && <Panel title="Create work item"><form className="care-inline-form" onSubmit={createItem}><label><span>Category</span><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{(MODE_CATEGORIES[mode] || ['Task']).map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Patient</span><select value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })}><option value="">Organisation-level task</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.last_name?.toUpperCase()}, {patient.first_name}</option>)}</select></label><label><span>Title *</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label><label><span>Priority</span><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option>Routine</option><option>Urgent</option><option>Immediate</option></select></label><label><span>Due</span><input type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} /></label><div className="care-form-actions"><button type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-button" disabled={busy}>Create item</button></div></form></Panel>}

      <Panel title="Work items" count={rows.length} actions={<label className="care-inline-check"><input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} /> Show completed</label>}>
        {!rows.length ? <div className="empty-state">No work items are currently recorded for this workspace.</div> : <div className="care-work-list">{rows.map((row) => {
          const patient = patientMap.get(row.patient_id)
          const overdueItem = row.due_at && row.status !== 'completed' && new Date(row.due_at) < new Date()
          return <article key={row.id} className={`${row.status === 'completed' ? 'completed' : ''} ${overdueItem ? 'overdue' : ''}`}><div className={`care-priority priority-${String(row.priority || 'routine').toLowerCase()}`}>{row.priority || 'Routine'}</div><div className="care-work-main"><span>{row.category || 'Task'}</span><strong>{row.title}</strong><small>{patient ? `${patient.last_name?.toUpperCase()}, ${patient.first_name} · ${patient.nhs_number || 'No NHS number'}` : 'Organisation-level task'}</small></div><div className="care-work-meta"><span>{row.due_at ? new Date(row.due_at).toLocaleString('en-GB') : 'No due date'}</span><b>{row.status}</b></div><div className="care-row-actions">{row.patient_id && <button onClick={() => navigate(`/patients/${row.patient_id}`)}>Open record</button>}{row.status !== 'completed' && <button className="primary-button" onClick={() => complete(row)} disabled={busy}><CheckCircle2 size={13}/>Complete</button>}</div></article>
        })}</div>}
      </Panel>

      {sharedOverview?.workspace?.id && <Panel title="Shared Care work" count={sharedRows.length} actions={<span className="shared-care-queue-network-label">{sharedOverview.members?.length || 0} connected communities</span>}>
        {!sharedRows.length ? <div className="empty-state">No cross-organisation Shared Care tasks are currently assigned in this network.</div> : <div className="care-work-list shared-care-queue-list">{sharedRows.map((row) => {
          const isTarget = row.target_organisation_id === sharedOverview.workspace.currentOrganisationId
          const isSource = row.source_organisation_id === sharedOverview.workspace.currentOrganisationId
          const overdueItem = row.due_at && !['completed','cancelled'].includes(row.status) && new Date(row.due_at) < new Date()
          return <article key={row.id} className={`${row.status === 'completed' ? 'completed' : ''} ${overdueItem ? 'overdue' : ''}`}><div className={`care-priority priority-${String(row.priority || 'routine').toLowerCase()}`}>{row.priority || 'Routine'}</div><div className="care-work-main"><span>SHARED CARE · {row.source_organisation_name} → {row.target_organisation_name}</span><strong>{row.title}</strong><small>{row.details || 'Cross-organisation task'}{row.due_at ? ` · Due ${new Date(row.due_at).toLocaleString('en-GB')}` : ''}</small></div><div className="care-work-meta"><b>{row.status}</b></div><div className="care-row-actions">{row.local_patient_id && <button onClick={() => navigate(`/patients/${row.local_patient_id}/shared-care`)}>Shared record</button>}{isTarget && row.status === 'open' && <button onClick={() => updateSharedTask(row, 'accepted')}>Accept</button>}{isTarget && ['open','accepted'].includes(row.status) && <button className="primary-button" onClick={() => updateSharedTask(row, 'completed')}><CheckCircle2 size={13}/>Complete</button>}{isSource && !['completed','cancelled'].includes(row.status) && <button onClick={() => updateSharedTask(row, 'cancelled')}>Cancel</button>}</div></article>
        })}</div>}
      </Panel>}
    </div>
  )
}
