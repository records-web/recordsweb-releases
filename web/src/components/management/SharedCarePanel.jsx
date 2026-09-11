import React, { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Handshake, Link2, PauseCircle, RefreshCw, Save, ShieldCheck, Unlink, X } from 'lucide-react'
import {
  getSharedCareCode,
  listSharedCareLinks,
  requestSharedCareLink,
  respondSharedCareLink,
  setSharedCareLinkStatus,
  sharedCareModeLabel,
  SHARED_CARE_PERMISSION_OPTIONS,
  updateSharedCarePermissions,
} from '../../lib/sharedCareService'

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function statusLabel(status) {
  if (status === 'active') return 'Active'
  if (status === 'pending') return 'Pending approval'
  if (status === 'suspended') return 'Suspended'
  if (status === 'declined') return 'Declined'
  if (status === 'revoked') return 'Revoked'
  return status || 'Unknown'
}

function PermissionEditor({ link, onSave, busy }) {
  const [permissions, setPermissions] = useState(() => link.outbound_permissions || {})

  useEffect(() => {
    setPermissions(link.outbound_permissions || {})
  }, [link.link_id, link.outbound_permissions])

  return (
    <div className="shared-care-permissions">
      <div className="shared-care-permissions-heading">
        <div>
          <strong>What your community shares</strong>
          <span>These controls affect records sent from your community to {link.partner_name}. Their incoming permissions are managed by their own Management team.</span>
        </div>
      </div>
      <div className="shared-care-permission-grid">
        {SHARED_CARE_PERMISSION_OPTIONS.map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={permissions[key] !== false}
              onChange={(event) => setPermissions((current) => ({ ...current, [key]: event.target.checked }))}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <div className="shared-care-permissions-actions">
        <button type="button" onClick={() => onSave(link.link_id, permissions)} disabled={busy}><Save size={13}/> Save sharing permissions</button>
      </div>
    </div>
  )
}

export default function SharedCarePanel() {
  const [code, setCode] = useState('')
  const [linkCode, setLinkCode] = useState('')
  const [links, setLinks] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [expanded, setExpanded] = useState(null)

  const activeCount = useMemo(() => links.filter((link) => link.status === 'active').length, [links])
  const pendingCount = useMemo(() => links.filter((link) => link.status === 'pending').length, [links])

  async function load() {
    setBusy(true)
    setError('')
    try {
      const [nextCode, nextLinks] = await Promise.all([getSharedCareCode(), listSharedCareLinks()])
      setCode(nextCode || '')
      setLinks(Array.isArray(nextLinks) ? nextLinks : [])
    } catch (err) {
      setError(err?.message || 'Unable to load Shared Care.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { load() }, [])

  async function requestLink() {
    setError(''); setNotice('')
    const clean = linkCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    if (clean.length !== 6) { setError('Enter the partner community\'s six-character Shared Care code.'); return }
    setBusy(true)
    try {
      await requestSharedCareLink(clean)
      setLinkCode('')
      setNotice('Shared Care request sent. The other community must approve it before any patient record can be linked.')
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to send the Shared Care request.')
    } finally { setBusy(false) }
  }

  async function respond(link, decision) {
    setBusy(true); setError(''); setNotice('')
    try {
      await respondSharedCareLink(link.link_id, decision)
      setNotice(decision === 'approve' ? `Shared Care is now active with ${link.partner_name}.` : `Shared Care request from ${link.partner_name} declined.`)
      await load()
    } catch (err) { setError(err?.message || 'Unable to update the Shared Care request.') }
    finally { setBusy(false) }
  }

  async function changeStatus(link, status) {
    const action = status === 'revoked' ? 'revoke' : status === 'suspended' ? 'suspend' : 'resume'
    if ((status === 'revoked' || status === 'suspended') && !window.confirm(`${action[0].toUpperCase()}${action.slice(1)} Shared Care with ${link.partner_name}?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await setSharedCareLinkStatus(link.link_id, status)
      setNotice(`Shared Care with ${link.partner_name} ${status === 'active' ? 'resumed' : status}.`)
      await load()
    } catch (err) { setError(err?.message || 'Unable to change the Shared Care relationship.') }
    finally { setBusy(false) }
  }

  async function savePermissions(linkId, permissions) {
    setBusy(true); setError(''); setNotice('')
    try {
      await updateSharedCarePermissions(linkId, permissions)
      setNotice('Shared Care permissions updated.')
      await load()
    } catch (err) { setError(err?.message || 'Unable to save Shared Care permissions.') }
    finally { setBusy(false) }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setNotice('Shared Care code copied.')
    } catch {
      setError('Unable to copy the Shared Care code. Select it and copy it manually.')
    }
  }

  return (
    <div className="shared-care-panel">
      <div className="shared-care-heading">
        <div><Handshake size={22}/><div><strong>Shared Care Network</strong><span>Securely link this community with one or more Primary Care, Secondary Care or Ambulance / PHEM RecordsWeb communities.</span></div></div>
        <button onClick={load} disabled={busy}><RefreshCw size={14}/> Refresh</button>
      </div>

      {error && <div className="form-error shared-care-message">{error}</div>}
      {notice && <div className="form-success shared-care-message">{notice}</div>}

      <div className="shared-care-summary">
        <div><Link2 size={18}/><strong>{activeCount}</strong><span>Active links</span></div>
        <div><ShieldCheck size={18}/><strong>{pendingCount}</strong><span>Pending requests</span></div>
        <div className="shared-care-code-card"><strong>{code || '------'}</strong><span>Your six-character code</span><button type="button" onClick={copyCode} disabled={!code}><Copy size={13}/> Copy</button></div>
      </div>

      <section className="shared-care-card">
        <header><div><strong>Link another RecordsWeb community</strong><span>Enter their six-character code. The relationship remains pending until Management in the other community approves it.</span></div></header>
        <div className="shared-care-link-form">
          <label><span>Partner Shared Care code</span><input maxLength={6} value={linkCode} onChange={(e) => setLinkCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="A7K4Q2" /></label>
          <button className="primary-button" type="button" onClick={requestLink} disabled={busy || linkCode.length !== 6}><Link2 size={14}/> Send link request</button>
        </div>
        <div className="shared-care-security-note"><ShieldCheck size={15}/><span>The code only starts a request. It never grants access by itself. Both communities must approve the relationship, and patient records must then be linked individually.</span></div>
        <div className="shared-care-security-note"><Handshake size={15}/><span>Multiple direct links can form a larger Shared Care network — for example Ambulance ↔ Hospital ↔ GP, three-way GP/Hospital/Ambulance networks, GP ↔ GP or Hospital ↔ Hospital. Each direct relationship is approved separately; records are never silently forwarded through an intermediary community.</span></div>
      </section>

      <section className="shared-care-card">
        <header><div><strong>Linked communities</strong><span>All three RecordsWeb service types can interlink in any combination.</span></div></header>
        {!links.length ? <div className="management-empty">No Shared Care relationships yet.</div> : (
          <div className="shared-care-link-list">
            {links.map((link) => {
              const incomingPending = link.status === 'pending' && !link.requested_by_us
              return (
                <article className={`shared-care-link shared-care-${link.status}`} key={link.link_id}>
                  <div className="shared-care-link-main">
                    <div className="shared-care-link-identity">
                      <strong>{link.partner_name}</strong>
                      <span>@{link.partner_code} · {sharedCareModeLabel(link.partner_mode)}</span>
                    </div>
                    <div className={`shared-care-status shared-care-status-${link.status}`}>{statusLabel(link.status)}</div>
                    <div className="shared-care-link-date"><span>{link.status === 'active' ? 'Approved' : 'Created'}</span><strong>{formatDate(link.status === 'active' ? link.approved_at : link.created_at)}</strong></div>
                    <div className="shared-care-link-actions">
                      {incomingPending && <><button className="primary-button" onClick={() => respond(link, 'approve')} disabled={busy}><Check size={13}/> Approve</button><button onClick={() => respond(link, 'decline')} disabled={busy}><X size={13}/> Decline</button></>}
                      {link.status === 'pending' && link.requested_by_us && <span className="shared-care-awaiting">Awaiting partner approval</span>}
                      {link.status === 'active' && <><button onClick={() => setExpanded(expanded === link.link_id ? null : link.link_id)}><ShieldCheck size={13}/> Sharing</button><button onClick={() => changeStatus(link, 'suspended')} disabled={busy}><PauseCircle size={13}/> Suspend</button><button onClick={() => changeStatus(link, 'revoked')} disabled={busy}><Unlink size={13}/> Revoke</button></>}
                      {link.status === 'suspended' && <><button onClick={() => setExpanded(expanded === link.link_id ? null : link.link_id)}><ShieldCheck size={13}/> Sharing</button><button className="primary-button" onClick={() => changeStatus(link, 'active')} disabled={busy}><Check size={13}/> Resume</button></>}
                    </div>
                  </div>
                  {expanded === link.link_id && (link.status === 'active' || link.status === 'suspended') && <PermissionEditor link={link} onSave={savePermissions} busy={busy} />}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
