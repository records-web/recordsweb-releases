import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileCheck2,
  LogOut,
  Power,
  RefreshCw,
  Rocket,
  Save,
  ServerCog,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import recordsWebLogo from '../assets/recordsweb-update-logo.png'
import { useAuth } from '../contexts/AuthContext'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { APP_VERSION } from '../lib/webRuntime'
import {
  PLATFORM_OPERATOR_EMAIL_FORMAT,
  getPlatformMaintenanceState,
  getPlatformOperatorSession,
  isPlatformOperator,
  listPlatformReleases,
  publishPlatformRelease,
  setPlatformMaintenance,
  setPlatformReleaseActive,
  signInPlatformOperator,
  signOutPlatformOperator,
  verifyPlatformOperator,
} from '../lib/platformOperationsService'

function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function OperatorSignIn({ onSignedIn, currentSession }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const wrongAccount = currentSession?.user && !isPlatformOperator(currentSession)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (wrongAccount) await signOutPlatformOperator()
      const session = await signInPlatformOperator({ email, password })
      onSignedIn(session)
    } catch (err) {
      setError(err?.message || 'Unable to sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="review-request-auth-screen">
      <div className="review-request-auth-card">
        <div className="review-request-auth-brand">
          <img src={recordsWebLogo} alt="RecordsWeb" />
          <div><strong>RecordsWeb</strong><span>Platform management</span></div>
        </div>
        <div className="review-request-auth-rule" />
        <div className="review-request-auth-heading"><ShieldCheck size={20}/><div><strong>Restricted operator area</strong><span>Platform-wide controls are available only to the reserved RecordsWeb operator identity.</span></div></div>
        {wrongAccount && <div className="review-request-auth-warning">The currently signed-in account <strong>{currentSession.user.email}</strong> is not authorised for platform management.</div>}
        <form onSubmit={submit}>
          <label><span>Account email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={PLATFORM_OPERATOR_EMAIL_FORMAT} autoComplete="username" required /></label>
          <label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
          {error && <div className="review-request-auth-error">{error}</div>}
          <div className="review-request-auth-actions">
            <button type="button" onClick={() => navigate('/')}><ArrowLeft size={14}/> Home</button>
            <button className="review-request-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </div>
        </form>
        <div className="review-request-auth-footer">RecordsWeb {APP_VERSION}</div>
      </div>
    </div>
  )
}

function MaintenancePanel() {
  const [state, setState] = useState({ enabled: false, message: '', estimated_end_at: null })
  const [message, setMessage] = useState('')
  const [estimatedEnd, setEstimatedEnd] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const next = await getPlatformMaintenanceState()
      setState(next)
      setMessage(next.message || '')
      setEstimatedEnd(toLocalInput(next.estimated_end_at))
    } catch (err) {
      setError(err?.message || 'Unable to load platform maintenance state.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function save(enabled = state.enabled) {
    const isStateChange = enabled !== state.enabled
    if (isStateChange) {
      const question = enabled
        ? 'Enable platform maintenance for every RecordsWeb community? All community staff sessions will be signed out.'
        : 'End platform maintenance and allow all RecordsWeb communities to sign in again?'
      if (!window.confirm(question)) return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const next = await setPlatformMaintenance({
        enabled,
        message,
        estimatedEndAt: estimatedEnd ? new Date(estimatedEnd).toISOString() : null,
      })
      setState(next)
      setMessage(next.message || '')
      setEstimatedEnd(toLocalInput(next.estimated_end_at))
      setNotice(isStateChange ? (enabled ? 'Platform maintenance enabled.' : 'Platform maintenance ended.') : 'Maintenance details saved.')
    } catch (err) {
      setError(err?.message || 'Unable to update platform maintenance.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="platform-operator-panel">
      <header><div><span>GLOBAL CONTROL</span><h2>Platform maintenance</h2><p>This affects every RecordsWeb organisation, desktop app and staff website.</p></div><button onClick={load} disabled={busy}><RefreshCw size={14}/> Refresh</button></header>
      <div className={`platform-maintenance-state ${state.enabled ? 'enabled' : 'available'}`}>
        <Wrench size={20}/><div><strong>{state.enabled ? 'Platform maintenance enabled' : 'RecordsWeb available'}</strong><span>{state.enabled ? 'Community staff access is being blocked across RecordsWeb.' : 'All configured communities can use RecordsWeb normally.'}</span></div>
      </div>
      <div className="platform-form-grid">
        <label><span>Maintenance message</span><textarea rows={5} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} /><small>{message.length}/500</small></label>
        <label><span>Estimated completion <em>Optional</em></span><div className="platform-date-input"><Clock3 size={14}/><input type="datetime-local" value={estimatedEnd} onChange={(e) => setEstimatedEnd(e.target.value)} /></div></label>
      </div>
      {state.enabled_at && <div className="platform-meta">Enabled {formatDate(state.enabled_at)}{state.enabled_by_name ? ` by ${state.enabled_by_name}` : ''}</div>}
      {error && <div className="review-request-message error">{error}</div>}
      {notice && <div className="review-request-message success"><CheckCircle2 size={15}/>{notice}</div>}
      <div className="platform-panel-actions">
        <button className={state.enabled ? 'danger' : 'primary'} disabled={busy} onClick={() => save(!state.enabled)}><Power size={14}/>{state.enabled ? 'End maintenance' : 'Enable maintenance'}</button>
        <button disabled={busy} onClick={() => save(state.enabled)}><Save size={14}/> Save details</button>
      </div>
    </section>
  )
}

function ReleasesPanel() {
  const [rows, setRows] = useState([])
  const [version, setVersion] = useState('')
  const [channel, setChannel] = useState('stable')
  const [notes, setNotes] = useState('')
  const [active, setActive] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setError('')
    try { setRows(await listPlatformReleases()) }
    catch (err) { setError(err?.message || 'Unable to load releases.') }
  }, [])
  useEffect(() => { load() }, [load])

  async function submit(event) {
    event.preventDefault()
    if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version.trim())) {
      setError('Enter a semantic version such as 3.2.1.')
      return
    }
    if (!window.confirm(`Publish RecordsWeb ${version.trim()} to the ${channel.trim()} channel? Only do this after the website and matching desktop release are ready.`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await publishPlatformRelease({ version, channel, releaseNotes: notes, active })
      setNotice(`RecordsWeb ${version.trim()} published to ${channel.trim()}.`)
      setNotes('')
      await load()
    } catch (err) { setError(err?.message || 'Unable to publish release.') }
    finally { setBusy(false) }
  }

  async function toggle(row) {
    setBusy(true); setError(''); setNotice('')
    try {
      await setPlatformReleaseActive(row.id, !row.active)
      setNotice(`${row.version} is now ${row.active ? 'inactive' : 'active'}.`)
      await load()
    } catch (err) { setError(err?.message || 'Unable to update release.') }
    finally { setBusy(false) }
  }

  return (
    <section className="platform-operator-panel">
      <header><div><span>GLOBAL CONTROL</span><h2>RecordsWeb releases</h2><p>Publishing an active release can trigger desktop updates and the website refresh prompt.</p></div><button onClick={load} disabled={busy}><RefreshCw size={14}/> Refresh</button></header>
      <form className="platform-release-form" onSubmit={submit}>
        <label><span>Version</span><input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="3.2.2" required /></label>
        <label><span>Channel</span><select value={channel} onChange={(e) => setChannel(e.target.value)}><option value="stable">stable</option><option value="web">web</option><option value="beta">beta</option></select></label>
        <label className="platform-release-notes"><span>Release notes</span><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What changed in this release?" /></label>
        <label className="platform-checkbox"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Publish as active</span></label>
        <button className="primary" disabled={busy}><Rocket size={14}/>{busy ? 'Publishing…' : 'Publish release'}</button>
      </form>
      {error && <div className="review-request-message error">{error}</div>}
      {notice && <div className="review-request-message success"><CheckCircle2 size={15}/>{notice}</div>}
      <div className="platform-release-list">
        <div className="platform-release-list-head"><strong>Release history</strong><span>{rows.length}</span></div>
        {rows.length === 0 && <div className="platform-empty">No releases found.</div>}
        {rows.map((row) => <div className="platform-release-row" key={row.id}><div><strong>{row.version}</strong><span>{row.channel}</span></div><div><span>{row.release_notes || 'No release notes'}</span><small>{formatDate(row.published_at)}</small></div><button className={row.active ? 'active' : ''} onClick={() => toggle(row)} disabled={busy}>{row.active ? 'Active' : 'Inactive'}</button></div>)}
      </div>
    </section>
  )
}

export default function PlatformManagementPage() {
  const navigate = useNavigate()
  const { session: clinicalSession, logout: logoutClinicalSession } = useAuth()
  const [authReady, setAuthReady] = useState(false)
  const [operatorSession, setOperatorSession] = useState(null)
  const [serverAuthorised, setServerAuthorised] = useState(false)
  const [section, setSection] = useState('overview')
  const [authError, setAuthError] = useState('')

  const clientAuthorised = isPlatformOperator(operatorSession)
  const authorised = clientAuthorised && serverAuthorised

  useEffect(() => {
    let live = true
    if (!supabaseConfigured || !supabase) { setAuthReady(true); return undefined }
    getPlatformOperatorSession().then(async (session) => {
      if (!live) return
      setOperatorSession(session)
      if (isPlatformOperator(session)) {
        try { setServerAuthorised(await verifyPlatformOperator()) }
        catch (err) { if (live) setAuthError(err?.message || 'Unable to verify platform access.') }
      }
    }).catch(() => {}).finally(() => { if (live) setAuthReady(true) })
    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!live) return
      setOperatorSession(session)
      setServerAuthorised(false)
      if (isPlatformOperator(session)) {
        try { setServerAuthorised(await verifyPlatformOperator()) }
        catch (err) { if (live) setAuthError(err?.message || 'Unable to verify platform access.') }
      }
      setAuthReady(true)
    })
    return () => { live = false; data?.subscription?.unsubscribe?.() }
  }, [])

  async function signedIn(session) {
    setOperatorSession(session)
    setAuthError('')
    try { setServerAuthorised(await verifyPlatformOperator()) }
    catch (err) { setAuthError(err?.message || 'Unable to verify platform access.') }
  }

  async function logoutOperator() {
    await signOutPlatformOperator().catch(() => {})
    setOperatorSession(null)
    setServerAuthorised(false)
    navigate('/')
  }

  if (!authReady) return <div className="review-request-loading">Checking platform management access…</div>
  if (!supabaseConfigured) return <div className="review-request-loading"><div><strong>Platform management unavailable</strong><span>Supabase must be configured.</span><button onClick={() => navigate('/')}>Return home</button></div></div>
  if (clinicalSession && !isPlatformOperator(clinicalSession)) {
    return <div className="review-request-loading"><div><strong>Sign out of the staff session first</strong><span>Platform management requires the reserved {PLATFORM_OPERATOR_EMAIL_FORMAT} operator identity.</span><button onClick={async () => { await logoutClinicalSession('platform_operator_switch'); setOperatorSession(null); setServerAuthorised(false) }}>Sign out staff account</button><button onClick={() => navigate('/')}>Return home</button></div></div>
  }
  if (!authorised) return <><OperatorSignIn currentSession={operatorSession} onSignedIn={signedIn}/>{authError ? <div className="platform-auth-floating-error">{authError}</div> : null}</>

  return (
    <div className="platform-management-page">
      <header className="review-request-header">
        <div className="review-request-brand"><img src={recordsWebLogo} alt="RecordsWeb"/><div><strong>RecordsWeb</strong><span>Platform management</span></div></div>
        <div className="review-request-header-actions"><span><ShieldCheck size={14}/>{operatorSession?.user?.email}</span><button onClick={() => navigate('/')}><ArrowLeft size={14}/> Home</button><button onClick={logoutOperator}><LogOut size={14}/> Sign out</button></div>
      </header>

      <main className="platform-management-main">
        <section className="review-request-titlebar">
          <div><span>RECORDSWEB OPERATOR</span><h1>Platform management</h1><p>Controls here affect the RecordsWeb platform itself and are deliberately unavailable inside community Management.</p></div>
        </section>

        <div className="platform-management-tabs">
          <button className={section === 'overview' ? 'active' : ''} onClick={() => setSection('overview')}><Activity size={14}/> Overview</button>
          <button className={section === 'maintenance' ? 'active' : ''} onClick={() => setSection('maintenance')}><Wrench size={14}/> Maintenance</button>
          <button className={section === 'releases' ? 'active' : ''} onClick={() => setSection('releases')}><Rocket size={14}/> Releases</button>
          <button onClick={() => navigate('/review-request')}><FileCheck2 size={14}/> Review requests</button>
        </div>

        {section === 'overview' && <section className="platform-overview-grid">
          <button onClick={() => setSection('maintenance')}><Wrench size={22}/><div><strong>Platform maintenance</strong><span>Temporarily block all community staff access across RecordsWeb.</span></div></button>
          <button onClick={() => setSection('releases')}><Rocket size={22}/><div><strong>Release control</strong><span>Publish the active version used by desktop and website update checks.</span></div></button>
          <button onClick={() => navigate('/review-request')}><FileCheck2 size={22}/><div><strong>Access requests</strong><span>Review communities requesting a RecordsWeb deployment.</span></div></button>
          <div><ServerCog size={22}/><div><strong>Operator-only controls</strong><span>Community managers cannot access or change these platform-wide settings.</span></div></div>
        </section>}
        {section === 'maintenance' && <MaintenancePanel />}
        {section === 'releases' && <ReleasesPanel />}
      </main>
      <footer className="review-request-footer"><span>RecordsWeb · Restricted platform operator area</span><span>Version {APP_VERSION}</span></footer>
    </div>
  )
}
