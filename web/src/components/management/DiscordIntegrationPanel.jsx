import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bot, CheckCircle2, ExternalLink, Hash, RefreshCw, Save, Send, Server, Unplug } from 'lucide-react'
import {
  discoverDiscordServer,
  disconnectDiscordIntegration,
  loadDiscordIntegration,
  saveDiscordIntegration,
  sendDiscordTest,
} from '../../lib/discordIntegrationService'

function cleanSnowflake(value) {
  return String(value || '').trim().replace(/\D+/g, '')
}

export default function DiscordIntegrationPanel() {
  const [status, setStatus] = useState(null)
  const [guildId, setGuildId] = useState('')
  const [channelId, setChannelId] = useState('')
  const [channels, setChannels] = useState([])
  const [maintenanceNotifications, setMaintenanceNotifications] = useState(true)
  const [loginDmEnabled, setLoginDmEnabled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const integration = status?.integration || null
  const bot = status?.bot || null
  const connected = Boolean(integration?.guild_id && integration?.channel_id)
  const selectedChannel = useMemo(() => channels.find((item) => item.id === channelId), [channels, channelId])

  function applyStatus(next) {
    setStatus(next)
    const row = next?.integration || null
    if (row) {
      setGuildId(row.guild_id || '')
      setChannelId(row.channel_id || '')
      setMaintenanceNotifications(row.maintenance_notifications !== false)
      setLoginDmEnabled(row.login_dm_enabled !== false)
    }
    if (Array.isArray(next?.channels)) setChannels(next.channels)
  }

  async function load() {
    setBusy(true); setError(''); setNotice('')
    try { applyStatus(await loadDiscordIntegration()) }
    catch (err) { setError(err.message || 'Unable to load Discord integration.') }
    finally { setBusy(false) }
  }

  useEffect(() => { load() }, [])

  async function discover() {
    const clean = cleanSnowflake(guildId)
    if (!/^\d{17,20}$/.test(clean)) { setError('Enter the Discord server ID. It should be a 17–20 digit number.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await discoverDiscordServer(clean)
      setGuildId(clean)
      setChannels(result.channels || [])
      setStatus((current) => ({ ...(current || {}), bot: result.bot || current?.bot, discovered_guild: result.guild }))
      if (result.guild?.name) setNotice(`RecordsWeb Bot found ${result.guild.name}. Choose the maintenance channel below.`)
    } catch (err) { setChannels([]); setError(err.message || 'Unable to find that Discord server.') }
    finally { setBusy(false) }
  }

  async function save() {
    const cleanGuild = cleanSnowflake(guildId)
    const cleanChannel = cleanSnowflake(channelId)
    if (!/^\d{17,20}$/.test(cleanGuild)) { setError('Enter a valid Discord server ID.'); return }
    if (!/^\d{17,20}$/.test(cleanChannel)) { setError('Select or enter a valid maintenance channel.'); return }
    if (!window.confirm(`Connect this RecordsWeb community to ${status?.discovered_guild?.name || integration?.guild_name || 'the selected Discord server'}?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await saveDiscordIntegration({ guildId: cleanGuild, channelId: cleanChannel, maintenanceNotifications, loginDmEnabled })
      applyStatus(result)
      setNotice('Discord integration saved and verified.')
    } catch (err) { setError(err.message || 'Unable to save Discord integration.') }
    finally { setBusy(false) }
  }

  async function test() {
    setBusy(true); setError(''); setNotice('')
    try {
      await sendDiscordTest()
      setNotice(`Test message sent to #${integration?.channel_name || selectedChannel?.name || 'configured-channel'}.`)
    } catch (err) { setError(err.message || 'Unable to send the Discord test message.') }
    finally { setBusy(false) }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect this community from RecordsWeb Bot? Automatic maintenance messages and login DMs will stop.')) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await disconnectDiscordIntegration()
      applyStatus(result)
      setGuildId(''); setChannelId(''); setChannels([])
      setNotice('Discord integration disconnected.')
    } catch (err) { setError(err.message || 'Unable to disconnect Discord.') }
    finally { setBusy(false) }
  }

  if (!status && busy) {
    return <section className="management-panel discord-integration-panel"><header><strong>RecordsWeb Bot</strong></header><div className="discord-panel-loading">Loading Discord integration…</div></section>
  }

  return (
    <section className="management-panel discord-integration-panel">
      <header>
        <Bot size={15}/><strong>RecordsWeb Bot</strong><span className="discord-panel-subtitle">Community Discord integration</span><div className="management-panel-spacer"/>
        <button className="secondary-button" type="button" onClick={load} disabled={busy}><RefreshCw size={13}/> Refresh</button>
      </header>

      <div className="discord-integration-body">
        <div className={`discord-status-card ${connected ? 'connected' : 'disconnected'}`}>
          <div className="discord-bot-mark"><Bot size={25}/></div>
          <div>
            <strong>{bot?.username ? `${bot.username}${bot.discriminator && bot.discriminator !== '0' ? `#${bot.discriminator}` : ''}` : 'RecordsWeb Bot'}</strong>
            <span>{connected ? `Connected to ${integration.guild_name || 'Discord server'} · #${integration.channel_name || 'channel'}` : 'Not connected to this community yet'}</span>
          </div>
          <div className="discord-status-pill">{connected ? <><CheckCircle2 size={13}/> Connected</> : <><AlertTriangle size={13}/> Setup required</>}</div>
        </div>

        {!status?.configured && (
          <div className="discord-service-warning"><AlertTriangle size={16}/><div><strong>RecordsWeb Bot is not configured on the platform.</strong><span>The platform operator must deploy the <code>recordsweb-discord</code> Edge Function and set <code>RECORDSWEB_DISCORD_BOT_TOKEN</code>.</span></div></div>
        )}

        {status?.configured && status?.error && (
          <div className="discord-service-warning"><AlertTriangle size={16}/><div><strong>RecordsWeb Bot could not authenticate with Discord.</strong><span>{status.error}</span></div></div>
        )}

        {status?.live_error && (
          <div className="discord-service-warning"><AlertTriangle size={16}/><div><strong>Discord connection needs attention.</strong><span>{status.live_error}</span></div></div>
        )}

        <div className="discord-setup-grid">
          <div className="discord-setup-card">
            <div className="discord-step-title"><span>1</span><div><strong>Add RecordsWeb Bot</strong><small>Add the single official RecordsWeb bot to your Discord server.</small></div></div>
            <p>The bot requests only the permissions it needs to view the allocated channel, send messages and embed maintenance information.</p>
            <button className="primary-button" type="button" disabled={!status?.configured || !bot?.invite_url} onClick={() => window.open(bot.invite_url, '_blank', 'noopener,noreferrer')}><ExternalLink size={13}/> Add bot to Discord</button>
          </div>

          <div className="discord-setup-card">
            <div className="discord-step-title"><span>2</span><div><strong>Select your server</strong><small>Paste the Discord Server ID after adding the bot.</small></div></div>
            <label className="discord-field"><span><Server size={12}/> Server ID</span><div className="discord-inline-input"><input value={guildId} onChange={(e) => setGuildId(cleanSnowflake(e.target.value))} placeholder="123456789012345678" inputMode="numeric"/><button type="button" onClick={discover} disabled={busy || !status?.configured}>Load channels</button></div></label>
            <small className="discord-help">Discord → User Settings → Advanced → Developer Mode, then right-click the server and choose Copy Server ID.</small>
          </div>

          <div className="discord-setup-card">
            <div className="discord-step-title"><span>3</span><div><strong>Allocate a maintenance channel</strong><small>Platform maintenance notices will be posted here automatically.</small></div></div>
            <label className="discord-field"><span><Hash size={12}/> Channel</span>
              {channels.length ? (
                <select value={channelId} onChange={(e) => setChannelId(e.target.value)}><option value="">Select a channel…</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}</select>
              ) : (
                <input value={channelId} onChange={(e) => setChannelId(cleanSnowflake(e.target.value))} placeholder="Channel ID" inputMode="numeric"/>
              )}
            </label>
            <small className="discord-help">Text and announcement channels are supported. RecordsWeb verifies that the bot can see the selected channel.</small>
          </div>
        </div>

        <div className="discord-options-card">
          <div><strong>Community automation</strong><span>Choose how this community uses RecordsWeb Bot.</span></div>
          <label><input type="checkbox" checked={maintenanceNotifications} onChange={(e) => setMaintenanceNotifications(e.target.checked)}/><span><strong>Automatic maintenance messages</strong><small>Post platform maintenance start/end information, maintenance text, estimated completion and RecordsWeb status link.</small></span></label>
          <label><input type="checkbox" checked={loginDmEnabled} onChange={(e) => setLoginDmEnabled(e.target.checked)}/><span><strong>Staff login DMs</strong><small>Allow Management to send a staff member their RecordsWeb username and a newly-set temporary password by Discord DM.</small></span></label>
        </div>

        {connected && (
          <div className="discord-connection-details">
            <div><span>Server</span><strong>{integration.guild_name || 'Discord server'}</strong><small>{integration.guild_id}</small></div>
            <div><span>Maintenance channel</span><strong>#{integration.channel_name || 'channel'}</strong><small>{integration.channel_id}</small></div>
            <div><span>Last verified</span><strong>{integration.verified_at ? new Date(integration.verified_at).toLocaleString() : 'Not recorded'}</strong><small>{integration.last_error || 'No connection errors'}</small></div>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}
        {notice && <div className="form-success">{notice}</div>}

        <div className="discord-actions">
          <button className="primary-button" type="button" onClick={save} disabled={busy || !status?.configured}><Save size={13}/>{busy ? 'Working…' : connected ? 'Save & verify' : 'Connect community'}</button>
          <button className="secondary-button" type="button" onClick={test} disabled={busy || !connected}><Send size={13}/> Send test message</button>
          {connected && <button className="secondary-button discord-disconnect" type="button" onClick={disconnect} disabled={busy}><Unplug size={13}/> Disconnect</button>}
        </div>

        <div className="discord-security-note"><strong>Credential safety</strong><span>RecordsWeb never stores a staff password in the Discord integration. Login DMs are sent only after Management creates or resets a temporary password, and the user is required to change it at next sign-in.</span></div>
      </div>
    </section>
  )
}
