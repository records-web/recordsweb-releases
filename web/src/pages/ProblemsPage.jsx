import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import ClinicalToolbar from '../components/ClinicalToolbar'
import PatientHeader from '../components/PatientHeader'
import ProblemEditorModal from '../components/ProblemEditorModal'
import { createForPatient, getPatient, listForPatient, updateForPatient } from '../lib/dataService'

function isPastProblem(problem = {}) {
  const status = String(problem.status || 'Active').trim().toLowerCase()
  return status === 'past' || status === 'resolved' || status === 'inactive'
}

function problemIndexLabel(index) {
  if (index < 26) return String.fromCharCode(65 + index)
  return String(index - 25)
}

function significanceText(problem = {}) {
  const value = String(problem.significance || '').trim()
  return value || 'Minor'
}

function ProblemSection({ title, problems, indexOffset = 0, emptyText, onEdit }) {
  return (
    <section className="emis-problem-section">
      <header className="emis-problem-section-header">
        <strong>{title}</strong>
        <span>{problems.length}</span>
      </header>
      {problems.length === 0 ? (
        <div className="emis-problem-empty">{emptyText}</div>
      ) : (
        <div className="emis-problem-list" role="list">
          {problems.map((problem, index) => (
            <button
              type="button"
              className="emis-problem-row"
              key={problem.id}
              onClick={() => onEdit(problem)}
              role="listitem"
              title="Open problem details"
            >
              <span className="emis-problem-index" aria-hidden="true">{problemIndexLabel(indexOffset + index)}</span>
              <span className="emis-problem-name">{problem.name}</span>
              <em className={`emis-problem-significance significance-${String(significanceText(problem)).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                ({significanceText(problem)})
              </em>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

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

  const searched = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return problems
    return problems.filter((problem) => `${problem.name} ${problem.status} ${problem.significance} ${problem.notes || ''}`.toLowerCase().includes(query))
  }, [problems, filter])

  const activeProblems = useMemo(() => searched.filter((problem) => !isPastProblem(problem)), [searched])
  const pastProblems = useMemo(() => searched.filter(isPastProblem), [searched])

  return (
    <div>
      <ClinicalToolbar actions={[
        { label: 'Add problem', icon: 'add', onClick: () => setEditing({}) },
        { label: 'Filters', icon: 'filter', groupStart: true, onClick: () => setShowFilter((value) => !value) },
        { label: 'Print', icon: 'print', onClick: () => window.print() },
        { label: 'Search', icon: 'search', onClick: () => setShowFilter(true) },
      ]} />
      <PatientHeader patient={patient} />
      <div className="page-pad compact-pad problems-record-page">
        {error && <div className="form-error">{error}</div>}
        {showFilter && <div className="record-filter-bar"><strong>Filter Problems</strong><input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search active and past problems…" /><button onClick={() => { setFilter(''); setShowFilter(false) }}>Clear</button></div>}

        <div className="emis-problem-record" aria-label="Patient problems">
          <div className="emis-problem-record-title">Problem</div>
          <ProblemSection
            title="Active Problems"
            problems={activeProblems}
            emptyText="No active problems recorded."
            onEdit={setEditing}
          />
          <ProblemSection
            title="Significant Past Problems"
            problems={pastProblems}
            indexOffset={activeProblems.length}
            emptyText="No past problems recorded."
            onEdit={setEditing}
          />
        </div>
      </div>
      {editing !== null && <ProblemEditorModal record={editing} onClose={() => setEditing(null)} onSave={async (payload) => { if (editing.id) await updateForPatient('problems', editing.id, payload); else await createForPatient('problems', patientId, payload); setEditing(null); await load() }} />}
    </div>
  )
}
