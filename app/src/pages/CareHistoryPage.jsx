import React, { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import ClinicalToolbar from '../components/ClinicalToolbar'
import PatientHeader from '../components/PatientHeader'
import { getPatient, listForPatient } from '../lib/dataService'

export default function CareHistoryPage() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const [patient, setPatient] = useState(null)
  const [consultations, setConsultations] = useState([])
  const [filter, setFilter] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      getPatient(patientId),
      listForPatient('consultations', patientId, 'date'),
    ]).then(([patientRow, consultationRows]) => {
      if (!active) return
      setPatient(patientRow)
      setConsultations(consultationRows)
    }).catch((err) => {
      if (active) setError(err.message || 'Unable to load care history.')
    })
    return () => { active = false }
  }, [patientId])

  const rows = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return consultations
    return consultations.filter((row) => `${row.clinician || ''} ${row.location || ''} ${row.type || ''} ${JSON.stringify(row.entries || [])}`.toLowerCase().includes(query))
  }, [consultations, filter])

  return (
    <div>
      <ClinicalToolbar actions={[
        { label: 'Add contact', icon: 'add', onClick: () => navigate(`/patients/${patientId}/consultations/new`) },
        { label: 'Text search', icon: 'search', groupStart: true, onClick: () => setShowSearch(true) },
        { label: 'Print', icon: 'print', onClick: () => window.print() },
      ]} />
      <PatientHeader patient={patient} />
      {error && <div className="form-error top-record-error">{error}</div>}
      <div className="page-pad compact-pad">
        {showSearch && <div className="record-filter-bar"><Search size={14} /><strong>Search Care History</strong><input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search contacts, clinician or clinical text…" /><button onClick={() => { setFilter(''); setShowSearch(false) }}>Clear</button></div>}
        <div className="care-history-list">
          <div className="care-history-head"><span>Date</span><span>Type</span><span>Clinical entry</span><span>Clinician / location</span></div>
          {rows.length === 0 && <div className="empty-state">No care history entries found.</div>}
          {rows.map((row) => (
            <article className="care-history-row" key={row.id}>
              <time>{new Date(row.date).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</time>
              <strong>{row.type || 'Consultation'}</strong>
              <div>{(row.entries || []).map((entry, index) => <p key={index}><span>{entry.type}:</span> {entry.text}</p>)}</div>
              <div><strong>{row.clinician || '—'}</strong><span>{row.location || '—'}</span></div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
