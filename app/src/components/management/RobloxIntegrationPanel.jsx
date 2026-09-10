import React, { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Copy, Gamepad2, KeyRound, Power, RefreshCw, RotateCcw, Save, ShieldCheck, Unplug, Wifi } from 'lucide-react'
import {
  generateRobloxConnectionCode,
  getRobloxIntegration,
  revokeRobloxConnectionCode,
  saveRobloxIntegration,
} from '../../lib/robloxIntegrationService'

function formatDate(value) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Never'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(date)
}

function normaliseIdList(value) {
  return String(value || '')
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function validateNumericId(value, label) {
  if (!value) return ''
  return /^\d{1,20}$/.test(value) ? '' : `${label} must contain numbers only.`
}

export default function RobloxIntegrationPanel() {
  const [state, setState] = useState(null)
  const [enabled, setEnabled] = useState(false)
  const [universeId, setUniverseId] = useState('')
  const [placeIdsText, setPlaceIdsText] = useState('')
  const [displayNameMode, setDisplayNameMode] = useState('first_name_last_initial')
  const [displayDurationSeconds, setDisplayDurationSeconds] = useState(12)
  const [newCode, setNewCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const endpoint = useMemo(() => {
    const root = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
    return root ? `${root}/functions/v1/recordsweb-game-api` : 'https://YOUR_PROJECT.supabase.co/functions/v1/recordsweb-game-api'
  }, [])

  function applyStatus(result) {
    const integration = result?.integration || result || {}
    setState(integration)
    setEnabled(Boolean(integration.enabled))
    setUniverseId(String(integration.universe_id || ''))
    setPlaceIdsText(Array.isArray(integration.place_ids) ? integration.place_ids.join(', ') : '')
    setDisplayNameMode(integration.display_name_mode || 'first_name_last_initial')
    setDisplayDurationSeconds(Number(integration.display_duration_seconds) || 12)
  }

  async function load() {
    setBusy(true); setError('')
    try { applyStatus(await getRobloxIntegration()) }
    catch (err) { setError(err?.message || 'Unable to load Roblox integration.') }
    finally { setBusy(false) }
  }

  useEffect(() => { load() }, [])

  async function save() {
    setError(''); setNotice('')
    const cleanUniverse = universeId.trim()
    const places = normaliseIdList(placeIdsText)
    const universeError = validateNumericId(cleanUniverse, 'Universe ID')
    if (universeError) { setError(universeError); return }
    const invalidPlace = places.find((item) => !/^\d{1,20}$/.test(item))
    if (invalidPlace) { setError(`Place ID ${invalidPlace} is invalid. Place IDs must contain numbers only.`); return }
    if (enabled && !state?.has_key) { setError('Generate a connection code before enabling the Roblox integration.'); return }
    setBusy(true)
    try {
      const result = await saveRobloxIntegration({ enabled, universeId: cleanUniverse, placeIds: places, displayNameMode, displayDurationSeconds })
      applyStatus(result)
      setNotice('Roblox integration settings saved.')
    } catch (err) { setError(err?.message || 'Unable to save Roblox integration settings.') }
    finally { setBusy(false) }
  }

  async function generate() {
    const verb = state?.has_key ? 'regenerate' : 'generate'
    if (state?.has_key && !window.confirm('Regenerating the connection code immediately disconnects any Roblox servers still using the old code. Continue?')) return
    setBusy(true); setError(''); setNotice(''); setNewCode('')
    try {
      const result = await generateRobloxConnectionCode()
      setNewCode(result?.connection_code || '')
      applyStatus(result)
      setNotice(`Connection code ${verb}d. Copy it now; RecordsWeb will not show the full code again after you leave this page.`)
    } catch (err) { setError(err?.message || 'Unable to generate the Roblox connection code.') }
    finally { setBusy(false) }
  }

  async function revoke() {
    if (!window.confirm('Revoke this community\'s Roblox connection code? Connected game servers will stop receiving RecordsWeb calls immediately.')) return
    setBusy(true); setError(''); setNotice(''); setNewCode('')
    try {
      const result = await revokeRobloxConnectionCode()
      applyStatus(result)
      setNotice('Roblox connection code revoked and the integration disabled.')
    } catch (err) { setError(err?.message || 'Unable to revoke the Roblox connection code.') }
    finally { setBusy(false) }
  }

  async function copy(value, label) {
    try {
      await navigator.clipboard.writeText(value)
      setNotice(`${label} copied.`)
    } catch {
      setError(`Unable to copy ${label.toLowerCase()}. Select it and copy it manually.`)
    }
  }

  const connectedRecently = state?.last_heartbeat_at && Date.now() - new Date(state.last_heartbeat_at).getTime() < 30000

  return (
    <div className="roblox-integration-panel">
      <div className="roblox-integration-heading">
        <div><Gamepad2 size={22}/><div><strong>Roblox integration</strong><span>Connect this RecordsWeb community to its Roblox experience and display patient calls on in-game waiting-room screens.</span></div></div>
        <button onClick={load} disabled={busy}><RefreshCw size={14}/> Refresh</button>
      </div>

      <div className="roblox-status-grid">
        <div><Power size={18}/><strong>{state?.enabled ? 'Enabled' : 'Disabled'}</strong><span>Integration</span></div>
        <div className={connectedRecently ? 'online' : ''}><Wifi size={18}/><strong>{connectedRecently ? 'Connected' : 'Offline'}</strong><span>Game heartbeat</span></div>
        <div><KeyRound size={18}/><strong>{state?.has_key ? `•••• ${state.key_last_four || 'ready'}` : 'Not created'}</strong><span>Connection code</span></div>
        <div><ShieldCheck size={18}/><strong>{state?.last_place_id || '—'}</strong><span>Last Place ID</span></div>
      </div>

      <section className="roblox-settings-card">
        <header><div><strong>Connection</strong><span>The connection code is a secret. Put it only in the server-side Roblox configuration.</span></div></header>
        <div className="roblox-form-grid">
          <label className="roblox-toggle-row"><span>Enable integration</span><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /></label>
          <label><span>Universe ID <em>Recommended</em></span><input value={universeId} onChange={(e) => setUniverseId(e.target.value.replace(/\D/g, ''))} placeholder="1234567890"/><small>Use <code>game.GameId</code>. Leave blank only while initially testing.</small></label>
          <label className="roblox-wide"><span>Allowed Place IDs <em>Optional</em></span><input value={placeIdsText} onChange={(e) => setPlaceIdsText(e.target.value)} placeholder="1234567890, 9876543210"/><small>Comma-separated. When set, requests from other places are rejected.</small></label>
          <label><span>Patient display</span><select value={displayNameMode} onChange={(e) => setDisplayNameMode(e.target.value)}><option value="first_name_last_initial">First name + surname initial</option><option value="full_name">Full patient name</option><option value="record_number">Record number only</option></select></label>
          <label><span>Display duration</span><select value={displayDurationSeconds} onChange={(e) => setDisplayDurationSeconds(Number(e.target.value))}><option value={8}>8 seconds</option><option value={10}>10 seconds</option><option value={12}>12 seconds</option><option value={15}>15 seconds</option><option value={20}>20 seconds</option><option value={30}>30 seconds</option></select></label>
        </div>
        <div className="roblox-card-actions"><button className="primary-button" onClick={save} disabled={busy}><Save size={14}/> Save integration settings</button></div>
      </section>

      <section className="roblox-settings-card">
        <header><div><strong>Game connection code</strong><span>Each community has its own secret code. Regenerating it invalidates the previous one instantly.</span></div></header>
        {newCode && <div className="roblox-secret-box"><div><strong>New connection code</strong><span>This is shown in full only now.</span></div><div className="roblox-copy-line"><input readOnly value={newCode}/><button onClick={() => copy(newCode, 'Connection code')}><Copy size={14}/> Copy</button></div></div>}
        <div className="roblox-endpoint-row"><label><span>Game API endpoint</span><input readOnly value={endpoint}/></label><button onClick={() => copy(endpoint, 'Game API endpoint')}><Copy size={14}/> Copy</button></div>
        <div className="roblox-card-actions">
          <button onClick={generate} disabled={busy}><RotateCcw size={14}/>{state?.has_key ? 'Regenerate connection code' : 'Generate connection code'}</button>
          {state?.has_key && <button className="danger-button" onClick={revoke} disabled={busy}><Unplug size={14}/> Revoke connection code</button>}
        </div>
      </section>

      <section className="roblox-settings-card roblox-heartbeat-card">
        <header><div><strong>Connection status</strong><span>Roblox servers send a heartbeat whenever they poll RecordsWeb for patient-call events.</span></div></header>
        <dl>
          <div><dt>Last heartbeat</dt><dd>{formatDate(state?.last_heartbeat_at)}</dd></div>
          <div><dt>Universe</dt><dd>{state?.last_universe_id || '—'}</dd></div>
          <div><dt>Place</dt><dd>{state?.last_place_id || '—'}</dd></div>
          <div><dt>Server job</dt><dd>{state?.last_server_id || '—'}</dd></div>
        </dl>
      </section>

      {error && <div className="form-error">{error}</div>}
      {notice && <div className="roblox-notice"><CheckCircle2 size={15}/>{notice}</div>}
      <div className="roblox-help-note">When an appointment changes to <strong>S — Patient in consulting room</strong>, Supabase creates a short-lived patient-call event. Connected Roblox servers receive that event on their next poll and display it on every <strong>RecordsWebDisplay</strong> screen in the experience.</div>
    </div>
  )
}
