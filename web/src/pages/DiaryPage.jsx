import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import ClinicalToolbar from '../components/ClinicalToolbar'
import Panel from '../components/Panel'
import PatientHeader from '../components/PatientHeader'
import RecordEditModal from '../components/RecordEditModal'
import { createForPatient, getPatient, listForPatient, updateForPatient } from '../lib/dataService'

const alertFields = [
  ['message', 'Alert', 'textarea'],
  ['severity', 'Severity', 'select', ['Information','Warning','High']],
  ['active', 'Active', 'checkbox'],
]

const fields = [
  ['title', 'Task', 'text'],
  ['priority', 'Priority', 'select', ['Low', 'Normal', 'High']],
  ['due_date', 'Due date', 'date'],
  ['completed', 'Completed', 'checkbox'],
]

export default function DiaryPage() {
  const { patientId } = useParams()
  const [patient, setPatient] = useState(null)
  const [tasks, setTasks] = useState([])
  const [alerts, setAlerts] = useState([])
  const [editingAlert, setEditingAlert] = useState(null)
  const [filter, setFilter] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    try {
      setError('')
      const [patientRow, taskRows, alertRows] = await Promise.all([
        getPatient(patientId),
        listForPatient('diary_tasks', patientId, 'due_date', true),
        listForPatient('patient_alerts', patientId, 'created_at').catch(() => []),
      ])
      setPatient(patientRow)
      setTasks(taskRows)
      setAlerts(alertRows)
    } catch (err) {
      setError(err.message || 'Unable to load diary.')
    }
  }

  useEffect(() => { load() }, [patientId])

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return tasks
    return tasks.filter((task) => `${task.title} ${task.priority || ''} ${task.completed ? 'completed' : 'outstanding'}`.toLowerCase().includes(query))
  }, [tasks, filter])

  return (
    <div>
      <ClinicalToolbar actions={[
        { label: 'Add diary task', icon: 'add', onClick: () => setEditing({}) },
        { label: 'Add clinical alert', icon: 'info', onClick: () => setEditingAlert({ active: true, severity: 'Warning' }) },
        { label: 'Filters', icon: 'filter', groupStart: true, onClick: () => setShowFilter((value) => !value) },
        { label: 'Print', icon: 'print', onClick: () => window.print() },
        { label: 'Search', icon: 'search', onClick: () => setShowFilter(true) },
      ]} />
      <PatientHeader patient={patient} />
      <div className="page-pad compact-pad">
        {error && <div className="form-error">{error}</div>}
        {showFilter && <div className="record-filter-bar"><strong>Filter Diary</strong><input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search diary tasks…" /><button onClick={() => { setFilter(''); setShowFilter(false) }}>Clear</button></div>}
        <Panel title="Diary" count={filtered.length}>
          {filtered.length === 0 ? <div className="empty-state">No diary tasks found.</div> : <div className="generic-table">
            <div className="generic-row generic-head"><span>Task</span><span>Priority</span><span>Completed</span><span>Due date</span></div>
            {filtered.map((task) => <button type="button" className="generic-row generic-data-row" key={task.id} onClick={() => setEditing(task)}><span>{task.title}</span><span>{task.priority || 'Normal'}</span><span>{task.completed ? 'Yes' : 'No'}</span><span>{formatDate(task.due_date)}</span></button>)}
          </div>}
        </Panel>
        <Panel title="Clinical alerts" count={alerts.filter((item)=>item.active!==false).length}>
          {alerts.length === 0 ? <div className="empty-state">No clinical alerts recorded.</div> : <div className="generic-table"><div className="generic-row generic-head"><span>Alert</span><span>Severity</span><span>Active</span><span>Created</span></div>{alerts.map((alert)=><button type="button" className="generic-row generic-data-row" key={alert.id} onClick={()=>setEditingAlert(alert)}><span>{alert.message}</span><span>{alert.severity||'Warning'}</span><span>{alert.active===false?'No':'Yes'}</span><span>{formatDate(alert.created_at)}</span></button>)}</div>}
        </Panel>
      </div>
      {editing !== null && <RecordEditModal title={`${editing.id ? 'Edit' : 'Add'} diary task`} fields={fields} record={editing} onClose={() => setEditing(null)} onSave={async (payload) => { if (editing.id) await updateForPatient('diary_tasks', editing.id, payload); else await createForPatient('diary_tasks', patientId, payload); setEditing(null); await load() }} />}
      {editingAlert !== null && <RecordEditModal title={`${editingAlert.id ? 'Edit' : 'Add'} clinical alert`} fields={alertFields} record={editingAlert} onClose={() => setEditingAlert(null)} onSave={async (payload) => { if (editingAlert.id) await updateForPatient('patient_alerts', editingAlert.id, payload); else await createForPatient('patient_alerts', patientId, payload); setEditingAlert(null); await load() }} />}
    </div>
  )
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('en-GB') : '—'
}
