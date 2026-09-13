import React, { useEffect, useState } from 'react'
import { ArrowRight, Building2, CheckCircle2, CircleCheck, MessageSquareText, Network, RefreshCw, Send, UserCheck } from 'lucide-react'
import Panel from '../Panel'
import {
  createSharedCareWorkspaceTask,
  listSharedCareWorkspaceMessages,
  listSharedCareWorkspaceTasks,
  listSharedCareWorkspaceTransfers,
  postSharedCareWorkspaceMessage,
  sharedCareModeLabel,
  updateSharedCareTransferStatus,
  updateSharedCareWorkspaceTaskStatus,
} from '../../lib/sharedCareService'

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

function statusLabel(value) {
  return String(value || 'open').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function SharedCareCollaboration({ overview, patientWorkspace = null, patient = null, initialTab = 'discussion', compact = false }) {
  const workspace = overview?.workspace || null
  const members = patientWorkspace?.members?.length
    ? patientWorkspace.members.map((member) => ({
        organisationId: member.organisationId,
        name: member.organisationName,
        code: member.organisationCode,
        mode: member.organisationMode,
        current: member.current,
      }))
    : (overview?.members || [])
  const currentOrganisationId = patientWorkspace?.currentOrganisationId || workspace?.currentOrganisationId || ''
  const patientThreadId = patientWorkspace?.threadId || null
  const [tab, setTab] = useState(initialTab)
  const [messages, setMessages] = useState([])
  const [tasks, setTasks] = useState([])
  const [transfers, setTransfers] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [messageBody, setMessageBody] = useState('')
  const [messageType, setMessageType] = useState('discussion')
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [task, setTask] = useState({ targetOrganisationId: '', title: '', details: '', priority: 'Routine', dueAt: '' })
  const [showCompleted, setShowCompleted] = useState(false)

  const workspaceId = workspace?.id || patientWorkspace?.workspaceId || ''

  async function load() {
    if (!workspaceId) return
    setBusy(true); setError('')
    try {
      const [messageRows, taskRows, transferRows] = await Promise.all([
        listSharedCareWorkspaceMessages(workspaceId, patientThreadId),
        listSharedCareWorkspaceTasks(workspaceId, { patientThreadId, includeCompleted: showCompleted }),
        listSharedCareWorkspaceTransfers(workspaceId, patientThreadId),
      ])
      setMessages(Array.isArray(messageRows) ? messageRows : [])
      setTasks(Array.isArray(taskRows) ? taskRows : [])
      setTransfers(Array.isArray(transferRows) ? transferRows : [])
    } catch (err) {
      setError(err?.message || 'Unable to load the Shared Care workspace.')
    } finally { setBusy(false) }
  }

  useEffect(() => { load() }, [workspaceId, patientThreadId, showCompleted])
  useEffect(() => {
    if (!workspaceId) return undefined
    const timer = window.setInterval(load, 15000)
    return () => window.clearInterval(timer)
  }, [workspaceId, patientThreadId, showCompleted])

  useEffect(() => {
    const justDelivered = transfers.filter((row) => row.target_organisation_id === currentOrganisationId && row.status === 'sent')
    if (!justDelivered.length) return
    Promise.all(justDelivered.map((row) => updateSharedCareTransferStatus(row.id, 'received').catch(() => null))).then(() => load())
  }, [transfers, currentOrganisationId])

  useEffect(() => {
    if (tab !== 'handovers') return
    const newlyViewed = transfers.filter((row) => row.target_organisation_id === currentOrganisationId && row.status === 'received')
    if (!newlyViewed.length) return
    Promise.all(newlyViewed.map((row) => updateSharedCareTransferStatus(row.id, 'viewed').catch(() => null))).then(() => load())
  }, [tab, transfers, currentOrganisationId])

  const openTasks = tasks.filter((row) => !['completed','cancelled'].includes(row.status)).length
  const urgentTasks = tasks.filter((row) => !['completed','cancelled'].includes(row.status) && ['Urgent','Immediate'].includes(row.priority)).length

  async function sendMessage(event) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      await postSharedCareWorkspaceMessage(workspaceId, { patientThreadId, body: messageBody, messageType })
      setMessageBody(''); setMessageType('discussion'); await load()
    } catch (err) { setError(err?.message || 'Unable to send the Shared Care message.') }
    finally { setBusy(false) }
  }

  async function createTask(event) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      await createSharedCareWorkspaceTask(workspaceId, {
        patientThreadId,
        targetOrganisationId: task.targetOrganisationId,
        title: task.title,
        details: task.details,
        priority: task.priority,
        dueAt: task.dueAt ? new Date(task.dueAt).toISOString() : null,
      })
      setTask({ targetOrganisationId: '', title: '', details: '', priority: 'Routine', dueAt: '' })
      setShowTaskForm(false); await load()
    } catch (err) { setError(err?.message || 'Unable to create the Shared Care task.') }
    finally { setBusy(false) }
  }

  async function updateTask(row, status) {
    setBusy(true); setError('')
    try { await updateSharedCareWorkspaceTaskStatus(row.id, status); await load() }
    catch (err) { setError(err?.message || 'Unable to update the Shared Care task.') }
    finally { setBusy(false) }
  }

  async function updateTransfer(row, status) {
    setBusy(true); setError('')
    try { await updateSharedCareTransferStatus(row.id, status); await load() }
    catch (err) { setError(err?.message || 'Unable to update the handover.') }
    finally { setBusy(false) }
  }

  if (!workspaceId) {
    return <Panel title="Shared Care workspace"><div className="empty-state">This community is not currently part of an active Shared Care network.</div></Panel>
  }

  return (
    <section className={`shared-care-collaboration ${compact ? 'compact' : ''}`}>
      <div className="shared-care-workspace-tabs" role="tablist">
        <button className={tab === 'discussion' ? 'active' : ''} onClick={() => setTab('discussion')}><MessageSquareText size={14}/>Discussion<span>{messages.length}</span></button>
        <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}><CircleCheck size={14}/>Work Queue<span>{openTasks}</span></button>
        <button className={tab === 'handovers' ? 'active' : ''} onClick={() => setTab('handovers')}><ArrowRight size={14}/>Handovers<span>{transfers.length}</span></button>
        <button className={tab === 'network' ? 'active' : ''} onClick={() => setTab('network')}><Network size={14}/>Care Network<span>{members.length}</span></button>
        <button className="workspace-refresh" onClick={load} disabled={busy} title="Refresh Shared Care workspace"><RefreshCw size={13}/></button>
      </div>
      {error && <div className="form-error">{error}</div>}

      {tab === 'discussion' && <Panel title={patient ? `Discussion · ${patient.last_name?.toUpperCase()}, ${patient.first_name}` : 'Workspace discussion'} count={messages.length}>
        <form className="shared-care-message-composer" onSubmit={sendMessage}>
          <select value={messageType} onChange={(event) => setMessageType(event.target.value)} aria-label="Message type">
            <option value="discussion">Discussion</option><option value="clinical_update">Clinical update</option><option value="request">Request / question</option>
          </select>
          <textarea rows="3" value={messageBody} onChange={(event) => setMessageBody(event.target.value)} placeholder={patient ? 'Discuss this patient with every organisation in the linked care network…' : 'Send a message to every organisation in this Shared Care workspace…'} required />
          <button className="primary-button" disabled={busy || !messageBody.trim()}><Send size={13}/>Send</button>
        </form>
        {!messages.length ? <div className="empty-state">No messages have been posted in this workspace yet.</div> : <div className="shared-care-message-list">{messages.map((row) => <article key={row.id}>
          <div className="shared-care-message-avatar">{String(row.author_name || row.source_organisation_name || 'R').slice(0,1).toUpperCase()}</div>
          <div className="shared-care-message-content"><header><strong>{row.author_name || 'RecordsWeb user'}</strong><span>{row.author_role || 'Staff'} · {row.source_organisation_name} · @{row.source_organisation_code}</span><time>{formatDate(row.created_at)}</time></header><div className={`shared-care-message-type type-${row.message_type}`}>{statusLabel(row.message_type)}</div><p>{row.body}</p></div>
        </article>)}</div>}
      </Panel>}

      {tab === 'tasks' && <>
        <div className="shared-care-tab-actions"><div><strong>{openTasks}</strong> open · <strong>{urgentTasks}</strong> urgent/immediate</div><label className="care-inline-check"><input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)}/> Show completed</label><button className="primary-button" onClick={() => setShowTaskForm((value) => !value)}>+ Shared task</button></div>
        {showTaskForm && <Panel title="Create cross-organisation task"><form className="shared-care-task-form" onSubmit={createTask}>
          <label><span>Assign to organisation *</span><select value={task.targetOrganisationId} onChange={(e) => setTask({ ...task, targetOrganisationId: e.target.value })} required><option value="">Select organisation</option>{members.map((member) => <option key={member.organisationId} value={member.organisationId}>{member.name} · {sharedCareModeLabel(member.mode)}</option>)}</select></label>
          <label><span>Priority</span><select value={task.priority} onChange={(e) => setTask({ ...task, priority: e.target.value })}><option>Routine</option><option>High</option><option>Urgent</option><option>Immediate</option></select></label>
          <label><span>Due</span><input type="datetime-local" value={task.dueAt} onChange={(e) => setTask({ ...task, dueAt: e.target.value })}/></label>
          <label className="wide"><span>Task *</span><input value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} required placeholder="e.g. Review discharge medication changes"/></label>
          <label className="wide"><span>Details</span><textarea rows="3" value={task.details} onChange={(e) => setTask({ ...task, details: e.target.value })}/></label>
          <div className="care-form-actions wide"><button type="button" onClick={() => setShowTaskForm(false)}>Cancel</button><button className="primary-button" disabled={busy}>Create shared task</button></div>
        </form></Panel>}
        <Panel title="Shared Care work" count={tasks.length}>{!tasks.length ? <div className="empty-state">No Shared Care tasks are currently recorded.</div> : <div className="shared-care-task-list">{tasks.map((row) => {
          const isTarget = row.target_organisation_id === currentOrganisationId
          const isSource = row.source_organisation_id === currentOrganisationId
          const overdue = row.due_at && !['completed','cancelled'].includes(row.status) && new Date(row.due_at) < new Date()
          return <article key={row.id} className={`${row.status} ${overdue ? 'overdue' : ''}`}><div className={`care-priority priority-${String(row.priority || 'Routine').toLowerCase()}`}>{row.priority}</div><div className="shared-care-task-main"><span>{row.source_organisation_name} <ArrowRight size={11}/> {row.target_organisation_name}</span><strong>{row.title}</strong>{row.details && <p>{row.details}</p>}<small>{row.created_by_name || 'RecordsWeb user'} · Created {formatDate(row.created_at)}{row.due_at ? ` · Due ${formatDate(row.due_at)}` : ''}</small></div><div className="shared-care-task-status">{statusLabel(row.status)}</div><div className="care-row-actions">{isTarget && row.status === 'open' && <button onClick={() => updateTask(row, 'accepted')}><UserCheck size={13}/>Accept</button>}{isTarget && ['open','accepted'].includes(row.status) && <button className="primary-button" onClick={() => updateTask(row, 'completed')}><CheckCircle2 size={13}/>Complete</button>}{isSource && !['completed','cancelled'].includes(row.status) && <button onClick={() => updateTask(row, 'cancelled')}>Cancel</button>}</div></article>
        })}</div>}</Panel>
      </>}

      {tab === 'handovers' && <Panel title="Transfer of Care & handovers" count={transfers.length}>
        {!transfers.length ? <div className="empty-state">No transfer-of-care events are recorded in this workspace.</div> : <div className="shared-care-handover-list">{transfers.map((row) => {
          const inbound = row.target_organisation_id === currentOrganisationId
          return <article key={row.id}><div className={`handover-route ${inbound ? 'inbound' : ''}`}><Building2 size={15}/><strong>{row.source_organisation_name}</strong><ArrowRight size={14}/><strong>{row.target_organisation_name}</strong></div><div className="handover-main"><span>{statusLabel(row.transfer_type)}</span><p>{row.summary}</p><small>Sent {formatDate(row.created_at)} · Status: {statusLabel(row.status)}</small><div className="handover-status-track"><span className="done">Sent</span><span className={row.received_at || ['received','viewed','acknowledged','actioned'].includes(row.status) ? 'done' : ''}>Received</span><span className={row.viewed_at || ['viewed','acknowledged','actioned'].includes(row.status) ? 'done' : ''}>Viewed</span><span className={row.acknowledged_at || ['acknowledged','actioned'].includes(row.status) ? 'done' : ''}>Acknowledged</span><span className={row.actioned_at || row.status === 'actioned' ? 'done' : ''}>Actioned</span></div></div>{inbound && row.status !== 'actioned' && <div className="care-row-actions">{!['acknowledged','actioned'].includes(row.status) && <button onClick={() => updateTransfer(row, 'acknowledged')}><CircleCheck size={13}/>Acknowledge</button>}<button className="primary-button" onClick={() => updateTransfer(row, 'actioned')}><CheckCircle2 size={13}/>Actioned</button></div>}</article>
        })}</div>}
      </Panel>}

      {tab === 'network' && <Panel title="Connected care network" count={members.length}>
        <div className="shared-care-network-map">{members.map((member, index) => <React.Fragment key={member.organisationId}><article className={member.organisationId === currentOrganisationId ? 'current' : ''}><Building2 size={19}/><div><span>{sharedCareModeLabel(member.mode)}</span><strong>{member.name}</strong><small>@{member.code}{member.organisationId === currentOrganisationId ? ' · Current organisation' : ''}</small></div></article>{index < members.length - 1 && <div className="network-connector"><span></span></div>}</React.Fragment>)}</div>
        <div className="shared-care-network-note"><Network size={16}/><p>RecordsWeb automatically combines connected Shared Care links into one workspace. A chain such as Hospital → GP → Ambulance therefore collaborates in the same network workspace. Clinical-record visibility still follows the permissions configured on each direct Shared Care relationship.</p></div>
      </Panel>}
    </section>
  )
}
