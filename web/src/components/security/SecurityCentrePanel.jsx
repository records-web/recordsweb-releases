import React, { useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, Laptop, LogOut, RefreshCw, ShieldCheck } from 'lucide-react'
import { listMySecuritySessions, revokeMySecuritySession, setSecurityPin } from '../../lib/securityService'

function fmt(value) { try { return value ? new Date(value).toLocaleString() : '—' } catch { return value || '—' } }

export default function SecurityCentrePanel() {
  const [sessions, setSessions] = useState([])
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function load() {
    try { setSessions(await listMySecuritySessions()) } catch (err) { setError(err.message || 'Unable to load sessions.') }
  }
  useEffect(() => { load() }, [])

  async function savePin(event) {
    event.preventDefault(); setError(''); setMessage('')
    if (!/^\d{6}$/.test(pin)) return setError('Security PIN must contain exactly 6 digits.')
    if (pin !== pinConfirm) return setError('Security PINs do not match.')
    try { await setSecurityPin(pin); setPin(''); setPinConfirm(''); setMessage('Security PIN updated.') }
    catch (err) { setError(err.message || 'Unable to update Security PIN.') }
  }

  async function revoke(id) {
    if (!window.confirm('Revoke this RecordsWeb session?')) return
    try { await revokeMySecuritySession(id); await load() } catch (err) { setError(err.message || 'Unable to revoke session.') }
  }

  return <div className="recordsweb-security-centre">
    <div className="security-summary-grid">
      <div><ShieldCheck size={21}/><strong>Security Centre</strong><span>Enhanced protection enabled</span></div>
      <div><Laptop size={21}/><strong>{sessions.filter((s)=>!s.revoked_at && !s.ended_at).length}</strong><span>Active sessions</span></div>
      <div><KeyRound size={21}/><strong>Step-up security</strong><span>6-digit Security PIN</span></div>
    </div>

    {error && <div className="form-error">{error}</div>}
    {message && <div className="form-success"><CheckCircle2 size={14}/>{message}</div>}

    <section className="security-centre-section">
      <header><div><h3>Active sessions</h3><p>Review devices currently authorised to use your RecordsWeb account.</p></div><button className="secondary-button" onClick={load}><RefreshCw size={14}/>Refresh</button></header>
      <div className="security-session-list">
        {sessions.map((row) => <div key={row.id} className="security-session-row">
          <Laptop size={17}/><div><strong>{row.device_name || 'Unknown device'}</strong><span>{row.platform || ''} · {row.app_version || 'Web'}</span><small>Started {fmt(row.started_at)} · Last active {fmt(row.last_seen_at)}</small></div>
          <div>{row.revoked_at ? <span>Revoked</span> : <button className="secondary-button" onClick={()=>revoke(row.id)}><LogOut size={13}/>Revoke</button>}</div>
        </div>)}
      </div>
    </section>

    <section className="security-centre-section">
      <header><div><h3>Security PIN</h3><p>Used for step-up verification before high-risk actions such as patient deletion, permissions changes, Shared Care grants and platform access.</p></div></header>
      <form className="security-password-form" onSubmit={savePin}>
        <label>New 6-digit Security PIN<input type="password" inputMode="numeric" maxLength="6" value={pin} onChange={(e)=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))}/></label>
        <label>Confirm PIN<input type="password" inputMode="numeric" maxLength="6" value={pinConfirm} onChange={(e)=>setPinConfirm(e.target.value.replace(/\D/g,'').slice(0,6))}/></label>
        <div className="security-form-actions"><button className="primary-button" disabled={!pin || !pinConfirm}><KeyRound size={14}/>Save Security PIN</button></div>
      </form>
    </section>
  </div>
}
