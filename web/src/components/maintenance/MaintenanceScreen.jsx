import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Clock3, RefreshCcw, ShieldCheck, Wrench } from 'lucide-react'
import { ORGANISATION } from '../../lib/demoData'
import recordsWebIcon from '../../assets/recordsweb-update-logo.png'
import { getInstalledOrganisationCode } from '../../lib/installation'
import { supabaseConfigured } from '../../lib/supabase'
import { APP_VERSION } from '../../lib/webRuntime'
import { applyOrganisationSettings, getCachedOrganisationSettings, loadOrganisationSettings } from '../../lib/organisationSettings'

function formatEstimate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export default function MaintenanceScreen({ state, onRetry }) {
  const navigate = useNavigate()
  const [appVersion] = useState(APP_VERSION)
  const [organisationSettings, setOrganisationSettings] = useState(() => getCachedOrganisationSettings())

  useEffect(() => {
    applyOrganisationSettings(organisationSettings)
    const sync = (event) => setOrganisationSettings(event?.detail || getCachedOrganisationSettings())
    window.addEventListener('recordsweb-organisation-settings-changed', sync)
    loadOrganisationSettings().then(setOrganisationSettings).catch(() => {})
    return () => window.removeEventListener('recordsweb-organisation-settings-changed', sync)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const organisationName = organisationSettings.organisationName || ORGANISATION.name
  const organisationCode = organisationSettings.organisationCode || getInstalledOrganisationCode() || ORGANISATION.org_code

  return (
    <div className="emis-login-screen">
      <div className="emis-login-window simplified-login-window maintenance-login-window">
        <div className="login-version">RecordsWeb {appVersion} · Web Clinical System</div>

        <div className="legacy-brand-row simplified-brand-row">
          <div className="recordsweb-logo recordsweb-logo-text">
            <img draggable={false} className="login-organisation-logo recordsweb-fixed-logo" src={recordsWebIcon} alt="RecordsWeb" />
            <strong>RecordsWeb</strong>
          </div>
          <div className="centre-lockup"><strong>{organisationName}</strong><span>Health care records</span></div>
        </div>

        <div className="legacy-blue-rule" />

        <section className="legacy-credentials maintenance-credentials">
          <div className="maintenance-heading"><Wrench size={19}/><div><h2>RecordsWeb maintenance</h2><span>The RecordsWeb platform is temporarily unavailable.</span></div></div>
          <p className="maintenance-message">{state?.message}</p>
          {state?.estimated_end_at && <div className="maintenance-estimate"><Clock3 size={13}/><span>Estimated completion: <strong>{formatEstimate(state.estimated_end_at)}</strong></span></div>}
          <p className="maintenance-help">Clinical and community staff access is temporarily blocked. The public website, service status and restricted Platform Management area remain available during maintenance.</p>
          <div className="maintenance-public-links">
            <button type="button" onClick={() => navigate('/status')}><ArrowRight size={13}/> Service status</button>
            <button type="button" onClick={() => navigate('/')}><ArrowRight size={13}/> Public website</button>
            <button type="button" onClick={() => navigate('/contact')}><ArrowRight size={13}/> Contact</button>
            <button type="button" onClick={() => navigate('/platform-management')}><ShieldCheck size={13}/> Platform management</button>
          </div>
          <div className="legacy-login-actions maintenance-actions">
            <button type="button" className="legacy-signin" onClick={onRetry}><RefreshCcw size={13}/> Retry clinical access</button>
          </div>
        </section>

        <div className="legacy-login-footer"><span>Connection: {supabaseConfigured ? 'RecordsWeb Supabase' : 'Local demo database'}</span><span>Organisation: {organisationCode}</span></div>
        <div className="legacy-copyright">RecordsWeb · {organisationName}. Prototype clinical software. Do not use with live patient data until security, information-governance and clinical-safety requirements have been completed.</div>
      </div>
    </div>
  )
}
