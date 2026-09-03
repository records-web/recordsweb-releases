import React, { useEffect, useState } from 'react'
import { Clock3, Power, RefreshCcw, Save, Wrench } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { DEFAULT_MAINTENANCE_STATE, loadMaintenanceState, setMaintenanceMode } from '../../lib/maintenanceMode'

function maintenanceErrorMessage(err) {
  const raw = String(err?.message || '')
  if (/organisation_code.*ambiguous/i.test(raw)) return 'Maintenance database function needs the RecordsWeb 3.1.1 Supabase hotfix.'
  return raw || 'Unable to update maintenance mode.'
}

function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

export default function MaintenancePanel() {
  const { session } = useAuth()
  const [state, setState] = useState(DEFAULT_MAINTENANCE_STATE)
  const [message, setMessage] = useState(DEFAULT_MAINTENANCE_STATE.message)
  const [estimatedEnd, setEstimatedEnd] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function load() {
    setError('')
    try {
      const next = await loadMaintenanceState()
      setState(next)
      setMessage(next.message)
      setEstimatedEnd(toLocalInput(next.estimated_end_at))
      if (next.setup_required) setError('System maintenance is not installed in Supabase. Run supabase/recordsweb-3.1.0.sql, then recordsweb-3.1.1.sql.')
    } catch (err) {
      setError(err.message || 'Unable to load maintenance state.')
    }
  }

  useEffect(() => { load() }, [])

  async function apply(enabled) {
    const question = enabled
      ? 'Enable RecordsWeb maintenance mode? Staff will be prevented from signing in until maintenance mode is disabled.'
      : 'End RecordsWeb maintenance mode and allow staff to sign in again?'
    if (!window.confirm(question)) return

    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const next = await setMaintenanceMode({
        enabled,
        message,
        estimatedEndAt: estimatedEnd ? new Date(estimatedEnd).toISOString() : null,
        actorName: session?.profile?.display_name || session?.profile?.username || 'Management user',
      })
      setState(next)
      setMessage(next.message)
      setEstimatedEnd(toLocalInput(next.estimated_end_at))
      setSuccess(enabled ? 'Maintenance mode enabled.' : 'Maintenance mode disabled. Staff can sign in again.')
    } catch (err) {
      setError(maintenanceErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="management-panel maintenance-management-panel">
      <header><strong>System maintenance</strong><div className="management-panel-spacer"/><button className="secondary-button" type="button" onClick={load} disabled={busy}><RefreshCcw size={13}/> Refresh</button></header>
      <div className="maintenance-management-body">
        <div className={`maintenance-state-card ${state.enabled ? 'maintenance-enabled' : 'maintenance-disabled'}`}>
          <Wrench size={20}/><div><strong>{state.enabled ? 'Maintenance mode enabled' : 'RecordsWeb available'}</strong><span>{state.enabled ? 'Normal staff sign-in is currently blocked.' : 'Staff can sign in normally.'}</span></div>
        </div>

        <div className="maintenance-management-form">
          <label><span>Maintenance message</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} rows={4}/><small>{message.length}/500</small></label>
          <label><span>Estimated completion <em>Optional</em></span><div className="maintenance-date-input"><Clock3 size={14}/><input type="datetime-local" value={estimatedEnd} onChange={(event) => setEstimatedEnd(event.target.value)} /></div></label>
        </div>

        {state.enabled && <div className="maintenance-meta"><span>Enabled by <strong>{state.enabled_by_name || 'Management'}</strong></span>{state.enabled_at && <span>{new Date(state.enabled_at).toLocaleString()}</span>}</div>}
        {error && <div className="form-error">{error}</div>}
        {success && <div className="form-success">{success}</div>}

        <div className="maintenance-management-actions">
          {state.enabled ? (
            <button className="primary-button" type="button" disabled={busy} onClick={() => apply(false)}><Power size={13}/>{busy ? 'Updating…' : 'End maintenance'}</button>
          ) : (
            <button className="primary-button" type="button" disabled={busy} onClick={() => apply(true)}><Power size={13}/>{busy ? 'Updating…' : 'Enable maintenance'}</button>
          )}
          <button className="secondary-button" type="button" disabled={busy} onClick={async () => {
            setBusy(true); setError(''); setSuccess('')
            try {
              const next = await setMaintenanceMode({ enabled: state.enabled, message, estimatedEndAt: estimatedEnd ? new Date(estimatedEnd).toISOString() : null, actorName: session?.profile?.display_name || '' })
              setState(next); setSuccess('Maintenance details saved.')
            } catch (err) { setError(maintenanceErrorMessage(err)) }
            finally { setBusy(false) }
          }}><Save size={13}/> Save details</button>
        </div>
      </div>
    </section>
  )
}
