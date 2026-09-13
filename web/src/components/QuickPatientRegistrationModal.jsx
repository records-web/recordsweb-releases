import React, { useState } from 'react'
import { Save, UserPlus, X } from 'lucide-react'
import ModalPortal from './ModalPortal'
import { createPatient } from '../lib/dataService'

export default function QuickPatientRegistrationModal({ mode = 'general_practice', organisationName = 'RecordsWeb', onClose, onCreated }) {
  const [form, setForm] = useState({
    title: 'Mr',
    first_name: '',
    last_name: '',
    dob: '',
    sex: '',
    gender: '',
    usual_gp: '',
    address: '',
    discord_user_id: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const contextLabel = mode === 'hospital' ? 'Hospital patient record' : mode === 'ambulance' ? 'Ambulance / PHEM patient record' : 'Patient registration'
  const contextHelp = mode === 'ambulance'
    ? 'Create a patient record that can be linked immediately to an incident and ePCR.'
    : mode === 'hospital'
      ? 'Create a patient record that can be selected immediately for an admission or inpatient episode.'
      : 'Create a new patient record.'

  async function submit(event) {
    event.preventDefault()
    setError('')
    const discordUserId = String(form.discord_user_id || '').trim()
    if (discordUserId && !/^\d{17,20}$/.test(discordUserId)) {
      setError('Discord ID must be a 17–20 digit Discord User ID.')
      return
    }
    setSaving(true)
    try {
      const created = await createPatient({ ...form, discord_user_id: discordUserId || null })
      onCreated?.(created)
    } catch (err) {
      setError(err?.message || 'Unable to create the patient record.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalPortal onClose={onClose} ariaLabel={contextLabel}>
      <form className="records-modal care-patient-registration-modal" onSubmit={submit}>
        <header>
          <div><span>{contextLabel.toUpperCase()}</span><strong>New patient</strong></div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={17}/></button>
        </header>
        <div className="care-patient-modal-body">
          <div className="care-patient-modal-intro"><UserPlus size={18}/><div><strong>{organisationName}</strong><span>{contextHelp}</span></div></div>
          <div className="records-form-grid embedded care-patient-modal-grid">
            <label>Title<select value={form.title} onChange={(event) => set('title', event.target.value)}><option>Mr</option><option>Mrs</option><option>Miss</option><option>Ms</option><option>Dr</option><option>Mx</option></select></label>
            <label>First name<input autoFocus value={form.first_name} onChange={(event) => set('first_name', event.target.value)} required /></label>
            <label>Last name<input value={form.last_name} onChange={(event) => set('last_name', event.target.value)} required /></label>
            <label>Date of birth<input type="date" value={form.dob} onChange={(event) => set('dob', event.target.value)} required /></label>
            <label>Sex<select value={form.sex} onChange={(event) => set('sex', event.target.value)}><option value="">Not recorded</option><option>Female</option><option>Male</option><option>Intersex</option></select></label>
            <label>Gender<input value={form.gender} onChange={(event) => set('gender', event.target.value)} placeholder="Optional" /></label>
            <label className="span-two">Address<textarea value={form.address} onChange={(event) => set('address', event.target.value)} /></label>
            <label>Discord ID<input value={form.discord_user_id} onChange={(event) => set('discord_user_id', event.target.value.replace(/\D+/g, '').slice(0, 20))} inputMode="numeric" placeholder="123456789012345678" /><small>Used for automatic RecordsWeb Bot prescription and fit-note DMs.</small></label>
            {mode !== 'ambulance' && <label>Usual GP<input value={form.usual_gp} onChange={(event) => set('usual_gp', event.target.value)} placeholder="Clinician name" /></label>}
          </div>
          <div className="care-patient-generated-note">NHS number and local record number are generated automatically when the patient is created.</div>
          {error && <div className="form-error">{error}</div>}
        </div>
        <footer>
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="primary-button" disabled={saving}><Save size={14}/>{saving ? 'Creating…' : 'Create patient'}</button>
        </footer>
      </form>
    </ModalPortal>
  )
}
