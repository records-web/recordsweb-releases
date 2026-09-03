import React, { useEffect, useMemo, useState } from 'react'
import { BriefcaseBusiness, ClipboardPlus, FileWarning, Megaphone, Plus, RefreshCcw, X } from 'lucide-react'
import Panel from '../components/Panel'
import ModalPortal from '../components/ModalPortal'
import { useAuth } from '../contexts/AuthContext'
import {
  createStaffJob,
  createStaffNotice,
  createStaffReport,
  listStaffJobs,
  listStaffNotices,
  listStaffReports,
  updateStaffJob,
  updateStaffNotice,
  updateStaffReport,
} from '../lib/dataService'

const tabs = [
  ['reports', 'Reports', FileWarning],
  ['jobs', 'Jobs & Vacancies', BriefcaseBusiness],
  ['notices', 'Staff Notices', Megaphone],
]

export default function StaffAreaPage() {
  const { session } = useAuth()
  const profile = session?.profile || {}
  const isManagement = Boolean(profile.is_management)
  const [activeTab, setActiveTab] = useState('reports')
  const [reports, setReports] = useState([])
  const [jobs, setJobs] = useState([])
  const [notices, setNotices] = useState([])
  const [modal, setModal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [reportRows, jobRows, noticeRows] = await Promise.all([
        listStaffReports(),
        listStaffJobs(),
        listStaffNotices(),
      ])
      setReports(reportRows)
      setJobs(jobRows)
      setNotices(noticeRows)
    } catch (err) {
      setError(err.message || 'Unable to load the Staff Area.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openReports = useMemo(() => reports.filter((x) => x.status !== 'Closed').length, [reports])
  const openJobs = useMemo(() => jobs.filter((x) => x.status === 'Open').length, [jobs])
  const activeNotices = useMemo(() => notices.filter((x) => x.active !== false).length, [notices])
  const visibleJobs = useMemo(() => isManagement ? jobs : jobs.filter((x) => x.status === 'Open'), [jobs, isManagement])
  const visibleNotices = useMemo(() => {
    if (isManagement) return notices
    const today = new Date().toISOString().slice(0, 10)
    return notices.filter((x) => x.active !== false && (!x.expires_at || String(x.expires_at).slice(0, 10) >= today))
  }, [notices, isManagement])

  async function saveReport(payload) {
    if (modal?.item?.id) await updateStaffReport(modal.item.id, payload)
    else await createStaffReport({
      ...payload,
      reporter_name: profile.display_name || profile.username || 'RecordsWeb user',
      reporter_username: profile.username || '',
    })
    setModal(null)
    await load()
  }

  async function saveJob(payload) {
    if (modal?.item?.id) await updateStaffJob(modal.item.id, payload)
    else await createStaffJob(payload)
    setModal(null)
    await load()
  }

  async function saveNotice(payload) {
    if (modal?.item?.id) await updateStaffNotice(modal.item.id, payload)
    else await createStaffNotice(payload)
    setModal(null)
    await load()
  }

  return (
    <div className="page-pad workspace-page staff-area-page">
      <div className="page-title-row">
        <div>
          <h1>Staff Area</h1>
          <p>Internal reports, vacancies and staff notices for Grove Way Health Centre.</p>
        </div>
        <button className="secondary-button" onClick={load}><RefreshCcw size={14}/> Refresh</button>
      </div>

      <div className="staff-area-summary">
        <div><FileWarning size={20}/><strong>{openReports}</strong><span>open reports</span></div>
        <div><BriefcaseBusiness size={20}/><strong>{openJobs}</strong><span>open jobs</span></div>
        <div><Megaphone size={20}/><strong>{activeNotices}</strong><span>active notices</span></div>
      </div>

      <div className="staff-area-tabs">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}>
            <Icon size={15}/>{label}
          </button>
        ))}
      </div>

      {error && <div className="form-error">{error}</div>}
      {loading ? <div className="empty-state">Loading Staff Area…</div> : (
        <>
          {activeTab === 'reports' && (
            <Panel title="Internal Reports">
              <div className="workspace-toolbar">
                <span>Submit operational, facilities, staffing, IT or other internal concerns.</span>
                <button className="primary-button" onClick={() => setModal({ type: 'report', item: null })}><Plus size={14}/> New report</button>
              </div>
              <div className="staff-list-table">
                <div className="staff-list-row staff-list-head report-row"><span>Submitted</span><span>Subject</span><span>Category</span><span>Urgency</span><span>Status</span><span>Reporter</span></div>
                {reports.length === 0 ? <div className="empty-state">No staff reports have been submitted.</div> : reports.map((row) => (
                  <button className="staff-list-row report-row" key={row.id} onClick={() => setModal({ type: 'report', item: row })}>
                    <span>{formatDate(row.created_at)}</span><span><strong>{row.subject}</strong><small>{row.description || 'No description'}</small></span><span>{row.category || 'General'}</span><span>{row.urgency || 'Normal'}</span><span className={`status-pill ${slug(row.status)}`}>{row.status || 'Open'}</span><span>{row.reporter_name || '—'}</span>
                  </button>
                ))}
              </div>
            </Panel>
          )}

          {activeTab === 'jobs' && (
            <Panel title="Jobs & Vacancies">
              <div className="workspace-toolbar">
                <span>Current internal and external vacancies at Grove Way Health Centre.</span>
                {isManagement && <button className="primary-button" onClick={() => setModal({ type: 'job', item: null })}><Plus size={14}/> Add vacancy</button>}
              </div>
              <div className="staff-card-list">
                {visibleJobs.length === 0 ? <div className="empty-state">There are currently no vacancies listed.</div> : visibleJobs.map((job) => (
                  <article className="staff-job-card" key={job.id} onClick={() => isManagement && setModal({ type: 'job', item: job })}>
                    <div className="staff-card-icon"><BriefcaseBusiness size={20}/></div>
                    <div className="staff-card-main"><strong>{job.title}</strong><span>{job.department || 'Grove Way Health Centre'} · {job.employment_type || 'Not specified'}</span><p>{job.description || 'No vacancy description has been added.'}</p></div>
                    <div className="staff-card-meta"><span className={`status-pill ${slug(job.status)}`}>{job.status || 'Open'}</span><small>{job.closing_date ? `Closes ${formatDate(job.closing_date)}` : 'No closing date'}</small></div>
                  </article>
                ))}
              </div>
            </Panel>
          )}

          {activeTab === 'notices' && (
            <Panel title="Staff Notices">
              <div className="workspace-toolbar">
                <span>Practice-wide updates and information for staff.</span>
                {isManagement && <button className="primary-button" onClick={() => setModal({ type: 'notice', item: null })}><Plus size={14}/> New notice</button>}
              </div>
              <div className="staff-card-list">
                {visibleNotices.length === 0 ? <div className="empty-state">There are no staff notices.</div> : visibleNotices.map((notice) => (
                  <article className={`staff-notice-card priority-${slug(notice.priority)}`} key={notice.id} onClick={() => isManagement && setModal({ type: 'notice', item: notice })}>
                    <div className="staff-card-icon"><Megaphone size={20}/></div>
                    <div className="staff-card-main"><strong>{notice.title}</strong><span>{notice.priority || 'Normal'} priority · {formatDate(notice.published_at || notice.created_at)}</span><p>{notice.body || 'No notice text.'}</p></div>
                    <div className="staff-card-meta"><span className={`status-pill ${notice.active === false ? 'disabled' : 'active'}`}>{notice.active === false ? 'Inactive' : 'Active'}</span>{notice.expires_at && <small>Expires {formatDate(notice.expires_at)}</small>}</div>
                  </article>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}

      {modal?.type === 'report' && <ReportModal item={modal.item} isManagement={isManagement} onClose={() => setModal(null)} onSave={saveReport}/>} 
      {modal?.type === 'job' && isManagement && <JobModal item={modal.item} onClose={() => setModal(null)} onSave={saveJob}/>} 
      {modal?.type === 'notice' && isManagement && <NoticeModal item={modal.item} onClose={() => setModal(null)} onSave={saveNotice}/>} 
    </div>
  )
}

function ReportModal({ item, isManagement, onClose, onSave }) {
  const [form, setForm] = useState({
    subject: item?.subject || '',
    category: item?.category || 'General',
    urgency: item?.urgency || 'Normal',
    status: item?.status || 'Open',
    description: item?.description || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    setSaving(true); setError('')
    try { await onSave(form) } catch (err) { setError(err.message || 'Unable to save report.'); setSaving(false) }
  }
  return <ModalShell title={item ? 'Staff report' : 'New staff report'} subtitle="Staff Area" onClose={onClose} error={error} footer={<><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving || !form.subject.trim()} onClick={save}>{saving ? 'Saving…' : 'Save report'}</button></>}>
    <label>Subject<input value={form.subject} onChange={(e)=>setForm({...form,subject:e.target.value})}/></label>
    <label>Category<select value={form.category} onChange={(e)=>setForm({...form,category:e.target.value})}><option>General</option><option>IT / Systems</option><option>Facilities</option><option>Staffing</option><option>Clinical safety</option><option>Security</option><option>Other</option></select></label>
    <label>Urgency<select value={form.urgency} onChange={(e)=>setForm({...form,urgency:e.target.value})}><option>Low</option><option>Normal</option><option>High</option><option>Urgent</option></select></label>
    {item && isManagement && <label>Status<select value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})}><option>Open</option><option>In review</option><option>Resolved</option><option>Closed</option></select></label>}
    <label className="span-two">Details<textarea value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})} placeholder="Describe the issue or report…"/></label>
  </ModalShell>
}

function JobModal({ item, onClose, onSave }) {
  const [form, setForm] = useState({
    title: item?.title || '', department: item?.department || '', employment_type: item?.employment_type || 'Permanent',
    location: item?.location || 'Grove Way Health Centre', closing_date: item?.closing_date || '', status: item?.status || 'Open', description: item?.description || '',
  })
  const [saving,setSaving]=useState(false); const [error,setError]=useState('')
  async function save(){setSaving(true);setError('');try{await onSave(form)}catch(err){setError(err.message||'Unable to save vacancy.');setSaving(false)}}
  return <ModalShell title={item ? 'Edit vacancy' : 'Add vacancy'} subtitle="Jobs & Vacancies" onClose={onClose} error={error} footer={<><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving||!form.title.trim()} onClick={save}>{saving?'Saving…':'Save vacancy'}</button></>}>
    <label>Job title<input value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})}/></label><label>Department<input value={form.department} onChange={(e)=>setForm({...form,department:e.target.value})}/></label>
    <label>Employment type<select value={form.employment_type} onChange={(e)=>setForm({...form,employment_type:e.target.value})}><option>Permanent</option><option>Fixed term</option><option>Temporary</option><option>Bank</option><option>Locum</option><option>Apprenticeship</option></select></label>
    <label>Location<input value={form.location} onChange={(e)=>setForm({...form,location:e.target.value})}/></label><label>Closing date<input type="date" value={form.closing_date||''} onChange={(e)=>setForm({...form,closing_date:e.target.value})}/></label>
    <label>Status<select value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})}><option>Open</option><option>Draft</option><option>Closed</option></select></label><label className="span-two">Description<textarea value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})}/></label>
  </ModalShell>
}

function NoticeModal({ item, onClose, onSave }) {
  const [form, setForm] = useState({
    title:item?.title||'', body:item?.body||'', priority:item?.priority||'Normal', published_at:dateInput(item?.published_at||new Date().toISOString()), expires_at:dateInput(item?.expires_at||''), active:item?.active !== false,
  })
  const [saving,setSaving]=useState(false); const [error,setError]=useState('')
  async function save(){setSaving(true);setError('');try{await onSave({...form,published_at:form.published_at||null,expires_at:form.expires_at||null})}catch(err){setError(err.message||'Unable to save notice.');setSaving(false)}}
  return <ModalShell title={item ? 'Edit staff notice' : 'New staff notice'} subtitle="Staff Notices" onClose={onClose} error={error} footer={<><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving||!form.title.trim()} onClick={save}>{saving?'Saving…':'Save notice'}</button></>}>
    <label>Title<input value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})}/></label><label>Priority<select value={form.priority} onChange={(e)=>setForm({...form,priority:e.target.value})}><option>Low</option><option>Normal</option><option>High</option><option>Urgent</option></select></label>
    <label>Publish date<input type="date" value={form.published_at} onChange={(e)=>setForm({...form,published_at:e.target.value})}/></label><label>Expiry date<input type="date" value={form.expires_at} onChange={(e)=>setForm({...form,expires_at:e.target.value})}/></label>
    <label className="span-two">Notice<textarea value={form.body} onChange={(e)=>setForm({...form,body:e.target.value})}/></label><label className="check-label span-two"><input type="checkbox" checked={form.active} onChange={(e)=>setForm({...form,active:e.target.checked})}/> Active and visible to staff</label>
  </ModalShell>
}

function ModalShell({ title, subtitle, onClose, error, children, footer }) {
  return <ModalPortal onClose={onClose} ariaLabel={title}><div className="records-modal management-modal"><header><div><strong>{title}</strong><span>{subtitle}</span></div><button type="button" onClick={onClose}><X size={18}/></button></header><div className="records-form-grid">{children}</div>{error&&<div className="form-error modal-error">{error}</div>}<footer>{footer}</footer></div></ModalPortal>
}

function slug(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')}
function formatDate(value){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('en-GB')}
function dateInput(value){if(!value)return '';const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value).slice(0,10);return d.toISOString().slice(0,10)}
