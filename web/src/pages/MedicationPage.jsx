import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, KeyRound, LockKeyhole, Plus, Search, ShieldCheck, X } from 'lucide-react'
import { useParams, useSearchParams } from 'react-router-dom'
import PatientHeader from '../components/PatientHeader'
import ClinicalToolbar from '../components/ClinicalToolbar'
import ModalPortal from '../components/ModalPortal'
import { createMedication, getPatient, listForPatient, updateMedication } from '../lib/dataService'
import { hasPrescribingPin, setPrescribingPin } from '../lib/prescribingSecurity'
import { useAuth } from '../contexts/AuthContext'

const MEDICATION_TYPES = ['Acute Meds', 'Repeat', 'Long Term Meds']

function normaliseMedicationType(type) {
  if (type === 'Acute') return 'Acute Meds'
  if (type === 'Repeat dispensing') return 'Long Term Meds'
  return MEDICATION_TYPES.includes(type) ? type : 'Acute Meds'
}

function clinicianName(profile = {}) {
  return [profile.title, profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
    || profile.display_name
    || profile.username
    || 'Current clinician'
}

export default function MedicationPage() {
  const { patientId } = useParams()
  const [params, setParams] = useSearchParams()
  const { session } = useAuth()
  const profile = session?.profile || {}
  const currentClinician = clinicianName(profile)
  const [patient, setPatient] = useState(null)
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState(null)

  async function load() {
    const [p, meds] = await Promise.all([
      getPatient(patientId),
      listForPatient('medications', patientId, 'last_issue_date'),
    ])
    setPatient(p)
    setRows(meds.map((medication) => ({ ...medication, type: normaliseMedicationType(medication.type) })))
  }

  useEffect(() => { load() }, [patientId])

  useEffect(() => {
    if (params.get('add') === '1' && editing === null) {
      setEditing({ type: 'Acute Meds' })
      const next = new URLSearchParams(params)
      next.delete('add')
      setParams(next, { replace: true })
    }
  }, [params, editing, setParams])

  const filtered = useMemo(
    () => rows.filter((medication) => `${medication.name} ${medication.dose} ${medication.authoriser}`.toLowerCase().includes(filter.toLowerCase())),
    [rows, filter],
  )

  return (
    <div>
      <ClinicalToolbar actions={[
        { label: 'Add drug', icon: 'medication', onClick: () => setEditing({ type: 'Acute Meds' }) },
        { label: 'End course', icon: 'add' },
        { label: 'Reauthorise', icon: 'medication' },
        { label: 'Issue', icon: 'medication', groupStart: true },
        { label: 'Current / Past', icon: 'consult', groupStart: true },
        { label: 'Drug history', icon: 'info' },
        { label: 'Search view', icon: 'search', groupStart: true },
        { label: 'Print', icon: 'print' },
      ]}/>

      <PatientHeader patient={patient}/>
      <div className="medication-page">
        <div className="med-title-row">
          <h2>Current medication</h2>
          <div className="med-search"><Search size={15}/><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search medication"/></div>
        </div>

        {MEDICATION_TYPES.map((type) => {
          const group = filtered.filter((medication) => normaliseMedicationType(medication.type) === type)
          return (
            <section className="med-group" key={type}>
              <header>{type}</header>
              <div className="med-table">
                <div className="med-row med-head"><span>Drug / Dosage / Quantity</span><span>Usage</span><span>Last issue date / Authoriser</span><span>Last issue number / Method</span></div>
                {group.length === 0 && <div className="empty-state">No {type.toLowerCase()} recorded.</div>}
                {group.map((medication, index) => (
                  <button className="med-row" key={medication.id} onClick={() => setEditing(medication)}>
                    <span><b>{String.fromCharCode(65 + index)} &nbsp; {medication.name}</b><small>{medication.dose} · {medication.quantity}</small></span>
                    <span className="usage-red">{medication.usage || '—'}</span>
                    <span><b>{medication.last_issue_date ? new Date(medication.last_issue_date).toLocaleDateString('en-GB') : '—'}</b><small>{medication.authoriser}</small></span>
                    <span>{medication.issues || '—'}<small>{medication.method || '—'}</small></span>
                  </button>
                ))}
              </div>
            </section>
          )
        })}

        <div className="med-footer"><strong>Allergies</strong><span className="clinical-green">No additional allergy records entered in medication view.</span></div>
      </div>

      {editing && (
        <MedicationModal
          medication={{ ...editing, type: normaliseMedicationType(editing.type) }}
          authoriser={currentClinician}
          onClose={() => setEditing(null)}
          onSave={async (payload, pin) => {
            const cleanPayload = { ...payload, type: normaliseMedicationType(payload.type), authoriser: currentClinician }
            if (editing.id) await updateMedication(editing.id, patientId, cleanPayload, pin)
            else await createMedication(patientId, cleanPayload, pin)
            setEditing(null)
            await load()
          }}
        />
      )}
    </div>
  )
}

function MedicationModal({ medication, authoriser, onClose, onSave }) {
  const [form, setForm] = useState({
    name: medication.name || '',
    dose: medication.dose || '',
    quantity: medication.quantity || '28 tablets',
    type: normaliseMedicationType(medication.type),
    authoriser,
    method: medication.method || 'Electronic R2',
    issues: medication.issues || '1 of 1',
    last_issue_date: medication.last_issue_date || new Date().toISOString().slice(0, 10),
    usage: medication.usage || '',
  })
  const [pinConfigured, setPinConfigured] = useState(null)
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isNew = !medication.id
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  useEffect(() => {
    let active = true
    hasPrescribingPin().then((configured) => { if (active) setPinConfigured(configured) }).catch((err) => {
      if (active) { setPinConfigured(false); setError(err.message || 'Unable to check prescribing PIN.') }
    })
    return () => { active = false }
  }, [])

  function pinDigits(setter) {
    return (event) => setter(event.target.value.replace(/\D/g, '').slice(0, 4))
  }

  async function authoriseAndSave() {
    setError('')
    if (!form.name.trim()) return setError('Enter the medication name.')
    if (!/^\d{4}$/.test(pin)) return setError('Enter your 4-digit prescribing PIN.')
    if (pinConfigured === false && pin !== pinConfirm) return setError('The new prescribing PINs do not match.')

    setSaving(true)
    try {
      if (pinConfigured === false) {
        await setPrescribingPin({ newPin: pin })
        setPinConfigured(true)
      }
      await onSave(form, pin)
    } catch (err) {
      setError(err.message || 'Unable to authorise this medication.')
      setSaving(false)
      setPin('')
      setPinConfirm('')
    }
  }

  return (
    <ModalPortal onClose={onClose} ariaLabel={isNew ? 'Add medication' : 'Edit medication'}>
      <div className="med-modal prescribing-med-modal">
        <header>
          <div><strong>{isNew ? 'Add a drug' : 'Edit a drug'}</strong><span>Medication details</span></div>
          <button type="button" onClick={onClose}><X size={18}/></button>
        </header>
        <div className="modal-patient-strip">Medication record</div>
        <div className="med-form-grid">
          <label>Name<input autoFocus value={form.name} onChange={(event) => set('name', event.target.value)}/></label>
          <label>Dosage<input value={form.dose} onChange={(event) => set('dose', event.target.value)}/></label>
          <label>Quantity<input value={form.quantity} onChange={(event) => set('quantity', event.target.value)}/></label>
          <label>
            Medication group
            <select value={form.type} onChange={(event) => set('type', event.target.value)}>
              {MEDICATION_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label>Authorising clinician<input value={authoriser} readOnly aria-readonly="true" className="locked-clinician-input"/></label>
          <label>Issue method<select value={form.method} onChange={(event) => set('method', event.target.value)}><option>Electronic R2</option><option>Electronic</option><option>Print</option></select></label>
          <label className="span-two">Usage / directions<input value={form.usage} onChange={(event) => set('usage', event.target.value)} placeholder="Directions for use"/></label>
        </div>
        <div className="warnings">
          <strong>Warnings</strong>
          <div><AlertTriangle size={16}/><span>Clinical decision support placeholder: verify allergies, interactions, contraindications and dose before issuing.</span></div>
          <div><AlertTriangle size={16}/><span>This roleplay prototype does not replace a medicines knowledge base or real prescribing safety system.</span></div>
        </div>
        <div className="prescribing-pin-panel">
          <div className="prescribing-pin-title"><ShieldCheck size={17}/><div><strong>Prescribing authorisation</strong><span>A fresh 4-digit PIN is required every time medication is added or changed.</span></div></div>
          {pinConfigured === null ? <div className="prescribing-pin-loading">Checking prescribing PIN…</div> : (
            <div className="prescribing-pin-fields">
              <label>{pinConfigured ? 'Prescribing PIN' : 'Create a 4-digit prescribing PIN'}<span className="pin-input-wrap"><LockKeyhole size={14}/><input type="password" inputMode="numeric" autoComplete="off" maxLength="4" value={pin} onChange={pinDigits(setPin)} placeholder="••••"/></span></label>
              {!pinConfigured && <label>Confirm PIN<span className="pin-input-wrap"><KeyRound size={14}/><input type="password" inputMode="numeric" autoComplete="off" maxLength="4" value={pinConfirm} onChange={pinDigits(setPinConfirm)} placeholder="••••"/></span></label>}
            </div>
          )}
          <small>The PIN is an additional roleplay safety confirmation and is stored as a one-way hash. It is not a substitute for account authentication.</small>
        </div>
        {error && <div className="form-error modal-error">{error}</div>}
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary-button" onClick={authoriseAndSave} disabled={saving || pinConfigured === null || !form.name.trim()}><LockKeyhole size={15}/> {saving ? 'Authorising…' : isNew ? 'Authorise & add medication' : 'Authorise & save changes'}</button>
        </footer>
      </div>
    </ModalPortal>
  )
}
