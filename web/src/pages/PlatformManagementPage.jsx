import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock3,
  FileCheck2,
  LogOut,
  KeyRound,
  Pencil,
  Power,
  RefreshCw,
  Rocket,
  Save,
  ServerCog,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import recordsWebLogo from '../assets/recordsweb-update-logo.png'
import { useAuth } from '../contexts/AuthContext'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { APP_VERSION } from '../lib/webRuntime'
import { applyRecordsWebProductBrand } from '../lib/organisationSettings'
import { validateRecordsWebPassword } from '../lib/passwordPolicy'
import {
  PLATFORM_OPERATOR_EMAIL_FORMAT,
  createPlatformCommunity,
  getPlatformMaintenanceState,
  getPlatformOperatorSession,
  isPlatformOperator,
  listPlatformCommunities,
  listPlatformReleases,
  publishPlatformRelease,
  setPlatformCommunityActive,
  setPlatformCommunityOperatorPassword,
  setPlatformMaintenance,
  setPlatformReleaseActive,
  signInPlatformOperator,
  signOutPlatformOperator,
  updatePlatformCommunity,
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
        <label><span>Version</span><input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="3.2.4" required /></label>
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


function normaliseCommunityCode(value) {
  return String(value || '').trim().replace(/^@+/, '').replace(/\s+/g, '').toUpperCase()
}

function CommunitiesPanel({ operatorAccountEmail = '' }) {
  const [rows, setRows] = useState([])
  const [communityName, setCommunityName] = useState('')
  const [organisationCode, setOrganisationCode] = useState('')
  const [systemMode, setSystemMode] = useState('general_practice')
  const [defaultLocation, setDefaultLocation] = useState('Main Site')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editCommunity, setEditCommunity] = useState(null)
  const [editName, setEditName] = useState('')
  const [editMode, setEditMode] = useState('general_practice')
  const [editLocation, setEditLocation] = useState('')
  const [operatorCommunity, setOperatorCommunity] = useState(null)
  const [operatorPassword, setOperatorPassword] = useState('')
  const [operatorConfirmPassword, setOperatorConfirmPassword] = useState('')

  const cleanCode = useMemo(() => normaliseCommunityCode(organisationCode), [organisationCode])
  const operatorEmail = `gus.farnsworth@${/^[A-Z]{2}\.[A-Z]{2}$/.test(cleanCode) ? cleanCode : 'XX.XX'}`
  const currentOperatorCode = useMemo(() => {
    const suffix = String(operatorAccountEmail || '').split('@')[1] || ''
    return normaliseCommunityCode(suffix)
  }, [operatorAccountEmail])

  const load = useCallback(async () => {
    setError('')
    try { setRows(await listPlatformCommunities()) }
    catch (err) { setError(err?.message || 'Unable to load RecordsWeb communities.') }
  }, [])

  useEffect(() => { load() }, [load])

  async function submit(event) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (!/^[A-Z]{2}\.[A-Z]{2}$/.test(cleanCode)) {
      setError('Enter the community extension using four letters in the format @XX.XX.')
      return
    }
    if (!communityName.trim()) {
      setError('Enter the community name.')
      return
    }
    if (!defaultLocation.trim()) {
      setError('Enter the default location.')
      return
    }
    const passwordError = validateRecordsWebPassword(password, operatorEmail)
    if (passwordError) {
      setError(passwordError)
      return
    }
    if (password !== confirmPassword) {
      setError('The password confirmation does not match.')
      return
    }

    const accountEmail = `gus.farnsworth@${cleanCode}`
    if (!window.confirm(`Create ${communityName.trim()} as @${cleanCode} and create the reserved operator account ${accountEmail}?`)) return

    setBusy(true)
    try {
      const result = await createPlatformCommunity({
        organisationCode: cleanCode,
        communityName: communityName.trim(),
        systemMode,
        defaultLocation: defaultLocation.trim(),
        password,
      })
      setNotice(`${result?.community?.name || communityName.trim()} created. Operator account: ${result?.operator_email || accountEmail}`)
      setCommunityName('')
      setOrganisationCode('')
      setSystemMode('general_practice')
      setDefaultLocation('Main Site')
      setPassword('')
      setConfirmPassword('')
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to create the RecordsWeb community.')
    } finally {
      setBusy(false)
    }
  }

  function openEdit(row) {
    setError('')
    setNotice('')
    setEditCommunity(row)
    setEditName(row.name || '')
    setEditMode(row.system_mode || 'general_practice')
    setEditLocation(row.default_location || 'Main Site')
  }

  async function saveEdit(event) {
    event.preventDefault()
    if (!editCommunity) return
    if (!editName.trim()) { setError('Enter the community name.'); return }
    if (!editLocation.trim()) { setError('Enter the default location.'); return }
    if (!window.confirm(`Save changes to ${editCommunity.name} (@${editCommunity.org_code})?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await updatePlatformCommunity({
        organisationId: editCommunity.id,
        communityName: editName.trim(),
        systemMode: editMode,
        defaultLocation: editLocation.trim(),
      })
      setNotice(`${result?.community?.name || editName.trim()} updated.`)
      setEditCommunity(null)
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to update the community.')
    } finally { setBusy(false) }
  }

  async function toggleCommunity(row) {
    const nextActive = !row.active
    if (!nextActive && row.org_code === currentOperatorCode) {
      setError(`You cannot disable @${row.org_code} while signed in through that community. Sign in with a reserved operator account from another active community first.`)
      return
    }
    const question = nextActive
      ? `Enable ${row.name} (@${row.org_code})? Staff will be able to sign in again.`
      : `Disable ${row.name} (@${row.org_code})? New sign-ins and database access for that community will be blocked until it is enabled again.`
    if (!window.confirm(question)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await setPlatformCommunityActive(row.id, nextActive)
      setNotice(`${result?.community?.name || row.name} is now ${nextActive ? 'enabled' : 'disabled'}.`)
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to change community status.')
    } finally { setBusy(false) }
  }

  function openOperator(row) {
    setError('')
    setNotice('')
    setOperatorCommunity(row)
    setOperatorPassword('')
    setOperatorConfirmPassword('')
  }

  async function saveOperatorPassword(event) {
    event.preventDefault()
    if (!operatorCommunity) return
    const reservedEmail = `gus.farnsworth@${operatorCommunity.org_code}`
    const passwordError = validateRecordsWebPassword(operatorPassword, reservedEmail)
    if (passwordError) { setError(passwordError); return }
    if (operatorPassword !== operatorConfirmPassword) { setError('The password confirmation does not match.'); return }
    if (!operatorCommunity.active && !operatorCommunity.has_reserved_operator) {
      setError('Enable the community before creating its missing reserved operator account.')
      return
    }
    const actionLabel = operatorCommunity.has_reserved_operator ? 'reset the password for' : 'create'
    if (!window.confirm(`${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)} ${reservedEmail}?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await setPlatformCommunityOperatorPassword({ organisationId: operatorCommunity.id, password: operatorPassword })
      setNotice(result?.created
        ? `Reserved operator ${result.operator_email || reservedEmail} created.`
        : `Password reset for ${result?.operator_email || reservedEmail}.`)
      setOperatorCommunity(null)
      setOperatorPassword('')
      setOperatorConfirmPassword('')
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to update the reserved operator account.')
    } finally { setBusy(false) }
  }

  return (
    <section className="platform-operator-panel">
      <header>
        <div><span>OPERATOR ONLY</span><h2>Community management</h2><p>Create, edit, enable or disable RecordsWeb communities and manage their reserved operator account.</p></div>
        <button onClick={load} disabled={busy}><RefreshCw size={14}/> Refresh</button>
      </header>

      <form className="platform-community-form" onSubmit={submit}>
        <div className="platform-community-grid">
          <label><span>Community name</span><input value={communityName} onChange={(e) => setCommunityName(e.target.value)} placeholder="Community or organisation name" maxLength={120} required /></label>
          <label><span>Organisation extension</span><div className="platform-community-code"><b>@</b><input value={organisationCode} onChange={(e) => setOrganisationCode(e.target.value.replace(/^@+/, '').replace(/\s+/g, '').toUpperCase())} placeholder="XX.XX" maxLength={5} required /></div><small>Four letters in the format @XX.XX. The extension becomes the permanent login namespace.</small></label>
          <label><span>RecordsWeb mode</span><select value={systemMode} onChange={(e) => setSystemMode(e.target.value)}><option value="general_practice">General Practitioner</option><option value="hospital">Hospital</option></select></label>
          <label><span>Default location</span><input value={defaultLocation} onChange={(e) => setDefaultLocation(e.target.value)} placeholder="Main Site" maxLength={120} required /></label>
        </div>

        <div className="platform-community-operator">
          <div className="platform-community-operator-heading"><UserPlus size={18}/><div><strong>Reserved operator account</strong><span>This account is created automatically and receives Management access in the new community.</span></div></div>
          <div className="platform-community-grid">
            <label><span>Account email</span><input value={operatorEmail} readOnly /></label>
            <label><span>Initial password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required /></label>
            <label><span>Confirm password</span><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required /></label>
          </div>
          <p className="platform-community-password-help">Minimum 10 characters with at least one letter and one number. The password is sent only to the protected Supabase Edge Function and is never stored in the website.</p>
        </div>

        {error && <div className="review-request-message error">{error}</div>}
        {notice && <div className="review-request-message success"><CheckCircle2 size={15}/>{notice}</div>}
        <div className="platform-panel-actions"><button className="primary" disabled={busy}><Building2 size={14}/>{busy ? 'Creating community…' : 'Create community'}</button></div>
      </form>

      <div className="platform-community-list">
        <div className="platform-release-list-head"><strong>RecordsWeb communities</strong><span>{rows.length}</span></div>
        {rows.length === 0 && <div className="platform-empty">No communities found.</div>}
        {rows.map((row) => (
          <div className={`platform-community-row ${row.active ? '' : 'disabled'}`} key={row.id}>
            <div><strong>{row.name}</strong><span>@{row.org_code}</span></div>
            <div><span>{row.system_mode === 'hospital' ? 'Hospital' : 'General Practitioner'}</span><small>{row.default_location || 'Main Site'}</small></div>
            <div><span className={row.active ? 'community-active' : 'community-inactive'}>{row.active ? 'Active' : 'Disabled'}</span><small>{row.has_reserved_operator ? 'Operator ready' : 'Operator missing'}</small></div>
            <div className="platform-community-actions">
              <button onClick={() => openEdit(row)} disabled={busy} title="Edit community"><Pencil size={13}/> Edit</button>
              <button onClick={() => toggleCommunity(row)} disabled={busy || (!row.active && false)} className={row.active ? 'danger-soft' : 'success-soft'} title={row.active ? 'Disable community' : 'Enable community'}><Power size={13}/>{row.active ? 'Disable' : 'Enable'}</button>
              <button onClick={() => openOperator(row)} disabled={busy} title={row.has_reserved_operator ? 'Reset reserved operator password' : 'Create reserved operator'}>{row.has_reserved_operator ? <KeyRound size={13}/> : <UserCheck size={13}/>} {row.has_reserved_operator ? 'Password' : 'Create operator'}</button>
            </div>
          </div>
        ))}
      </div>

      {editCommunity && <div className="platform-community-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setEditCommunity(null) }}>
        <form className="platform-community-modal" onSubmit={saveEdit}>
          <header><div><span>EDIT COMMUNITY</span><h3>{editCommunity.name}</h3><p>@{editCommunity.org_code}</p></div><button type="button" onClick={() => setEditCommunity(null)} disabled={busy} aria-label="Close"><X size={16}/></button></header>
          <div className="platform-community-modal-body">
            <label><span>Community name</span><input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={120} required /></label>
            <label><span>RecordsWeb mode</span><select value={editMode} onChange={(e) => setEditMode(e.target.value)}><option value="general_practice">General Practitioner</option><option value="hospital">Hospital</option></select></label>
            <label><span>Default location</span><input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} maxLength={120} required /></label>
            <label><span>Organisation extension</span><input value={`@${editCommunity.org_code}`} readOnly /><small>The extension is permanent because it is used as the account login namespace.</small></label>
          </div>
          <div className="platform-community-modal-actions"><button type="button" onClick={() => setEditCommunity(null)} disabled={busy}>Cancel</button><button className="primary" disabled={busy}><Save size={13}/>{busy ? 'Saving…' : 'Save changes'}</button></div>
        </form>
      </div>}

      {operatorCommunity && <div className="platform-community-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setOperatorCommunity(null) }}>
        <form className="platform-community-modal" onSubmit={saveOperatorPassword}>
          <header><div><span>RESERVED OPERATOR</span><h3>{operatorCommunity.has_reserved_operator ? 'Reset operator password' : 'Create missing operator'}</h3><p>gus.farnsworth@{operatorCommunity.org_code}</p></div><button type="button" onClick={() => setOperatorCommunity(null)} disabled={busy} aria-label="Close"><X size={16}/></button></header>
          <div className="platform-community-modal-body">
            <label><span>{operatorCommunity.has_reserved_operator ? 'New password' : 'Initial password'}</span><input type="password" value={operatorPassword} onChange={(e) => setOperatorPassword(e.target.value)} autoComplete="new-password" required /></label>
            <label><span>Confirm password</span><input type="password" value={operatorConfirmPassword} onChange={(e) => setOperatorConfirmPassword(e.target.value)} autoComplete="new-password" required /></label>
            <div className="platform-community-modal-note">{operatorCommunity.has_reserved_operator ? 'The existing operator account remains linked to this community. Only its password changes.' : 'A new reserved operator profile will be created and linked to this community.'}</div>
          </div>
          <div className="platform-community-modal-actions"><button type="button" onClick={() => setOperatorCommunity(null)} disabled={busy}>Cancel</button><button className="primary" disabled={busy}><KeyRound size={13}/>{busy ? 'Saving…' : (operatorCommunity.has_reserved_operator ? 'Reset password' : 'Create operator')}</button></div>
        </form>
      </div>}
    </section>
  )
}

export default function PlatformManagementPage() {
  useEffect(() => { applyRecordsWebProductBrand() }, [])
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
          <button className={section === 'communities' ? 'active' : ''} onClick={() => setSection('communities')}><Building2 size={14}/> Communities</button>
          <button onClick={() => navigate('/review-request')}><FileCheck2 size={14}/> Review requests</button>
        </div>

        {section === 'overview' && <section className="platform-overview-grid">
          <button onClick={() => setSection('maintenance')}><Wrench size={22}/><div><strong>Platform maintenance</strong><span>Temporarily block all community staff access across RecordsWeb.</span></div></button>
          <button onClick={() => setSection('releases')}><Rocket size={22}/><div><strong>Release control</strong><span>Publish the active version used by desktop and website update checks.</span></div></button>
          <button onClick={() => setSection('communities')}><Building2 size={22}/><div><strong>Community management</strong><span>Create, edit, enable or disable RecordsWeb communities and manage reserved operators.</span></div></button>
          <button onClick={() => navigate('/review-request')}><FileCheck2 size={22}/><div><strong>Access requests</strong><span>Review communities requesting a RecordsWeb deployment.</span></div></button>
          <div><ServerCog size={22}/><div><strong>Operator-only controls</strong><span>Community managers cannot access or change these platform-wide settings.</span></div></div>
        </section>}
        {section === 'maintenance' && <MaintenancePanel />}
        {section === 'releases' && <ReleasesPanel />}
        {section === 'communities' && <CommunitiesPanel operatorAccountEmail={operatorSession?.user?.email || ''} />}
      </main>
      <footer className="review-request-footer"><span>RecordsWeb · Restricted platform operator area</span><span>Version {APP_VERSION}</span></footer>
    </div>
  )
}
