import React, { useEffect, useState } from 'react'
import { AlertTriangle, Car, FileWarning, Gavel, Radio, Search, Shield, UserRoundSearch, Video } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getPolicingDashboardCounts } from '../lib/policingService'

export default function PolicingHomePage() {
  const navigate = useNavigate()
  const [counts, setCounts] = useState({ persons: 0, vehicles: 0, incidents: 0, fpns: 0, wanted: 0 })
  const [error, setError] = useState('')
  useEffect(() => { getPolicingDashboardCounts().then(setCounts).catch((e) => setError(e?.message || 'Unable to load policing dashboard.')) }, [])
  const cards = [
    ['Persons', counts.persons, UserRoundSearch, '/policing/people'],
    ['Vehicles', counts.vehicles, Car, '/policing/vehicles'],
    ['Active incidents', counts.incidents, Radio, '/policing/incidents'],
    ['FPNs', counts.fpns, Gavel, '/policing/fpns'],
    ['Wanted / BOLO', counts.wanted, FileWarning, '/policing/records/bolo'],
  ]
  return <div className="policing-page page-pad compact-pad">
    <section className="policing-hero"><div><span>RECORDSWEB POLICING</span><h1>Operational records</h1><p>Persons, vehicles, incidents, enforcement and intelligence for your RecordsWeb policing community.</p></div><Shield size={34}/></section>
    {error && <div className="form-error">{error}</div>}
    <section className="policing-stat-grid">{cards.map(([label,value,Icon,path]) => <button key={label} onClick={() => navigate(path)}><Icon size={20}/><strong>{value}</strong><span>{label}</span></button>)}</section>
    <section className="policing-shortcuts">
      <button onClick={() => navigate('/policing/people')}><Search size={18}/><div><strong>Person search</strong><span>Find or create an operational person record.</span></div></button>
      <button onClick={() => navigate('/policing/incidents')}><Radio size={18}/><div><strong>Incident desk</strong><span>Create and manage current incidents.</span></div></button>
      <button onClick={() => navigate('/policing/fpns')}><Gavel size={18}/><div><strong>Fixed Penalty Notices</strong><span>Issue and review FPNs.</span></div></button>
      <button onClick={() => navigate('/policing/records/intelligence')}><AlertTriangle size={18}/><div><strong>Intelligence</strong><span>Record operational intelligence and observations.</span></div></button>
      <button onClick={() => navigate('/policing/bodycams')}><Video size={18}/><div><strong>Bodycams</strong><span>Start or view live body-worn video through LiveKit Cloud.</span></div></button>
    </section>
  </div>
}
