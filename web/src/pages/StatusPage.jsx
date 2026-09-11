import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ArrowLeft, ArrowRight, CheckCircle2, Cloud, Database, FileText, Gamepad2, Github, RefreshCw, ShieldCheck, TriangleAlert, WifiOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import recordsWebWordmark from '../assets/RW-Logo.png'
import { APP_VERSION } from '../lib/webRuntime'
import { applyRecordsWebProductBrand } from '../lib/organisationSettings'

const STATUS_META = {
  operational: { label: 'Operational', className: 'operational' },
  degraded: { label: 'Degraded Performance', className: 'degraded' },
  partial_outage: { label: 'Partial Outage', className: 'outage' },
  major_outage: { label: 'Major Outage', className: 'outage' },
  outage: { label: 'Outage', className: 'outage' },
  unknown: { label: 'Check Unavailable', className: 'unknown' },
}

const ICONS = {
  website: Cloud,
  auth: ShieldCheck,
  data: Database,
  storage: FileText,
  api: Gamepad2,
  updates: Github,
}

function relativeTime(iso, now) {
  if (!iso) return 'Not checked yet'
  const ms = Math.max(0, now - new Date(iso).getTime())
  const seconds = Math.floor(ms / 1000)
  if (seconds < 5) return 'Updated just now'
  if (seconds < 60) return `Updated ${seconds} seconds ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes === 1) return 'Updated 1 minute ago'
  if (minutes < 60) return `Updated ${minutes} minutes ago`
  return `Updated ${new Date(iso).toLocaleString('en-GB')}`
}

function overallCopy(status) {
  if (status === 'operational') return ['All Systems Operational', 'All automated RecordsWeb health checks are currently passing.']
  if (status === 'degraded') return ['Some Systems Degraded', 'One or more RecordsWeb services are responding with degraded performance.']
  if (status === 'partial_outage') return ['Partial Service Outage', 'One or more RecordsWeb services are currently unavailable.']
  if (status === 'major_outage') return ['Major Service Outage', 'Multiple core RecordsWeb services are currently unavailable.']
  return ['Status Checks Incomplete', 'One or more automated health checks could not be completed.']
}

function ServiceRow({ item }) {
  const Icon = ICONS[item.id] || Activity
  const meta = STATUS_META[item.status] || STATUS_META.unknown

  return (
    <div className="public-status-component">
      <div className="public-status-component-main">
        <span className={`public-status-component-icon ${meta.className}`}><Icon size={17}/></span>
        <div>
          <strong>{item.name}</strong>
          <small>{item.note || 'Automated service check.'}</small>
        </div>
      </div>
      <div className="public-status-component-result">
        {Number.isFinite(item.latencyMs) && <small>{item.latencyMs} ms</small>}
        <span className={`public-status-pill ${meta.className}`}>{meta.label}</span>
      </div>
    </div>
  )
}

export default function StatusPage() {
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, error: '', data: null })
  const [now, setNow] = useState(Date.now())
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { applyRecordsWebProductBrand() }, [])

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      const response = await fetch(`/api/status?t=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Unable to retrieve RecordsWeb service status.')
      setState({ loading: false, error: '', data: payload })
    } catch (error) {
      setState((current) => ({ loading: false, error: error?.message || 'Unable to retrieve RecordsWeb service status.', data: current.data }))
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const poller = window.setInterval(() => load(), 30000)
    return () => window.clearInterval(poller)
  }, [load])

  useEffect(() => {
    const ticker = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(ticker)
  }, [])

  const grouped = useMemo(() => {
    const groups = new Map()
    for (const item of state.data?.components || []) {
      const group = item.group || 'Services'
      if (!groups.has(group)) groups.set(group, [])
      groups.get(group).push(item)
    }
    return Array.from(groups.entries())
  }, [state.data])

  const incidentComponents = useMemo(
    () => (state.data?.components || []).filter((item) => item.status !== 'operational'),
    [state.data],
  )

  const overall = state.data?.overall || 'unknown'
  const overallMeta = STATUS_META[overall] || STATUS_META.unknown
  const [overallTitle, overallDescription] = overallCopy(overall)

  return (
    <div className="public-home recordsweb-status-page">
      <header className="public-home-header">
        <div className="public-home-brand" role="button" tabIndex={0} onClick={() => navigate('/')} onKeyDown={(event) => event.key === 'Enter' && navigate('/')}>
          <img className="public-home-wordmark" src={recordsWebWordmark} alt="RecordsWeb" />
          <span>Service status</span>
        </div>
        <nav>
          <button type="button" onClick={() => navigate('/')}><ArrowLeft size={15}/> RecordsWeb</button>
          <button type="button" onClick={() => navigate('/pricing')}>Pricing</button>
          <button type="button" className="public-staff-button" onClick={() => navigate('/login')}>Staff sign in <ArrowRight size={15}/></button>
        </nav>
      </header>

      <main className="public-status-main">
        <section className="public-status-heading">
          <div>
            <span className="public-eyebrow">RECORDSWEB SERVICE STATUS</span>
            <h1>RecordsWeb Status</h1>
            <p>Live availability for the RecordsWeb platform and connected services. Status is generated automatically from direct service checks and cannot be manually set to operational.</p>
          </div>
          <button type="button" className="public-status-refresh" disabled={refreshing} onClick={() => load(true)}><RefreshCw size={15} className={refreshing ? 'spin' : ''}/>{refreshing ? 'Checking…' : 'Check now'}</button>
        </section>

        <section className={`public-status-overall ${overallMeta.className}`}>
          <div className="public-status-overall-icon">
            {overall === 'operational' ? <CheckCircle2 size={24}/> : overall === 'unknown' ? <TriangleAlert size={24}/> : <WifiOff size={24}/>} 
          </div>
          <div className="public-status-overall-copy">
            <strong>{state.loading && !state.data ? 'Checking RecordsWeb services…' : overallTitle}</strong>
            <span>{state.loading && !state.data ? 'Running automated live checks.' : overallDescription}</span>
          </div>
          <div className="public-status-updated">{relativeTime(state.data?.generatedAt, now)}</div>
        </section>

        {state.error && <div className="public-status-fetch-error"><TriangleAlert size={16}/><span>{state.error} Existing results are shown where available.</span></div>}

        <div className="public-status-groups">
          {grouped.map(([group, items]) => (
            <section className="public-status-group" key={group}>
              <div className="public-status-group-heading">
                <div><span>{group.toUpperCase()}</span><h2>{group}</h2></div>
                <small>{items.filter((item) => item.status === 'operational').length}/{items.length} operational</small>
              </div>
              <div className="public-status-component-list">
                {items.map((item) => <ServiceRow item={item} key={item.id}/>) }
              </div>
            </section>
          ))}
        </div>

        <section className="public-status-incidents">
          <div className="public-status-section-title"><span>AUTOMATED INCIDENTS</span><h2>Current incidents</h2></div>
          {incidentComponents.length === 0 && !state.loading ? (
            <div className="public-status-no-incidents"><CheckCircle2 size={20}/><div><strong>No active incidents detected</strong><span>All monitored RecordsWeb components are currently responding normally.</span></div></div>
          ) : incidentComponents.length > 0 ? (
            <div className="public-status-incident-list">
              {incidentComponents.map((item) => {
                const meta = STATUS_META[item.status] || STATUS_META.unknown
                return <article key={item.id}><span className={`public-status-incident-marker ${meta.className}`}/><div><strong>{item.name}</strong><p>{item.note || meta.label}</p></div><span className={`public-status-pill ${meta.className}`}>{meta.label}</span></article>
              })}
            </div>
          ) : (
            <div className="public-status-no-incidents"><Activity size={20}/><div><strong>Checking for incidents</strong><span>Automated service checks are running.</span></div></div>
          )}
        </section>

        <section className="public-status-automation-note">
          <ShieldCheck size={20}/>
          <div><strong>Automated status reporting</strong><p>This page does not use a manual “all systems operational” switch. The displayed state is calculated from live checks against RecordsWeb infrastructure and connected service endpoints. Checks refresh automatically every 30 seconds.</p></div>
        </section>
      </main>

      <footer className="public-home-footer"><span>RecordsWeb · Public service status</span><div className="public-home-footer-actions"><button type="button" onClick={() => navigate('/')}>Home</button><button type="button" onClick={() => navigate('/contact')}>Contact Us</button><span>Version {APP_VERSION}</span></div></footer>
    </div>
  )
}
