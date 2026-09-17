import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Ban, CheckCircle2, Laptop, Network, RefreshCw, ShieldAlert, UserX, XCircle } from 'lucide-react'
import { createPlatformBan, endPlatformSupportSession, getPlatformSecurityOverview, listPlatformBans, revokePlatformBan, startPlatformSupportSession } from '../../lib/securityService'

function fmt(value) {
  if (!value) return '—'
  try { return new Date(value).toLocaleString() } catch { return String(value) }
}

export default function PlatformSecurityPanel() {
  const [overview, setOverview] = useState(null)
  const [bans, setBans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ banType: 'account', userId: '', email: '', ip: '', deviceHash: '', reason: '', internalNote: '', scope: 'platform', organisationId: '', expiresAt: '' })
  const [support, setSupport] = useState({ organisationId: '', reason: '', reference: '' })
  const [supportSession, setSupportSession] = useState(null)
  const activeBans = useMemo(() => bans.filter((row) => !row.revoked_at), [bans])

  async function load() {
    setLoading(true); setError('')
    try {
      const [nextOverview, nextBans] = await Promise.all([getPlatformSecurityOverview(), listPlatformBans()])
      setOverview(nextOverview)
      setBans(nextBans)
    } catch (err) { setError(err.message || 'Unable to load platform security.') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function createBan(event) {
    event.preventDefault(); setError('')
    try {
      await createPlatformBan({
        ...form,
        userId: form.userId || null,
        email: form.email || null,
        ipNetwork: form.ip || null,
        deviceHash: form.deviceHash || null,
        organisationId: form.scope === 'organisation' ? form.organisationId || null : null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      })
      setForm({ banType: 'account', userId: '', email: '', ip: '', deviceHash: '', reason: '', internalNote: '', scope: 'platform', organisationId: '', expiresAt: '' })
      await load()
    } catch (err) { setError(err.message || 'Unable to create ban.') }
  }

  async function revoke(row) {
    const reason = window.prompt('Reason for revoking this ban?')
    if (!reason) return
    try { await revokePlatformBan(row.id, reason); await load() }
    catch (err) { setError(err.message || 'Unable to revoke ban.') }
  }

  const metrics = overview?.metrics || {}

  async function beginSupport(event) {
    event.preventDefault(); setError('')
    try {
      const result = await startPlatformSupportSession(support)
      setSupportSession(result.supportSession || null)
      setSupport({ organisationId: '', reason: '', reference: '' })
    } catch (err) { setError(err.message || 'Unable to start support session.') }
  }

  async function endSupport() {
    if (!supportSession?.id) return
    try { await endPlatformSupportSession(supportSession.id); setSupportSession(null) }
    catch (err) { setError(err.message || 'Unable to end support session.') }
  }

  return <section className="platform-operator-panel platform-security-panel">
    <header>
      <div><span>PLATFORM SECURITY</span><h2>Security & moderation</h2><p>Monitor suspicious access and enforce account, network and device restrictions across RecordsWeb.</p></div>
      <button onClick={load} disabled={loading}><RefreshCw size={14}/>{loading ? 'Loading…' : 'Refresh'}</button>
    </header>

    {error && <div className="platform-alert bad"><AlertTriangle size={15}/>{error}</div>}

    <div className="platform-discord-metrics">
      <div><Ban size={18}/><strong>{metrics.activeBans ?? 0}</strong><span>Active bans</span></div>
      <div><ShieldAlert size={18}/><strong>{metrics.failedLogins24h ?? 0}</strong><span>Failed logins / 24h</span></div>
      <div><AlertTriangle size={18}/><strong>{metrics.breakGlass24h ?? 0}</strong><span>Break-glass / 24h</span></div>
      <div><Laptop size={18}/><strong>{metrics.activeSessions ?? 0}</strong><span>Active sessions</span></div>
    </div>

    <form className="platform-security-ban-form" onSubmit={createBan}>
      <h3>Create restriction</h3>
      <div className="platform-form-grid">
        <label>Restriction type<select value={form.banType} onChange={(e)=>setForm({...form,banType:e.target.value})}><option value="account">Account</option><option value="ip">IP address</option><option value="device">Device / hardware</option></select></label>
        <label>Scope<select value={form.scope} onChange={(e)=>setForm({...form,scope:e.target.value})}><option value="platform">Entire RecordsWeb platform</option><option value="organisation">Single organisation</option></select></label>{form.scope === 'organisation' && <label>Organisation UUID<input required value={form.organisationId} onChange={(e)=>setForm({...form,organisationId:e.target.value})} placeholder="Organisation ID"/></label>}
        {form.banType === 'account' && <><label>User UUID<input value={form.userId} onChange={(e)=>setForm({...form,userId:e.target.value})} placeholder="Optional if email supplied"/></label><label>Email / username<input value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} placeholder="user@ORG.CODE"/></label></>}
        {form.banType === 'ip' && <label>IP / CIDR<input value={form.ip} onChange={(e)=>setForm({...form,ip:e.target.value})} placeholder="203.0.113.10"/></label>}
        {form.banType === 'device' && <label>Device hash<input value={form.deviceHash} onChange={(e)=>setForm({...form,deviceHash:e.target.value})} placeholder="SHA-256 device hash"/></label>}
        <label>Expiry<input type="datetime-local" value={form.expiresAt} onChange={(e)=>setForm({...form,expiresAt:e.target.value})}/></label>
        <label className="wide">Moderation reason<textarea required value={form.reason} onChange={(e)=>setForm({...form,reason:e.target.value})} placeholder="Reason visible in moderation history"/></label>
        <label className="wide">Internal note<textarea value={form.internalNote} onChange={(e)=>setForm({...form,internalNote:e.target.value})} placeholder="Optional internal RecordsWeb note"/></label>
      </div>
      <div className="platform-panel-actions"><button className="primary" type="submit"><Ban size={14}/>Apply restriction</button></div>
    </form>

    <form className="platform-security-ban-form" onSubmit={beginSupport}>
      <h3>Platform support access</h3>
      <p>Start an audited, time-limited support session before accessing an organisation for troubleshooting.</p>
      {supportSession ? <div className="platform-alert"><ShieldAlert size={15}/><span><strong>Support session active</strong> · expires {fmt(supportSession.expires_at)}</span><button type="button" onClick={endSupport}>End session</button></div> : <div className="platform-form-grid">
        <label>Organisation UUID<input required value={support.organisationId} onChange={(e)=>setSupport({...support,organisationId:e.target.value})}/></label>
        <label>Support reference<input value={support.reference} onChange={(e)=>setSupport({...support,reference:e.target.value})} placeholder="RW-1043"/></label>
        <label className="wide">Reason<textarea required minLength={8} value={support.reason} onChange={(e)=>setSupport({...support,reason:e.target.value})} placeholder="Why platform access is required"/></label>
        <div className="platform-panel-actions wide"><button className="primary" type="submit"><ShieldAlert size={14}/>Start 30-minute support session</button></div>
      </div>}
    </form>

    <div className="platform-security-ban-list">
      <h3>Moderation history</h3>
      {bans.length === 0 && <div className="platform-empty">No platform restrictions recorded.</div>}
      {bans.map((row) => <div key={row.id} className={`platform-security-ban-row ${row.revoked_at ? 'revoked' : 'active'}`}>
        <div>{row.ban_type === 'account' ? <UserX size={16}/> : row.ban_type === 'ip' ? <Network size={16}/> : <Laptop size={16}/>}</div>
        <div><strong>{row.ban_type.toUpperCase()} · {row.scope}</strong><small>{row.reason}</small></div>
        <div><span>{row.user_id || row.email_normalised || row.ip_network || row.device_hash || 'Unknown target'}</span><small>Created {fmt(row.created_at)} by {row.created_by_name || 'Platform operator'}</small></div>
        <div>{row.revoked_at ? <span className="security-good"><CheckCircle2 size={13}/>Revoked {fmt(row.revoked_at)}</span> : <button onClick={()=>revoke(row)}><XCircle size={14}/>Revoke</button>}</div>
      </div>)}
    </div>
  </section>
}
