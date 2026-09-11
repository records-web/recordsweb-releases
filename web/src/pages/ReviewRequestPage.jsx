import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  Hospital,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  UserRoundCheck,
  XCircle,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import recordsWebLogo from '../assets/recordsweb-update-logo.png'
import {
  ACCESS_REQUEST_REVIEWER_EMAIL_FORMAT,
  createAccessRequestLogoUrl,
  getAccessRequestReviewerSession,
  isAccessRequestReviewer,
  listRecordsWebAccessRequests,
  saveRecordsWebAccessRequestReview,
  signInAccessRequestReviewer,
  signOutAccessRequestReviewer,
} from '../lib/accessRequestReviewService'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { APP_VERSION } from '../lib/webRuntime'
import { applyRecordsWebProductBrand } from '../lib/organisationSettings'
import { useAuth } from '../contexts/AuthContext'

const FILTERS = [
  ['pending', 'Pending'],
  ['reviewing', 'Reviewing'],
  ['approved', 'Approved'],
  ['declined', 'Declined'],
  ['', 'All'],
]

const STATUS_LABELS = {
  pending: 'Pending',
  reviewing: 'Reviewing',
  approved: 'Approved',
  declined: 'Declined',
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function memberRangeLabel(value) {
  return ({ '10-99': '10+', '100-999': '100+', '1000-9999': '1,000+', '10000+': '10,000+' })[value] || value || '—'
}

function safeHref(value) {
  try {
    const url = new URL(String(value || ''))
    return url.protocol === 'https:' ? url.toString() : ''
  } catch { return '' }
}

function ReviewerSignIn({ onSignedIn, currentSession }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const wrongAccount = currentSession?.user && !isAccessRequestReviewer(currentSession)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (wrongAccount) await signOutAccessRequestReviewer()
      const session = await signInAccessRequestReviewer({ email, password })
      onSignedIn(session)
    } catch (err) {
      setError(err?.message || 'Unable to sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="review-request-auth-screen">
      <div className="review-request-auth-card">
        <div className="review-request-auth-brand">
          <img src={recordsWebLogo} alt="RecordsWeb" />
          <div><strong>RecordsWeb</strong><span>Access request review</span></div>
        </div>
        <div className="review-request-auth-rule" />
        <div className="review-request-auth-heading"><ShieldCheck size={20}/><div><strong>Restricted review area</strong><span>Sign in with a reserved RecordsWeb reviewer account for any active organisation.</span></div></div>
        {wrongAccount && (
          <div className="review-request-auth-warning">
            The currently signed-in account <strong>{currentSession.user.email}</strong> does not have access to this page. Signing in below will sign that account out first.
          </div>
        )}
        <form onSubmit={submit}>
          <label><span>Account email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={ACCESS_REQUEST_REVIEWER_EMAIL_FORMAT} autoComplete="username" required /></label>
          <label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
          {error && <div className="review-request-auth-error">{error}</div>}
          <div className="review-request-auth-actions">
            <button type="button" onClick={() => navigate('/')}><ArrowLeft size={14}/> Home</button>
            <button className="review-request-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </div>
        </form>
        <div className="review-request-auth-footer">RecordsWeb {APP_VERSION}</div>
      </div>
    </div>
  )
}

export default function ReviewRequestPage() {
  useEffect(() => { applyRecordsWebProductBrand() }, [])
  const navigate = useNavigate()
  const { session: clinicalSession, logout: logoutClinicalSession } = useAuth()
  const [authReady, setAuthReady] = useState(false)
  const [reviewerSession, setReviewerSession] = useState(null)
  const [filter, setFilter] = useState('pending')
  const [requests, setRequests] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [operatorNotes, setOperatorNotes] = useState('')
  const [savingStatus, setSavingStatus] = useState('')

  const authorised = isAccessRequestReviewer(reviewerSession)
  const selected = useMemo(() => requests.find((item) => item.id === selectedId) || requests[0] || null, [requests, selectedId])

  useEffect(() => {
    let live = true
    if (!supabaseConfigured || !supabase) {
      setAuthReady(true)
      return undefined
    }
    getAccessRequestReviewerSession()
      .then((session) => { if (live) setReviewerSession(session) })
      .catch(() => {})
      .finally(() => { if (live) setAuthReady(true) })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!live) return
      setReviewerSession(session)
      setAuthReady(true)
    })
    return () => {
      live = false
      data?.subscription?.unsubscribe?.()
    }
  }, [])

  const loadRequests = useCallback(async (preferredId = '') => {
    if (!authorised) return
    setLoading(true)
    setError('')
    try {
      const rows = await listRecordsWebAccessRequests(filter)
      setRequests(rows)
      setSelectedId((current) => {
        if (preferredId && rows.some((item) => item.id === preferredId)) return preferredId
        if (current && rows.some((item) => item.id === current)) return current
        return rows[0]?.id || ''
      })
    } catch (err) {
      setError(err?.message || 'Unable to load access requests.')
    } finally {
      setLoading(false)
    }
  }, [authorised, filter])

  useEffect(() => {
    if (authorised) loadRequests()
  }, [authorised, filter, loadRequests])

  useEffect(() => {
    let live = true
    setLogoUrl('')
    setOperatorNotes(selected?.operator_notes || '')
    if (!selected?.logo_path || !authorised) return undefined
    createAccessRequestLogoUrl(selected.logo_path).then((url) => {
      if (live) setLogoUrl(url)
    }).catch(() => {})
    return () => { live = false }
  }, [selected?.id, selected?.logo_path, selected?.operator_notes, authorised])

  async function updateStatus(status) {
    if (!selected || savingStatus) return
    setSavingStatus(status)
    setError('')
    setNotice('')
    try {
      await saveRecordsWebAccessRequestReview({ id: selected.id, status, operatorNotes })
      setNotice(`Request marked ${STATUS_LABELS[status].toLowerCase()}.`)
      await loadRequests(selected.id)
    } catch (err) {
      setError(err?.message || 'Unable to update this request.')
    } finally {
      setSavingStatus('')
    }
  }

  async function logoutReviewer() {
    await signOutAccessRequestReviewer().catch(() => {})
    setReviewerSession(null)
    navigate('/')
  }

  if (!authReady) {
    return <div className="review-request-loading">Checking reviewer access…</div>
  }

  if (!supabaseConfigured) {
    return (
      <div className="review-request-loading">
        <div><strong>Request review unavailable</strong><span>Supabase must be configured to use the review-request page.</span><button onClick={() => navigate('/')}>Return home</button></div>
      </div>
    )
  }

  if (clinicalSession && !isAccessRequestReviewer(clinicalSession)) {
    return (
      <div className="review-request-loading">
        <div>
          <strong>Sign out of the staff session first</strong>
          <span>The current RecordsWeb staff account is not an authorised platform reviewer identity. Use gus.farnsworth@XX.XX or alfie.james@XX.XX for the matching active community.</span>
          <button onClick={async () => { await logoutClinicalSession('reviewer_switch'); setReviewerSession(null) }}>Sign out staff account</button>
          <button onClick={() => navigate('/')}>Return home</button>
        </div>
      </div>
    )
  }

  if (!authorised) {
    return <ReviewerSignIn currentSession={reviewerSession} onSignedIn={setReviewerSession} />
  }

  return (
    <div className="review-request-page">
      <header className="review-request-header">
        <div className="review-request-brand"><img src={recordsWebLogo} alt="RecordsWeb"/><div><strong>RecordsWeb</strong><span>Access request review</span></div></div>
        <div className="review-request-header-actions">
          <span><UserRoundCheck size={14}/>{reviewerSession?.user?.email}</span>
          <button onClick={() => navigate('/platform-management')}><ShieldCheck size={14}/> Platform management</button>
          <button onClick={() => navigate('/')}><ArrowLeft size={14}/> Home</button>
          <button onClick={logoutReviewer}><LogOut size={14}/> Sign out</button>
        </div>
      </header>

      <main className="review-request-main">
        <section className="review-request-titlebar">
          <div><span>RECORDSWEB ACCESS</span><h1>Review requests</h1><p>Review community deployment requests submitted through the public RecordsWeb website.</p></div>
          <button onClick={() => loadRequests(selected?.id || '')} disabled={loading}><RefreshCw size={15} className={loading ? 'review-request-spin' : ''}/> Refresh</button>
        </section>

        <div className="review-request-filters">
          {FILTERS.map(([value, label]) => <button key={label} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}
        </div>

        {error && <div className="review-request-message error">{error}</div>}
        {notice && <div className="review-request-message success"><CheckCircle2 size={15}/>{notice}</div>}

        <div className="review-request-workspace">
          <aside className="review-request-list">
            <div className="review-request-list-header"><strong>{FILTERS.find(([value]) => value === filter)?.[1] || 'Requests'}</strong><span>{requests.length}</span></div>
            {loading && requests.length === 0 ? <div className="review-request-empty">Loading requests…</div> : null}
            {!loading && requests.length === 0 ? <div className="review-request-empty">No requests in this view.</div> : null}
            {requests.map((request) => (
              <button key={request.id} className={`review-request-list-item ${selected?.id === request.id ? 'selected' : ''}`} onClick={() => setSelectedId(request.id)}>
                <div className="review-request-list-top"><strong>{request.community_name}</strong><span className={`review-request-status ${request.status}`}>{STATUS_LABELS[request.status] || request.status}</span></div>
                <span>{request.requested_mode === 'hospital' ? 'Secondary Care (Hospital)' : 'Primary Care (GP)'} · {memberRangeLabel(request.member_range)} members</span>
                <small>{formatDate(request.created_at)}</small>
              </button>
            ))}
          </aside>

          <section className="review-request-detail">
            {!selected ? <div className="review-request-empty detail">Select a request to review it.</div> : (
              <>
                <div className="review-request-detail-heading">
                  <div className="review-request-logo-wrap">{logoUrl ? <img src={logoUrl} alt={`${selected.community_name} logo`}/> : <FileCheck2 size={28}/>}</div>
                  <div><span>{selected.requested_mode === 'hospital' ? <><Hospital size={14}/> Secondary Care (Hospital)</> : <><Stethoscope size={14}/> Primary Care (GP)</>}</span><h2>{selected.community_name}</h2><p>Submitted {formatDate(selected.created_at)}</p></div>
                  <span className={`review-request-status large ${selected.status}`}>{STATUS_LABELS[selected.status] || selected.status}</span>
                </div>

                <div className="review-request-detail-grid">
                  <div><span>Community size</span><strong>{memberRangeLabel(selected.member_range)}</strong></div>
                  <div><span>Contact</span><strong>{selected.contact_name}</strong><small>{selected.contact_email}</small></div>
                  <div><span>Discord username</span><strong>{selected.discord_username || 'Not supplied'}</strong></div>
                  <div><span>Submitted</span><strong>{formatDate(selected.created_at)}</strong></div>
                </div>

                <div className="review-request-links">
                  {safeHref(selected.discord_url) && <a href={safeHref(selected.discord_url)} target="_blank" rel="noreferrer">Discord <ExternalLink size={13}/></a>}
                  {safeHref(selected.roblox_group_url) && <a href={safeHref(selected.roblox_group_url)} target="_blank" rel="noreferrer">Roblox group <ExternalLink size={13}/></a>}
                  {logoUrl && <a href={logoUrl} target="_blank" rel="noreferrer">Open logo <ExternalLink size={13}/></a>}
                </div>

                <div className="review-request-block"><span>Additional information</span><p>{selected.additional_details || 'No additional information was supplied.'}</p></div>
                <div className="review-request-block"><span>Authorisation confirmation</span><p>{selected.authorised_contact ? 'Confirmed by the submitter.' : 'Not confirmed.'}</p></div>

                <label className="review-request-notes"><span>Reviewer notes</span><textarea value={operatorNotes} onChange={(e) => setOperatorNotes(e.target.value)} maxLength={3000} rows={6} placeholder="Private notes about eligibility, checks completed, or setup requirements." /></label>

                <div className="review-request-actions">
                  <button className="reviewing" onClick={() => updateStatus('reviewing')} disabled={Boolean(savingStatus)}><Clock3 size={15}/>{savingStatus === 'reviewing' ? 'Saving…' : 'Mark reviewing'}</button>
                  <button className="approved" onClick={() => updateStatus('approved')} disabled={Boolean(savingStatus)}><CheckCircle2 size={15}/>{savingStatus === 'approved' ? 'Saving…' : 'Approve'}</button>
                  <button className="declined" onClick={() => updateStatus('declined')} disabled={Boolean(savingStatus)}><XCircle size={15}/>{savingStatus === 'declined' ? 'Saving…' : 'Decline'}</button>
                  <button onClick={() => updateStatus(selected.status)} disabled={Boolean(savingStatus)}><FileCheck2 size={15}/>{savingStatus === selected.status ? 'Saving…' : 'Save notes'}</button>
                </div>

                {selected.reviewed_at && <div className="review-request-reviewed"><ShieldCheck size={14}/> Last reviewed {formatDate(selected.reviewed_at)}</div>}
              </>
            )}
          </section>
        </div>
      </main>
      <footer className="review-request-footer"><span>RecordsWeb · Restricted operator review</span><span>Version {APP_VERSION}</span></footer>
    </div>
  )
}
