import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Command, Pencil, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react'
import {
  deletePlatformDiscordCommand,
  listPlatformDiscordCommands,
  savePlatformDiscordCommand,
} from '../../lib/discordIntegrationService'

const EMPTY = {
  id: '',
  name: '',
  description: '',
  response: '',
  responseMode: 'text',
  ephemeral: false,
  enabled: true,
  showInHelp: true,
  accentColor: 0x0F6FBD,
}

function fromRow(row) {
  return {
    id: row?.id || '',
    name: row?.name || '',
    description: row?.description || '',
    response: row?.response || '',
    responseMode: row?.response_mode === 'embed' ? 'embed' : 'text',
    ephemeral: row?.ephemeral === true,
    enabled: row?.enabled !== false,
    showInHelp: row?.show_in_help !== false,
    accentColor: Number(row?.accent_color || 0x0F6FBD),
  }
}

export default function PlatformDiscordCommandsPanel() {
  const [commands, setCommands] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const result = await listPlatformDiscordCommands()
      setCommands(result.commands || [])
    } catch (err) {
      setError(err?.message || 'Unable to load Discord commands.')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const editing = Boolean(form.id)
  const reserved = useMemo(() => ['ping', 'status', 'recordsweb', 'help'], [])

  function reset() {
    setForm(EMPTY)
    setError('')
  }

  async function save() {
    setBusy(true); setError(''); setNotice('')
    try {
      const name = form.name.trim().toLowerCase()
      if (!/^[a-z0-9_-]{1,32}$/.test(name)) throw new Error('Use 1–32 lowercase letters, numbers, hyphens or underscores for the command name.')
      if (reserved.includes(name)) throw new Error(`/${name} is built into RecordsWeb Bot.`)
      if (!form.description.trim()) throw new Error('Enter a command description.')
      if (!form.response.trim()) throw new Error('Enter the bot response.')
      await savePlatformDiscordCommand({ ...form, name })
      setNotice(`/${name} saved. The 24/7 bot will sync it to connected Discord servers within about 60 seconds.`)
      setForm(EMPTY)
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to save Discord command.')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(row) {
    setBusy(true); setError(''); setNotice('')
    try {
      await savePlatformDiscordCommand({ ...fromRow(row), enabled: row.enabled === false })
      setNotice(`/${row.name} ${row.enabled === false ? 'enabled' : 'disabled'}.`)
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to update Discord command.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(row) {
    if (!window.confirm(`Delete the /${row.name} Discord command?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await deletePlatformDiscordCommand(row.id)
      if (form.id === row.id) setForm(EMPTY)
      setNotice(`/${row.name} deleted. The bot will remove it from connected servers on its next command sync.`)
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to delete Discord command.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="platform-discord-command-manager">
    <div className="platform-discord-command-head">
      <div><Command size={20}/><div><strong>Custom slash commands</strong><span>Create commands here or add JavaScript commands to the bot's <code>src/commands</code> folder.</span></div></div>
      <button onClick={load} disabled={busy}><RefreshCw size={14}/> Refresh</button>
    </div>

    {error && <div className="review-request-message error">{error}</div>}
    {notice && <div className="review-request-message success"><CheckCircle2 size={14}/>{notice}</div>}

    <div className="platform-discord-command-layout">
      <div className="platform-discord-command-form">
        <h3>{editing ? `Edit /${form.name}` : 'Add command'}</h3>
        <div className="platform-discord-command-grid">
          <label><span>Command name</span><div className="platform-discord-command-name"><b>/</b><input value={form.name} maxLength={32} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} placeholder="information" /></div></label>
          <label><span>Discord description</span><input value={form.description} maxLength={100} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Show RecordsWeb information" /></label>
          <label className="wide"><span>Response</span><textarea value={form.response} maxLength={1900} rows={7} onChange={(e) => setForm({ ...form, response: e.target.value })} placeholder="RecordsWeb information goes here…"/><small>Supported placeholders: <code>{'{{user}}'}</code>, <code>{'{{server}}'}</code>, <code>{'{{recordsweb_url}}'}</code>.</small></label>
          <label><span>Response style</span><select value={form.responseMode} onChange={(e) => setForm({ ...form, responseMode: e.target.value })}><option value="text">Normal message</option><option value="embed">RecordsWeb embed</option></select></label>
          <label className="platform-discord-command-check"><input type="checkbox" checked={form.ephemeral} onChange={(e) => setForm({ ...form, ephemeral: e.target.checked })}/><span>Only command user can see the response</span></label>
          <label className="platform-discord-command-check"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })}/><span>Command enabled</span></label>
          <label className="platform-discord-command-check"><input type="checkbox" checked={form.showInHelp} onChange={(e) => setForm({ ...form, showInHelp: e.target.checked })}/><span>Show in /help</span></label>
        </div>
        <div className="platform-panel-actions">
          <button className="primary" type="button" onClick={save} disabled={busy}><Save size={14}/>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add command'}</button>
          {editing && <button type="button" onClick={reset} disabled={busy}><X size={14}/> Cancel edit</button>}
        </div>
      </div>

      <div className="platform-discord-command-list">
        <div className="platform-discord-command-list-title"><strong>Website-managed commands</strong><span>{commands.length} configured · bot sync interval ≈ 60 seconds</span></div>
        {commands.length === 0 && <div className="platform-empty">No custom commands yet. Built-in commands remain available: /ping, /status, /recordsweb and /help.</div>}
        {commands.map((row) => <div className={`platform-discord-command-row ${row.enabled === false ? 'disabled' : ''}`} key={row.id}>
          <div className="platform-discord-command-icon"><Command size={17}/></div>
          <div className="platform-discord-command-info"><strong>/{row.name}</strong><span>{row.description}</span><small>{row.response_mode === 'embed' ? 'Embed' : 'Message'} · {row.ephemeral ? 'Private response' : 'Public response'} · {row.show_in_help === false ? 'Hidden from /help' : 'Shown in /help'}</small></div>
          <span className={`platform-discord-command-state ${row.enabled === false ? 'off' : 'on'}`}>{row.enabled === false ? 'Disabled' : 'Enabled'}</span>
          <div className="platform-discord-command-actions">
            <button title="Edit command" onClick={() => { setForm(fromRow(row)); setError(''); setNotice('') }} disabled={busy}><Pencil size={13}/></button>
            <button title={row.enabled === false ? 'Enable command' : 'Disable command'} onClick={() => toggle(row)} disabled={busy}>{row.enabled === false ? <Plus size={13}/> : <X size={13}/>}</button>
            <button className="danger" title="Delete command" onClick={() => remove(row)} disabled={busy}><Trash2 size={13}/></button>
          </div>
        </div>)}
      </div>
    </div>
  </div>
}
