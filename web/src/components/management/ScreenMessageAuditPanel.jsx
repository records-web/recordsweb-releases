import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, RefreshCcw, Search } from 'lucide-react'
import { listScreenMessageAudit } from '../../lib/staffMessaging'

function staffLabel(staff) {
  if (!staff) return 'Unknown staff member'
  const fullName = [staff.title, staff.first_name, staff.last_name].filter(Boolean).join(' ').trim()
  return fullName || staff.display_name || staff.username || 'Unknown staff member'
}

function formatSentAt(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' })
  } catch {
    return String(value)
  }
}

export default function ScreenMessageAuditPanel({ staff = [] }) {
  const [messages, setMessages] = useState([])
  const [query, setQuery] = useState('')
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const staffById = useMemo(() => new Map(staff.map((member) => [member.id, member])), [staff])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const rows = await listScreenMessageAudit()
      setMessages(rows)
      if (selected) {
        const refreshed = rows.find((row) => row.id === selected.id)
        setSelected(refreshed || null)
      }
    } catch (err) {
      setError(err.message || 'Unable to load screen message logs.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return messages.filter((message) => {
      if (urgentOnly && !message.urgent) return false
      const sender = staffById.has(message.sender_id) ? staffLabel(staffById.get(message.sender_id)) : (message.sender_name || 'Unknown staff member')
      const recipient = staffLabel(staffById.get(message.recipient_id))
      const searchable = `${sender} ${message.sender_role || ''} ${recipient} ${message.subject || ''} ${message.body || ''}`.toLowerCase()
      return !needle || searchable.includes(needle)
    })
  }, [messages, query, urgentOnly, staffById])

  return <div className="message-audit-panel">
    <div className="message-audit-toolbar">
      <div className="message-audit-search"><Search size={14}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search sender, recipient, subject or message"/></div>
      <label><input type="checkbox" checked={urgentOnly} onChange={(event)=>setUrgentOnly(event.target.checked)}/> Urgent only</label>
      <button type="button" className="secondary-button" onClick={load} disabled={loading}><RefreshCcw size={13}/>{loading ? 'Refreshing…' : 'Refresh'}</button>
    </div>

    {error && <div className="form-error">{error}</div>}

    <div className="message-audit-layout">
      <div className="message-audit-table-wrap">
        <div className="message-audit-row message-audit-head">
          <span>Sent</span><span>From</span><span>To</span><span>Subject</span><span>Priority</span><span>Read</span>
        </div>
        {loading && messages.length === 0
          ? <div className="empty-state">Loading screen message logs…</div>
          : filtered.length === 0
            ? <div className="empty-state">No screen messages match this view.</div>
            : filtered.map((message) => {
              const recipient = staffLabel(staffById.get(message.recipient_id))
              const sender = staffById.has(message.sender_id) ? staffLabel(staffById.get(message.sender_id)) : (message.sender_name || 'Unknown staff member')
              return <button type="button" key={message.id} className={`message-audit-row ${selected?.id===message.id?'selected':''}`} onClick={()=>setSelected(message)}>
                <span>{formatSentAt(message.created_at)}</span>
                <span><strong>{sender}</strong><small>{message.sender_role || staffById.get(message.sender_id)?.role || 'Staff'}</small></span>
                <span><strong>{recipient}</strong><small>{staffById.get(message.recipient_id)?.role || ''}</small></span>
                <span>{message.subject}</span>
                <span>{message.urgent ? <b className="audit-urgent"><AlertTriangle size={12}/> Urgent</b> : 'Normal'}</span>
                <span>{message.read_at ? formatSentAt(message.read_at) : 'Unread'}</span>
              </button>
            })}
      </div>

      <aside className="message-audit-preview">
        {selected ? <>
          <h3>{selected.subject}</h3>
          <dl>
            <div><dt>From</dt><dd>{staffById.has(selected.sender_id) ? staffLabel(staffById.get(selected.sender_id)) : (selected.sender_name || 'Unknown staff member')} ({selected.sender_role || staffById.get(selected.sender_id)?.role || 'Staff'})</dd></div>
            <div><dt>To</dt><dd>{staffLabel(staffById.get(selected.recipient_id))}</dd></div>
            <div><dt>Sent</dt><dd>{formatSentAt(selected.created_at)}</dd></div>
            <div><dt>Status</dt><dd>{selected.read_at ? `Read ${formatSentAt(selected.read_at)}` : 'Unread'}</dd></div>
            <div><dt>Priority</dt><dd>{selected.urgent ? 'Urgent' : 'Normal'}</dd></div>
          </dl>
          <div className="message-audit-body"><strong>Message</strong><p>{selected.body}</p></div>
          <small className="message-audit-id">Message ID: {selected.id}</small>
        </> : <div className="empty-state">Select a message to inspect the full audit entry.</div>}
      </aside>
    </div>
  </div>
}
