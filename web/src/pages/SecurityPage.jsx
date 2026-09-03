import React, { useEffect, useState } from 'react'
import { Building2, CheckCircle2, Clock3, History, KeyRound, LockKeyhole, LogOut, ShieldCheck, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Panel from '../components/Panel'
import { useAuth } from '../contexts/AuthContext'
import { changeOwnPassword } from '../lib/supabase'
import { hasRecoveryCode, setRecoveryCode } from '../lib/recoverySecurity'
import { listMyAccountActivity, recordAudit } from '../lib/auditService'
import { hasPrescribingPin, setPrescribingPin } from '../lib/prescribingSecurity'
import { getSettings } from '../lib/settings'
import { ORGANISATION } from '../lib/demoData'

export default function SecurityPage() {
  const { session, logout, updateProfile } = useAuth()
  const navigate = useNavigate()
  const profile = session?.profile || {}
  const username = profile.username || session?.user?.email || ''
  const roles = profile.roles?.length ? profile.roles : [profile.role || 'Patient Coordinator']
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const [pinConfigured, setPinConfigured] = useState(null)
  const [pinForm, setPinForm] = useState({ current: '', next: '', confirm: '' })
  const [pinError, setPinError] = useState('')
  const [pinSuccess, setPinSuccess] = useState('')
  const [pinSaving, setPinSaving] = useState(false)
  const [recoveryConfigured, setRecoveryConfigured] = useState(null)
  const [recoveryForm, setRecoveryForm] = useState({ current: '', next: '', confirm: '' })
  const [recoveryError, setRecoveryError] = useState('')
  const [recoverySuccess, setRecoverySuccess] = useState('')
  const [recoverySaving, setRecoverySaving] = useState(false)
  const [activity, setActivity] = useState([])

  useEffect(() => {
    hasPrescribingPin().then(setPinConfigured).catch((err) => { setPinConfigured(false); setPinError(err.message || 'Unable to check prescribing PIN.') })
    hasRecoveryCode(session?.user?.id || profile?.id).then(setRecoveryConfigured).catch((err) => { setRecoveryConfigured(false); setRecoveryError(err.message || 'Unable to check recovery code.') })
    listMyAccountActivity(10).then(setActivity).catch(() => {})
  }, [session?.user?.id, profile?.id])

  async function updatePassword(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (form.next !== form.confirm) {
      setError('New passwords do not match.')
      return
    }
    setSaving(true)
    try {
      await changeOwnPassword({ username, currentPassword: form.current, newPassword: form.next })
      setForm({ current: '', next: '', confirm: '' })
      setSuccess('Password updated successfully.')
      updateProfile({ must_change_password: false, password_changed_at: new Date().toISOString() })
      setActivity(await listMyAccountActivity(10).catch(() => activity))
    } catch (err) {
      setError(err.message || 'Unable to update password.')
    } finally {
      setSaving(false)
    }
  }

  function pinChange(key) {
    return (event) => setPinForm((current) => ({ ...current, [key]: event.target.value.replace(/\D/g, '').slice(0, 4) }))
  }

  async function updatePin(e) {
    e.preventDefault()
    setPinError('')
    setPinSuccess('')
    if (!/^\d{4}$/.test(pinForm.next)) return setPinError('New prescribing PIN must contain exactly 4 digits.')
    if (pinForm.next !== pinForm.confirm) return setPinError('New prescribing PINs do not match.')
    if (pinConfigured && !/^\d{4}$/.test(pinForm.current)) return setPinError('Enter your current 4-digit prescribing PIN.')
    setPinSaving(true)
    try {
      await setPrescribingPin({ newPin: pinForm.next, currentPin: pinConfigured ? pinForm.current : '' })
      setPinConfigured(true)
      setPinForm({ current: '', next: '', confirm: '' })
      setPinSuccess(pinConfigured ? 'Prescribing PIN changed.' : 'Prescribing PIN created.')
    } catch (err) {
      setPinError(err.message || 'Unable to update prescribing PIN.')
    } finally {
      setPinSaving(false)
    }
  }

  function recoveryChange(key) {
    return (event) => setRecoveryForm((current) => ({ ...current, [key]: event.target.value.replace(/\D/g, '').slice(0, 6) }))
  }

  async function updateRecovery(e) {
    e.preventDefault()
    setRecoveryError(''); setRecoverySuccess('')
    if (!/^\d{6}$/.test(recoveryForm.next)) return setRecoveryError('Recovery code must contain exactly 6 digits.')
    if (recoveryForm.next !== recoveryForm.confirm) return setRecoveryError('New recovery codes do not match.')
    if (recoveryConfigured && !/^\d{6}$/.test(recoveryForm.current)) return setRecoveryError('Enter your current 6-digit recovery code.')
    setRecoverySaving(true)
    try {
      await setRecoveryCode({ userId: session?.user?.id || profile?.id, newCode: recoveryForm.next, currentCode: recoveryConfigured ? recoveryForm.current : '' })
      setRecoveryConfigured(true); setRecoveryForm({ current:'', next:'', confirm:'' })
      setRecoverySuccess(recoveryConfigured ? 'Recovery code changed.' : 'Recovery code created.')
      await recordAudit({ action:'account.recovery_code.changed', entityType:'profile', description: recoveryConfigured ? 'Recovery code changed.' : 'Recovery code created.' })
      setActivity(await listMyAccountActivity(10).catch(() => activity))
    } catch (err) { setRecoveryError(err.message || 'Unable to update recovery code.') }
    finally { setRecoverySaving(false) }
  }

  async function signOutNow() {
    if (getSettings().confirmSignOut && !window.confirm('Sign out of RecordsWeb?')) return
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="page-pad workspace-page security-page">
      <div className="page-title-row">
        <div>
          <h1>Account &amp; Security</h1>
          <p>Review your RecordsWeb account, password and prescribing PIN.</p>
        </div>
      </div>

      <div className="security-summary-grid">
        <div><ShieldCheck size={21}/><strong>Protected session</strong><span>Signed in to RecordsWeb</span></div>
        <div><Building2 size={21}/><strong>{ORGANISATION.name}</strong><span>{ORGANISATION.org_code}</span></div>
        <div><UserRound size={21}/><strong>{profile.role || roles[0]}</strong><span>{roles.length} staff role{roles.length === 1 ? '' : 's'} · {profile.is_management ? 'Management access' : 'Standard access'}</span></div>
      </div>

      <div className="security-columns security-columns-three">
        <Panel title="Signed-in account">
          <div className="account-detail-list">
            <div><span>Display name</span><strong>{profile.display_name || 'Clinical User'}</strong></div>
            <div><span>Title</span><strong>{profile.title || 'None'}</strong></div>
            <div><span>Username</span><strong className="mono-login">{username || 'Not available'}</strong></div>
            <div><span>Organisation</span><strong>{profile.organisation_name || ORGANISATION.name}</strong></div>
            <div><span>Primary role</span><strong>{profile.role || roles[0]}</strong></div>
            <div><span>All roles</span><strong>{roles.join(' · ')}</strong></div>
            <div><span>Account status</span><strong className="security-good"><CheckCircle2 size={13}/> Active</strong></div>
            <div><span>Session</span><strong><Clock3 size={13}/> Current web session</strong></div>
          </div>
          <div className="security-signout-row">
            <p>Signing out closes access to clinical records on this workstation until credentials are entered again.</p>
            <button className="secondary-button" onClick={signOutNow}><LogOut size={14}/> Sign out</button>
          </div>
        </Panel>

        <Panel title="Change password">
          <form className="security-password-form" onSubmit={updatePassword}>
            <label>Current password<input type="password" autoComplete="current-password" value={form.current} onChange={(e)=>setForm({...form,current:e.target.value})}/></label>
            <label>New password<input type="password" autoComplete="new-password" value={form.next} onChange={(e)=>setForm({...form,next:e.target.value})}/></label>
            <label>Confirm new password<input type="password" autoComplete="new-password" value={form.confirm} onChange={(e)=>setForm({...form,confirm:e.target.value})}/></label>
            <small>Use at least 10 characters with at least one letter and one number.</small>
            {error && <div className="form-error">{error}</div>}
            {success && <div className="form-success"><CheckCircle2 size={14}/>{success}</div>}
            <div className="security-form-actions"><button className="primary-button" disabled={saving || !form.current || !form.next || !form.confirm}><KeyRound size={14}/>{saving ? 'Updating…' : 'Update password'}</button></div>
          </form>
        </Panel>

        <Panel title="Prescribing PIN">
          <form className="security-password-form prescribing-security-form" onSubmit={updatePin}>
            <div className="prescribing-status"><LockKeyhole size={17}/><div><strong>{pinConfigured === null ? 'Checking…' : pinConfigured ? 'PIN configured' : 'PIN not configured'}</strong><span>Required every time medication is added or changed.</span></div></div>
            {pinConfigured && <label>Current PIN<input type="password" inputMode="numeric" autoComplete="off" maxLength="4" value={pinForm.current} onChange={pinChange('current')} placeholder="••••"/></label>}
            <label>{pinConfigured ? 'New PIN' : 'Create PIN'}<input type="password" inputMode="numeric" autoComplete="off" maxLength="4" value={pinForm.next} onChange={pinChange('next')} placeholder="4 digits"/></label>
            <label>Confirm new PIN<input type="password" inputMode="numeric" autoComplete="off" maxLength="4" value={pinForm.confirm} onChange={pinChange('confirm')} placeholder="4 digits"/></label>
            <small>The PIN is stored as a one-way hash and acts as an additional roleplay confirmation before prescribing.</small>
            {pinError && <div className="form-error">{pinError}</div>}
            {pinSuccess && <div className="form-success"><CheckCircle2 size={14}/>{pinSuccess}</div>}
            <div className="security-form-actions"><button className="primary-button" disabled={pinSaving || pinConfigured === null || !pinForm.next || !pinForm.confirm}><LockKeyhole size={14}/>{pinSaving ? 'Saving…' : pinConfigured ? 'Change PIN' : 'Create PIN'}</button></div>
          </form>
        </Panel>

        <Panel title="Account recovery code">
          <form className="security-password-form" onSubmit={updateRecovery}>
            <div className="prescribing-status"><KeyRound size={17}/><div><strong>{recoveryConfigured === null ? 'Checking…' : recoveryConfigured ? 'Recovery enabled' : 'Recovery not configured'}</strong><span>Used only for username reminders and password recovery.</span></div></div>
            {recoveryConfigured && <label>Current recovery code<input type="password" inputMode="numeric" autoComplete="off" maxLength="6" value={recoveryForm.current} onChange={recoveryChange('current')} placeholder="••••••"/></label>}
            <label>{recoveryConfigured ? 'New recovery code' : 'Create recovery code'}<input type="password" inputMode="numeric" autoComplete="off" maxLength="6" value={recoveryForm.next} onChange={recoveryChange('next')} placeholder="6 digits"/></label>
            <label>Confirm recovery code<input type="password" inputMode="numeric" autoComplete="off" maxLength="6" value={recoveryForm.confirm} onChange={recoveryChange('confirm')} placeholder="6 digits"/></label>
            <small>This code is separate from your prescribing PIN. It is stored as a one-way hash and can unlock the recovery options on the sign-in screen.</small>
            {recoveryError && <div className="form-error">{recoveryError}</div>}
            {recoverySuccess && <div className="form-success"><CheckCircle2 size={14}/>{recoverySuccess}</div>}
            <div className="security-form-actions"><button className="primary-button" disabled={recoverySaving || recoveryConfigured === null || !recoveryForm.next || !recoveryForm.confirm}><KeyRound size={14}/>{recoverySaving ? 'Saving…' : recoveryConfigured ? 'Change recovery code' : 'Create recovery code'}</button></div>
          </form>
        </Panel>

        <Panel title="Account activity">
          <div className="account-activity-list">
            {activity.length === 0 ? <div className="empty-state">No recent account-security activity.</div> : activity.map((item) => <div key={item.id}><History size={13}/><span><strong>{item.description || item.action}</strong><small>{new Date(item.created_at).toLocaleString('en-GB')}</small></span></div>)}
          </div>
        </Panel>
      </div>
    </div>
  )
}
