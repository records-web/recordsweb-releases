import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Building2, Handshake, Link2, RefreshCw, ShieldCheck, Unlink } from 'lucide-react'
import { useParams } from 'react-router-dom'
import ClinicalToolbar from '../components/ClinicalToolbar'
import PatientHeader from '../components/PatientHeader'
import Panel from '../components/Panel'
import { getPatient } from '../lib/dataService'
import {
  getSharedCarePatientSnapshot,
  linkSharedCarePatient,
  listSharedCarePatientCandidates,
  listSharedCarePatientLinks,
  sharedCareModeLabel,
  unlinkSharedCarePatient,
} from '../lib/sharedCareService'

function formatDate(value, withTime = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', withTime
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }
  ).format(date)
}

function RecordSection({ title, rows, renderRow, blockedText }) {
  if (rows === null) {
    return <section className="shared-care-record-section blocked"><header><strong>{title}</strong><span>Not shared</span></header><div>{blockedText || 'The source community has not enabled this section for Shared Care.'}</div></section>
  }
  return (
    <section className="shared-care-record-section">
      <header><strong>{title}</strong><span>{Array.isArray(rows) ? rows.length : 0}</span></header>
      {!rows?.length ? <div className="shared-care-record-empty">No shared records in this section.</div> : <div className="shared-care-record-list">{rows.map((row, index) => renderRow(row, index))}</div>}
    </section>
  )
}

function SharedSnapshot({ snapshot }) {
  const source = snapshot?.sourceOrganisation || {}
  const patient = snapshot?.patient || {}
  if (!snapshot) return null

  return (
    <div className="shared-care-snapshot">
      <div className="shared-care-source-banner">
        <Building2 size={18}/>
        <div><strong>{source.name}</strong><span>@{source.code} · {sharedCareModeLabel(source.mode)} · Shared Care read-only record</span></div>
      </div>

      <div className="shared-care-remote-patient">
        <div><span>Patient</span><strong>{[patient.title, patient.firstName, patient.lastName].filter(Boolean).join(' ')}</strong></div>
        <div><span>DOB</span><strong>{formatDate(patient.dob)}</strong></div>
        <div><span>Sex / Gender</span><strong>{patient.gender || patient.sex || '—'}</strong></div>
        <div><span>NHS No.</span><strong>{patient.nhsNumber || '—'}</strong></div>
        <div><span>Record No.</span><strong>{patient.recordNumber || '—'}</strong></div>
      </div>

      {Array.isArray(snapshot.alerts) && snapshot.alerts.length > 0 && (
        <div className="shared-care-alerts"><AlertTriangle size={15}/><div>{snapshot.alerts.map((alert) => <span key={alert.id || alert.message}>{alert.message} {alert.severity ? `(${alert.severity})` : ''}</span>)}</div></div>
      )}

      <div className="shared-care-record-grid">
        <RecordSection title="Problems" rows={snapshot.problems} renderRow={(row) => (
          <div className="shared-care-clinical-row" key={row.id}><div><strong>{row.name}</strong><span>{row.status || '—'} · {row.significance || '—'}</span></div><time>{formatDate(row.onset_date)}{row.end_date ? ` – ${formatDate(row.end_date)}` : ''}</time></div>
        )}/>
        <RecordSection title="Medication" rows={snapshot.medications} renderRow={(row) => (
          <div className="shared-care-clinical-row" key={row.id}><div><strong>{row.name}</strong><span>{row.dose || 'Dose not recorded'}{row.quantity ? ` · ${row.quantity}` : ''}</span></div><time>{formatDate(row.last_issue_date)}</time></div>
        )}/>
        <RecordSection title="Consultations" rows={snapshot.consultations} renderRow={(row) => (
          <div className="shared-care-consultation" key={row.id}><header><strong>{row.clinician || 'Clinician'}</strong><span>{formatDate(row.date, true)} · {row.location || 'Location not recorded'}</span></header><div>{(row.entries || []).map((entry, index) => <p key={`${entry.type || 'entry'}-${index}`}><b>{entry.type || 'Entry'}:</b> {entry.text || ''}</p>)}</div></div>
        )}/>
        <RecordSection title="Investigations" rows={snapshot.investigations} renderRow={(row) => (
          <div className="shared-care-clinical-row" key={row.id}><div><strong>{row.name}</strong><span>{row.result || row.status || 'No result recorded'}</span></div><time>{formatDate(row.date)}</time></div>
        )}/>
        <RecordSection title="Referrals" rows={snapshot.referrals} renderRow={(row) => (
          <div className="shared-care-clinical-row" key={row.id}><div><strong>{row.destination || row.service || row.type || 'Referral'}</strong><span>{row.reason || row.status || 'Referral record'}</span></div><time>{formatDate(row.created_at, true)}</time></div>
        )}/>
        <RecordSection title="Documents" rows={snapshot.documents} renderRow={(row) => (
          <div className="shared-care-clinical-row" key={row.id}><div><strong>{row.title}</strong><span>{row.category || row.document_type || 'Document'} · {row.status || 'Filed'}</span></div><time>{formatDate(row.date || row.created_at)}</time></div>
        )}/>
        <RecordSection title="Care history" rows={snapshot.careHistory} renderRow={(row) => (
          <div className="shared-care-clinical-row" key={row.id}><div><strong>{String(row.source_table || 'Record').replaceAll('_', ' ')}</strong><span>{row.action || 'Updated'}</span></div><time>{formatDate(row.created_at, true)}</time></div>
        )}/>
      </div>
    </div>
  )
}

export default function SharedCarePatientPage() {
  const { patientId } = useParams()
  const [patient, setPatient] = useState(null)
  const [links, setLinks] = useState([])
  const [candidates, setCandidates] = useState([])
  const [selected, setSelected] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    setBusy(true); setError('')
    try {
      const [patientRow, linkRows, candidateRows] = await Promise.all([
        getPatient(patientId),
        listSharedCarePatientLinks(patientId),
        listSharedCarePatientCandidates(patientId),
      ])
      setPatient(patientRow)
      setLinks(Array.isArray(linkRows) ? linkRows : [])
      setCandidates(Array.isArray(candidateRows) ? candidateRows : [])
      if (selected) {
        const stillThere = (linkRows || []).find((item) => item.shared_patient_link_id === selected.shared_patient_link_id)
        if (!stillThere) { setSelected(null); setSnapshot(null) }
      }
    } catch (err) {
      setError(err?.message || 'Unable to load Shared Care records.')
    } finally { setBusy(false) }
  }

  useEffect(() => { load() }, [patientId])

  const linkedPartnerIds = useMemo(() => new Set(links.map((link) => link.partner_organisation_id)), [links])

  async function openLink(link) {
    setSelected(link); setSnapshot(null); setBusy(true); setError('')
    try { setSnapshot(await getSharedCarePatientSnapshot(link.shared_patient_link_id)) }
    catch (err) { setError(err?.message || 'Unable to open the Shared Care patient record.') }
    finally { setBusy(false) }
  }

  async function connect(candidate) {
    if (!window.confirm(`Link this patient with ${candidate.remote_first_name} ${candidate.remote_last_name} at ${candidate.partner_name}?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await linkSharedCarePatient(candidate.shared_care_link_id, patientId, candidate.remote_patient_id)
      setNotice(`Patient linked with ${candidate.partner_name}. Shared records are now available according to each community's sharing permissions.`)
      await load()
    } catch (err) { setError(err?.message || 'Unable to link the Shared Care patient records.') }
    finally { setBusy(false) }
  }

  async function disconnect(link) {
    if (!window.confirm(`Remove this patient's Shared Care link with ${link.partner_name}? This does not delete either patient record.`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await unlinkSharedCarePatient(link.shared_patient_link_id)
      setNotice(`Patient Shared Care link with ${link.partner_name} removed.`)
      setSelected(null); setSnapshot(null)
      await load()
    } catch (err) { setError(err?.message || 'Unable to remove the Shared Care patient link.') }
    finally { setBusy(false) }
  }

  return (
    <div>
      <ClinicalToolbar actions={[
        { label: 'Refresh', icon: 'search', onClick: load },
        { label: 'Print shared record', icon: 'print', groupStart: true, onClick: () => window.print() },
      ]}/>
      <PatientHeader patient={patient}/>
      <div className="page-pad compact-pad shared-care-patient-page">
        {error && <div className="form-error">{error}</div>}
        {notice && <div className="form-success">{notice}</div>}

        <div className="shared-care-patient-intro">
          <div><Handshake size={20}/><div><strong>Shared Care</strong><span>View read-only clinical information from RecordsWeb communities linked to this patient. Every cross-community view is audited.</span></div></div>
          <button onClick={load} disabled={busy}><RefreshCw size={13}/> Refresh</button>
        </div>

        <Panel title="Linked patient records" count={links.length}>
          {!links.length ? <div className="empty-state">This patient is not linked to another community yet.</div> : (
            <div className="shared-care-patient-link-grid">
              {links.map((link) => (
                <div className={`shared-care-patient-link ${selected?.shared_patient_link_id === link.shared_patient_link_id ? 'active' : ''}`} key={link.shared_patient_link_id}>
                  <button className="shared-care-patient-open" onClick={() => openLink(link)}>
                    <Building2 size={17}/><div><strong>{link.partner_name}</strong><span>{sharedCareModeLabel(link.partner_mode)} · @{link.partner_code}</span><small>{link.remote_last_name?.toUpperCase()}, {link.remote_first_name} · DOB {formatDate(link.remote_dob)}</small></div>
                  </button>
                  <button className="shared-care-unlink" title="Remove patient link" onClick={() => disconnect(link)}><Unlink size={13}/></button>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {candidates.filter((candidate) => !linkedPartnerIds.has(candidate.partner_organisation_id)).length > 0 && (
          <Panel title="Possible Shared Care matches" count={candidates.length}>
            <div className="shared-care-candidates">
              {candidates.filter((candidate) => !linkedPartnerIds.has(candidate.partner_organisation_id)).map((candidate) => (
                <div className="shared-care-candidate" key={`${candidate.shared_care_link_id}-${candidate.remote_patient_id}`}>
                  <div><strong>{candidate.remote_last_name?.toUpperCase()}, {candidate.remote_first_name}</strong><span>{candidate.partner_name} · {sharedCareModeLabel(candidate.partner_mode)}</span><small>DOB {formatDate(candidate.remote_dob)} · NHS {candidate.remote_nhs_number || '—'} · Match: {candidate.match_reason}</small></div>
                  <button className="primary-button" onClick={() => connect(candidate)} disabled={busy}><Link2 size={13}/> Link patient</button>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {selected && <SharedSnapshot snapshot={snapshot}/>} 
        {selected && !snapshot && busy && <div className="shared-care-loading"><ShieldCheck size={16}/> Loading audited Shared Care record…</div>}
      </div>
    </div>
  )
}
