import React, { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import PatientHeader from '../components/PatientHeader'
import ClinicalToolbar from '../components/ClinicalToolbar'
import ModalPortal from '../components/ModalPortal'
import { getPatient, listForPatient, updateConsultation } from '../lib/dataService'
import { CONSULTATION_TEMPLATE, consultationEntriesToMap, normaliseConsultationEntryType } from '../lib/consultationTemplate'

export default function ConsultationsPage() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const [patient, setPatient] = useState(null)
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    setError('')
    try {
      const [p, c] = await Promise.all([getPatient(patientId), listForPatient('consultations', patientId, 'date')])
      setPatient(p)
      setRows(c)
    } catch (err) {
      setError(err.message || 'Unable to load consultations.')
    }
  }

  useEffect(() => { load() }, [patientId])

  const filtered = useMemo(() => rows.filter((r) => `${r.clinician} ${r.location} ${r.type} ${JSON.stringify(r.entries || [])}`.toLowerCase().includes(filter.toLowerCase())), [rows, filter])
  const years = [...new Set(filtered.map((r) => new Date(r.date).getFullYear()))].sort((a, b) => b - a)

  return (
    <div>
      <ClinicalToolbar actions={[
        { label: 'Add', icon: 'add', onClick: () => navigate(`/patients/${patientId}/consultations/new`) },
        { label: 'Edit consultation', icon: 'consult', onClick: selected ? () => setEditing(selected) : null, disabled: !selected },
        { label: 'Filters', icon: 'filter', groupStart: true, onClick: () => setShowSearch((v) => !v) },
        { label: 'Text search', icon: 'search', onClick: () => setShowSearch(true) },
        { label: 'Print', icon: 'print', groupStart: true, onClick: () => window.print() },
      ]} />
      <PatientHeader patient={patient} />
      {error && <div className="form-error top-record-error">{error}</div>}
      <div className="consultation-layout">
        <aside className="date-navigator">
          <div className="navigator-title">Date navigator</div>
          {years.map((year) => (
            <div key={year} className="year-group">
              <strong><ChevronDown size={14} /> {year} ({filtered.filter((r) => new Date(r.date).getFullYear() === year).length})</strong>
              {[...new Set(filtered.filter((r) => new Date(r.date).getFullYear() === year).map((r) => new Date(r.date).toLocaleString('en-GB', { month: 'short' })))].map((month) => <span key={month}>{month}</span>)}
            </div>
          ))}
        </aside>
        <section className="consultation-main">
          {showSearch && <div className="record-search"><Search size={15} /><input autoFocus placeholder="Search within consultations" value={filter} onChange={(e) => setFilter(e.target.value)} /><button onClick={() => { setFilter(''); setShowSearch(false) }}>Clear</button><button onClick={() => navigate(`/patients/${patientId}/consultations/new`)}>New consultation</button></div>}
          <div className="consultation-table-head"><span>Date</span><span>Consultation text</span><span>Status</span></div>
          <div className="consultation-feed">
            {filtered.length === 0 && <div className="empty-state">No consultation entries found.</div>}
            {filtered.map((c) => (
              <article className={`consultation-entry clinical-consultation-entry ${selected?.id === c.id ? 'selected' : ''}`} key={c.id} onClick={() => setSelected(c)} onDoubleClick={() => setEditing(c)}>
                <header><time>{new Date(c.date).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</time><strong>{c.location}</strong><span>{c.clinician}</span><em>{c.status}</em></header>
                <div className="consultation-entry-body consultation-template-readback">
                  {(c.entries || [{ type: c.type, text: c.summary || 'Consultation entry' }]).map((e, i) => {
                    const type = normaliseConsultationEntryType(e.type)
                    return <div key={`${type}-${i}`}><span>{type}</span><p className={type === 'Problem' ? 'clinical-green strong' : ''}>{e.text}</p></div>
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
      {editing && <EditConsultationModal consultation={editing} onClose={() => setEditing(null)} onSave={async (payload) => { await updateConsultation(editing.id, payload); setEditing(null); setSelected(null); await load() }} />}
    </div>
  )
}

function EditConsultationModal({ consultation, onClose, onSave }) {
  const sourceEntries = consultation.entries?.length ? consultation.entries : [{ type: consultation.type || 'Comment', text: consultation.summary || '' }]
  const { mapped, legacy } = consultationEntriesToMap(sourceEntries)
  const [form, setForm] = useState({
    clinician: consultation.clinician || '',
    location: consultation.location || '',
    status: consultation.status || 'Complete',
    entries: mapped,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function patchEntry(type, text) {
    setForm((current) => ({ ...current, entries: { ...current.entries, [type]: text } }))
  }

  async function save() {
    const entries = CONSULTATION_TEMPLATE
      .map((type) => ({ type, text: String(form.entries[type] || '').trim() }))
      .filter((entry) => entry.text)
      .concat(legacy)
    if (!entries.length) return
    setSaving(true)
    setError('')
    try {
      await onSave({ clinician: form.clinician, location: form.location, status: form.status, type: entries[0].type, entries })
    } catch (err) {
      setError(err.message || 'Unable to update consultation.')
      setSaving(false)
    }
  }

  return (
    <ModalPortal onClose={onClose} ariaLabel="Edit consultation">
      <div className="records-modal edit-consultation-modal clinical-edit-consultation-modal">
        <header><div><strong>Edit consultation</strong><span>{new Date(consultation.date).toLocaleString('en-GB')}</span></div><button type="button" onClick={onClose}><X size={18} /></button></header>
        <div className="modal-patient-strip">RecordsWeb consultation record</div>
        <div className="records-form-grid clinical-edit-top-grid">
          <label>Clinician<input className="locked-clinician-input" value={form.clinician} readOnly aria-readonly="true" /></label>
          <label>Location<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
          <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>Complete</option><option>Draft</option></select></label>
        </div>
        <div className="clinical-edit-sections-scroll">
          {CONSULTATION_TEMPLATE.map((section) => (
            <div className="clinical-edit-fixed-entry" key={section}>
              <strong>{section}</strong>
              <textarea value={form.entries[section] || ''} onChange={(e) => patchEntry(section, e.target.value)} placeholder={`Enter ${section.toLowerCase()} details…`} />
            </div>
          ))}
          {legacy.length > 0 && <div className="legacy-consultation-entries"><strong>Legacy entries</strong><span>These entries were created by an earlier RecordsWeb consultation template and are preserved when this consultation is saved.</span>{legacy.map((entry, index) => <div key={`${entry.type}-${index}`}><b>{entry.type}</b><p>{entry.text}</p></div>)}</div>}
        </div>
        {error && <div className="form-error modal-error">{error}</div>}
        <footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={saving || !CONSULTATION_TEMPLATE.some((section) => String(form.entries[section] || '').trim()) && legacy.length === 0} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button></footer>
      </div>
    </ModalPortal>
  )
}
