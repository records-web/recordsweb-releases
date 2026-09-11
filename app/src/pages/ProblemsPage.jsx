import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import ClinicalToolbar from '../components/ClinicalToolbar'
import Panel from '../components/Panel'
import PatientHeader from '../components/PatientHeader'
import ProblemEditorModal from '../components/ProblemEditorModal'
import { createForPatient, getPatient, listForPatient, updateForPatient } from '../lib/dataService'

function isPastProblem(problem = {}) {
  const status = String(problem.status || 'Active').trim().toLowerCase()
  return status === 'past' || status === 'resolved' || status === 'inactive'
}

export default function ProblemsPage() {
  const { patientId } = useParams()
  const [patient, setPatient] = useState(null)
  const [problems, setProblems] = useState([])
  const [filter, setFilter] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [editing, setEditing] = useState(null)
  const [tab, setTab] = useState('active')
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

  const searched = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return problems
    return problems.filter((problem) => `${problem.name} ${problem.status} ${problem.significance} ${problem.notes || ''}`.toLowerCase().includes(query))
  }, [problems, filter])

  const activeProblems = useMemo(() => searched.filter((problem) => !isPastProblem(problem)), [searched])
  const pastProblems = useMemo(() => searched.filter(isPastProblem), [searched])
  const visibleProblems = tab === 'past' ? pastProblems : activeProblems

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

        <div className="problem-status-tabs" role="tablist" aria-label="Problem status">
          <button type="button" role="tab" aria-selected={tab === 'active'} className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>Active Problems <span>{activeProblems.length}</span></button>
          <button type="button" role="tab" aria-selected={tab === 'past'} className={tab === 'past' ? 'active' : ''} onClick={() => setTab('past')}>Past Problems <span>{pastProblems.length}</span></button>
        </div>

        <Panel title={tab === 'past' ? 'Past Problems' : 'Active Problems'} count={visibleProblems.length}>
          {visibleProblems.length === 0 ? <div className="empty-state">{tab === 'past' ? 'No past problems found.' : 'No active problems found.'}</div> : <div className="generic-table problems-table">
            <div className="generic-row generic-head problems-row"><span>Problem</span><span>Status</span><span>Significance</span><span>Start date</span><span>End date</span></div>
            {visibleProblems.map((problem) => <button type="button" className="generic-row generic-data-row problems-row" key={problem.id} onClick={() => setEditing(problem)}><span>{problem.name}</span><span>{problem.status || '—'}</span><span>{problem.significance || '—'}</span><span>{formatDate(problem.onset_date)}</span><span>{formatDate(problem.end_date)}</span></button>)}
          </div>}
        </Panel>
      </div>
      {editing !== null && <ProblemEditorModal record={editing} onClose={() => setEditing(null)} onSave={async (payload) => { if (editing.id) await updateForPatient('problems', editing.id, payload); else await createForPatient('problems', patientId, payload); setEditing(null); await load() }} />}
    </div>
  )
}

function formatDate(value) {
  return value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB') : '—'
}
