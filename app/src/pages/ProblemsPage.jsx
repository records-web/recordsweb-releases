import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import ClinicalToolbar from '../components/ClinicalToolbar'
import Panel from '../components/Panel'
import PatientHeader from '../components/PatientHeader'
import RecordEditModal from '../components/RecordEditModal'
import { createForPatient, getPatient, listForPatient, updateForPatient } from '../lib/dataService'

const fields = [
  ['name', 'Problem', 'text'],
  ['status', 'Status', 'select', ['Active', 'Past', 'Resolved']],
  ['significance', 'Significance', 'select', ['Significant', 'Minor', 'Low']],
  ['onset_date', 'Onset date', 'date'],
  ['notes', 'Notes', 'textarea'],
]

export default function ProblemsPage() {
  const { patientId } = useParams()
  const [patient, setPatient] = useState(null)
  const [problems, setProblems] = useState([])
  const [filter, setFilter] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    try {
      setError('')
      const [patientRow, problemRows] = await Promise.all([
        getPatient(patientId),
        listForPatient('problems', patientId, 'onset_date'),
      ])
      setPatient(patientRow)
      setProblems(problemRows)
    } catch (err) {
      setError(err.message || 'Unable to load problems.')
    }
  }

  useEffect(() => { load() }, [patientId])

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return problems
    return problems.filter((problem) => `${problem.name} ${problem.status} ${problem.significance} ${problem.notes || ''}`.toLowerCase().includes(query))
  }, [problems, filter])

  return (
    <div>
      <ClinicalToolbar actions={[
        { label: 'Add problem', icon: 'add', onClick: () => setEditing({}) },
        { label: 'Filters', icon: 'filter', groupStart: true, onClick: () => setShowFilter((value) => !value) },
        { label: 'Print', icon: 'print', onClick: () => window.print() },
        { label: 'Search', icon: 'search', onClick: () => setShowFilter(true) },
      ]} />
      <PatientHeader patient={patient} />
      <div className="page-pad compact-pad">
        {error && <div className="form-error">{error}</div>}
        {showFilter && <div className="record-filter-bar"><strong>Filter Problems</strong><input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search problems…" /><button onClick={() => { setFilter(''); setShowFilter(false) }}>Clear</button></div>}
        <Panel title="Problems" count={filtered.length}>
          {filtered.length === 0 ? <div className="empty-state">No problems found.</div> : <div className="generic-table">
            <div className="generic-row generic-head"><span>Problem</span><span>Status</span><span>Significance</span><span>Onset date</span></div>
            {filtered.map((problem) => <button type="button" className="generic-row generic-data-row" key={problem.id} onClick={() => setEditing(problem)}><span>{problem.name}</span><span>{problem.status || '—'}</span><span>{problem.significance || '—'}</span><span>{formatDate(problem.onset_date)}</span></button>)}
          </div>}
        </Panel>
      </div>
      {editing !== null && <RecordEditModal title={`${editing.id ? 'Edit' : 'Add'} problem`} fields={fields} record={editing} onClose={() => setEditing(null)} onSave={async (payload) => { if (editing.id) await updateForPatient('problems', editing.id, payload); else await createForPatient('problems', patientId, payload); setEditing(null); await load() }} />}
    </div>
  )
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('en-GB') : '—'
}
