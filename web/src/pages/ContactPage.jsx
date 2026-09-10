import React, { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Mail, Send } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import recordsWebWordmark from '../assets/RW-Logo.png'
import { APP_VERSION } from '../lib/webRuntime'
import { applyRecordsWebProductBrand } from '../lib/organisationSettings'

const INITIAL_FORM = {
  name: '',
  email: '',
  category: 'General enquiry',
  subject: '',
  message: '',
  website: '',
}

export default function ContactPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState(INITIAL_FORM)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { applyRecordsWebProductBrand() }, [])

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Unable to send your message.')
      setSuccess('Your message has been sent to the RecordsWeb team.')
      setForm(INITIAL_FORM)
    } catch (err) {
      setError(err?.message || 'Unable to send your message.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="public-home contact-page">
      <header className="public-home-header">
        <div className="public-home-brand" role="button" tabIndex={0} onClick={() => navigate('/')} onKeyDown={(e) => e.key === 'Enter' && navigate('/')}>
          <img className="public-home-wordmark" src={recordsWebWordmark} alt="RecordsWeb" />
          <span>Clinical records platform</span>
        </div>
        <nav>
          <button type="button" onClick={() => navigate('/')}><ArrowLeft size={15}/> Back to RecordsWeb</button>
          <button type="button" className="public-staff-button" onClick={() => navigate('/login')}>Staff sign in</button>
        </nav>
      </header>

      <main className="contact-main">
        <section className="contact-intro">
          <span className="public-eyebrow">CONTACT RECORDSWEB</span>
          <h1>Contact Us</h1>
          <p>Use this form for general questions, support enquiries, access questions or anything else relating to RecordsWeb.</p>
          <div className="contact-destination"><Mail size={18}/><div><strong>Messages are delivered to</strong><span>contactus@recordsweb.org</span></div></div>
        </section>

        <form className="public-request-form contact-form" onSubmit={submit}>
          <div className="public-form-grid">
            <label><span>Your name *</span><input value={form.name} onChange={(e) => update('name', e.target.value)} maxLength={120} autoComplete="name" required /></label>
            <label><span>Your email address *</span><input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} maxLength={254} autoComplete="email" required /></label>
            <label><span>Enquiry type *</span><select value={form.category} onChange={(e) => update('category', e.target.value)}><option>General enquiry</option><option>Technical support</option><option>Organisation access</option><option>Account assistance</option><option>Security or privacy</option><option>Feedback</option><option>Other</option></select></label>
            <label><span>Subject *</span><input value={form.subject} onChange={(e) => update('subject', e.target.value)} maxLength={160} required /></label>
            <label className="public-form-wide"><span>Message *</span><textarea value={form.message} onChange={(e) => update('message', e.target.value)} maxLength={5000} rows={9} placeholder="Tell us how we can help." required /></label>
            <label className="contact-honeypot" aria-hidden="true"><span>Website</span><input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => update('website', e.target.value)} /></label>
          </div>

          <p className="contact-reply-note">The email address you enter is attached as the reply address, so the RecordsWeb team can reply directly to you.</p>
          {error && <div className="public-request-message error">{error}</div>}
          {success && <div className="public-request-message success"><CheckCircle2 size={16}/>{success}</div>}
          <div className="public-request-actions"><button type="submit" className="public-primary" disabled={busy}><Send size={15}/>{busy ? 'Sending…' : 'Send message'}</button></div>
        </form>
      </main>

      <footer className="public-home-footer"><span>RecordsWeb · Contact</span><span>Version {APP_VERSION}</span></footer>
    </div>
  )
}
