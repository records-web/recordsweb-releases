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


const DAILY_FREQUENCY_LABELS = {
  1: 'once daily',
  2: 'twice daily',
  3: 'three times daily',
  4: 'four times daily',
}

function frequencyLabelFromNumber(value) {
  const frequency = Number(value)
  if (!Number.isInteger(frequency) || frequency <= 0) return ''
  return DAILY_FREQUENCY_LABELS[frequency] || `${frequency} times daily`
}

function prescribedTypicalLabel(option, frequencyPerDay) {
  if (!option) return ''
  if (!option.calculable || !option.doseAmount || !option.doseUnit) return option.label || ''
  const frequencyLabel = frequencyLabelFromNumber(frequencyPerDay || option.frequencyPerDay)
  return frequencyLabel
    ? `${option.doseAmount} ${option.doseUnit} ${frequencyLabel}`
    : option.label || ''
}

function normaliseDoseUnit(unit = '') {
  const value = String(unit || '').trim().toLowerCase()
  if (value === 'mcg' || value === 'microgram' || value === 'micrograms') return 'micrograms'
  if (value === 'mg') return 'mg'
  if (value === 'g') return 'g'
  return value
}

function doseUnitToMgFactor(unit) {
  const normalised = normaliseDoseUnit(unit)
  if (normalised === 'micrograms') return 0.001
  if (normalised === 'mg') return 1
  if (normalised === 'g') return 1000
  return null
}

function frequencyCandidatesFromText(value = '') {
  const text = String(value || '').toLowerCase().replaceAll('–', '-')
  if (/once\s*\/\s*twice\s+daily/.test(text) || /once\s+or\s+twice\s+daily/.test(text)) return [1, 2]
  const numericRange = text.match(/\b([1-4])\s*-\s*([1-4])\s+times\s+daily\b/)
  if (numericRange) {
    const start = Number(numericRange[1])
    const end = Number(numericRange[2])
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index)
  }
  if (/\bfour\s+times\s+daily\b|\bup\s+to\s+four\s+times\s+daily\b/.test(text)) return [4]
  if (/\bthree\s+times\s+daily\b|\bup\s+to\s+three\s+times\s+daily\b/.test(text)) return [3]
  if (/\btwice\s+daily\b/.test(text)) return [2]
  if (/\bonce\s+daily\b|\bonce\s+a\s+day\b|\bnightly\b|\bat\s+night\b|\bmg\/day\b|\bmicrograms?\/day\b|\bg\/day\b/.test(text)) return [1]
  return []
}

function doseAmountsFromText(value = '') {
  const text = String(value || '').replaceAll('–', '-')
  // Combination strengths such as 500/125 mg are not a single dose amount and
  // therefore cannot safely drive the automatic tablet calculator.
  if (/\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*(?:micrograms?|mcg|mg|g)\b/i.test(text)) return null

  const range = text.match(/\b(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(micrograms?|mcg|mg|g)\b/i)
  if (range) {
    return {
      amounts: [Number(range[1]), Number(range[2])],
      unit: normaliseDoseUnit(range[3]),
    }
  }

  const single = text.match(/\b(\d+(?:\.\d+)?)\s*(micrograms?|mcg|mg|g)\b/i)
  if (!single) return null
  return {
    amounts: [Number(single[1])],
    unit: normaliseDoseUnit(single[2]),
  }
}

function buildTypicalDoseOptions(reference) {
  if (!reference) return []
  const sources = [
    { key: 'usual', label: 'Usual / starting dose', text: reference.usualDose || '' },
    { key: 'higher', label: 'Higher / maintenance', text: reference.higherDose || '' },
  ]
  const options = []
  const fallback = []

  for (const source of sources) {
    const text = String(source.text || '').trim()
    if (!text) continue
    const dose = doseAmountsFromText(text)
    const frequencies = frequencyCandidatesFromText(text)

    if (dose && frequencies.length) {
      for (const amount of dose.amounts) {
        for (const frequencyPerDay of frequencies) {
          const frequencyLabel = DAILY_FREQUENCY_LABELS[frequencyPerDay] || `${frequencyPerDay} times daily`
          options.push({
            id: `${source.key}-${amount}-${dose.unit}-${frequencyPerDay}`,
            sourceKey: source.key,
            sourceLabel: source.label,
            sourceText: text,
            label: `${amount} ${dose.unit} ${frequencyLabel}`,
            doseAmount: amount,
            doseUnit: dose.unit,
            frequencyPerDay,
            calculable: true,
          })
        }
      }
    } else {
      fallback.push({
        id: `${source.key}-reference`,
        sourceKey: source.key,
        sourceLabel: source.label,
        sourceText: text,
        label: text,
        doseAmount: null,
        doseUnit: '',
        frequencyPerDay: null,
        calculable: false,
      })
    }
  }

  const chosen = options.length ? options : fallback.slice(0, 1)
  const seen = new Set()
  return chosen.filter((option) => {
    const key = option.label.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function supportsAutomaticQuantity(form = '') {
  return /tablet|capsule/i.test(String(form || ''))
}

function quantityUnitForForm(form = '') {
  const value = String(form || '').toLowerCase()
  const hasTablet = value.includes('tablet')
  const hasCapsule = value.includes('capsule')
  if (hasTablet && hasCapsule) return 'tablets/capsules'
  if (hasTablet) return 'tablets'
  if (hasCapsule) return 'capsules'
  return 'units'
}

function strengthLabelForForm(form = '') {
  const value = String(form || '').toLowerCase()
  if (value.includes('tablet') && !value.includes('capsule')) return 'Strength per tablet'
  if (value.includes('capsule') && !value.includes('tablet')) return 'Strength per capsule'
  return 'Strength per tablet / unit'
}

function formatCalculatedQuantity(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  if (Math.abs(number - Math.round(number)) < 0.000001) return String(Math.round(number))
  return number.toFixed(2).replace(/\.00$/, '').replace(/0$/, '')
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

export function MedicationModal({ medication, authoriser, isGpPartner, onClose, onSave, contextLabel = 'Medication record' }) {
  const initialReference = referenceFromMedication(medication)
  const initialTypicalOptions = buildTypicalDoseOptions(initialReference)
  const initialTypicalMatch = initialTypicalOptions.find((option) => option.label.toLowerCase() === String(medication.dose || '').trim().toLowerCase())
  const [form, setForm] = useState({
    name: medication.name || '',
    dose: medication.dose || initialTypicalOptions[0]?.label || '',
    quantity: medication.quantity || '',
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
  const [dosageMode, setDosageMode] = useState(initialReference && (!medication.dose || initialTypicalMatch) ? 'typical' : 'custom')
  const [selectedTypicalId, setSelectedTypicalId] = useState(initialTypicalMatch?.id || initialTypicalOptions[0]?.id || '')
  const [strengthAmount, setStrengthAmount] = useState('')
  const [strengthUnit, setStrengthUnit] = useState(initialTypicalMatch?.doseUnit || initialTypicalOptions[0]?.doseUnit || 'mg')
  const [frequencyPerDay, setFrequencyPerDay] = useState(String(initialTypicalMatch?.frequencyPerDay || initialTypicalOptions[0]?.frequencyPerDay || ''))
  const [courseDurationDays, setCourseDurationDays] = useState('')
  const [quantityMode, setQuantityMode] = useState(medication.quantity ? 'custom' : 'auto')
  const [customQuantity, setCustomQuantity] = useState(medication.quantity || '')

  const isNew = !medication.id
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const reference = useMemo(() => form.catalogue_id ? medicationCatalogueEntryById(form.catalogue_id) : null, [form.catalogue_id])
  const results = useMemo(() => searchGpMedicationCatalogue(form.name, 14), [form.name])
  const specialist = Boolean(form.specialist_only || (reference && isSpecialistMedication(reference)))
  const typicalOptions = useMemo(() => buildTypicalDoseOptions(reference), [reference])
  const selectedTypical = useMemo(
    () => typicalOptions.find((option) => option.id === selectedTypicalId) || typicalOptions[0] || null,
    [typicalOptions, selectedTypicalId],
  )
  const automaticQuantitySupported = supportsAutomaticQuantity(reference?.form || form.form)
  const quantityUnit = quantityUnitForForm(reference?.form || form.form)

  const autoQuantity = useMemo(() => {
    if (dosageMode !== 'typical' || quantityMode !== 'auto' || !automaticQuantitySupported || !selectedTypical?.calculable) return null
    const doseFactor = doseUnitToMgFactor(selectedTypical.doseUnit)
    const strengthFactor = doseUnitToMgFactor(strengthUnit)
    const strength = Number(strengthAmount)
    const duration = Number(courseDurationDays)
    const frequency = Number(frequencyPerDay)
    if (!doseFactor || !strengthFactor || !Number.isFinite(strength) || strength <= 0 || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(frequency) || frequency <= 0) return null
    const doseMg = Number(selectedTypical.doseAmount) * doseFactor
    const strengthMg = strength * strengthFactor
    if (!Number.isFinite(doseMg) || doseMg <= 0 || !Number.isFinite(strengthMg) || strengthMg <= 0) return null
    const value = (doseMg / strengthMg) * frequency * duration
    return Number.isFinite(value) && value > 0 ? value : null
  }, [automaticQuantitySupported, courseDurationDays, dosageMode, frequencyPerDay, quantityMode, selectedTypical, strengthAmount, strengthUnit])

  const calculatedQuantityText = autoQuantity === null ? '' : `${formatCalculatedQuantity(autoQuantity)} ${quantityUnit}`
  const effectiveQuantity = quantityMode === 'auto' ? calculatedQuantityText : customQuantity.trim()

  useEffect(() => {
    let active = true
    hasPrescribingPin().then((configured) => { if (active) setPinConfigured(configured) }).catch((err) => {
      if (active) { setPinConfigured(false); setError(err.message || 'Unable to check prescribing PIN.') }
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (dosageMode !== 'typical' || !selectedTypical) return
    const prescribedDose = prescribedTypicalLabel(selectedTypical, frequencyPerDay)
    if (!prescribedDose) return
    setForm((current) => current.dose === prescribedDose ? current : { ...current, dose: prescribedDose })
  }, [dosageMode, frequencyPerDay, selectedTypical])

  function pinDigits(setter) {
    return (event) => setter(event.target.value.replace(/\D/g, '').slice(0, 4))
  }

  function applyReference(entry) {
    const options = buildTypicalDoseOptions(entry)
    const first = options[0] || null
    const autoSupported = supportsAutomaticQuantity(entry.form) && Boolean(first?.calculable)
    setForm((current) => ({
      ...current,
      name: entry.medicine,
      dose: first?.label || entry.usualDose || current.dose,
      quantity: '',
      catalogue_id: entry.id,
      form: entry.form || '',
      indication: entry.indication || '',
      reference_usual_dose: entry.usualDose || '',
      reference_higher_dose: entry.higherDose || '',
      specialist_only: isSpecialistMedication(entry),
    }))
    setDosageMode('typical')
    setSelectedTypicalId(first?.id || '')
    setStrengthAmount('')
    setStrengthUnit(first?.doseUnit || 'mg')
    setFrequencyPerDay(first?.frequencyPerDay ? String(first.frequencyPerDay) : '')
    setCourseDurationDays('')
    setQuantityMode(autoSupported ? 'auto' : 'custom')
    setCustomQuantity('')
    setSearchOpen(false)
  }

  function selectReference(entry) {
    applyReference(entry)
  }

  function changeName(value) {
    setForm((current) => ({
      ...current,
      name: value,
      dose: '',
      quantity: '',
      catalogue_id: '',
      form: '',
      indication: '',
      reference_usual_dose: '',
      reference_higher_dose: '',
      specialist_only: false,
    }))
    setDosageMode('typical')
    setSelectedTypicalId('')
    setStrengthAmount('')
    setStrengthUnit('mg')
    setFrequencyPerDay('')
    setCourseDurationDays('')
    setQuantityMode('custom')
    setCustomQuantity('')
    setSearchOpen(Boolean(value.trim()))
  }

  function chooseTypicalOption(id) {
    const option = typicalOptions.find((entry) => entry.id === id) || typicalOptions[0] || null
    setSelectedTypicalId(option?.id || '')
    if (option) {
      const nextFrequency = option.frequencyPerDay ? String(option.frequencyPerDay) : ''
      setFrequencyPerDay(nextFrequency)
      set('dose', prescribedTypicalLabel(option, nextFrequency))
      if (option.doseUnit) setStrengthUnit(option.doseUnit)
    }
    if (!option?.calculable || !automaticQuantitySupported) setQuantityMode('custom')
  }

  function useReferenceSource(sourceKey) {
    const option = typicalOptions.find((entry) => entry.sourceKey === sourceKey)
    if (!option) return
    setDosageMode('typical')
    chooseTypicalOption(option.id)
  }

  function switchDosageMode(mode) {
    setDosageMode(mode)
    setError('')
    if (mode === 'typical') {
      const option = selectedTypical || typicalOptions[0] || null
      if (option) {
        setSelectedTypicalId(option.id)
        const nextFrequency = option.frequencyPerDay ? String(option.frequencyPerDay) : ''
        setFrequencyPerDay(nextFrequency)
        set('dose', prescribedTypicalLabel(option, nextFrequency))
        if (option.doseUnit) setStrengthUnit(option.doseUnit)
        if (!option.calculable || !automaticQuantitySupported) setQuantityMode('custom')
      }
    } else {
      setQuantityMode('custom')
    }
  }

  async function authoriseAndSave() {
    setError('')
    if (!form.name.trim()) return setError('Search for and select a medication.')
    if (!form.catalogue_id) return setError('Select the medication from the GP medicines search results so RecordsWeb can use the supplied prescribing reference.')
    if (!String(form.dose || '').trim()) return setError('Enter or select the prescribed dosage.')

    if (quantityMode === 'auto') {
      if (dosageMode !== 'typical' || !selectedTypical?.calculable) return setError('Automatic quantity needs a calculable typical dosage. Choose Custom quantity for this regimen.')
      if (!automaticQuantitySupported) return setError('Automatic quantity is only available for tablet/capsule prescriptions. Choose Custom quantity for this formulation.')
      if (!Number.isFinite(Number(strengthAmount)) || Number(strengthAmount) <= 0) return setError(`Enter the ${strengthLabelForForm(reference?.form || form.form).toLowerCase()}.`)
      if (!Number.isInteger(Number(frequencyPerDay)) || Number(frequencyPerDay) < 1 || Number(frequencyPerDay) > 24) return setError('Enter a whole-number frequency per day between 1 and 24.')
      if (!Number.isFinite(Number(courseDurationDays)) || Number(courseDurationDays) <= 0) return setError('Enter the course duration in days.')
      if (!calculatedQuantityText) return setError('RecordsWeb could not calculate the quantity from the selected dose, strength, frequency and duration.')
    } else if (!customQuantity.trim()) {
      return setError('Enter the custom quantity to supply.')
    }

    if (specialist && !isGpPartner) return setError(SPECIALIST_WARNING)
    if (!/^\d{4}$/.test(pin)) return setError('Enter your 4-digit prescribing PIN.')
    if (pinConfigured === false && pin !== pinConfirm) return setError('The new prescribing PINs do not match.')

    setSaving(true)
    try {
      if (pinConfigured === false) {
        await setPrescribingPin({ newPin: pin })
        setPinConfigured(true)
      }
      await onSave({ ...form, quantity: effectiveQuantity, specialist_only: specialist }, pin)
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
        <div className="modal-patient-strip">{contextLabel}</div>

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
              <button type="button" onClick={() => useReferenceSource('usual')}><span>Usual starting / usual dose</span><strong>{reference.usualDose || '—'}</strong><small>Choose typical dosage</small></button>
              <button type="button" onClick={() => useReferenceSource('higher')}><span>Higher / maintenance reference</span><strong>{reference.higherDose || '—'}</strong><small>{typicalOptions.some((entry) => entry.sourceKey === 'higher') ? 'Choose typical dosage' : 'Reference only'}</small></button>
            </div>
          </div>
        )}

        <div className="med-dose-builder">
          <div className="med-dose-builder-title">
            <div><strong>Prescribed dosage & quantity</strong><span>Use a typical dose from the supplied reference, or enter a custom regimen and quantity.</span></div>
            <div className="med-mode-toggle" role="group" aria-label="Dosage mode">
              <button type="button" className={dosageMode === 'typical' ? 'active' : ''} onClick={() => switchDosageMode('typical')} disabled={!typicalOptions.length}>Typical dosage</button>
              <button type="button" className={dosageMode === 'custom' ? 'active' : ''} onClick={() => switchDosageMode('custom')}>Custom dosage</button>
            </div>
          </div>

          {dosageMode === 'typical' ? (
            <div className="med-dose-builder-grid">
              <label className="span-two">Typical prescribed dosage
                <select value={selectedTypical?.id || ''} onChange={(event) => chooseTypicalOption(event.target.value)}>
                  {typicalOptions.map((option) => <option key={option.id} value={option.id}>{option.label} · {option.sourceLabel}</option>)}
                </select>
                {selectedTypical?.sourceText && <small>Reference wording: {selectedTypical.sourceText}</small>}
              </label>

              <label>{strengthLabelForForm(reference?.form || form.form)}
                <div className="med-strength-row">
                  <input type="number" min="0" step="0.001" inputMode="decimal" value={strengthAmount} onChange={(event) => setStrengthAmount(event.target.value)} placeholder="e.g. 5"/>
                  <select value={strengthUnit} onChange={(event) => setStrengthUnit(event.target.value)}><option value="micrograms">micrograms</option><option value="mg">mg</option><option value="g">g</option></select>
                </div>
                <small>Enter the strength of the actual tablet/capsule being issued; the GP MEDS reference does not define pack strength.</small>
              </label>

              <label>Frequency per day (ONLY CHANGE THE NUMBER)
                <input
                  type="number"
                  min="1"
                  max="24"
                  step="1"
                  inputMode="numeric"
                  value={frequencyPerDay}
                  onChange={(event) => setFrequencyPerDay(event.target.value.replace(/\D/g, '').slice(0, 2))}
                  placeholder="e.g. 4"
                />
                <small>{frequencyLabelFromNumber(frequencyPerDay) || 'Enter the number of doses per day.'} · Only change the number.</small>
              </label>

              <label>Course duration (days)
                <input type="number" min="0.5" step="0.5" inputMode="decimal" value={courseDurationDays} onChange={(event) => setCourseDurationDays(event.target.value)} placeholder="e.g. 5"/>
              </label>

              <div className="med-quantity-mode-field">
                <span>Quantity mode</span>
                <div className="med-mode-toggle compact">
                  <button type="button" className={quantityMode === 'auto' ? 'active' : ''} disabled={!automaticQuantitySupported || !selectedTypical?.calculable} onClick={() => setQuantityMode('auto')}>Auto-calculate</button>
                  <button type="button" className={quantityMode === 'custom' ? 'active' : ''} onClick={() => setQuantityMode('custom')}>Custom quantity</button>
                </div>
                {(!automaticQuantitySupported || !selectedTypical?.calculable) && (
                  <small className="med-auto-quantity-unavailable">
                    {!automaticQuantitySupported
                      ? 'Auto-calculate is not suitable for this formulation. Enter the supplied quantity manually.'
                      : 'The supplied reference does not contain one exact calculable regimen. Choose Custom quantity or Custom dosage.'}
                  </small>
                )}
              </div>

              {quantityMode === 'auto' ? (
                <div className="med-calculated-quantity span-two">
                  <div><span>Calculated quantity</span><strong>{calculatedQuantityText || 'Enter strength and duration'}</strong></div>
                  <small>Dose ÷ strength per tablet × frequency per day × course duration = quantity.</small>
                  {!automaticQuantitySupported && <small>Automatic calculation is only enabled for tablet/capsule prescriptions.</small>}
                  {selectedTypical && !selectedTypical.calculable && <small>This reference wording is not an exact calculable regimen; choose Custom quantity.</small>}
                </div>
              ) : (
                <label className="span-two">Custom quantity
                  <input value={customQuantity} onChange={(event) => setCustomQuantity(event.target.value)} placeholder={`e.g. 40 ${quantityUnit}`}/>
                </label>
              )}
            </div>
          ) : (
            <div className="med-dose-builder-grid">
              <label className="span-two">Custom prescribed dosage
                <input value={form.dose} onChange={(event) => set('dose', event.target.value)} placeholder="Enter the authorised regimen exactly as prescribed"/>
              </label>
              <label className="span-two">Custom quantity
                <input value={customQuantity} onChange={(event) => setCustomQuantity(event.target.value)} placeholder="Enter the quantity to supply, e.g. 40 tablets"/>
              </label>
              <div className="med-custom-dose-note span-two"><AlertTriangle size={15}/><span>Custom dosage and quantity bypass the automatic quantity calculation. The prescribing clinician is responsible for verifying the regimen and quantity.</span></div>
            </div>
          )}
        </div>

        <div className="med-form-grid">
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
