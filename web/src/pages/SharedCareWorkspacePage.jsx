import React, { useEffect, useState } from 'react'
import { Handshake, MessageSquareText, Network, RefreshCw, Workflow } from 'lucide-react'
import Panel from '../components/Panel'
import SharedCareCollaboration from '../components/sharedcare/SharedCareCollaboration'
import { getSharedCareWorkspaceOverview, sharedCareModeLabel } from '../lib/sharedCareService'

export default function SharedCareWorkspacePage() {
  const [overview, setOverview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setBusy(true); setError('')
    try { setOverview(await getSharedCareWorkspaceOverview()) }
    catch (err) { setError(err?.message || 'Unable to load the Shared Care workspace.') }
    finally { setBusy(false) }
  }

  useEffect(() => { load() }, [])

  const workspace = overview?.workspace
  const members = overview?.members || []
  const counts = overview?.counts || {}

  return (
    <div className="care-workspace shared-care-workspace-page page-pad compact-pad">
      <div className="care-workspace-heading shared-care-workspace-heading">
        <div><span>SHARED CARE 3.0</span><h1>Shared Care Workspace</h1><p>One collaborative workspace for every RecordsWeb community connected through the same Shared Care network.</p></div>
        <div className="care-heading-actions"><button onClick={load} disabled={busy}><RefreshCw size={14}/>Refresh</button></div>
      </div>
      {error && <div className="form-error">{error}</div>}

      {!workspace ? <Panel title="No active Shared Care network"><div className="shared-care-empty-workspace"><Handshake size={32}/><strong>No Shared Care workspace is available yet.</strong><p>Once this organisation has an active Shared Care relationship with another RecordsWeb community, RecordsWeb automatically creates a shared workspace. Connected chains are merged automatically.</p></div></Panel> : <>
        <div className="care-stat-grid shared-care-workspace-stats">
          <article><Network size={20}/><div><strong>{members.length}</strong><span>Connected communities</span></div></article>
          <article><MessageSquareText size={20}/><div><strong>{counts.messages || 0}</strong><span>Workspace messages</span></div></article>
          <article><Workflow size={20}/><div><strong>{counts.openTasks || 0}</strong><span>Open shared tasks</span></div></article>
          <article><Handshake size={20}/><div><strong>{counts.handovers || 0}</strong><span>Handovers / transfers</span></div></article>
        </div>

        <Panel title="Care network membership" count={members.length}>
          <div className="shared-care-workspace-member-grid">{members.map((member) => <article key={member.organisationId} className={member.current ? 'current' : ''}><div className="member-mode">{sharedCareModeLabel(member.mode)}</div><strong>{member.name}</strong><span>@{member.code}</span>{member.current && <small>Current organisation</small>}</article>)}</div>
          <div className="shared-care-chain-explainer"><Network size={15}/><span>Connected links are treated as one network. For example, Hospital → GP and GP → Ambulance automatically places Hospital, GP and Ambulance in this same workspace.</span></div>
        </Panel>

        <SharedCareCollaboration overview={overview}/>
      </>}
    </div>
  )
}
