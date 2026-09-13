import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRightLeft, Building2, CheckCircle2, Handshake, Link2, RefreshCw, Send, ShieldCheck, Unlink } from 'lucide-react'
import { useParams } from 'react-router-dom'
import ClinicalToolbar from '../components/ClinicalToolbar'
import PatientHeader from '../components/PatientHeader'
import Panel from '../components/Panel'
import { useAuth } from '../contexts/AuthContext'
import { getPatient } from '../lib/dataService'
import {
  createSharedCareTransfer,
  getSharedCarePatientSnapshot,
  linkSharedCarePatient,
  listSharedCarePatientCandidates,
  listSharedCarePatientLinks,
  listSharedCareTransfers,
  sharedCareModeLabel,
  unlinkSharedCarePatient,
  updateSharedCareTransferStatus,
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

function RecordSection({ title, rows, renderRow, sourceName, blockedText }) {
  if (rows === null) {
    return <section className="shared-care-record-section blocked"><header><strong>{title}</strong><span>Not shared</span></header><div>{blockedText || 'The source community has not enabled this section for Shared Care.'}</div></section>
  }
  return (
    <section className="shared-care-record-section">
      <header><strong>{title}</strong><div className="shared-care-section-meta"><small>Source: {sourceName || 'Partner community'}</small><span>{Array.isArray(rows) ? rows.length : 0}</span></div></header>
      {!rows?.length ? <div className="shared-care-record-empty">No shared records in this section.</div> : <div className="shared-care-record-list">{rows.map((row, index) => renderRow(row, index))}</div>}
    </section>
  )
}

function SharedSnapshot({ snapshot }) {
  const source = snapshot?.sourceOrganisation || {}
  const patient = snapshot?.patient || {}
  if (!snapshot) return null
  const sourceName = source.name || 'Partner community'

  return (
    <div className="shared-care-snapshot">
      <div className="shared-care-source-banner">
        <Building2 size={18}/>
        <div><strong>{sourceName}</strong><span>@{source.code} · {sharedCareModeLabel(source.mode)} · Shared Care read-only record</span></div>
        <div className="shared-care-provenance-badge">SOURCE RECORD</div>
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
        <RecordSection title="Problems" sourceName={sourceName} rows={snapshot.problems} renderRow={(row) => <div className="shared-care-clinical-row" key={row.id}><div><strong>{row.name}</strong><span>{row.status || '—'} · {row.significance || '—'}</span></div><time>{formatDate(row.onset_date)}{row.end_date ? ` – ${formatDate(row.end_date)}` : ''}</time></div>}/>
        <RecordSection title="Medication" sourceName={sourceName} rows={snapshot.medications} renderRow={(row) => <div className="shared-care-clinical-row" key={row.id}><div><strong>{row.name}</strong><span>{row.dose || 'Dose not recorded'}{row.quantity ? ` · ${row.quantity}` : ''}</span></div><time>{formatDate(row.last_issue_date)}</time></div>}/>
        <RecordSection title="Consultations" sourceName={sourceName} rows={snapshot.consultations} renderRow={(row) => <div className="shared-care-consultation" key={row.id}><header><strong>{row.clinician || 'Clinician'}</strong><span>{formatDate(row.date, true)} · {row.location || 'Location not recorded'}</span></header><div>{(row.entries || []).map((entry, index) => <p key={`${entry.type || 'entry'}-${index}`}><b>{entry.type || 'Entry'}:</b> {entry.text || ''}</p>)}</div></div>}/>
        <RecordSection title="Investigations" sourceName={sourceName} rows={snapshot.investigations} renderRow={(row) => <div className="shared-care-clinical-row" key={row.id}><div><strong>{row.name}</strong><span>{row.result || row.status || 'No result recorded'}</span></div><time>{formatDate(row.date)}</time></div>}/>
        <RecordSection title="Referrals" sourceName={sourceName} rows={snapshot.referrals} renderRow={(row) => <div className="shared-care-clinical-row" key={row.id}><div><strong>{row.destination || row.service || row.type || 'Referral'}</strong><span>{row.reason || row.status || 'Referral record'}</span></div><time>{formatDate(row.created_at, true)}</time></div>}/>
        <RecordSection title="Documents" sourceName={sourceName} rows={snapshot.documents} renderRow={(row) => <div className="shared-care-clinical-row" key={row.id}><div><strong>{row.title}</strong><span>{row.category || row.document_type || 'Document'} · {row.status || 'Filed'}</span></div><time>{formatDate(row.date || row.created_at)}</time></div>}/>
        <RecordSection title="Care history" sourceName={sourceName} rows={snapshot.careHistory} renderRow={(row) => <div className="shared-care-clinical-row" key={row.id}><div><strong>{String(row.source_table || 'Record').replaceAll('_', ' ')}</strong><span>{row.action || 'Updated'}</span></div><time>{formatDate(row.created_at, true)}</time></div>}/>
      </div>
    </div>
  )
}

export default function SharedCarePatientPage() {
  const { patientId } = useParams()
  const { session } = useAuth()
  const profile = session?.profile || {}
  const localMode = profile.organisation_mode || 'general_practice'
  const [patient, setPatient] = useState(null)
  const [links, setLinks] = useState([])
  const [candidates, setCandidates] = useState([])
  const [transfers, setTransfers] = useState([])
  const [selected, setSelected] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [transferOpen, setTransferOpen] = useState(false)
  const [transfer, setTransfer] = useState({ shared_patient_link_id: '', transfer_type: localMode === 'ambulance' ? 'ambulance_handover' : localMode === 'hospital' ? 'hospital_discharge' : 'clinical_update', summary: '' })

  async function load() {
    setBusy(true); setError('')
    try {
      const [patientRow, linkRows, candidateRows, transferRows] = await Promise.all([
        getPatient(patientId), listSharedCarePatientLinks(patientId), listSharedCarePatientCandidates(patientId), listSharedCareTransfers(patientId).catch(() => []),
      ])
      setPatient(patientRow); setLinks(Array.isArray(linkRows) ? linkRows : []); setCandidates(Array.isArray(candidateRows) ? candidateRows : []); setTransfers(Array.isArray(transferRows) ? transferRows : [])
      if (selected) {
        const stillThere = (linkRows || []).find((item) => item.shared_patient_link_id === selected.shared_patient_link_id)
        if (!stillThere) { setSelected(null); setSnapshot(null) }
      }
    } catch (err) { setError(err?.message || 'Unable to load Shared Care records.') }
    finally { setBusy(false) }
  }

  useEffect(() => { load() }, [patientId])
  useEffect(() => { setTransfer((current) => ({ ...current, transfer_type: localMode === 'ambulance' ? 'ambulance_handover' : localMode === 'hospital' ? 'hospital_discharge' : 'clinical_update' })) }, [localMode])

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
    try { await linkSharedCarePatient(candidate.shared_care_link_id, patientId, candidate.remote_patient_id); setNotice(`Patient linked with ${candidate.partner_name}.`); await load() }
    catch (err) { setError(err?.message || 'Unable to link the Shared Care patient records.') }
    finally { setBusy(false) }
  }

  async function disconnect(link) {
    if (!window.confirm(`Remove this patient's Shared Care link with ${link.partner_name}? This does not delete either patient record.`)) return
    setBusy(true); setError(''); setNotice('')
    try { await unlinkSharedCarePatient(link.shared_patient_link_id); setNotice(`Patient Shared Care link with ${link.partner_name} removed.`); setSelected(null); setSnapshot(null); await load() }
    catch (err) { setError(err?.message || 'Unable to remove the Shared Care patient link.') }
    finally { setBusy(false) }
  }

  async function sendTransfer(event) {
    event.preventDefault()
    const link = links.find((item) => item.shared_patient_link_id === transfer.shared_patient_link_id)
    if (!link) return setError('Choose a linked RecordsWeb community.')
    setBusy(true); setError(''); setNotice('')
    try {
      await createSharedCareTransfer({ sharedPatientLinkId: link.shared_patient_link_id, sourcePatientId: patientId, targetOrganisationId: link.partner_organisation_id, targetPatientId: link.remote_patient_id, transferType: transfer.transfer_type, summary: transfer.summary, payload: { source_mode: localMode, source_name: profile.organisation_name || '', target_name: link.partner_name } })
      setNotice(`Transfer of care sent to ${link.partner_name}.`); setTransfer({ ...transfer, shared_patient_link_id: '', summary: '' }); setTransferOpen(false); await load()
    } catch (err) { setError(err?.message || 'Unable to send the transfer of care.') }
    finally { setBusy(false) }
  }

  async function markTransfer(row, status) {
    setBusy(true); setError('')
    try { await updateSharedCareTransferStatus(row.id, status); await load() }
    catch (err) { setError(err?.message || 'Unable to update the transfer.') }
    finally { setBusy(false) }
  }

  return (
    <div>
      <ClinicalToolbar actions={[{ label: 'Refresh', icon: 'search', onClick: load }, { label: 'Print shared record', icon: 'print', groupStart: true, onClick: () => window.print() }]}/>
      <PatientHeader patient={patient}/>
      <div className="page-pad compact-pad shared-care-patient-page shared-care-v2">
        {error && <div className="form-error">{error}</div>}{notice && <div className="form-success">{notice}</div>}
        <div className="shared-care-patient-intro"><div><Handshake size={20}/><div><strong>Shared Care 2.0</strong><span>One care network with clear source provenance, linked records and structured transfer-of-care events.</span></div></div><div className="care-heading-actions"><button onClick={load} disabled={busy}><RefreshCw size={13}/>Refresh</button>{links.length > 0 && <button className="primary-button" onClick={() => setTransferOpen((value) => !value)}><ArrowRightLeft size={13}/>Transfer of care</button>}</div></div>

        <Panel title="Care network" count={links.length + 1}>
          <div className="shared-care-network"><article className="local"><div className="shared-care-network-icon"><ShieldCheck size={17}/></div><div><span>LOCAL RECORD</span><strong>{profile.organisation_name || 'This RecordsWeb community'}</strong><small>{sharedCareModeLabel(localMode)} · Current source of truth</small></div></article>{links.map((link) => <article key={link.shared_patient_link_id}><div className="shared-care-network-icon"><Building2 size={17}/></div><div><span>LINKED RECORD</span><strong>{link.partner_name}</strong><small>{sharedCareModeLabel(link.partner_mode)} · @{link.partner_code}</small></div></article>)}</div>
        </Panel>

        {transferOpen && <Panel title="Send transfer of care"><form className="shared-care-transfer-form" onSubmit={sendTransfer}><label><span>Receiving community</span><select value={transfer.shared_patient_link_id} onChange={(e) => setTransfer({ ...transfer, shared_patient_link_id: e.target.value })} required><option value="">Select linked community</option>{links.map((link) => <option key={link.shared_patient_link_id} value={link.shared_patient_link_id}>{link.partner_name} · {sharedCareModeLabel(link.partner_mode)}</option>)}</select></label><label><span>Transfer type</span><select value={transfer.transfer_type} onChange={(e) => setTransfer({ ...transfer, transfer_type: e.target.value })}><option value="clinical_update">Clinical update</option><option value="ambulance_handover">Ambulance handover</option><option value="hospital_discharge">Hospital discharge</option><option value="care_plan_update">Care plan update</option></select></label><label className="shared-care-transfer-summary"><span>Clinical handover / summary</span><textarea rows="4" value={transfer.summary} onChange={(e) => setTransfer({ ...transfer, summary: e.target.value })} required placeholder="Summarise the current episode, treatment, outstanding actions and information the receiving team needs." /></label><div className="care-form-actions"><button type="button" onClick={() => setTransferOpen(false)}>Cancel</button><button className="primary-button" disabled={busy}><Send size={13}/>Send transfer</button></div></form></Panel>}

        <Panel title="Transfer of Care" count={transfers.length}>
          {!transfers.length ? <div className="empty-state">No Shared Care handovers or transfer events are recorded for this patient.</div> : <div className="shared-care-transfer-list">{transfers.map((row) => {
            const inbound = row.target_patient_id === patientId
            return <article key={row.id}><div className={`transfer-direction ${inbound ? 'inbound' : 'outbound'}`}>{inbound ? 'RECEIVED' : 'SENT'}</div><div><strong>{String(row.transfer_type || 'clinical_update').replaceAll('_', ' ')}</strong><p>{row.summary}</p><small>{formatDate(row.created_at, true)} · Status: {row.status || 'sent'}</small></div>{inbound && row.status !== 'actioned' && <div className="care-row-actions"><button onClick={() => markTransfer(row, 'viewed')}>Mark viewed</button><button className="primary-button" onClick={() => markTransfer(row, 'actioned')}><CheckCircle2 size={13}/>Actioned</button></div>}</article>
          })}</div>}
        </Panel>

        <Panel title="Linked patient records" count={links.length}>{!links.length ? <div className="empty-state">This patient is not linked to another community yet.</div> : <div className="shared-care-patient-link-grid">{links.map((link) => <div className={`shared-care-patient-link ${selected?.shared_patient_link_id === link.shared_patient_link_id ? 'active' : ''}`} key={link.shared_patient_link_id}><button className="shared-care-patient-open" onClick={() => openLink(link)}><Building2 size={17}/><div><strong>{link.partner_name}</strong><span>{sharedCareModeLabel(link.partner_mode)} · @{link.partner_code}</span><small>{link.remote_last_name?.toUpperCase()}, {link.remote_first_name} · DOB {formatDate(link.remote_dob)}</small></div></button><button className="shared-care-unlink" title="Remove patient link" onClick={() => disconnect(link)}><Unlink size={13}/></button></div>)}</div>}</Panel>

        {candidates.filter((candidate) => !linkedPartnerIds.has(candidate.partner_organisation_id)).length > 0 && <Panel title="Possible Shared Care matches" count={candidates.length}><div className="shared-care-candidates">{candidates.filter((candidate) => !linkedPartnerIds.has(candidate.partner_organisation_id)).map((candidate) => <div className="shared-care-candidate" key={`${candidate.shared_care_link_id}-${candidate.remote_patient_id}`}><div><strong>{candidate.remote_last_name?.toUpperCase()}, {candidate.remote_first_name}</strong><span>{candidate.partner_name} · {sharedCareModeLabel(candidate.partner_mode)}</span><small>DOB {formatDate(candidate.remote_dob)} · NHS {candidate.remote_nhs_number || '—'} · Match: {candidate.match_reason}</small></div><button className="primary-button" onClick={() => connect(candidate)} disabled={busy}><Link2 size={13}/>Link patient</button></div>)}</div></Panel>}

        {selected && <SharedSnapshot snapshot={snapshot}/>} {selected && !snapshot && busy && <div className="shared-care-loading"><ShieldCheck size={16}/> Loading audited Shared Care record…</div>}
      </div>
    </div>
  )
}
