import React, { useMemo, useState } from 'react'
import { Printer, X } from 'lucide-react'
import ModalPortal from './ModalPortal'
import { ORGANISATION } from '../lib/demoData'

const today = () => new Date().toISOString().slice(0, 10)

function clinicianName(profile = {}) {
  return [profile.title, profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
    || profile.display_name
    || profile.username
    || 'Current clinician'
}

function patientName(patient = {}) {
  return [patient.title, patient.first_name, patient.last_name].filter(Boolean).join(' ').trim()
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T12:00:00`)
  date.setDate(date.getDate() + Number(days || 0))
  return date.toISOString().slice(0, 10)
}

export default function FitNoteModal({ patient, profile, onClose, onIssue }) {
  const issuer = useMemo(() => clinicianName(profile), [profile])
  const [form, setForm] = useState({
    assessed_on: today(),
    condition: '',
    advice: 'Not fit for work',
    phased_return: false,
    altered_hours: false,
    amended_duties: false,
    workplace_adaptations: false,
    comments: '',
    period_mode: 'dates',
    period_from: today(),
    period_to: addDays(today(), 6),
    duration_value: '1',
    duration_unit: 'week(s)',
    no_reassessment_required: true,
    statement_date: today(),
    issuer_name: issuer,
    issuer_profession: profile?.role || 'Clinician',
    issuer_address: `${ORGANISATION.name}\nMain Building`,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function issue() {
    if (!form.condition.trim()) {
      setError('Enter the condition or conditions relevant to the fit note.')
      return
    }
    if (form.period_mode === 'dates' && (!form.period_from || !form.period_to)) {
      setError('Enter the fit note start and end dates.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onIssue({ ...form, issuer_name: issuer, patient_name: patientName(patient), roleplay_only: true })
    } catch (err) {
      setError(err.message || 'Unable to issue the fit note.')
      setSaving(false)
    }
  }

  return (
    <ModalPortal onClose={onClose} ariaLabel="Issue fit note">
      <div className="records-modal fit-note-modal">
        <header>
          <div><strong>Issue fit note</strong><span>Roleplay Statement of Fitness for Work</span></div>
          <button onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="modal-patient-strip">{patientName(patient)} · NHS No. {patient?.nhs_number || '—'}</div>
        <div className="fit-note-roleplay-banner"><strong>ROLEPLAY / SIMULATION ONLY</strong><span>This generated document has no statutory, employment, benefits or real clinical validity.</span></div>
        <div className="fit-note-form">
          <section>
            <h3>Assessment</h3>
            <div className="fit-note-grid two">
              <label>I assessed your case on<input type="date" value={form.assessed_on} onChange={(e) => set('assessed_on', e.target.value)} /></label>
              <label>Issuer<input value={issuer} readOnly /></label>
            </div>
            <label>Because of the following condition(s)<textarea rows="4" maxLength={320} value={form.condition} onChange={(e) => set('condition', e.target.value)} placeholder="Enter the condition(s)…" /></label>
          </section>

          <section>
            <h3>Advice about work</h3>
            <div className="fit-note-choice-row">
              <label><input type="radio" name="fit-advice" checked={form.advice === 'Not fit for work'} onChange={() => set('advice', 'Not fit for work')} /> You are not fit for work</label>
              <label><input type="radio" name="fit-advice" checked={form.advice === 'May be fit for work'} onChange={() => set('advice', 'May be fit for work')} /> You may be fit for work taking account of the following advice</label>
            </div>
            <div className="fit-note-adjustments">
              <label><input type="checkbox" checked={form.phased_return} onChange={(e) => set('phased_return', e.target.checked)} /> Phased return to work</label>
              <label><input type="checkbox" checked={form.amended_duties} onChange={(e) => set('amended_duties', e.target.checked)} /> Amended duties</label>
              <label><input type="checkbox" checked={form.altered_hours} onChange={(e) => set('altered_hours', e.target.checked)} /> Altered hours</label>
              <label><input type="checkbox" checked={form.workplace_adaptations} onChange={(e) => set('workplace_adaptations', e.target.checked)} /> Workplace adaptations</label>
            </div>
            <label>Comments, including functional effects of the condition(s)<textarea rows="5" maxLength={900} value={form.comments} onChange={(e) => set('comments', e.target.value)} placeholder="Enter clinical advice or leave blank…" /></label>
          </section>

          <section>
            <h3>Period</h3>
            <div className="fit-note-choice-row">
              <label><input type="radio" name="fit-period" checked={form.period_mode === 'dates'} onChange={() => set('period_mode', 'dates')} /> Specific dates</label>
              <label><input type="radio" name="fit-period" checked={form.period_mode === 'duration'} onChange={() => set('period_mode', 'duration')} /> Duration</label>
            </div>
            {form.period_mode === 'dates' ? (
              <div className="fit-note-grid two">
                <label>From<input type="date" value={form.period_from} onChange={(e) => set('period_from', e.target.value)} /></label>
                <label>To<input type="date" value={form.period_to} onChange={(e) => set('period_to', e.target.value)} /></label>
              </div>
            ) : (
              <div className="fit-note-grid two">
                <label>For<input type="number" min="1" value={form.duration_value} onChange={(e) => set('duration_value', e.target.value)} /></label>
                <label>Unit<select value={form.duration_unit} onChange={(e) => set('duration_unit', e.target.value)}><option>day(s)</option><option>week(s)</option><option>month(s)</option></select></label>
              </div>
            )}
            <label className="fit-note-inline-check"><input type="checkbox" checked={form.no_reassessment_required} onChange={(e) => set('no_reassessment_required', e.target.checked)} /> I will not need to assess fitness for work again at the end of this period.</label>
          </section>

          <section>
            <h3>Issuer details</h3>
            <div className="fit-note-grid two">
              <label>Issuer's name<input value={issuer} readOnly /></label>
              <label>Issuer's profession<input value={form.issuer_profession} readOnly /></label>
              <label>Date of statement<input type="date" value={form.statement_date} onChange={(e) => set('statement_date', e.target.value)} /></label>
              <label>Issuer's address<textarea rows="2" maxLength={220} value={form.issuer_address} onChange={(e) => set('issuer_address', e.target.value)} /></label>
            </div>
          </section>
        </div>
        {error && <div className="form-error modal-error">{error}</div>}
        <footer>
          <span className="fit-note-no-preview"><Printer size={13} /> No preview is shown. The issued fit note is filed under Documents and can then be printed or saved as a PDF.</span>
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={saving} onClick={issue}>{saving ? 'Issuing…' : 'Issue fit note'}</button>
        </footer>
      </div>
    </ModalPortal>
  )
}
