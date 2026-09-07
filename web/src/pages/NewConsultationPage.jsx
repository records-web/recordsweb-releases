import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Save } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import PatientHeader from '../components/PatientHeader'
import ClinicalToolbar from '../components/ClinicalToolbar'
import { createConsultation, getPatient, listForPatient } from '../lib/dataService'
import { useAuth } from '../contexts/AuthContext'
import { CONSULTATION_TEMPLATE } from '../lib/consultationTemplate'

function normalizeDraftEntries(entries = {}) {
  const next = { ...entries }
  if (next['Test Request'] && !next['Test Requests']) next['Test Requests'] = next['Test Request']
  delete next['Test Request']
  return next
}

export default function NewConsultationPage() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const [patient, setPatient] = useState(null)
  const [recent, setRecent] = useState([])
  const [problems, setProblems] = useState([])
  const [selectedProblemId, setSelectedProblemId] = useState('')
  const [entryTexts, setEntryTexts] = useState({})
  const [location, setLocation] = useState('GP Surgery')
  const [activeSection, setActiveSection] = useState('Problem')
  const sectionRefs = useRef({})
  const profile = session?.profile || {}
  const clinician = [profile.title, profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || profile.display_name || profile.username || 'Current clinician'
  const draftKey = `recordsweb-consultation-draft:${session?.user?.id || 'user'}:${patientId}`
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      getPatient(patientId),
      listForPatient('consultations', patientId, 'date'),
      listForPatient('problems', patientId, 'created_at'),
    ]).then(([p, c, problemRows]) => {
      setPatient(p)
      setRecent(c.slice(0, 3))
      setProblems(problemRows.filter((problem) => String(problem.status || 'Active').toLowerCase() !== 'inactive'))
      try {
        const draft = JSON.parse(localStorage.getItem(draftKey) || 'null')
        if (draft && typeof draft === 'object') {
          setEntryTexts(normalizeDraftEntries(draft.entryTexts || {}))
          setSelectedProblemId(draft.selectedProblemId || '')
          setLocation(draft.location || 'GP Surgery')
          setActiveSection(CONSULTATION_TEMPLATE.includes(draft.activeSection) ? draft.activeSection : 'Problem')
        }
      } catch {}
    }).catch((err) => setError(err.message || 'Unable to prepare the consultation.'))
  }, [patientId, draftKey])

  useEffect(() => {
    const dirty = Object.values(entryTexts).some((value) => String(value || '').trim())
    if (!dirty && !selectedProblemId) return
    const draft = { entryTexts, selectedProblemId, location, activeSection, savedAt: new Date().toISOString() }
    localStorage.setItem(draftKey, JSON.stringify(draft))
  }, [entryTexts, selectedProblemId, location, activeSection, draftKey])

  useEffect(() => {
    const warn = (event) => {
      const dirty = Object.values(entryTexts).some((value) => String(value || '').trim())
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [entryTexts])

  useEffect(() => {
    const guardLinks = (event) => {
      const dirty = Object.values(entryTexts).some((value) => String(value || '').trim())
      if (!dirty) return
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!link) return
      if (!window.confirm('Leave this consultation? Your autosaved draft will be kept.')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener('click', guardLinks, true)
    return () => document.removeEventListener('click', guardLinks, true)
  }, [entryTexts])

  const selectedProblem = useMemo(() => problems.find((problem) => problem.id === selectedProblemId) || null, [problems, selectedProblemId])
  const completedEntries = useMemo(() => CONSULTATION_TEMPLATE.filter((type) => String(entryTexts[type] || '').trim()), [entryTexts])

  function chooseProblem(problemId) {
    setSelectedProblemId(problemId)
    const problem = problems.find((row) => row.id === problemId)
    if (problem) {
      setEntryTexts((current) => current.Problem?.trim() ? current : { ...current, Problem: problem.name || '' })
    }
  }

  function patchSection(section, value) {
    setEntryTexts((current) => ({ ...current, [section]: value }))
  }

  function jumpTo(section) {
    setActiveSection(section)
    sectionRefs.current[section]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => sectionRefs.current[section]?.querySelector('textarea')?.focus(), 220)
  }

  async function save() {
    const entries = CONSULTATION_TEMPLATE
      .map((type) => ({ type, text: String(entryTexts[type] || '').trim() }))
      .filter((entry) => entry.text)
    if (!entries.length) return

    setSaving(true)
    setError('')
    try {
      await createConsultation(patientId, {
        date: new Date().toISOString(),
        clinician,
        location,
        type: entries[0]?.type || 'Consultation',
        status: 'Complete',
        entries,
      })
      localStorage.removeItem(draftKey)
      navigate(`/patients/${patientId}/consultations`)
    } catch (err) {
      setError(err.message || 'Unable to save the consultation.')
      setSaving(false)
    }
  }

  return (
    <div>
      <ClinicalToolbar actions={[
        { label: saving ? 'Saving…' : 'Save', icon: 'add', onClick: save, disabled: saving || completedEntries.length === 0 },
        { label: 'Next problem', icon: 'consult', onClick: () => jumpTo('Problem') },
        { label: 'Online visibility', icon: 'info', groupStart: true },
        { label: 'Book appointment', icon: 'appointment', groupStart: true, onClick: () => navigate(`/appointments?patient=${patientId}`) },
        { label: 'Medication review', icon: 'medication', onClick: () => navigate(`/patients/${patientId}/medication`) },
        { label: 'Add fit note', icon: 'add', onClick: () => navigate(`/patients/${patientId}/documents?fitnote=1`) },
      ]} />
      <PatientHeader patient={patient} />
      {error && <div className="form-error top-record-error">{error}</div>}

      <div className="new-consult-layout clinical-template-layout">
        <aside className="consult-type-menu clinical-template-menu">
          <h3>Consultation</h3>
          {CONSULTATION_TEMPLATE.map((name) => (
            <button key={name} className={activeSection === name ? 'active' : ''} onClick={() => jumpTo(name)}>
              <span>{name}</span>
              {String(entryTexts[name] || '').trim() && <em className="consult-entry-saved-dot" title={`${name} contains text`}>•</em>}
            </button>
          ))}
        </aside>

        <main className="consult-editor clinical-template-editor">
          <div className="consult-editor-top">
            <label>Location
              <select value={location} onChange={(e) => setLocation(e.target.value)}>
                <option>GP Surgery</option>
                <option>Telephone consultation</option>
                <option>Home visit</option>
                <option>Video consultation</option>
              </select>
            </label>
            <label>Clinician
              <input className="locked-clinician-input" value={clinician} readOnly aria-readonly="true" title="The clinician is taken from the signed-in RecordsWeb account." />
            </label>
          </div>

          <div className="clinical-template-scroll">
            <section ref={(node) => { sectionRefs.current.Problem = node }} className={`clinical-entry-section problem-entry-section ${activeSection === 'Problem' ? 'active' : ''}`} onFocusCapture={() => setActiveSection('Problem')}>
              <div className="clinical-entry-label">Problem</div>
              <div className="clinical-entry-content">
                <div className="consult-problem-context clinical-problem-selector">
                  <select value={selectedProblemId} onChange={(e) => chooseProblem(e.target.value)}>
                    <option value="">&lt;No Problem&gt;</option>
                    {problems.map((problem) => <option key={problem.id} value={problem.id}>{problem.name}</option>)}
                  </select>
                </div>
                <div className="problem-record-strip">
                  <strong>{selectedProblem?.name || 'No problem selected'}</strong>
                  <span>{selectedProblem ? `${selectedProblem.status || 'Active'} problem · ${selectedProblem.significance || 'Significance not set'}${selectedProblem.onset_date ? ` · Onset ${new Date(selectedProblem.onset_date).toLocaleDateString('en-GB')}` : ''}` : 'This consultation is not currently linked to an existing problem.'}</span>
                </div>
                <textarea value={entryTexts.Problem || ''} onChange={(e) => patchSection('Problem', e.target.value)} placeholder="Enter the problem or presenting complaint…" />
              </div>
            </section>

            {CONSULTATION_TEMPLATE.slice(1).map((section) => (
              <section key={section} ref={(node) => { sectionRefs.current[section] = node }} className={`clinical-entry-section ${activeSection === section ? 'active' : ''}`} onFocusCapture={() => setActiveSection(section)}>
                <div className="clinical-entry-label">{section}</div>
                <div className="clinical-entry-content">
                  <textarea value={entryTexts[section] || ''} onChange={(e) => patchSection(section, e.target.value)} placeholder={placeholderFor(section)} />
                  {section === 'Document' && (
                    <div className="clinical-entry-actions">
                      <button type="button" onClick={() => navigate(`/patients/${patientId}/documents`)}>Open patient documents</button>
                      <button type="button" onClick={() => navigate(`/patients/${patientId}/documents?fitnote=1`)}>Create fit note</button>
                    </div>
                  )}
                  {section === 'Medication' && <div className="clinical-entry-hint">Use the Medication record to prescribe or alter medicines. Prescribing continues to require the clinician's 4-digit PIN.</div>}
                </div>
              </section>
            ))}

            <div className="clinical-template-endbar">
              <span>{completedEntries.length} of {CONSULTATION_TEMPLATE.length} sections contain entries</span>
              <button className="primary-button" onClick={save} disabled={saving || completedEntries.length === 0}><Save size={15} /> {saving ? 'Saving…' : 'Save consultation'}</button>
              <button className="secondary-button" onClick={() => { const dirty = Object.values(entryTexts).some((value) => String(value || '').trim()); if (!dirty || window.confirm('Leave this consultation? Your autosaved draft will be kept.')) navigate(`/patients/${patientId}/consultations`) }}>Cancel</button>
            </div>

            <section className="recent-preview clinical-latest-contacts">
              <h3>Latest contacts</h3>
              {recent.length === 0 && <div className="empty-state">No previous consultations recorded.</div>}
              {recent.map((r) => <article key={r.id}><time>{new Date(r.date).toLocaleString('en-GB')}</time><strong>{r.location}</strong><span>{r.clinician}</span></article>)}
            </section>
          </div>
        </main>

        <aside className="consult-summary-side">
          <h3>Summary</h3>
          <div className="side-block"><strong>Diary</strong><span>Overdue tasks</span><span>Test request awaiting sample</span></div>
          <div className="side-block"><strong>Problems</strong><span>Active problems</span><span>{problems.length ? `${problems.length} recorded` : 'No active problems recorded'}</span></div>
          <div className="side-block"><strong>Consultation template</strong>{CONSULTATION_TEMPLATE.map((section) => <span key={section}>{String(entryTexts[section] || '').trim() ? '✓' : '○'} {section}</span>)}</div>
        </aside>
      </div>
    </div>
  )
}

function placeholderFor(section) {
  const placeholders = {
    History: 'Enter the clinical history…',
    Examination: 'Enter examination findings and observations…',
    Medication: 'Enter medication-related notes for this consultation…',
    Comment: 'Enter additional clinical comments…',
    'Follow Up': 'Enter follow-up arrangements, review interval or safety-netting advice…',
    'Test Requests': 'Enter tests requested, samples required or investigation plan…',
    Referral: 'Enter referral details or onward-care plan…',
    Document: 'Record documents created, supplied or attached during this consultation…',
    Allergies: 'Record allergy information discussed or updated during this consultation…',
  }
  return placeholders[section] || `Enter ${section.toLowerCase()} details…`
}
