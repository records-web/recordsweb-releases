import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSchoolPupil, listSchoolAttendanceSummary, updateSchoolPupil } from '../lib/schoolService'

export default function SchoolPupilDetailPage() {
  const { pupilId } = useParams(); const navigate = useNavigate()
  const [pupil, setPupil] = useState(null); const [stats, setStats] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('')
  const from = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 60); return d.toISOString().slice(0,10) }, [])
  async function load() {
    setError('')
    try {
      const [row, summary] = await Promise.all([getSchoolPupil(pupilId), listSchoolAttendanceSummary({ from, to: new Date().toISOString().slice(0,10) })])
      setPupil(row); setStats(summary.find((item) => String(item.id) === String(pupilId)) || null)
    } catch (e) { setError(e?.message || 'Unable to load pupil.') }
  }
  useEffect(() => { void load() }, [pupilId])
  async function save(event) { event.preventDefault(); setBusy(true); setError(''); setNotice(''); try { const row = await updateSchoolPupil(pupilId, { first_name: String(pupil.first_name || '').trim(), last_name: String(pupil.last_name || '').trim(), preferred_name: String(pupil.preferred_name || '').trim() || null, dob: pupil.dob || null, year_group: String(pupil.year_group || '').trim(), form_group: String(pupil.form_group || '').trim().toUpperCase(), house: String(pupil.house || '').trim() || null, pronouns: String(pupil.pronouns || '').trim() || null, status: pupil.status === 'left' ? 'left' : 'active' }); setPupil(row); setNotice('Pupil record saved.') } catch(e) { setError(e?.message || 'Unable to save pupil.') } finally { setBusy(false) } }
  if (!pupil) return <div className="school-page page-pad">{error ? <div className="form-error">{error}</div> : 'Loading pupil…'}</div>
  return <div className="school-page page-pad compact-pad">
    <div className="school-page-head"><div><span>RO-SCHOOL · PUPIL</span><h1>{pupil.first_name} {pupil.last_name}</h1><p>{pupil.admission_number}</p></div><button onClick={() => navigate('/school/pupils')}><ArrowLeft size={14}/>Pupil list</button></div>
    {error && <div className="form-error">{error}</div>}{notice && <div className="form-success">{notice}</div>}
    <div className="school-pupil-summary"><div><strong>{stats?.attendance_percent == null ? '—' : `${stats.attendance_percent}%`}</strong><span>Attendance · last 60 days</span></div><div><strong>{stats?.late || 0}</strong><span>Late marks</span></div><div><strong>{stats?.authorised || 0}</strong><span>Authorised absence</span></div><div><strong>{stats?.unauthorised || 0}</strong><span>Unauthorised / pending</span></div></div>
    <form className="school-form" onSubmit={save}><h3>Pupil details</h3><div className="school-form-grid">
      <label><span>First name</span><input required value={pupil.first_name || ''} onChange={(e) => setPupil({...pupil, first_name:e.target.value})}/></label><label><span>Last name</span><input required value={pupil.last_name || ''} onChange={(e) => setPupil({...pupil, last_name:e.target.value})}/></label>
      <label><span>Preferred name</span><input value={pupil.preferred_name || ''} onChange={(e) => setPupil({...pupil, preferred_name:e.target.value})}/></label><label><span>Date of birth</span><input type="date" value={pupil.dob || ''} onChange={(e) => setPupil({...pupil, dob:e.target.value})}/></label>
      <label><span>Year group</span><input value={pupil.year_group || ''} onChange={(e) => setPupil({...pupil, year_group:e.target.value})}/></label><label><span>Form group</span><input value={pupil.form_group || ''} onChange={(e) => setPupil({...pupil, form_group:e.target.value})}/></label>
      <label><span>House</span><input value={pupil.house || ''} onChange={(e) => setPupil({...pupil, house:e.target.value})}/></label><label><span>Pronouns</span><input value={pupil.pronouns || ''} onChange={(e) => setPupil({...pupil, pronouns:e.target.value})}/></label><label><span>Roll status</span><select value={pupil.status || 'active'} onChange={(e) => setPupil({...pupil, status:e.target.value})}><option value="active">On roll</option><option value="left">Left school</option></select></label>
    </div><div className="school-form-actions"><button className="primary-button" disabled={busy}><Save size={14}/>{busy ? 'Saving…' : 'Save pupil'}</button></div></form>
  </div>
}
