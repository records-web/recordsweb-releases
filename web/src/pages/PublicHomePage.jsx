import React, { useEffect, useRef, useState } from 'react'
import { ArrowRight, Building2, CalendarDays, CheckCircle2, ClipboardList, FileText, Gamepad2, Hospital, ImagePlus, LockKeyhole, Pill, Search, Send, Stethoscope, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import recordsWebWordmark from '../assets/RW-Logo.png'
import { submitRecordsWebAccessRequest } from '../lib/accessRequestService'
import { APP_VERSION } from '../lib/webRuntime'
import { applyRecordsWebProductBrand } from '../lib/organisationSettings'

const INITIAL_FORM = {
  communityName: '',
  requestedMode: 'general_practice',
  discordUrl: '',
  robloxGroupUrl: '',
  memberRange: '',
  contactName: '',
  contactEmail: '',
  discordUsername: '',
  additionalDetails: '',
  authorisedContact: false,
}

const FEATURES = [
  [Search, 'Patient records', 'Search, register and maintain organisation-scoped patient records.'],
  [ClipboardList, 'Consultations', 'Record structured consultations, problems, follow-up and clinical notes.'],
  [Pill, 'Medication', 'Manage acute, repeat and long-term medication records.'],
  [FileText, 'Documents', 'Keep fit notes and other documents as clearly separated individual records.'],
  [CalendarDays, 'Appointments', 'Manage appointment books, arrival states and live waiting-time information.'],
  [LockKeyhole, 'Organisation isolation', 'Each approved community receives its own @XX.XX namespace and protected data boundary.'],
  [Gamepad2, 'Roblox bridge', 'Optionally connect the community to its Roblox experience for live waiting-room patient calls.'],
]

export default function PublicHomePage() {
  const navigate = useNavigate()
  useEffect(() => { applyRecordsWebProductBrand() }, [])
  const requestSectionRef = useRef(null)
  const formRef = useRef(null)
  const [form, setForm] = useState(INITIAL_FORM)
  const [logoFile, setLogoFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const result = await submitRecordsWebAccessRequest(form, logoFile)
      setSuccess(`Request submitted successfully. Reference: ${result.id}`)
      setForm(INITIAL_FORM)
      setLogoFile(null)
      formRef.current?.reset()
    } catch (err) {
      setError(err?.message || 'Unable to submit the request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="public-home">
      <header className="public-home-header">
        <div className="public-home-brand">
          <img className="public-home-wordmark" src={recordsWebWordmark} alt="RecordsWeb" />
          <span>Clinical records platform</span>
        </div>
        <nav>
          <button type="button" onClick={() => requestSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}>Request access</button>
          <button type="button" className="public-staff-button" onClick={() => navigate('/login')}>Staff sign in <ArrowRight size={15}/></button>
        </nav>
      </header>

      <main>
        <section className="public-hero">
          <div className="public-hero-copy">
            <span className="public-eyebrow">RECORDSWEB {APP_VERSION}</span>
            <h1>One records platform for multiple medical communities.</h1>
            <p>RecordsWeb provides approved communities with their own organisation extension, staff namespace and isolated clinical-record environment while keeping a consistent RecordsWeb workflow.</p>
            <div className="public-hero-actions">
              <button type="button" className="public-primary" onClick={() => navigate('/login')}>Open staff area <ArrowRight size={16}/></button>
              <button type="button" className="public-secondary" onClick={() => requestSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}>Request access</button>
            </div>
          </div>
          <div className="public-hero-panel">
            <div className="public-panel-title"><Building2 size={17}/><strong>Multi-organisation deployment</strong></div>
            <div className="public-org-example"><span>Example Medical Community</span><strong>@ZX.QV</strong></div>
            <div className="public-org-example"><span>Your community</span><strong>@XX.XX</strong></div>
            <p>Approved deployments receive a unique four-letter RecordsWeb extension used for logins and data separation. RecordsWeb branding remains identical across every deployment.</p>
          </div>
        </section>

        <section className="public-section">
          <div className="public-section-heading"><span>WHAT IT DOES</span><h2>Core RecordsWeb workflow</h2><p>The system combines the day-to-day records functions staff need into one consistent interface.</p></div>
          <div className="public-feature-grid">
            {FEATURES.map(([Icon, title, description]) => (
              <article key={title}><Icon size={21}/><div><strong>{title}</strong><p>{description}</p></div></article>
            ))}
          </div>
        </section>

        <section className="public-section public-modes-section">
          <div className="public-section-heading"><span>DEPLOYMENT MODES</span><h2>Configured around the organisation</h2></div>
          <div className="public-mode-grid">
            <article><div className="public-mode-icon"><Stethoscope size={23}/></div><div><strong>General Practice</strong><p>The current full RecordsWeb workflow for consultations, medication, documents, appointments, registration, investigations, referrals and staff administration.</p></div></article>
            <article><div className="public-mode-icon"><Hospital size={23}/></div><div><strong>Hospital</strong><p>RecordsWeb can register hospital deployments under the same organisation model, ready for hospital-specific modules and extensions as they are provisioned.</p></div></article>
          </div>
        </section>

        <section className="public-section public-access-process">
          <div className="public-section-heading"><span>ACCESS</span><h2>Access is provisioned manually</h2><p>RecordsWeb is not an open-registration service. Requests are reviewed before an organisation extension is created.</p></div>
          <div className="public-process-row">
            <div><span>1</span><strong>Submit a request</strong><p>Tell us about your community and the deployment you need.</p></div>
            <div><span>2</span><strong>Eligibility review</strong><p>The request is checked before any RecordsWeb organisation is created.</p></div>
            <div><span>3</span><strong>Organisation setup</strong><p>If accepted, your community receives its own @XX.XX extension and configuration.</p></div>
          </div>
        </section>

        <section className="public-request-section" ref={requestSectionRef} id="request-access">
          <div className="public-request-intro">
            <span className="public-eyebrow">REQUEST ACCESS</span>
            <h2>Request a RecordsWeb deployment</h2>
            <p>Complete the form below. Submission does not guarantee approval; requests are reviewed before an organisation is provisioned.</p>
            <div className="public-request-note"><CheckCircle2 size={18}/><span>Your community logo is collected only for request review. It never replaces or modifies RecordsWeb branding.</span></div>
          </div>

          <form ref={formRef} className="public-request-form" onSubmit={submit}>
            <div className="public-form-grid">
              <label><span>Community name *</span><input value={form.communityName} onChange={(e) => update('communityName', e.target.value)} maxLength={120} required /></label>
              <label><span>Requested mode *</span><select value={form.requestedMode} onChange={(e) => update('requestedMode', e.target.value)}><option value="general_practice">General Practitioner</option><option value="hospital">Hospital</option></select></label>
              <label><span>Discord URL *</span><input type="url" placeholder="https://discord.gg/..." value={form.discordUrl} onChange={(e) => update('discordUrl', e.target.value)} required /></label>
              <label><span>Roblox group link *</span><input type="url" placeholder="https://www.roblox.com/communities/..." value={form.robloxGroupUrl} onChange={(e) => update('robloxGroupUrl', e.target.value)} required /></label>
              <label><span>Community members *</span><select value={form.memberRange} onChange={(e) => update('memberRange', e.target.value)} required><option value="">Select size</option><option value="10-99">10+</option><option value="100-999">100+</option><option value="1000-9999">1,000+</option><option value="10000+">10,000+</option></select></label>
              <label className="public-logo-field"><span>Community logo *</span><div className="public-file-input"><ImagePlus size={17}/><span className="public-file-button">Choose logo</span><span className="public-file-name">{logoFile ? logoFile.name : 'No file chosen'}</span><small>PNG, JPG or WebP · max 4 MB</small><input className="public-file-native" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} required /></div></label>
              <label><span>Your name *</span><input value={form.contactName} onChange={(e) => update('contactName', e.target.value)} maxLength={120} required /></label>
              <label><span>Contact email *</span><input type="email" value={form.contactEmail} onChange={(e) => update('contactEmail', e.target.value)} required /></label>
              <label><span>Discord username</span><input value={form.discordUsername} onChange={(e) => update('discordUsername', e.target.value)} maxLength={80} placeholder="username" /></label>
              <label className="public-form-wide"><span>Additional information</span><textarea value={form.additionalDetails} onChange={(e) => update('additionalDetails', e.target.value)} maxLength={2000} rows={5} placeholder="Anything else that would help when reviewing the community or required setup." /></label>
            </div>

            <label className="public-authorised-check"><input type="checkbox" checked={form.authorisedContact} onChange={(e) => update('authorisedContact', e.target.checked)} required /><span>I confirm that I am authorised to request RecordsWeb access for this community.</span></label>
            {error && <div className="public-request-message error">{error}</div>}
            {success && <div className="public-request-message success"><CheckCircle2 size={16}/>{success}</div>}
            <div className="public-request-actions"><button type="submit" className="public-primary" disabled={busy}><Send size={15}/>{busy ? 'Submitting…' : 'Submit request'}</button></div>
          </form>
        </section>
      </main>

      <footer className="public-home-footer"><span>RecordsWeb · Multi-organisation clinical records platform</span><span>Version {APP_VERSION}</span></footer>
    </div>
  )
}
