import React, { useEffect, useMemo, useState } from 'react'
import { Activity, Clock3, Monitor, RefreshCcw, UserRound, X } from 'lucide-react'
import ModalPortal from '../ModalPortal'
import { listAuditLog } from '../../lib/auditService'
import { isSessionOnline, listStaffSessions } from '../../lib/staffSessions'

function fmt(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-GB')
}
function sessionResult(row) {
  if (isSessionOnline(row)) return 'Signed in'
  if (!row.ended_at) return 'Timed out / closed unexpectedly'
  const labels = {
    signed_out: 'Signed out',
    forced_by_management: 'Forced logout by Management',
    account_disabled: 'Account disabled',
    maintenance: 'Maintenance mode',
    session_ended: 'Session ended',
  }
  return labels[row.end_reason] || row.end_reason || 'Signed out'
}

export default function StaffProfileDetailsModal({ user, sessionSummary, onClose }) {
  const [tab, setTab] = useState('overview')
  const [sessions, setSessions] = useState([])
  const [audit, setAudit] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [sessionRows, auditRows] = await Promise.all([
        listStaffSessions({ userId: user.id, limit: 50 }),
        listAuditLog({ actorId: user.id, limit: 200 }),
      ])
      setSessions(sessionRows)
      setAudit(auditRows)
    } catch (err) {
      setError(err.message || 'Unable to load this staff profile.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [user.id])

  const latest = sessions[0] || sessionSummary?.latest || null
  const current = sessions.find((row) => isSessionOnline(row)) || sessionSummary?.current || null
  const online = Boolean(current)
  const recentActions = useMemo(() => audit.slice(0, 12), [audit])

  return (
    <ModalPortal onClose={onClose} ariaLabel="Staff profile details">
      <div className="records-modal management-modal staff-profile-details-modal">
        <header>
          <div><strong>Staff profile</strong><span>Management account and activity details</span></div>
          <button onClick={onClose}><X size={18}/></button>
        </header>

        <div className="staff-profile-identity">
          <UserRound size={23}/>
          <div><strong>{user.display_name}</strong><span>{user.role || user.roles?.[0] || 'Staff member'} · {user.username}</span></div>
          <span className={`status-pill ${online ? 'session-online' : 'session-offline'}`}>{online ? 'Signed in' : 'Signed out'}</span>
        </div>

        <div className="staff-profile-tabs">
          <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><UserRound size={13}/> Overview</button>
          <button className={tab === 'sessions' ? 'active' : ''} onClick={() => setTab('sessions')}><Monitor size={13}/> Sessions</button>
          <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}><Activity size={13}/> Audit log</button>
          <span />
          <button onClick={load}><RefreshCcw size={13}/> Refresh</button>
        </div>

        {error && <div className="form-error modal-error">{error}</div>}
        <div className="staff-profile-body">
          {loading && <div className="empty-state">Loading staff activity…</div>}

          {!loading && tab === 'overview' && <>
            <div className="staff-profile-stat-grid">
              <div><small>Current session</small><strong>{online ? 'Signed in' : 'Signed out'}</strong><span>{online ? `Since ${fmt(current?.started_at)}` : 'No active RecordsWeb session'}</span></div>
              <div><small>Last login</small><strong>{fmt(user.last_login_at)}</strong><span>{latest ? `Most recent session ${fmt(latest.started_at)}` : 'No session history recorded'}</span></div>
              <div><small>Account</small><strong>{user.active ? 'Active' : 'Disabled'}</strong><span>{user.active ? (user.is_management ? 'Management access' : 'Standard staff access') : (user.disabled_reason || 'No disable reason recorded')}</span></div>
              <div><small>Password changed</small><strong>{fmt(user.password_changed_at)}</strong><span>{user.must_change_password ? 'Password change required' : 'No forced change pending'}</span></div>
            </div>

            <section className="staff-profile-section">
              <header><Clock3 size={14}/><strong>Most recent session</strong></header>
              {latest ? <div className="staff-session-detail-grid">
                <span><small>Started</small><strong>{fmt(latest.started_at)}</strong></span>
                <span><small>Last seen</small><strong>{fmt(latest.last_seen_at)}</strong></span>
                <span><small>Ended</small><strong>{latest.ended_at ? fmt(latest.ended_at) : (isSessionOnline(latest) ? 'Still signed in' : 'No clean sign-out')}</strong></span>
                <span><small>Result</small><strong>{sessionResult(latest)}</strong></span>
                <span><small>Workstation</small><strong>{latest.device_name || 'Unknown workstation'}</strong></span>
                <span><small>RecordsWeb</small><strong>{latest.app_version || 'Unknown version'}</strong></span>
              </div> : <div className="empty-state compact-empty">No session history has been recorded for this account yet.</div>}
            </section>

            <section className="staff-profile-section">
              <header><Activity size={14}/><strong>Recent activity</strong></header>
              <div className="staff-profile-mini-audit">
                {recentActions.map((row) => <div key={row.id}><span>{fmt(row.created_at)}</span><strong>{row.action}</strong><span>{row.description || '—'}</span></div>)}
                {!recentActions.length && <div className="empty-state compact-empty">No audit events recorded for this staff member.</div>}
              </div>
            </section>
          </>}

          {!loading && tab === 'sessions' && <div className="staff-profile-table staff-session-history">
            <div className="staff-profile-table-row staff-profile-table-head"><span>Started</span><span>Last seen</span><span>Ended</span><span>Status</span><span>Workstation</span><span>Version</span></div>
            {sessions.map((row) => <div className="staff-profile-table-row" key={row.id}><span>{fmt(row.started_at)}</span><span>{fmt(row.last_seen_at)}</span><span>{row.ended_at ? fmt(row.ended_at) : '—'}</span><span>{sessionResult(row)}</span><span><strong>{row.device_name || 'Unknown'}</strong><small>{row.platform || ''}</small></span><span>{row.app_version || '—'}</span></div>)}
            {!sessions.length && <div className="empty-state">No RecordsWeb sessions recorded for this account.</div>}
          </div>}

          {!loading && tab === 'audit' && <div className="staff-profile-table staff-specific-audit">
            <div className="staff-profile-table-row staff-profile-table-head"><span>Date / time</span><span>Action</span><span>Record</span><span>Description</span></div>
            {audit.map((row) => <div className="staff-profile-table-row" key={row.id}><span>{fmt(row.created_at)}</span><span>{row.action}</span><span>{row.entity_type || '—'}</span><span>{row.description || '—'}</span></div>)}
            {!audit.length && <div className="empty-state">No audit events recorded for this staff member.</div>}
          </div>}
        </div>

        <footer><button className="secondary-button" onClick={onClose}>Close</button></footer>
      </div>
    </ModalPortal>
  )
}
