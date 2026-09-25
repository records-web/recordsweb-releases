import React, { useEffect, useState } from 'react'
import { ExternalLink, Plus, Search, UserRound } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { createPolicePerson, listPolicePersons } from '../lib/policingService'

const EMPTY = { first_name: '', last_name: '', dob: '', address: '', phone: '', markers: '', notes: '' }

export default function PolicingPeoplePage() {
  const [params] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') || '')
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load(term = search) {
    setError('')
    try { setRows(await listPolicePersons(term)) }
    catch (e) { setError(e?.message || 'Unable to load persons.') }
  }
  useEffect(() => { void load(params.get('q') || '') }, [params.get('q')])

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      await createPolicePerson({ ...form, markers: form.markers.split(',').map((x) => x.trim()).filter(Boolean) })
      setForm(EMPTY); setShowForm(false); await load()
    } catch (err) { setError(err?.message || 'Unable to create person.') }
    finally { setBusy(false) }
  }

  return <div className="policing-page page-pad compact-pad">
    <div className="policing-page-head"><div><span>POLICING · PEOPLE</span><h1>Person search</h1></div><button className="primary-button" onClick={() => setShowForm((v) => !v)}><Plus size={15}/>New person</button></div>
    <div className="policing-search"><Search size={16}/><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="Search name, address or person reference"/><button onClick={() => load()}>Search</button></div>
    {error && <div className="form-error">{error}</div>}
    {showForm && <form className="policing-form" onSubmit={submit}><h3>Create person record</h3><div className="policing-form-grid"><label><span>First name</span><input required value={form.first_name} onChange={(e) => setForm({...form, first_name:e.target.value})}/></label><label><span>Last name</span><input required value={form.last_name} onChange={(e) => setForm({...form, last_name:e.target.value})}/></label><label><span>Date of birth</span><input type="date" value={form.dob} onChange={(e) => setForm({...form, dob:e.target.value})}/></label><label><span>Phone</span><input value={form.phone} onChange={(e) => setForm({...form, phone:e.target.value})}/></label><label className="wide"><span>Address</span><input value={form.address} onChange={(e) => setForm({...form, address:e.target.value})}/></label><label className="wide"><span>Markers <small>comma separated</small></span><input value={form.markers} onChange={(e) => setForm({...form, markers:e.target.value})}/></label><label className="wide"><span>Notes</span><textarea rows={3} value={form.notes} onChange={(e) => setForm({...form, notes:e.target.value})}/></label></div><div className="policing-form-actions"><button type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Create record'}</button></div></form>}
    <div className="policing-list">{rows.length === 0 ? <div className="empty-state">No person records found.</div> : rows.map((row) => <article key={row.id}><UserRound size={18}/><div><div className="police-list-title-row"><Link to={`/policing/people/${row.id}`} target="_blank" rel="noreferrer"><strong>{row.last_name?.toUpperCase()}, {row.first_name}</strong></Link><Link className="police-open-link" to={`/policing/people/${row.id}`} target="_blank" rel="noreferrer">Open record <ExternalLink size={12}/></Link></div><span>{row.reference} {row.dob ? `· DOB ${row.dob}` : ''}</span><p>{row.address || 'No address recorded.'}</p>{row.markers?.length ? <div className="policing-tags">{row.markers.map((m) => <b key={m}>{m}</b>)}</div> : null}</div></article>)}</div>
  </div>
}
