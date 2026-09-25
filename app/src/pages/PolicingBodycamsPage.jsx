import React, { useEffect, useMemo, useState } from 'react'
import { Camera, CircleStop, MonitorUp, Radio, RefreshCw, ShieldCheck, Video } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useBodycam } from '../contexts/BodycamContext'
import { getBodycamStatus, listActiveBodycams } from '../lib/bodycamService'
import { listPoliceIncidents } from '../lib/policingService'
import BodycamViewer from '../components/policing/BodycamViewer'

function elapsed(startedAt) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((value) => String(value).padStart(2, '0')).join(':')
}

export default function PolicingBodycamsPage() {
  const { session: authSession } = useAuth()
  const { bodycam, isLive, busy, error: bodycamError, startBodycam, stopBodycam } = useBodycam()
  const [rows, setRows] = useState([])
  const [incidents, setIncidents] = useState([])
  const [provider, setProvider] = useState({ configured: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewing, setViewing] = useState(null)
  const [nowTick, setNowTick] = useState(0)
  const [form, setForm] = useState({ callsign: '', camera_label: '', location_label: '', incident_id: '', microphone_enabled: true })

  const profile = authSession?.profile || {}
  const ownId = bodycam?.id || ''

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const [status, active, incidentRows] = await Promise.all([
        getBodycamStatus(),
        listActiveBodycams(),
        listPoliceIncidents(''),
      ])
      setProvider(status)
      setRows(active)
      setIncidents(incidentRows.filter((item) => !['closed', 'resolved', 'cancelled'].includes(String(item.status || '').toLowerCase())).slice(0, 100))
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load bodycam control.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick((value) => value + 1), 1000)
    const refreshTimer = window.setInterval(() => void refresh(), 30000)
    return () => { window.clearInterval(timer); window.clearInterval(refreshTimer) }
  }, [])
  useEffect(() => { if (ownId) void refresh() }, [ownId])

  const visibleRows = useMemo(() => {
    const copy = [...rows]
    if (bodycam && !copy.some((item) => item.id === bodycam.id)) copy.unshift(bodycam)
    return copy
  }, [rows, bodycam, nowTick])

  const start = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await startBodycam(form)
      setForm((current) => ({ ...current, incident_id: '' }))
      window.setTimeout(() => void refresh(), 700)
    } catch (startError) {
      setError(startError?.message || 'Unable to start bodycam.')
    }
  }

  return (
    <div className="policing-page page-pad compact-pad bodycam-page">
      <div className="policing-page-head">
        <div><span>POLICING · OPERATIONS</span><h1>Bodycams</h1><p>Live body-worn video for authorised staff in this RecordsWeb policing community.</p></div>
        <button type="button" onClick={refresh} disabled={loading}><RefreshCw size={15}/>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {provider.configured === false && <div className="bodycam-setup-warning"><ShieldCheck size={18}/><div><strong>LiveKit Cloud is not configured</strong><span>Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET on the RecordsWeb Bodycam Edge Function before starting a live feed.</span></div></div>}
      {(error || bodycamError) && <div className="form-error">{error || bodycamError}</div>}

      <section className="bodycam-control-panel">
        <div className="bodycam-control-title"><div className={`bodycam-status-lamp ${isLive ? 'live' : ''}`}/><div><strong>{isLive ? 'Your bodycam is live' : 'Start your bodycam'}</strong><span>{isLive ? `${bodycam.callsign || bodycam.camera_label || 'Bodycam'} · ${elapsed(bodycam.started_at)}` : 'RecordsWeb will ask you which screen, application or browser tab to share.'}</span></div></div>
        {!isLive ? (
          <form className="bodycam-start-form" onSubmit={start}>
            <label><span>Callsign</span><input value={form.callsign} onChange={(event) => setForm({ ...form, callsign: event.target.value })} placeholder="e.g. 21-01" maxLength={60}/></label>
            <label><span>Camera ID</span><input value={form.camera_label} onChange={(event) => setForm({ ...form, camera_label: event.target.value })} placeholder="e.g. BWC-0176" maxLength={80}/></label>
            <label><span>Location / patrol area</span><input value={form.location_label} onChange={(event) => setForm({ ...form, location_label: event.target.value })} placeholder={profile.organisation_location || 'Optional'} maxLength={160}/></label>
            <label><span>Linked incident</span><select value={form.incident_id} onChange={(event) => setForm({ ...form, incident_id: event.target.value })}><option value="">Not linked</option>{incidents.map((incident) => <option key={incident.id} value={incident.id}>{incident.reference} · {incident.title}</option>)}</select></label>
            <label className="bodycam-checkbox"><input type="checkbox" checked={form.microphone_enabled} onChange={(event) => setForm({ ...form, microphone_enabled: event.target.checked })}/><span>Publish microphone audio</span></label>
            <button className="primary-button bodycam-start-button" disabled={busy || provider.configured === false}><MonitorUp size={16}/>{busy ? 'Starting…' : 'Start bodycam'}</button>
          </form>
        ) : (
          <div className="bodycam-live-actions"><div><span>Officer</span><strong>{bodycam.officer_name || profile.display_name}</strong></div><div><span>Started</span><strong>{new Date(bodycam.started_at).toLocaleString('en-GB')}</strong></div><div><span>Duration</span><strong>{elapsed(bodycam.started_at)}</strong></div><button className="bodycam-stop-button" disabled={busy} onClick={() => void stopBodycam()}><CircleStop size={16}/>Stop bodycam</button></div>
        )}
      </section>

      <section className="bodycam-live-section">
        <div className="bodycam-section-head"><div><Radio size={18}/><strong>Live bodycams</strong></div><span>{visibleRows.length} live</span></div>
        {visibleRows.length === 0 ? <div className="empty-state bodycam-empty"><Camera size={28}/><strong>No bodycams are live</strong><span>Live feeds from officers in this policing community will appear here.</span></div> : <div className="bodycam-grid">{visibleRows.map((item) => <article className="bodycam-card" key={item.id}><div className="bodycam-card-preview"><Video size={32}/><span className="bodycam-card-live">● LIVE</span></div><div className="bodycam-card-body"><strong>{item.officer_name || 'RecordsWeb officer'}</strong><span>{item.officer_role || 'Policing staff'}</span><dl><div><dt>Callsign</dt><dd>{item.callsign || '—'}</dd></div><div><dt>Camera</dt><dd>{item.camera_label || '—'}</dd></div><div><dt>Duration</dt><dd>{elapsed(item.started_at)}</dd></div><div><dt>Incident</dt><dd>{item.incident?.reference || 'Not linked'}</dd></div></dl><button className="primary-button" onClick={() => setViewing(item)}>View live</button></div></article>)}</div>}
      </section>

      <div className="bodycam-source-note">Bodycam overlay layout is adapted for RecordsWeb from the free-to-use XION-ChaseCam roleplay overlay. Live video is delivered through LiveKit Cloud; RecordsWeb does not record or retain the video stream in this release.</div>
      {viewing && <BodycamViewer session={viewing} onClose={() => setViewing(null)}/>} 
    </div>
  )
}
