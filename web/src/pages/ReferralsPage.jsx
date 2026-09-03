import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import ClinicalToolbar from '../components/ClinicalToolbar'
import Panel from '../components/Panel'
import PatientHeader from '../components/PatientHeader'
import RecordEditModal from '../components/RecordEditModal'
import { createForPatient, getPatient, listForPatient, updateForPatient } from '../lib/dataService'

const fields = [
  ['service', 'Service', 'text'],
  ['priority', 'Priority', 'select', ['Routine', 'Urgent', '2 week wait']],
  ['status', 'Status', 'select', ['Waiting', 'Accepted', 'Rejected', 'Complete']],
  ['date', 'Date', 'date'],
  ['notes', 'Notes', 'textarea'],
]

export default function ReferralsPage() {
  const { patientId } = useParams()
  const [patient, setPatient] = useState(null)
  const [referrals, setReferrals] = useState([])
  const [filter, setFilter] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    try {
      setError('')
      const [patientRow, referralRows] = await Promise.all([
        getPatient(patientId),
        listForPatient('referrals', patientId, 'date'),
      ])
      setPatient(patientRow)
      setReferrals(referralRows)
    } catch (err) {
      setError(err.message || 'Unable to load referrals.')
    }
  }

  useEffect(() => { load() }, [patientId])

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return referrals
    return referrals.filter((referral) => `${referral.service} ${referral.priority || ''} ${referral.status || ''} ${referral.notes || ''}`.toLowerCase().includes(query))
  }, [referrals, filter])

  return (
    <div>
      <ClinicalToolbar actions={[
        { label: 'Add referral', icon: 'add', onClick: () => setEditing({}) },
        { label: 'Filters', icon: 'filter', groupStart: true, onClick: () => setShowFilter((value) => !value) },
        { label: 'Print', icon: 'print', onClick: () => window.print() },
        { label: 'Search', icon: 'search', onClick: () => setShowFilter(true) },
      ]} />
      <PatientHeader patient={patient} />
      <div className="page-pad compact-pad">
        {error && <div className="form-error">{error}</div>}
        {showFilter && <div className="record-filter-bar"><strong>Filter Referrals</strong><input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search referrals…" /><button onClick={() => { setFilter(''); setShowFilter(false) }}>Clear</button></div>}
        <Panel title="Referrals" count={filtered.length}>
          {filtered.length === 0 ? <div className="empty-state">No referrals found.</div> : <div className="generic-table">
            <div className="generic-row generic-head"><span>Service</span><span>Priority</span><span>Status</span><span>Date</span></div>
            {filtered.map((referral) => <button type="button" className="generic-row generic-data-row" key={referral.id} onClick={() => setEditing(referral)}><span>{referral.service}</span><span>{referral.priority || '—'}</span><span>{referral.status || '—'}</span><span>{formatDate(referral.date)}</span></button>)}
          </div>}
        </Panel>
      </div>
      {editing !== null && <RecordEditModal title={`${editing.id ? 'Edit' : 'Add'} referral`} fields={fields} record={editing} onClose={() => setEditing(null)} onSave={async (payload) => { if (editing.id) await updateForPatient('referrals', editing.id, payload); else await createForPatient('referrals', patientId, payload); setEditing(null); await load() }} />}
    </div>
  )
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('en-GB') : '—'
}
