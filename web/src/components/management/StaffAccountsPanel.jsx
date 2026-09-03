import React, { useMemo, useState } from 'react'
import { KeyRound, LogOut, Pencil, Search, UserPlus } from 'lucide-react'
import Panel from '../Panel'

function fmtSessionTime(value) {
  if (!value) return 'No recorded session'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No recorded session'
  return date.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function StaffAccountsPanel({ rows, currentUserId, sessionSummary = {}, onCreate, onEdit, onPassword, onToggle, onForceLogout, onViewProfile }) {
  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => rows.filter((account) => JSON.stringify(account).toLowerCase().includes(filter.toLowerCase())), [rows, filter])

  return (
    <Panel title="Staff accounts" count={filtered.length}>
      <div className="workspace-toolbar management-toolbar">
        <div className="search-field"><Search size={16}/><input placeholder="Search name, role or username" value={filter} onChange={(event) => setFilter(event.target.value)} /></div>
        <button className="primary-button" onClick={onCreate}><UserPlus size={14}/> Create account</button>
      </div>

      <div className="accounts-table">
        <div className="account-row account-head"><span>Staff member</span><span>Username</span><span>Roles</span><span>Management</span><span>Account</span><span>Session</span><span>Most recent session</span><span>Actions</span></div>
        {filtered.length === 0 && <div className="management-empty">No staff accounts match this search.</div>}
        {filtered.map((user) => {
          const summary = sessionSummary[user.id] || {}
          const session = summary.current || summary.latest
          return (
            <div className="account-row" key={user.id}>
              <span className="staff-name-cell"><button type="button" className="staff-profile-link" onClick={() => onViewProfile(user)}><strong>{user.display_name}</strong><small>{user.role || user.roles?.[0]}</small></button></span>
              <span className="mono-login">{user.username}</span>
              <span className="role-chip-list">{(user.roles?.length ? user.roles : [user.role]).map((role) => <em className={role === user.role ? 'primary-role' : ''} key={role}>{role}</em>)}</span>
              <span>{user.is_management ? 'Yes' : 'No'}</span>
              <span><span className={`status-pill ${user.active ? 'active' : 'disabled'}`} title={!user.active && user.disabled_reason ? `Reason: ${user.disabled_reason}` : ''}>{user.active ? 'Active' : 'Disabled'}</span></span>
              <span><span className={`status-pill ${summary.online ? 'session-online' : 'session-offline'}`}>{summary.online ? 'Signed in' : 'Signed out'}</span></span>
              <span className="session-last-cell"><strong>{fmtSessionTime(session?.started_at || user.last_login_at)}</strong><small>{summary.online ? `Last seen ${fmtSessionTime(summary.current?.last_seen_at)}` : (session?.last_seen_at ? `Last seen ${fmtSessionTime(session.last_seen_at)}` : 'No session activity')}</small></span>
              <span className="account-actions">
                <button onClick={() => onEdit(user)}><Pencil size={13}/> Edit</button>
                <button onClick={() => onPassword(user)}><KeyRound size={13}/> Password</button>
                <button disabled={user.id === currentUserId || !summary.online} onClick={() => onForceLogout(user)} title={summary.online ? "End this user's current RecordsWeb session" : 'This user is not currently signed in'}><LogOut size={13}/> Logout</button>
                <button disabled={user.id === currentUserId} onClick={() => onToggle(user)}>{user.active ? 'Disable' : 'Enable'}</button>
              </span>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
