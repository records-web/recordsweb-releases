import React, { useEffect, useState } from 'react'
import { Search, UserRound } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { listPatients } from '../lib/dataService'
import Panel from '../components/Panel'

export default function PatientSearchPage() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') || ''
  const [search, setSearch] = useState(query)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function load(term = search) {
    setLoading(true)
    setError('')
    try { setRows(await listPatients(term)) }
    catch (err) { setRows([]); setError(err.message || 'Unable to search patient records.') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    setSearch(query)
    load(query)
  }, [query])

  function submit(e) {
    e.preventDefault()
    const value = search.trim()
    if ((params.get('q') || '') === value) load(value)
    else setParams(value ? { q: value } : {})
  }

  return (
    <div className="page-pad">
      <div className="page-title-row"><div><h1>Patient search</h1><p>Find a patient by name, NHS number or local record number.</p></div></div>
      <Panel title="Search criteria">
        <form className="patient-search-form" onSubmit={submit}>
          <div className="search-field"><Search size={18} /><input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or NHS number" /></div>
          <button className="primary-button">Search</button>
        </form>
      </Panel>
      {error && <div className="form-error">{error}</div>}
      <Panel title="Results" count={rows.length}>
        {loading ? <div className="empty-state">Searching…</div> : rows.length === 0 ? <div className="empty-state">No matching patients found.</div> : (
          <div className="patient-results">
            {rows.map((p) => (
              <button key={p.id} onClick={() => navigate(`/patients/${p.id}`)}>
                <div className="patient-result-avatar"><UserRound size={22} /></div>
                <div className="patient-result-main"><strong>{p.last_name?.toUpperCase()}, {p.first_name} ({p.title})</strong><span>{p.address || 'Address not recorded'}</span></div>
                <div><small>Date of birth</small><strong>{new Date(p.dob).toLocaleDateString('en-GB')}</strong></div>
                <div><small>NHS number</small><strong>{p.nhs_number || '—'}</strong></div>
                <div><small>Usual GP</small><strong>{p.usual_gp || '—'}</strong></div>
              </button>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
