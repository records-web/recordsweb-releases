import React, { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import ModalPortal from './ModalPortal'
import ProblemReferenceInput from './ProblemReferenceInput'
import { ORGANISATION } from '../lib/demoData'
import { findProblemReferenceByName, problemSignificanceFromReference } from '../lib/gpProblemCatalogue'

const today = () => new Date().toISOString().slice(0, 10)
const isPastStatus = (status) => ['past', 'resolved', 'inactive'].includes(String(status || '').trim().toLowerCase())

export default function ProblemEditorModal({ record = {}, onClose, onSave }) {
  const [form, setForm] = useState({
    name: record.name || '',
    status: record.status || 'Active',
    significance: record.significance || 'Minor',
    onset_date: record.onset_date || today(),
    end_date: record.end_date || '',
    notes: record.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const reference = useMemo(() => findProblemReferenceByName(form.name), [form.name])
  const past = isPastStatus(form.status)

  function selectReference(entry) {
    setForm((current) => ({
      ...current,
      name: entry.name,
      significance: problemSignificanceFromReference(entry),
      notes: current.notes.trim() ? current.notes : entry.description,
    }))
  }

  function setStatus(status) {
    setForm((current) => ({
      ...current,
      status,
      end_date: isPastStatus(status) ? (current.end_date || today()) : '',
    }))
  }

  async function save() {
    if (!String(form.name || '').trim()) return
    if (past && !form.end_date) {
      setError('Enter the end date for a past or resolved problem.')
      return
    }
    if (form.onset_date && form.end_date && form.end_date < form.onset_date) {
      setError('The problem end date cannot be before the start date.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave({
        ...form,
        name: String(form.name || '').trim(),
        end_date: past ? (form.end_date || null) : null,
        notes: String(form.notes || '').trim(),
      })
    } catch (err) {
      setError(err?.message || 'Unable to save problem.')
      setSaving(false)
    }
  }

  return (
    <ModalPortal onClose={onClose} ariaLabel={record.id ? 'Edit problem' : 'Add problem'}>
      <div className="records-modal problem-editor-modal">
        <header>
          <div><strong>{record.id ? 'Edit problem' : 'Add problem'}</strong><span>{ORGANISATION.name}</span></div>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="modal-patient-strip">RecordsWeb clinical record</div>
        <div className="records-form-grid problem-editor-grid">
          <label className="problem-editor-search-field">
            Problem
            <ProblemReferenceInput value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} onSelect={selectReference} autoFocus={!record.id} />
            <small>Search the supplied GP problem reference as you type. Free-text problems are also allowed.</small>
          </label>
          <label>Status
            <select value={form.status} onChange={(event) => setStatus(event.target.value)}>
              <option>Active</option><option>Past</option><option>Resolved</option>
            </select>
          </label>
          <label>Significance
            <select value={form.significance} onChange={(event) => setForm((current) => ({ ...current, significance: event.target.value }))}>
              <option>Severe</option><option>Significant</option><option>Minor</option><option>Low</option>
            </select>
          </label>
          <label>Start date
            <input type="date" value={form.onset_date} onChange={(event) => setForm((current) => ({ ...current, onset_date: event.target.value }))} />
          </label>
          <label>End date
            <input type="date" value={form.end_date} disabled={!past} onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))} />
            <small>{past ? 'Required for Past / Resolved problems.' : 'Available when the problem is moved to Past or Resolved.'}</small>
          </label>
          <label className="problem-editor-notes">Notes / reference description
            <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
          </label>
          {reference && <div className="problem-reference-source-note">Reference match: <strong>{reference.name}</strong> · {reference.severity}. This catalogue is a lookup aid, not an automated diagnostic or triage system.</div>}
        </div>
        {error && <div className="form-error modal-error">{error}</div>}
        <footer>
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="button" disabled={saving || !String(form.name || '').trim()} onClick={save}>{saving ? 'Saving…' : 'Save problem'}</button>
        </footer>
      </div>
    </ModalPortal>
  )
}
