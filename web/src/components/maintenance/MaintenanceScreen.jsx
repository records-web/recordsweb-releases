import React, { useEffect, useState } from 'react'
import { Clock3, RefreshCcw, ShieldCheck, Wrench } from 'lucide-react'
import { ORGANISATION } from '../../lib/demoData'
import { normaliseLoginName, signInRecordsWeb, signOut as supabaseSignOut, supabaseConfigured } from '../../lib/supabase'
import { applyOrganisationSettings, getCachedOrganisationSettings, loadOrganisationSettings } from '../../lib/organisationSettings'
import { APP_RUNTIME_LABEL, APP_VERSION } from '../../lib/webRuntime'

function formatEstimate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export default function MaintenanceScreen({ state, onRetry, onManagementLogin }) {
  const [appVersion] = useState(APP_VERSION)
  const [organisationSettings, setOrganisationSettings] = useState(() => getCachedOrganisationSettings())
  const [managementMode, setManagementMode] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    applyOrganisationSettings(organisationSettings)
    const sync = (event) => setOrganisationSettings(event?.detail || getCachedOrganisationSettings())
    window.addEventListener('recordsweb-organisation-settings-changed', sync)
    loadOrganisationSettings().then(setOrganisationSettings).catch(() => {})
    return () => window.removeEventListener('recordsweb-organisation-settings-changed', sync)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function managementSignIn(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await signInRecordsWeb({ username, password })
      if (!result?.profile?.is_management) {
        await supabaseSignOut()
        throw new Error('Management access is required while RecordsWeb is in maintenance mode.')
      }
      onManagementLogin(result)
    } catch (err) {
      const message = String(err?.message || '')
      setError(/rpc\(|\.catch|TypeError|schema cache/i.test(message)
        ? 'Unable to sign in to Management. Please try again or contact the system administrator.'
        : (message || 'Unable to sign in to Management.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="emis-login-screen">
      <div className="emis-login-window simplified-login-window maintenance-login-window">
        <div className="login-version">RecordsWeb {appVersion} · {APP_RUNTIME_LABEL}</div>

        <div className="legacy-brand-row simplified-brand-row">
          <div className="recordsweb-logo recordsweb-logo-text">
            {organisationSettings.logoUrl && <img draggable={false} className="login-organisation-logo" src={organisationSettings.logoUrl} alt={`${ORGANISATION.name} logo`} />}
            <strong>RecordsWeb</strong>
          </div>
          <div className="centre-lockup"><strong>{ORGANISATION.name}</strong><span>Health care records</span></div>
        </div>

        <div className="legacy-blue-rule" />

        {!managementMode ? (
          <section className="legacy-credentials maintenance-credentials">
            <div className="maintenance-heading"><Wrench size={19}/><div><h2>System maintenance</h2><span>RecordsWeb is temporarily unavailable.</span></div></div>
            <p className="maintenance-message">{state?.message}</p>
            {state?.estimated_end_at && <div className="maintenance-estimate"><Clock3 size={13}/><span>Estimated completion: <strong>{formatEstimate(state.estimated_end_at)}</strong></span></div>}
            <p className="maintenance-help">Staff will be able to sign in when maintenance has been completed.</p>
            <div className="legacy-login-actions maintenance-actions">
              <button type="button" className="legacy-signin" onClick={onRetry}><RefreshCcw size={13}/> Retry</button>
            </div>
            <div className="legacy-login-links maintenance-login-links">
              <button type="button" onClick={() => { setManagementMode(true); setError('') }}><ShieldCheck size={11}/> Management access</button>
            </div>
          </section>
        ) : (
          <section className="legacy-credentials simplified-credentials maintenance-management-login">
            <h2>Management access</h2>
            <p className="maintenance-help">Only active RecordsWeb Management accounts can sign in while maintenance mode is enabled.</p>
            <form onSubmit={managementSignIn} autoComplete="off">
              <label><span>Username</span><input value={username} onChange={(event) => setUsername(event.target.value)} onBlur={() => setUsername(normaliseLoginName(username))} placeholder="first.last@GW.HC" autoComplete="off" autoFocus required /></label>
              <label><span>Password</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="off" required /></label>
              {error && <div className="form-error legacy-error">{error}</div>}
              <div className="legacy-login-actions">
                <button className="legacy-signin" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
                <button type="button" className="legacy-close" onClick={() => { setManagementMode(false); setError(''); setPassword('') }}>Back</button>
              </div>
            </form>
          </section>
        )}

        <div className="legacy-login-footer"><span>Connection: {supabaseConfigured ? 'Grove Way Supabase' : 'Local demo database'}</span><span>Organisation: {ORGANISATION.org_code}</span></div>
        <div className="legacy-copyright">RecordsWeb · {ORGANISATION.name}. Prototype clinical software. Do not use with live patient data until security, information-governance and clinical-safety requirements have been completed.</div>
      </div>
    </div>
  )
}
