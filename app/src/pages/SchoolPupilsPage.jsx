import React, { useEffect, useState } from 'react'
import { ChevronRight, GraduationCap, Plus, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { createSchoolPupil, listSchoolPupils } from '../lib/schoolService'

const EMPTY = { first_name: '', last_name: '', preferred_name: '', dob: '', year_group: '', form_group: '', house: '', pronouns: '' }

export default function SchoolPupilsPage() {
  const [params] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') || '')
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load(term = search) { setError(''); try { setRows(await listSchoolPupils(term)) } catch (e) { setError(e?.message || 'Unable to load pupils.') } }
  useEffect(() => { void load(params.get('q') || '') }, [params.get('q')])

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await createSchoolPupil({ ...form, dob: form.dob || null, year_group: form.year_group.trim(), form_group: form.form_group.trim().toUpperCase(), preferred_name: form.preferred_name.trim() || null, house: form.house.trim() || null, pronouns: form.pronouns.trim() || null })
      setForm(EMPTY); setShowForm(false); await load()
    } catch (err) { setError(err?.message || 'Unable to create pupil.') } finally { setBusy(false) }
  }

  return <div className="school-page page-pad compact-pad">
    <div className="school-page-head"><div><span>RO-SCHOOL · PUPILS</span><h1>Pupil records</h1></div><button className="primary-button" onClick={() => setShowForm((value) => !value)}><Plus size={15}/>New pupil</button></div>
    <div className="school-search"><Search size={16}/><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="Search pupil, admission number, form or year group"/><button onClick={() => load()}>Search</button></div>
    {error && <div className="form-error">{error}</div>}
    {showForm && <form className="school-form" onSubmit={submit}><h3>Add pupil to roll</h3><div className="school-form-grid">
      <label><span>First name</span><input required value={form.first_name} onChange={(e) => setForm({...form, first_name:e.target.value})}/></label>
      <label><span>Last name</span><input required value={form.last_name} onChange={(e) => setForm({...form, last_name:e.target.value})}/></label>
      <label><span>Preferred name</span><input value={form.preferred_name} onChange={(e) => setForm({...form, preferred_name:e.target.value})}/></label>
      <label><span>Date of birth</span><input type="date" value={form.dob} onChange={(e) => setForm({...form, dob:e.target.value})}/></label>
      <label><span>Year group</span><input required value={form.year_group} onChange={(e) => setForm({...form, year_group:e.target.value})} placeholder="Year 10"/></label>
      <label><span>Form group</span><input required value={form.form_group} onChange={(e) => setForm({...form, form_group:e.target.value})} placeholder="10A"/></label>
      <label><span>House</span><input value={form.house} onChange={(e) => setForm({...form, house:e.target.value})}/></label>
      <label><span>Pronouns</span><input value={form.pronouns} onChange={(e) => setForm({...form, pronouns:e.target.value})}/></label>
    </div><div className="school-form-actions"><button type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Create pupil'}</button></div></form>}
    <div className="school-list">{rows.length === 0 ? <div className="empty-state">No pupils found.</div> : rows.map((row) => <article key={row.id}><GraduationCap size={18}/><div><div className="school-list-title"><Link to={`/school/pupils/${row.id}`}><strong>{row.last_name?.toUpperCase()}, {row.preferred_name || row.first_name}</strong></Link><Link to={`/school/pupils/${row.id}`}>Open <ChevronRight size={12}/></Link></div><span>{row.admission_number} · {row.year_group || 'No year'} · Form {row.form_group || '—'}</span><p>{row.house ? `House ${row.house}` : 'No house recorded'}{row.dob ? ` · DOB ${row.dob}` : ''}</p></div></article>)}</div>
  </div>
}
