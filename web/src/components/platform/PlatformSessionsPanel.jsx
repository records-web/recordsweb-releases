import React, { useEffect, useMemo, useState } from 'react'
import { Ban, CheckCircle2, Copy, Laptop, Network, RefreshCw, Search, ShieldAlert, XCircle } from 'lucide-react'
import { listPlatformSessions, revokePlatformSession } from '../../lib/securityService'

function fmt(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function sessionState(row) {
  if (row.revoked_at) return 'revoked'
  if (row.ended_at) return 'ended'
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return 'expired'
  return 'active'
}

function clientLabel(row) {
  const explicit = String(row.client_type || '').toLowerCase()
  if (explicit === 'electron') return 'Electron app'
  if (explicit === 'website') return 'Website'
  const probe = `${row.device_name || ''} ${row.user_agent || ''}`.toLowerCase()
  return probe.includes('electron') || (!probe.includes('browser installation') && row.device_name) ? 'Electron app' : 'Website'
}

function shortHash(value) {
  const text = String(value || '')
  if (!text) return 'No device hash'
  if (text.length <= 24) return text
  return `${text.slice(0, 12)}…${text.slice(-10)}`
}

async function copyText(value) {
  const text = String(value || '')
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const input = document.createElement('textarea')
      input.value = text
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.appendChild(input)
      input.select()
      const ok = document.execCommand('copy')
      input.remove()
      return ok
    } catch {
      return false
    }
  }
}

export default function PlatformSessionsPanel({ onCreateRestriction }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [clientType, setClientType] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState({})
  const pageSize = 50

  async function load(nextPage = page) {
    setLoading(true)
    setError('')
    try {
      const result = await listPlatformSessions({ page: nextPage, pageSize, status, clientType })
      setRows(result.sessions || [])
      setTotal(Number(result.total || 0))
      setSummary(result.summary || {})
      setPage(Number(result.page || nextPage))
    } catch (err) {
      setError(err?.message || 'Unable to load RecordsWeb user sessions.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
    load(1)
    // Deliberately no focus/visibility listener: Platform Management must not
    // refresh just because the browser or Electron window changes tab/focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, clientType])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) => [
      row.display_name,
      row.username,
      row.login_name,
      row.organisation_name,
      row.organisation_code,
      row.ip_address,
      row.device_hash,
      row.device_name,
      row.platform,
      row.app_version,
      row.id,
    ].some((value) => String(value || '').toLowerCase().includes(needle)))
  }, [rows, search])

  async function revoke(row) {
    const reason = window.prompt(`Reason for revoking ${row.display_name || row.login_name || 'this user'}'s session?`)
    if (!reason?.trim()) return
    setError('')
    try {
      await revokePlatformSession(row.id, reason.trim())
      setNotice('Session revoked. The client will be signed out on its next security heartbeat.')
      await load(page)
    } catch (err) {
      setError(err?.message || 'Unable to revoke session.')
    }
  }

  async function copyHash(row) {
    if (!row.device_hash) return
    const ok = await copyText(row.device_hash)
    setNotice(ok ? 'Device hash copied.' : 'Unable to copy the device hash automatically.')
  }

  function createRestriction(row, banType) {
    const payload = banType === 'device'
      ? { banType: 'device', deviceHash: row.device_hash || '' }
      : banType === 'ip'
        ? { banType: 'ip', ip: row.ip_address || '' }
        : { banType: 'account', userId: row.user_id || '', email: row.login_name || '' }
    onCreateRestriction?.(payload)
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return <section className="platform-operator-panel platform-sessions-panel">
    <header>
      <div>
        <span>PLATFORM SECURITY</span>
        <h2>User sessions</h2>
        <p>View RecordsWeb sessions across every community, including website and Electron desktop clients. Session tokens are never exposed.</p>
      </div>
      <button onClick={() => load(page)} disabled={loading}><RefreshCw size={14}/>{loading ? 'Loading…' : 'Refresh'}</button>
    </header>

    {error && <div className="platform-alert bad"><ShieldAlert size={15}/>{error}</div>}
    {notice && <div className="platform-alert"><CheckCircle2 size={15}/><span>{notice}</span><button onClick={() => setNotice('')}>Dismiss</button></div>}

    <div className="platform-session-metrics">
      <div><strong>{summary.active ?? 0}</strong><span>Active</span></div>
      <div><strong>{summary.website ?? 0}</strong><span>Website</span></div>
      <div><strong>{summary.electron ?? 0}</strong><span>Electron app</span></div>
      <div><strong>{summary.revoked ?? 0}</strong><span>Revoked</span></div>
    </div>

    <div className="platform-session-toolbar">
      <label className="platform-session-search"><Search size={14}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search user, community, IP, device hash…" /></label>
      <label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="all">All sessions</option><option value="revoked">Revoked</option><option value="ended">Ended / expired</option></select></label>
      <label>Client<select value={clientType} onChange={(e) => setClientType(e.target.value)}><option value="all">Website + Electron</option><option value="website">Website</option><option value="electron">Electron app</option></select></label>
    </div>

    <div className="platform-session-help">
      <strong>Need a device hash?</strong>
      <span>Find the user's session below and use <b>Copy hash</b>. You can also choose <b>Ban device</b> to send the hash straight to Security &amp; Moderation.</span>
    </div>

    <div className="platform-session-list">
      <div className="platform-session-row head">
        <span>User</span><span>Community</span><span>Client</span><span>Network / device</span><span>Activity</span><span>Status</span><span>Actions</span>
      </div>
      {!loading && filtered.length === 0 && <div className="platform-empty">No RecordsWeb sessions match these filters.</div>}
      {filtered.map((row) => {
        const state = sessionState(row)
        const active = state === 'active'
        return <div className="platform-session-row" key={row.id}>
          <div><strong>{row.display_name || 'RecordsWeb user'}</strong><small>{row.login_name || row.username || row.user_id}</small><small>{row.role || ''}</small></div>
          <div><strong>{row.organisation_name || 'Unknown community'}</strong><small>{row.organisation_code ? `@${row.organisation_code}` : row.organisation_id || '—'}</small></div>
          <div><span className={`platform-client-badge ${String(row.client_type || '').toLowerCase() || 'unknown'}`}><Laptop size={12}/>{clientLabel(row)}</span><small>{row.device_name || 'Unknown device'}</small><small>{row.platform || 'Unknown platform'}{row.app_version ? ` · v${row.app_version}` : ''}</small></div>
          <div><span><Network size={12}/>{row.ip_address || 'No IP recorded'}</span><button type="button" className="platform-hash-button" onClick={() => copyHash(row)} disabled={!row.device_hash} title={row.device_hash || ''}><Copy size={12}/>{shortHash(row.device_hash)}</button></div>
          <div><small>Started {fmt(row.started_at)}</small><small>Last seen {fmt(row.last_seen_at)}</small></div>
          <div><span className={`platform-session-status ${state}`}>{state}</span>{row.revoke_reason && <small>{row.revoke_reason}</small>}</div>
          <div className="platform-session-actions">
            {active ? <button type="button" onClick={() => revoke(row)}><XCircle size={13}/>Revoke</button> : <span className="platform-session-closed"><CheckCircle2 size={13}/>{state}</span>}
            {row.device_hash && <button type="button" onClick={() => createRestriction(row, 'device')}><Ban size={13}/>Ban device</button>}
            {row.ip_address && <button type="button" onClick={() => createRestriction(row, 'ip')}><Network size={13}/>Ban IP</button>}
          </div>
        </div>
      })}
    </div>

    <div className="platform-session-pagination">
      <span>Page {page} of {pageCount} · {total} session{total === 1 ? '' : 's'}</span>
      <div><button disabled={loading || page <= 1} onClick={() => load(page - 1)}>Previous</button><button disabled={loading || page >= pageCount} onClick={() => load(page + 1)}>Next</button></div>
    </div>
  </section>
}
