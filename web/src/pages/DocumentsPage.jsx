import React, { useEffect, useMemo, useState } from 'react'
import { FileText, Search } from 'lucide-react'
import { useParams, useSearchParams } from 'react-router-dom'
import ClinicalToolbar from '../components/ClinicalToolbar'
import PatientHeader from '../components/PatientHeader'
import RecordEditModal from '../components/RecordEditModal'
import FitNoteModal from '../components/FitNoteModal'
import DocumentDetailsModal from '../components/DocumentDetailsModal'
import { createForPatient, getPatient, listForPatient, lockFitNoteDocument, updateForPatient } from '../lib/dataService'
import { useAuth } from '../contexts/AuthContext'

const fields = [
  ['title', 'Document title', 'text'],
  ['category', 'Category', 'text'],
  ['author', 'Author', 'text'],
  ['date', 'Date', 'date'],
]

export default function DocumentsPage() {
  const { patientId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { session } = useAuth()
  const [patient, setPatient] = useState(null)
  const [documents, setDocuments] = useState([])
  const [filter, setFilter] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [editing, setEditing] = useState(null)
  const [fitNoteOpen, setFitNoteOpen] = useState(searchParams.get('fitnote') === '1')
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')
  const profile = session?.profile || {}
  const currentClinician = [profile.title, profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || profile.display_name || profile.username || 'Current clinician'

  async function load() {
    try {
      setError('')
      const [patientRow, documentRows] = await Promise.all([
        getPatient(patientId),
        listForPatient('documents', patientId, 'date'),
      ])
      setPatient(patientRow)
      setDocuments(documentRows)
    } catch (err) {
      setError(err.message || 'Unable to load documents.')
    }
  }

  useEffect(() => { load() }, [patientId])
  useEffect(() => {
    if (searchParams.get('fitnote') === '1') setFitNoteOpen(true)
  }, [searchParams])

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return documents
    return documents.filter((document) => `${document.title} ${document.category || ''} ${document.author || ''} ${JSON.stringify(document.details || {})}`.toLowerCase().includes(query))
  }, [documents, filter])

  function closeFitNote() {
    setFitNoteOpen(false)
    if (searchParams.has('fitnote')) {
      const next = new URLSearchParams(searchParams)
      next.delete('fitnote')
      setSearchParams(next, { replace: true })
    }
  }

  return (
    <div>
      <ClinicalToolbar actions={[
        { label: 'Add document', icon: 'add', onClick: () => setEditing({}) },
        { label: 'Add fit note', icon: 'add', onClick: () => setFitNoteOpen(true) },
        { label: 'Filters', icon: 'filter', groupStart: true, onClick: () => setShowFilter((value) => !value) },
        { label: 'Print', icon: 'print', onClick: () => window.print() },
        { label: 'Search', icon: 'search', onClick: () => setShowFilter(true) },
      ]} />
      <PatientHeader patient={patient} />
      <div className="page-pad compact-pad documents-page">
        {error && <div className="form-error">{error}</div>}
        {showFilter && <div className="record-filter-bar"><Search size={14} /><strong>Filter Documents</strong><input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search documents…" /><button onClick={() => { setFilter(''); setShowFilter(false) }}>Clear</button></div>}
        <div className="documents-stream-head"><strong>Documents</strong><span>{filtered.length}</span></div>
        {filtered.length === 0 ? <div className="empty-state documents-empty">No documents found.</div> : (
          <div className="documents-separated-list">
            {filtered.map((document) => {
              const isFitNote = document.document_type === 'Fit Note' || document.category === 'Fit Note'
              const details = document.details || {}
              return (
                <article className="document-record-card" key={document.id}>
                  <button type="button" className="document-record-main" onClick={() => setSelected(document)}>
                    <span className="document-record-icon"><FileText size={16} /></span>
                    <span className="document-record-title"><strong>{document.title}</strong><small>{document.category || document.document_type || 'Clinical document'}</small></span>
                    <span className="document-record-meta"><small>Date</small><strong>{formatDate(document.date)}</strong></span>
                    <span className="document-record-meta"><small>Author</small><strong>{document.author || '—'}</strong></span>
                    <span className="document-record-status">{document.status || 'Filed'}</span>
                  </button>
                  {isFitNote && (
                    <div className="document-record-sections fit-note-filed-summary">
                      <div><span>Format</span><p>PDF document</p></div>
                      <div><span>Record state</span><p>{document.immutable || document.status === 'Signed' ? 'Signed / locked' : 'Issued'}</p></div>
                      <div><span>Editing</span><p>{document.immutable || document.status === 'Signed' ? 'Not permitted' : 'Pending lock'}</p></div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </div>
      {editing !== null && <RecordEditModal title={`${editing.id ? 'Edit' : 'Add'} document`} fields={fields} record={editing} onClose={() => setEditing(null)} onSave={async (payload) => { const clean = { ...payload, document_type: editing.document_type || 'General', status: editing.status || 'Filed' }; if (editing.id) await updateForPatient('documents', editing.id, clean); else await createForPatient('documents', patientId, clean); setEditing(null); await load() }} />}
      {fitNoteOpen && patient && <FitNoteModal patient={patient} profile={profile} onClose={closeFitNote} onIssue={async (details) => {
        const createdDocument = await createForPatient('documents', patientId, {
          title: 'Statement of Fitness for Work',
          category: 'Fit Note',
          document_type: 'Fit Note',
          status: 'Issued',
          date: details.statement_date || new Date().toISOString().slice(0, 10),
          author: currentClinician,
          details,
        })

        let issueWarning = ''

        if (createdDocument?.id) {
          try {
            await lockFitNoteDocument(createdDocument.id)
          } catch (lockError) {
            issueWarning = `${issueWarning ? `${issueWarning} ` : ''}The fit note could not be locked. Run the v3.1.5 Supabase migration before issuing further fit notes. ${lockError?.message || ''}`.trim()
          }
        }

        if (issueWarning) setError(issueWarning)
        closeFitNote()
        await load()
      }} />}
      {selected && <DocumentDetailsModal document={selected} patient={patient} onClose={() => setSelected(null)} />}
    </div>
  )
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-GB')
}
