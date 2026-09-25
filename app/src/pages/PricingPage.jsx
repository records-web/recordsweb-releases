import React, { useEffect } from 'react'
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Mail, Megaphone, ShieldCheck, Stethoscope, ClipboardList, Layers } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import recordsWebWordmark from '../assets/RW-Logo.png'
import { APP_VERSION } from '../lib/webRuntime'
import { applyRecordsWebProductBrand } from '../lib/organisationSettings'

const INCLUDED = [
  'Full RecordsWeb organisation workspace',
  'Patient records and registration',
  'Consultations and clinical notes',
  'Medication, problems and investigations',
  'Documents and fit notes',
  'Appointments and waiting-time workflow',
  'Staff and organisation management',
  'Desktop and web access',
  'RecordsWeb updates and support',
]

export default function PricingPage() {
  const navigate = useNavigate()

  useEffect(() => { applyRecordsWebProductBrand() }, [])

  function requestAccess() {
    navigate('/#request-access')
  }

  return (
    <div className="public-home pricing-page">
      <header className="public-home-header">
        <div className="public-home-brand" role="button" tabIndex={0} onClick={() => navigate('/')} onKeyDown={(event) => event.key === 'Enter' && navigate('/')}>
          <img className="public-home-wordmark" src={recordsWebWordmark} alt="RecordsWeb" />
          <span>Your daily operations</span>
        </div>
        <nav>
          <button type="button" onClick={() => navigate('/')}><ArrowLeft size={15}/> Back to RecordsWeb</button>
          <button type="button" onClick={() => navigate('/status')}>Status</button>
          <button type="button" onClick={() => navigate('/contact')}>Contact Us <Mail size={14}/></button>
          <button type="button" className="public-staff-button" onClick={() => navigate('/login')}>Staff sign in <ArrowRight size={15}/></button>
        </nav>
      </header>

      <main className="pricing-main">
        <section className="pricing-hero">
          <span className="public-eyebrow">RECORDSWEB PRICING</span>
          <h1>Choose the RecordsWeb product package that fits your community.</h1>
          <p>RecordsWeb 5 separates Clinical and Policing into product entitlements. Complete communities can use both from the same staff account.</p>
        </section>

        <section className="pricing-layout">
          <article className="pricing-card pricing-card-primary">
            <div className="pricing-card-heading">
              <div><span>CLINICAL</span><h2>RecordsWeb Clinical</h2></div>
              <Stethoscope size={24}/>
            </div>

            <div className="pricing-amount"><strong>£9.50</strong><span>/ month</span></div>
            <p className="pricing-card-lead">Full access to RecordsWeb Clinical for one approved organisation. Existing RecordsWeb pricing remains the baseline for Clinical communities.</p>

            <div className="pricing-offer">
              <strong>New organisation offer</strong>
              <span><b>£5 for the first month</b>, with the normal £7 one-off setup fee included in that introductory price.</span>
            </div>

            <div className="pricing-feature-list">
              {INCLUDED.map((item) => <div key={item}><CheckCircle2 size={16}/><span>{item}</span></div>)}
            </div>

            <button type="button" className="public-primary pricing-cta" onClick={requestAccess}>Request RecordsWeb access <ArrowRight size={15}/></button>
          </article>

          <div className="pricing-side-column recordsweb-v5-package-column">
            <article className="pricing-card"><div className="pricing-card-heading"><div><span>POLICING</span><h2>RecordsWeb Policing</h2></div><ClipboardList size={23}/></div><p>Operational policing records including persons, vehicles, incidents, FPNs, intelligence, custody, warrants, BOLO and dispatch registers.</p><strong className="recordsweb-price-configured">Pricing agreed per approved community</strong></article>
            <article className="pricing-card"><div className="pricing-card-heading"><div><span>COMPLETE</span><h2>RecordsWeb Complete</h2></div><Layers size={23}/></div><p>Clinical + Policing under one RecordsWeb organisation. Complete is intended to cost less than purchasing the two products separately once package pricing is configured.</p><strong className="recordsweb-price-configured">Bundle pricing agreed during setup</strong></article>
          </div>

          <div className="pricing-side-column">
            <article className="pricing-card">
              <div className="pricing-card-heading"><div><span>OPTIONAL INTEGRATION</span><h2>In-game announcement board</h2></div><Megaphone size={23}/></div>
              <div className="pricing-addon-price"><strong>£10</strong><span>one-off</span></div>
              <p>Add the RecordsWeb announcement board with audio to a supported game experience and keep it synchronised with your RecordsWeb organisation.</p>
              <small>Integration availability depends on the organisation's game setup and required implementation work.</small>
            </article>

            <article className="pricing-card">
              <div className="pricing-card-heading"><div><span>EXTRA SERVICES</span><h2>Organisation-specific work</h2></div><ShieldCheck size={23}/></div>
              <p>RecordsWeb can accommodate additional services, integrations or implementation work where practical. Any extra cost is agreed before work begins.</p>
              <button type="button" className="public-secondary pricing-secondary-cta" onClick={() => navigate('/contact')}>Discuss an extra service <Mail size={14}/></button>
            </article>
          </div>
        </section>

        <section className="pricing-notes">
          <h2>How billing works</h2>
          <div className="pricing-note-grid">
            <div><strong>First month</strong><span>Eligible new Clinical organisations pay £5 for their first month. The normal £7 setup fee is included in that introductory price unless another package arrangement has been agreed.</span></div>
            <div><strong>After the first month</strong><span>The standard RecordsWeb Clinical subscription is £9.50 per month. Policing and Complete pricing is agreed separately until dedicated package pricing is configured.</span></div>
            <div><strong>Additional work</strong><span>Optional integrations and bespoke services are quoted separately and are never added without agreement.</span></div>
          </div>
          <p className="pricing-disclaimer">RecordsWeb is a fictional roleplay/simulation operations platform. Clinical modules are not NHS services and Policing modules are not connected to real law-enforcement systems.</p>
        </section>
      </main>

      <footer className="public-home-footer"><span>RecordsWeb · Pricing</span><div className="public-home-footer-actions"><button type="button" onClick={() => navigate('/status')}>Status</button><button type="button" onClick={() => navigate('/privacy')}>Privacy</button><button type="button" onClick={() => navigate('/terms')}>Terms</button><button type="button" onClick={() => navigate('/contact')}>Contact Us</button><span>Version {APP_VERSION}</span></div></footer>
    </div>
  )
}
