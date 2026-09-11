import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  History,
  KeyRound,
  LockKeyhole,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useParams, useSearchParams } from 'react-router-dom'
import PatientHeader from '../components/PatientHeader'
import ClinicalToolbar from '../components/ClinicalToolbar'
import ModalPortal from '../components/ModalPortal'
import {
  cancelMedication,
  createMedication,
  getMedicationHistory,
  getPatient,
  listForPatient,
  reauthoriseMedication,
  updateMedication,
} from '../lib/dataService'
import { hasPrescribingPin, setPrescribingPin } from '../lib/prescribingSecurity'
import {
  GP_MEDICATION_CATALOGUE_SOURCE_NOTE,
  isSpecialistMedication,
  medicationCatalogueEntryById,
  searchGpMedicationCatalogue,
} from '../lib/gpMedicationCatalogue'
import { useAuth } from '../contexts/AuthContext'

const MEDICATION_TYPES = ['Acute Meds', 'Repeat', 'Long Term Meds']
const SPECIALIST_WARNING = 'This drug is only allowed to be prescribed by specialists. Please speak to your GP Partner for authorisation to prescribe this drug.'

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

function profileHasRole(profile = {}, role) {
  const roles = Array.isArray(profile.roles) ? profile.roles : []
  return profile.role === role || roles.includes(role)
}

function referenceFromMedication(medication) {
  if (medication?.catalogue_id) return medicationCatalogueEntryById(medication.catalogue_id)
  if (!medication?.name) return null
  const matches = searchGpMedicationCatalogue(medication.name, 20)
  return matches.find((entry) => entry.medicine.toLowerCase() === String(medication.name).trim().toLowerCase()) || null
}

export default function MedicationPage() {
  const { patientId } = useParams()
  const [params, setParams] = useSearchParams()
  const { session } = useAuth()
  const profile = session?.profile || {}
  const currentClinician = clinicianName(profile)
  const isGpPartner = profileHasRole(profile, 'GP Partner')
  const [patient, setPatient] = useState(null)
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState(null)
  const [selectedMedication, setSelectedMedication] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [historyMedication, setHistoryMedication] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [reauthoriseTarget, setReauthoriseTarget] = useState(null)
  const [viewMode, setViewMode] = useState('current')
  const [pageError, setPageError] = useState('')

  async function load() {
    const [p, meds] = await Promise.all([
      getPatient(patientId),
      listForPatient('medications', patientId, 'last_issue_date'),
    ])
    setPatient(p)
    const normalised = meds.map((medication) => ({ ...medication, type: normaliseMedicationType(medication.type) }))
    setRows(normalised)
    if (selectedMedication?.id) {
      setSelectedMedication(normalised.find((row) => row.id === selectedMedication.id) || null)
    }
  }

  useEffect(() => { load().catch((error) => setPageError(error.message || 'Unable to load medication.')) }, [patientId])

  useEffect(() => {
    if (params.get('add') === '1' && editing === null) {
      setEditing({ type: 'Acute Meds' })
      const next = new URLSearchParams(params)
      next.delete('add')
      setParams(next, { replace: true })
    }
  }, [params, editing, setParams])

  useEffect(() => {
    if (!contextMenu) return undefined
    const close = () => setContextMenu(null)
    window.addEventListener('pointerdown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [contextMenu])

  const filtered = useMemo(() => {
    const needle = filter.toLowerCase()
    return rows.filter((medication) => {
      if (viewMode === 'current' && medication.active === false) return false
      return `${medication.name} ${medication.dose} ${medication.authoriser} ${medication.form || ''}`.toLowerCase().includes(needle)
    })
  }, [rows, filter, viewMode])

  function openContextMenu(event, medication) {
    event.preventDefault()
    event.stopPropagation()
    setSelectedMedication(medication)
    const width = 235
    const height = 142
    setContextMenu({
      medication,
      x: Math.min(event.clientX, Math.max(8, window.innerWidth - width - 8)),
      y: Math.min(event.clientY, Math.max(8, window.innerHeight - height - 8)),
    })
  }

  function openMedication(medication) {
    setSelectedMedication(medication)
    setEditing(medication)
  }

  function runSelected(action) {
    if (!selectedMedication) return
    action(selectedMedication)
  }

  return (
    <div>
      <ClinicalToolbar actions={[
        { label: 'Add drug', icon: 'medication', onClick: () => setEditing({ type: 'Acute Meds' }) },
        { label: 'End course', icon: 'add', disabled: !selectedMedication || selectedMedication.active === false, onClick: () => runSelected(setCancelTarget) },
        { label: 'Reauthorise', icon: 'medication', disabled: !selectedMedication, onClick: () => runSelected(setReauthoriseTarget) },
        { label: viewMode === 'current' ? 'Current / Past' : 'Current only', icon: 'consult', groupStart: true, onClick: () => setViewMode((current) => current === 'current' ? 'all' : 'current') },
        { label: 'Drug history', icon: 'info', disabled: !selectedMedication, onClick: () => runSelected(setHistoryMedication) },
        { label: 'Search view', icon: 'search', groupStart: true },
        { label: 'Print', icon: 'print' },
      ]}/>

      <PatientHeader patient={patient}/>
      {pageError && <div className="form-error top-record-error">{pageError}</div>}
      <div className="medication-page">
        <div className="med-title-row">
          <div>
            <h2>{viewMode === 'current' ? 'Current medication' : 'Current and past medication'}</h2>
            <small className="med-right-click-hint">Right-click a prescribed drug for history, cancellation or re-authorisation.</small>
          </div>
          <div className="med-search"><Search size={15}/><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search medication"/></div>
        </div>

        {MEDICATION_TYPES.map((type) => {
          const group = filtered.filter((medication) => normaliseMedicationType(medication.type) === type)
          return (
            <section className="med-group" key={type}>
              <header>{type}</header>
              <div className="med-table">
                <div className="med-row med-head"><span>Drug / Dosage / Quantity</span><span>Usage</span><span>Last issue date / Authoriser</span><span>Prescription count / Method</span></div>
                {group.length === 0 && <div className="empty-state">No {type.toLowerCase()} recorded.</div>}
                {group.map((medication, index) => (
                  <button
                    className={`med-row ${medication.active === false ? 'med-row-cancelled' : ''} ${selectedMedication?.id === medication.id ? 'med-row-selected' : ''}`}
                    key={medication.id}
                    onClick={() => openMedication(medication)}
                    onContextMenu={(event) => openContextMenu(event, medication)}
                    title="Right-click for medication actions"
                  >
                    <span>
                      <b>{String.fromCharCode(65 + (index % 26))} &nbsp; {medication.name}{medication.active === false ? ' — CANCELLED' : ''}</b>
                      <small>{medication.dose || 'Dose not entered'} · {medication.quantity || 'Quantity not entered'}{medication.form ? ` · ${medication.form}` : ''}</small>
                    </span>
                    <span className="usage-red">{medication.usage || '—'}</span>
                    <span><b>{medication.last_issue_date ? new Date(medication.last_issue_date).toLocaleDateString('en-GB') : '—'}</b><small>{medication.authoriser || '—'}</small></span>
                    <span><b>{Number(medication.prescription_count || 1)} prescribed</b><small>{medication.method || '—'}</small></span>
                  </button>
                ))}
              </div>
            </section>
          )
        })}

        <div className="med-footer"><strong>Allergies</strong><span className="clinical-green">No additional allergy records entered in medication view.</span></div>
      </div>

      {contextMenu && (
        <div className="med-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => { setHistoryMedication(contextMenu.medication); setContextMenu(null) }}><History size={15}/><span><strong>Drug history</strong><small>View issue and action history</small></span></button>
          <button type="button" disabled={contextMenu.medication.active === false} onClick={() => { setCancelTarget(contextMenu.medication); setContextMenu(null) }}><Ban size={15}/><span><strong>Cancel course</strong><small>A reason is required</small></span></button>
          <button type="button" onClick={() => { setReauthoriseTarget(contextMenu.medication); setContextMenu(null) }}><RotateCcw size={15}/><span><strong>Re-authorise</strong><small>Prescribing PIN required</small></span></button>
        </div>
      )}

      {editing && (
        <MedicationModal
          medication={{ ...editing, type: normaliseMedicationType(editing.type) }}
          authoriser={currentClinician}
          isGpPartner={isGpPartner}
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

      {historyMedication && <MedicationHistoryModal patientId={patientId} medication={historyMedication} onClose={() => setHistoryMedication(null)}/>}
      {cancelTarget && (
        <CancelCourseModal
          medication={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={async (reason) => {
            await cancelMedication(cancelTarget.id, patientId, reason)
            setCancelTarget(null)
            setSelectedMedication(null)
            await load()
          }}
        />
      )}
      {reauthoriseTarget && (
        <ReauthoriseModal
          medication={reauthoriseTarget}
          isGpPartner={isGpPartner}
          onClose={() => setReauthoriseTarget(null)}
          onConfirm={async (pin) => {
            await reauthoriseMedication(reauthoriseTarget.id, patientId, pin)
            setReauthoriseTarget(null)
            await load()
          }}
        />
      )}
    </div>
  )
}

function MedicationModal({ medication, authoriser, isGpPartner, onClose, onSave }) {
  const initialReference = referenceFromMedication(medication)
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
    catalogue_id: medication.catalogue_id || initialReference?.id || '',
    form: medication.form || initialReference?.form || '',
    indication: medication.indication || initialReference?.indication || '',
    reference_usual_dose: medication.reference_usual_dose || initialReference?.usualDose || '',
    reference_higher_dose: medication.reference_higher_dose || initialReference?.higherDose || '',
    specialist_only: medication.specialist_only ?? Boolean(initialReference && isSpecialistMedication(initialReference)),
  })
  const [pinConfigured, setPinConfigured] = useState(null)
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const isNew = !medication.id
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const reference = useMemo(() => form.catalogue_id ? medicationCatalogueEntryById(form.catalogue_id) : null, [form.catalogue_id])
  const results = useMemo(() => searchGpMedicationCatalogue(form.name, 14), [form.name])
  const specialist = Boolean(form.specialist_only || (reference && isSpecialistMedication(reference)))

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

  function selectReference(entry) {
    setForm((current) => ({
      ...current,
      name: entry.medicine,
      dose: entry.usualDose || current.dose,
      catalogue_id: entry.id,
      form: entry.form || '',
      indication: entry.indication || '',
      reference_usual_dose: entry.usualDose || '',
      reference_higher_dose: entry.higherDose || '',
      specialist_only: isSpecialistMedication(entry),
    }))
    setSearchOpen(false)
  }

  function changeName(value) {
    setForm((current) => ({
      ...current,
      name: value,
      catalogue_id: '',
      form: '',
      indication: '',
      reference_usual_dose: '',
      reference_higher_dose: '',
      specialist_only: false,
    }))
    setSearchOpen(Boolean(value.trim()))
  }

  async function authoriseAndSave() {
    setError('')
    if (!form.name.trim()) return setError('Search for and select a medication.')
    if (!form.catalogue_id) return setError('Select the medication from the GP medicines search results so RecordsWeb can use the supplied prescribing reference.')
    if (specialist && !isGpPartner) return setError(SPECIALIST_WARNING)
    if (!/^\d{4}$/.test(pin)) return setError('Enter your 4-digit prescribing PIN.')
    if (pinConfigured === false && pin !== pinConfirm) return setError('The new prescribing PINs do not match.')

    setSaving(true)
    try {
      if (pinConfigured === false) {
        await setPrescribingPin({ newPin: pin })
        setPinConfigured(true)
      }
      await onSave({ ...form, specialist_only: specialist }, pin)
    } catch (err) {
      setError(err.message || 'Unable to authorise this medication.')
      setSaving(false)
      setPin('')
      setPinConfirm('')
    }
  }

  return (
    <ModalPortal onClose={onClose} ariaLabel={isNew ? 'Add medication' : 'Edit medication'}>
      <div className="med-modal prescribing-med-modal med-catalogue-modal">
        <header>
          <div><strong>{isNew ? 'Add a drug' : 'Edit a drug'}</strong><span>GP prescribing reference search</span></div>
          <button type="button" onClick={onClose}><X size={18}/></button>
        </header>
        <div className="modal-patient-strip">Medication record</div>

        <div className="med-catalogue-search-block">
          <label>Search medicine
            <div className="med-catalogue-search-input"><Search size={15}/><input autoFocus value={form.name} onFocus={() => setSearchOpen(Boolean(form.name.trim()))} onChange={(event) => changeName(event.target.value)} placeholder="Start typing, e.g. amox, amlo, apix…"/></div>
          </label>
          {searchOpen && (
            <div className="med-catalogue-results">
              {results.length === 0 && <div className="med-catalogue-empty">No medicine in the supplied GP MEDS reference matches this search.</div>}
              {results.map((entry) => (
                <button type="button" key={entry.id} onClick={() => selectReference(entry)}>
                  <span><strong>{entry.medicine}</strong><small>{entry.form} · {entry.indication}</small></span>
                  <span className="catalogue-dose"><b>{entry.usualDose}</b><small>Page {entry.sourcePage}{isSpecialistMedication(entry) ? ' · Specialist' : ''}</small></span>
                </button>
              ))}
            </div>
          )}
        </div>

        {reference && (
          <div className="med-reference-panel">
            <div className="med-reference-title"><CheckCircle2 size={16}/><div><strong>{reference.medicine}</strong><span>Selected from GP MEDS.pdf · page {reference.sourcePage}</span></div></div>
            <div className="med-reference-grid">
              <div><span>Form</span><strong>{reference.form || '—'}</strong></div>
              <div><span>Common GP indication</span><strong>{reference.indication || '—'}</strong></div>
              <button type="button" onClick={() => set('dose', reference.usualDose || '')}><span>Usual starting / usual dose</span><strong>{reference.usualDose || '—'}</strong><small>Use this dose</small></button>
              <button type="button" onClick={() => set('dose', reference.higherDose || '')}><span>Higher / maintenance reference</span><strong>{reference.higherDose || '—'}</strong><small>Use this reference text</small></button>
            </div>
          </div>
        )}

        <div className="med-form-grid">
          <label>Prescribed dosage<input value={form.dose} onChange={(event) => set('dose', event.target.value)} placeholder="Select a reference dose above or enter the authorised regimen"/></label>
          <label>Quantity<input value={form.quantity} onChange={(event) => set('quantity', event.target.value)}/></label>
          <label>
            Medication group
            <select value={form.type} onChange={(event) => set('type', event.target.value)}>
              {MEDICATION_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label>Authorising clinician<input value={authoriser} readOnly aria-readonly="true" className="locked-clinician-input"/></label>
          <label>Issue method<select value={form.method} onChange={(event) => set('method', event.target.value)}><option>Electronic R2</option><option>Electronic</option><option>Print</option></select></label>
          <label>Reference form<input value={form.form} readOnly aria-readonly="true"/></label>
          <label className="span-two">Usage / directions<input value={form.usage} onChange={(event) => set('usage', event.target.value)} placeholder="Directions for use"/></label>
        </div>

        <div className="warnings">
          <strong>Prescribing reference & warnings</strong>
          {specialist && (
            <div className="specialist-drug-warning"><ShieldAlert size={18}/><span><b>Specialist drug</b>{SPECIALIST_WARNING}{isGpPartner ? ' You are signed in as a GP Partner; your prescribing PIN can authorise this prescription.' : ''}</span></div>
          )}
          <div><AlertTriangle size={16}/><span>{GP_MEDICATION_CATALOGUE_SOURCE_NOTE}</span></div>
          <div><AlertTriangle size={16}/><span>Always verify allergies, interactions, contraindications, monitoring requirements and the patient-specific dose before issuing.</span></div>
        </div>

        <div className="prescribing-pin-panel">
          <div className="prescribing-pin-title"><ShieldCheck size={17}/><div><strong>{specialist ? 'GP Partner prescribing authorisation' : 'Prescribing authorisation'}</strong><span>A fresh 4-digit PIN is required every time medication is added or changed.</span></div></div>
          {specialist && !isGpPartner ? (
            <div className="specialist-pin-blocked"><LockKeyhole size={16}/><span>Prescription blocked until a signed-in GP Partner authorises this specialist medicine.</span></div>
          ) : pinConfigured === null ? <div className="prescribing-pin-loading">Checking prescribing PIN…</div> : (
            <div className="prescribing-pin-fields">
              <label>{pinConfigured ? 'Prescribing PIN' : 'Create a 4-digit prescribing PIN'}<span className="pin-input-wrap"><LockKeyhole size={14}/><input type="password" inputMode="numeric" autoComplete="off" maxLength="4" value={pin} onChange={pinDigits(setPin)} placeholder="••••"/></span></label>
              {!pinConfigured && <label>Confirm PIN<span className="pin-input-wrap"><KeyRound size={14}/><input type="password" inputMode="numeric" autoComplete="off" maxLength="4" value={pinConfirm} onChange={pinDigits(setPinConfirm)} placeholder="••••"/></span></label>}
            </div>
          )}
          <small>The prescribing PIN is stored as a one-way hash and is required in addition to the signed-in RecordsWeb account.</small>
        </div>
        {error && <div className="form-error modal-error">{error}</div>}
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary-button" onClick={authoriseAndSave} disabled={saving || pinConfigured === null || !form.catalogue_id || (specialist && !isGpPartner)}><LockKeyhole size={15}/> {saving ? 'Authorising…' : isNew ? 'Authorise & add medication' : 'Authorise & save changes'}</button>
        </footer>
      </div>
    </ModalPortal>
  )
}

function MedicationHistoryModal({ patientId, medication, onClose }) {
  const [state, setState] = useState({ loading: true, count: Number(medication.prescription_count || 1), events: [], error: '' })

  useEffect(() => {
    let live = true
    getMedicationHistory(patientId, medication).then((result) => {
      if (live) setState({ loading: false, count: result.prescriptionCount, events: result.events, error: '' })
    }).catch((error) => {
      if (live) setState({ loading: false, count: Number(medication.prescription_count || 1), events: [], error: error.message || 'Unable to load drug history.' })
    })
    return () => { live = false }
  }, [patientId, medication])

  return (
    <ModalPortal onClose={onClose} ariaLabel={`Drug history for ${medication.name}`}>
      <div className="med-modal med-history-modal">
        <header><div><strong>Drug history</strong><span>{medication.name}</span></div><button type="button" onClick={onClose}><X size={18}/></button></header>
        <div className="med-history-summary"><History size={20}/><div><span>Total prescriptions / re-authorisations</span><strong>{state.loading ? '…' : state.count}</strong></div></div>
        {state.error && <div className="form-error modal-error">{state.error}</div>}
        <div className="med-history-list">
          {state.loading && <div className="empty-state">Loading medication history…</div>}
          {!state.loading && state.events.length === 0 && <div className="empty-state">No detailed event history is available for this legacy medication record.</div>}
          {state.events.map((event) => (
            <article key={event.id}>
              <div className={`med-history-event-icon ${event.event_type}`}><Clock3 size={14}/></div>
              <div><strong>{String(event.event_type || 'event').replaceAll('_', ' ')}</strong><span>{event.clinician_name || 'RecordsWeb clinician'} · {event.created_at ? new Date(event.created_at).toLocaleString('en-GB') : '—'}</span>{event.reason && <p>Reason: {event.reason}</p>}</div>
            </article>
          ))}
        </div>
        <footer><button type="button" className="primary-button" onClick={onClose}>Close</button></footer>
      </div>
    </ModalPortal>
  )
}

function CancelCourseModal({ medication, onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    const clean = reason.trim()
    if (clean.length < 3) return setError('Enter a reason for cancelling this medication course.')
    setSaving(true)
    setError('')
    try { await onConfirm(clean) } catch (err) { setError(err.message || 'Unable to cancel this medication course.'); setSaving(false) }
  }

  return (
    <ModalPortal onClose={onClose} ariaLabel={`Cancel ${medication.name}`}>
      <div className="med-modal med-action-modal">
        <header><div><strong>Cancel medication course</strong><span>{medication.name}</span></div><button type="button" onClick={onClose}><X size={18}/></button></header>
        <div className="med-action-body">
          <div className="med-action-warning"><Ban size={18}/><span>This ends the current course in RecordsWeb. The medication remains in the patient's past medication and drug history.</span></div>
          <label>Reason for cancellation<textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder="A cancellation reason is required…"/></label>
        </div>
        {error && <div className="form-error modal-error">{error}</div>}
        <footer><button type="button" className="secondary-button" onClick={onClose}>Back</button><button type="button" className="danger-button" disabled={saving || reason.trim().length < 3} onClick={confirm}>{saving ? 'Cancelling…' : 'Cancel course'}</button></footer>
      </div>
    </ModalPortal>
  )
}

function ReauthoriseModal({ medication, isGpPartner, onClose, onConfirm }) {
  const reference = referenceFromMedication(medication)
  const specialist = Boolean(medication.specialist_only || (reference && isSpecialistMedication(reference)))
  const [pin, setPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    if (specialist && !isGpPartner) return setError(SPECIALIST_WARNING)
    if (!/^\d{4}$/.test(pin)) return setError('Enter your 4-digit prescribing PIN.')
    setSaving(true)
    setError('')
    try { await onConfirm(pin) } catch (err) { setError(err.message || 'Unable to re-authorise this medication.'); setSaving(false); setPin('') }
  }

  return (
    <ModalPortal onClose={onClose} ariaLabel={`Re-authorise ${medication.name}`}>
      <div className="med-modal med-action-modal">
        <header><div><strong>Re-authorise medication</strong><span>{medication.name}</span></div><button type="button" onClick={onClose}><X size={18}/></button></header>
        <div className="med-action-body">
          {specialist && <div className="specialist-drug-warning"><ShieldAlert size={18}/><span><b>Specialist drug</b>{SPECIALIST_WARNING}</span></div>}
          <p>Re-authorising records another prescription issue, restores the medication to current medication if it was cancelled, and records the action in drug history.</p>
          <label>Prescribing PIN<span className="pin-input-wrap"><LockKeyhole size={14}/><input autoFocus type="password" inputMode="numeric" autoComplete="off" maxLength="4" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••"/></span></label>
        </div>
        {error && <div className="form-error modal-error">{error}</div>}
        <footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={saving || (specialist && !isGpPartner)} onClick={confirm}><RotateCcw size={15}/>{saving ? 'Authorising…' : 'Re-authorise'}</button></footer>
      </div>
    </ModalPortal>
  )
}
