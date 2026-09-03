import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import ClinicalToolbar from '../components/ClinicalToolbar'
import Panel from '../components/Panel'
import PatientHeader from '../components/PatientHeader'
import RecordEditModal from '../components/RecordEditModal'
import { createForPatient, getPatient, listForPatient, updateForPatient } from '../lib/dataService'

const fields = [
  ['name', 'Investigation', 'text'],
  ['result', 'Result', 'text'],
  ['status', 'Status', 'select', ['Normal', 'Abnormal', 'Pending']],
  ['date', 'Date', 'date'],
]

export default function InvestigationsPage() {
  const { patientId } = useParams()
  const [patient, setPatient] = useState(null)
  const [investigations, setInvestigations] = useState([])
  const [filter, setFilter] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    try {
      setError('')
      const [patientRow, investigationRows] = await Promise.all([
        getPatient(patientId),
        listForPatient('investigations', patientId, 'date'),
      ])
      setPatient(patientRow)
      setInvestigations(investigationRows)
    } catch (err) {
      setError(err.message || 'Unable to load investigations.')
    }
  }

  useEffect(() => { load() }, [patientId])

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return investigations
    return investigations.filter((item) => `${item.name} ${item.result || ''} ${item.status || ''}`.toLowerCase().includes(query))
  }, [investigations, filter])

  return (
    <div>
      <ClinicalToolbar actions={[
        { label: 'Add investigation', icon: 'add', onClick: () => setEditing({}) },
        { label: 'Filters', icon: 'filter', groupStart: true, onClick: () => setShowFilter((value) => !value) },
        { label: 'Print', icon: 'print', onClick: () => window.print() },
        { label: 'Search', icon: 'search', onClick: () => setShowFilter(true) },
      ]} />
      <PatientHeader patient={patient} />
      <div className="page-pad compact-pad">
        {error && <div className="form-error">{error}</div>}
        {showFilter && <div className="record-filter-bar"><strong>Filter Investigations</strong><input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search investigations…" /><button onClick={() => { setFilter(''); setShowFilter(false) }}>Clear</button></div>}
        <Panel title="Investigations" count={filtered.length}>
          {filtered.length === 0 ? <div className="empty-state">No investigations found.</div> : <div className="generic-table">
            <div className="generic-row generic-head"><span>Investigation</span><span>Result</span><span>Status</span><span>Date</span></div>
            {filtered.map((item) => <button type="button" className="generic-row generic-data-row" key={item.id} onClick={() => setEditing(item)}><span>{item.name}</span><span>{item.result || '—'}</span><span>{item.status || '—'}</span><span>{formatDate(item.date)}</span></button>)}
          </div>}
        </Panel>
      </div>
      {editing !== null && <RecordEditModal title={`${editing.id ? 'Edit' : 'Add'} investigation`} fields={fields} record={editing} onClose={() => setEditing(null)} onSave={async (payload) => { if (editing.id) await updateForPatient('investigations', editing.id, payload); else await createForPatient('investigations', patientId, payload); setEditing(null); await load() }} />}
    </div>
  )
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('en-GB') : '—'
}
