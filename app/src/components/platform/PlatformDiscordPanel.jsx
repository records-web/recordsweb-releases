import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Hash,
  Megaphone,
  RefreshCw,
  RotateCcw,
  Send,
  Server,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import {
  getPlatformDiscordOverview,
  listPlatformDiscordIntegrations,
  listPlatformDiscordLogs,
  runPlatformDiscordHealthCheck,
  sendPlatformDiscordBroadcast,
  sendPlatformDiscordTest,
  retryPlatformDiscordBroadcast,
} from '../../lib/discordIntegrationService'

const TABS = [
  ['overview', 'Overview'],
  ['announcements', 'Announcements'],
  ['maintenance', 'Maintenance'],
  ['servers', 'Connected Servers'],
  ['logs', 'Delivery Logs'],
  ['health', 'Bot Health'],
  ['config', 'Configuration'],
]

const MODE_OPTIONS = [
  ['general_practice', 'Primary Care (GP)'],
  ['hospital', 'Secondary Care (Hospital)'],
  ['ambulance', 'Ambulance / PHEM'],
]

const SERVICE_OPTIONS = [
  'Website',
  'Desktop application',
  'Shared Care',
  'Discord integration',
  'Roblox bridge',
  'Billing & payments',
]

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function statusLabel(status) {
  return String(status || 'unknown').replaceAll('_', ' ')
}

function BroadcastComposer({ mode, integrations, onSent }) {
  const isMaintenance = mode === 'maintenance'
  const [type, setType] = useState(isMaintenance ? 'maintenance_planned' : 'announcement')
  const [severity, setSeverity] = useState(isMaintenance ? 'warning' : 'info')
  const [title, setTitle] = useState(isMaintenance ? 'Planned RecordsWeb Maintenance' : 'RecordsWeb announcement')
  const [message, setMessage] = useState('')
  const [scope, setScope] = useState('all')
  const [modes, setModes] = useState([])
  const [selectedOrganisations, setSelectedOrganisations] = useState([])
  const [services, setServices] = useState([])
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!isMaintenance) return
    if (type === 'maintenance_complete') {
      setSeverity('success')
      setTitle('RecordsWeb maintenance complete')
    } else if (type === 'maintenance_started') {
      setSeverity('warning')
      setTitle('RecordsWeb maintenance has started')
    } else if (type === 'maintenance_update') {
      setSeverity('warning')
      setTitle('RecordsWeb maintenance update')
    } else {
      setSeverity('warning')
      setTitle('Planned RecordsWeb Maintenance')
    }
  }, [isMaintenance, type])

  function toggleArray(setter, current, value) {
    setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  }

  async function send() {
    if (!title.trim() || !message.trim()) {
      setError('Enter a title and message before sending.')
      return
    }
    if (scope === 'modes' && modes.length === 0) {
      setError('Select at least one care setting.')
      return
    }
    if (scope === 'selected' && selectedOrganisations.length === 0) {
      setError('Select at least one community.')
      return
    }
    if (!window.confirm('Send this RecordsWeb Discord broadcast to the selected community status channels?')) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await sendPlatformDiscordBroadcast({
        type,
        severity,
        title,
        message,
        scope,
        modes,
        organisationIds: selectedOrganisations,
        affectedServices: services,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      })
      setNotice(`Broadcast sent to ${Number(result.sent || 0)} status channel${Number(result.sent || 0) === 1 ? '' : 's'}${result.failed ? `; ${result.failed} failed` : ''}.`)
      if (result.failed) setError(`${result.failed} delivery attempt${result.failed === 1 ? '' : 's'} failed. Open Delivery Logs for details.`)
      onSent?.()
    } catch (err) {
      setError(err?.message || 'Unable to send the Discord broadcast.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="platform-discord-composer">
    <div className="platform-discord-composer-grid">
      {isMaintenance && <label><span>Maintenance stage</span><select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="maintenance_planned">Planned maintenance</option>
        <option value="maintenance_started">Maintenance started</option>
        <option value="maintenance_update">Maintenance update</option>
        <option value="maintenance_complete">Maintenance complete</option>
      </select></label>}
      {!isMaintenance && <label><span>Announcement type</span><select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="announcement">General announcement</option>
        <option value="incident">Service incident</option>
        <option value="critical">Critical platform notice</option>
      </select></label>}
      <label><span>Severity</span><select value={severity} onChange={(e) => setSeverity(e.target.value)}>
        <option value="info">Information</option>
        <option value="warning">Warning</option>
        <option value="critical">Critical</option>
        <option value="success">Resolved / success</option>
      </select></label>
      <label className="wide"><span>Title</span><input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="wide"><span>Message</span><textarea rows={6} maxLength={1800} value={message} onChange={(e) => setMessage(e.target.value)} /><small>{message.length}/1800</small></label>
      <label><span>Starts <em>Optional</em></span><input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></label>
      <label><span>Expected end <em>Optional</em></span><input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></label>
    </div>

    <div className="platform-discord-targets">
      <strong>Broadcast target</strong>
      <div className="platform-discord-target-tabs">
        <button type="button" className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>All connected communities</button>
        <button type="button" className={scope === 'modes' ? 'active' : ''} onClick={() => setScope('modes')}>Care setting</button>
        <button type="button" className={scope === 'selected' ? 'active' : ''} onClick={() => setScope('selected')}>Selected communities</button>
      </div>
      {scope === 'modes' && <div className="platform-discord-check-grid">{MODE_OPTIONS.map(([value, label]) => <label key={value}><input type="checkbox" checked={modes.includes(value)} onChange={() => toggleArray(setModes, modes, value)} /> {label}</label>)}</div>}
      {scope === 'selected' && <div className="platform-discord-community-picker">{integrations.map((row) => <label key={row.organisation_id}><input type="checkbox" checked={selectedOrganisations.includes(row.organisation_id)} onChange={() => toggleArray(setSelectedOrganisations, selectedOrganisations, row.organisation_id)} /><span><strong>{row.organisation_name}</strong><small>@{row.organisation_code} · #{row.channel_name || 'status-channel'}</small></span></label>)}</div>}
    </div>

    <div className="platform-discord-services">
      <strong>Affected services <span>Optional</span></strong>
      <div className="platform-discord-check-grid">{SERVICE_OPTIONS.map((service) => <label key={service}><input type="checkbox" checked={services.includes(service)} onChange={() => toggleArray(setServices, services, service)} /> {service}</label>)}</div>
    </div>

    <div className="platform-discord-preview">
      <div><Megaphone size={18}/><strong>{title || 'RecordsWeb announcement'}</strong></div>
      <p>{message || 'Your message preview will appear here.'}</p>
      {services.length > 0 && <small>Affected: {services.join(', ')}</small>}
    </div>

    {error && <div className="review-request-message error">{error}</div>}
    {notice && <div className="review-request-message success"><CheckCircle2 size={14}/>{notice}</div>}
    <div className="platform-panel-actions"><button className="primary" type="button" disabled={busy} onClick={send}><Send size={14}/>{busy ? 'Sending…' : 'Send broadcast'}</button></div>
  </div>
}

export default function PlatformDiscordPanel() {
  const [tab, setTab] = useState('overview')
  const [overview, setOverview] = useState(null)
  const [integrations, setIntegrations] = useState([])
  const [logs, setLogs] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const [nextOverview, nextIntegrations, nextLogs] = await Promise.all([
        getPlatformDiscordOverview(),
        listPlatformDiscordIntegrations(),
        listPlatformDiscordLogs(),
      ])
      setOverview(nextOverview)
      setIntegrations(nextIntegrations.integrations || [])
      setLogs(nextLogs.logs || [])
    } catch (err) {
      setError(err?.message || 'Unable to load RecordsWeb Discord operations.')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const counts = overview?.counts || {}
  const bot = overview?.bot || null

  const deliverySummary = useMemo(() => {
    const sent = logs.filter((row) => row.status === 'sent').length
    const failed = logs.filter((row) => row.status === 'failed').length
    return { sent, failed }
  }, [logs])

  async function healthCheck() {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await runPlatformDiscordHealthCheck()
      setNotice(`Checked ${Number(result.checked || 0)} Discord connection${Number(result.checked || 0) === 1 ? '' : 's'}; ${Number(result.failed || 0)} need attention.`)
      await load()
    } catch (err) { setError(err?.message || 'Discord health check failed.') }
    finally { setBusy(false) }
  }

  async function test(row) {
    setBusy(true); setError(''); setNotice('')
    try {
      await sendPlatformDiscordTest(row.organisation_id)
      setNotice(`Test message sent to ${row.organisation_name} #${row.channel_name}.`)
      await load()
    } catch (err) { setError(err?.message || 'Unable to send the test message.') }
    finally { setBusy(false) }
  }

  async function retry(broadcastId) {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await retryPlatformDiscordBroadcast(broadcastId)
      setNotice(`Retry completed: ${Number(result.sent || 0)} sent, ${Number(result.failed || 0)} failed.`)
      await load()
    } catch (err) { setError(err?.message || 'Unable to retry failed Discord deliveries.') }
    finally { setBusy(false) }
  }

  return <section className="platform-operator-panel platform-discord-operations">
    <header><div><span>PLATFORM DISCORD</span><h2>Discord operations</h2><p>Send RecordsWeb platform notices to community status channels and monitor the official RecordsWeb Bot.</p></div><button onClick={load} disabled={busy}><RefreshCw size={14}/> Refresh</button></header>

    <div className="platform-discord-tabs">{TABS.map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}</div>

    {error && <div className="review-request-message error">{error}</div>}
    {notice && <div className="review-request-message success"><CheckCircle2 size={14}/>{notice}</div>}

    {tab === 'overview' && <div className="platform-discord-overview">
      <div className={`platform-discord-bot-card ${bot ? 'online' : 'offline'}`}><Bot size={28}/><div><strong>{bot?.username || 'RecordsWeb Bot'}</strong><span>{bot ? 'Connected to Discord' : overview?.error || 'Bot unavailable'}</span></div><b>{bot ? 'ONLINE' : 'OFFLINE'}</b></div>
      <div className="platform-discord-metrics">
        <div><Server size={18}/><strong>{counts.connected || 0}</strong><span>Connected communities</span></div>
        <div><Hash size={18}/><strong>{counts.status_channels || 0}</strong><span>Status channels</span></div>
        <div><CheckCircle2 size={18}/><strong>{counts.sent_today || 0}</strong><span>Deliveries today</span></div>
        <div><AlertTriangle size={18}/><strong>{counts.failed_today || 0}</strong><span>Failures today</span></div>
      </div>
      <div className="platform-discord-overview-actions"><button onClick={() => setTab('announcements')}><Megaphone size={15}/> New announcement</button><button onClick={() => setTab('maintenance')}><Wrench size={15}/> Maintenance notice</button><button onClick={healthCheck} disabled={busy}><ShieldCheck size={15}/> Check all connections</button></div>
    </div>}

    {tab === 'announcements' && <BroadcastComposer mode="announcement" integrations={integrations} onSent={load} />}
    {tab === 'maintenance' && <BroadcastComposer mode="maintenance" integrations={integrations} onSent={load} />}

    {tab === 'servers' && <div className="platform-discord-server-list">
      <div className="platform-discord-server-row head"><strong>Community</strong><strong>Discord server</strong><strong>Status channel</strong><strong>Notifications</strong><span /></div>
      {integrations.length === 0 && <div className="platform-empty">No communities have connected RecordsWeb Bot yet.</div>}
      {integrations.map((row) => <div className="platform-discord-server-row" key={row.organisation_id}>
        <div><strong>{row.organisation_name}</strong><span>@{row.organisation_code} · {MODE_OPTIONS.find(([value]) => value === row.system_mode)?.[1] || row.system_mode}</span></div>
        <div><strong>{row.guild_name || 'Discord server'}</strong><span>{row.guild_id}</span></div>
        <div><strong>#{row.channel_name || 'channel'}</strong><span>{row.channel_id}</span></div>
        <div><span>{row.maintenance_notifications ? 'Maintenance' : 'No maintenance'} · {row.platform_announcements_enabled ? 'Announcements' : 'No announcements'}</span><small>{row.last_error || `Verified ${formatDate(row.verified_at)}`}</small></div>
        <button onClick={() => test(row)} disabled={busy}><Send size={13}/> Test</button>
      </div>)}
    </div>}

    {tab === 'logs' && <div className="platform-discord-log-list">
      <div className="platform-discord-log-summary"><span>{deliverySummary.sent} sent</span><span>{deliverySummary.failed} failed</span></div>
      <div className="platform-discord-log-row head"><strong>Broadcast</strong><strong>Community</strong><strong>Status</strong><strong>Attempt</strong><span /></div>
      {logs.length === 0 && <div className="platform-empty">No Discord delivery records yet.</div>}
      {logs.map((row) => <div className="platform-discord-log-row" key={row.id}>
        <div><strong>{row.broadcast_title || row.broadcast_type || 'RecordsWeb broadcast'}</strong><span>{row.broadcast_type || 'announcement'}</span></div>
        <div><strong>{row.organisation_name || 'Community'}</strong><span>#{row.channel_name || row.channel_id || 'channel'}</span></div>
        <div><span className={`platform-discord-delivery ${row.status}`}>{statusLabel(row.status)}</span><small>{row.error || row.discord_message_id || ''}</small></div>
        <span>{formatDate(row.attempted_at)}</span>
        <div>{row.status === 'failed' && row.broadcast_id ? <button onClick={() => retry(row.broadcast_id)} disabled={busy}><RotateCcw size={12}/> Retry broadcast</button> : null}</div>
      </div>)}
    </div>}

    {tab === 'health' && <div className="platform-discord-health">
      <div className="platform-discord-health-head"><div><Bot size={20}/><strong>RecordsWeb Bot health</strong><span>Validate every configured guild and status channel against Discord.</span></div><button className="primary" onClick={healthCheck} disabled={busy}><RefreshCw size={14}/>{busy ? 'Checking…' : 'Run health check'}</button></div>
      <div className="platform-discord-health-grid">
        <div><span>Bot</span><strong>{bot ? 'Online' : 'Unavailable'}</strong></div>
        <div><span>Configured servers</span><strong>{counts.connected || 0}</strong></div>
        <div><span>Needs attention</span><strong>{integrations.filter((row) => row.last_error).length}</strong></div>
        <div><span>Last delivery</span><strong>{logs[0] ? formatDate(logs[0].attempted_at) : 'No deliveries'}</strong></div>
      </div>
      <div className="platform-discord-health-list">{integrations.map((row) => <div key={row.organisation_id} className={row.last_error ? 'bad' : 'good'}><span>{row.last_error ? <AlertTriangle size={14}/> : <CheckCircle2 size={14}/>}</span><div><strong>{row.organisation_name}</strong><small>{row.last_error || `#${row.channel_name} verified ${formatDate(row.verified_at)}`}</small></div></div>)}</div>
    </div>}

    {tab === 'config' && <div className="platform-discord-config">
      <div><Bot size={22}/><strong>Official RecordsWeb Bot</strong><span>One platform-owned bot is used across all connected community Discord servers. The bot token remains in Supabase Edge Function secrets and is never exposed to the browser.</span></div>
      <div><Server size={22}/><strong>Status-channel model</strong><span>Each community chooses its own RecordsWeb status channel in Community Management. Platform Management can broadcast only to those configured channels.</span></div>
      <div><ShieldCheck size={22}/><strong>Delivery safety</strong><span>Messages disable Discord mentions, every attempt is logged, failed sends can be retried, and communities can control general announcement/maintenance preferences.</span></div>
      <div><Clock3 size={22}/><strong>Maintenance lifecycle</strong><span>Use Planned, Started, Update and Complete messages from the Maintenance tab. Start and expected-end times are included when supplied.</span></div>
    </div>}
  </section>
}
