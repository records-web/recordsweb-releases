import React, { useState } from 'react'
import { X } from 'lucide-react'
import { ORGANISATION } from '../lib/demoData'
import ModalPortal from './ModalPortal'

export default function RecordEditModal({ title, fields, record = {}, onClose, onSave }) {
  const initial = Object.fromEntries(fields.map(([key, , type, options]) => {
    if (record[key] !== undefined && record[key] !== null) return [key, record[key]]
    if (type === 'date') return [key, new Date().toISOString().slice(0, 10)]
    if (type === 'select') return [key, options?.[0] || '']
    if (type === 'checkbox') return [key, false]
    return [key, '']
  }))

  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const requiredKey = fields[0]?.[0]

  async function save() {
    if (requiredKey && !String(form[requiredKey] || '').trim()) return
    setSaving(true)
    setError('')
    try {
      await onSave(form)
    } catch (err) {
      setError(err.message || 'Unable to save record.')
      setSaving(false)
    }
  }

  function renderField([key, label, type, options]) {
    if (type === 'checkbox') {
      return (
        <label key={key} className="check-label modal-check">
          <input
            type="checkbox"
            checked={Boolean(form[key])}
            onChange={(event) => setForm({ ...form, [key]: event.target.checked })}
          />
          <span>{label}</span>
        </label>
      )
    }

    return (
      <label key={key}>
        {label}
        {type === 'select' ? (
          <select value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })}>
            {(options || []).map((option) => <option key={option}>{option}</option>)}
          </select>
        ) : type === 'textarea' ? (
          <textarea value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
        ) : (
          <input type={type} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
        )}
      </label>
    )
  }

  return (
    <ModalPortal onClose={onClose} ariaLabel={title}>
      <div className="records-modal">
        <header>
          <div><strong>{title}</strong><span>{ORGANISATION.name}</span></div>
          <button onClick={onClose}><X size={18} /></button>
        </header>
        <div className="modal-patient-strip">RecordsWeb clinical record</div>
        <div className="records-form-grid">{fields.map(renderField)}</div>
        {error && <div className="form-error modal-error">{error}</div>}
        <footer>
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={saving || (requiredKey && !String(form[requiredKey] || '').trim())} onClick={save}>
            {saving ? 'Saving…' : 'Save record'}
          </button>
        </footer>
      </div>
    </ModalPortal>
  )
}
