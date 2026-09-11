import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CreditCard, Megaphone, RefreshCw, TriangleAlert } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { getOrganisationBilling } from '../../lib/billingService'

const STATUS_LABELS = {
  setup: 'Setup / first month',
  active: 'Active',
  overdue: 'Payment overdue',
  suspended: 'Suspended',
  complimentary: 'Complimentary',
}

function money(value) {
  const number = Number(value)
  return Number.isFinite(number) ? `£${number.toFixed(2)}` : '—'
}

function formatDate(value) {
  if (!value) return 'Not set'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).format(date)
}

export default function BillingPanel() {
  const { session } = useAuth()
  const organisationId = session?.profile?.organisation_id || session?.profile?.organisations?.id || ''
  const organisationName = session?.profile?.organisation_name || session?.profile?.organisations?.name || 'Your organisation'
  const [billing, setBilling] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    try { setBilling(await getOrganisationBilling(organisationId)) }
    catch (err) { setError(err?.message || 'Unable to load billing information.') }
    finally { setBusy(false) }
  }, [organisationId])

  useEffect(() => { load() }, [load])

  const status = useMemo(() => STATUS_LABELS[billing?.billing_status] || billing?.billing_status || 'Unknown', [billing])

  return (
    <section className="organisation-billing-panel">
      <header className="organisation-billing-header">
        <div><span>BILLING</span><h2>Subscription & billing</h2><p>View the RecordsWeb plan and billing details assigned to {organisationName}.</p></div>
        <button type="button" onClick={load} disabled={busy}><RefreshCw size={14}/>{busy ? 'Refreshing…' : 'Refresh'}</button>
      </header>

      {error && <div className="billing-message error"><TriangleAlert size={16}/><span>{error}</span></div>}

      {billing && <>
        <div className="billing-summary-grid">
          <div className="billing-summary-main"><CreditCard size={22}/><div><span>STANDARD PLAN</span><strong>{money(billing.billing_monthly_price)} <small>/ month</small></strong><p>RecordsWeb Standard</p></div></div>
          <div><span>Status</span><strong className={`billing-status billing-status-${billing.billing_status}`}>{status}</strong></div>
          <div><span>Billing start</span><strong>{formatDate(billing.billing_start_date)}</strong></div>
          <div><span>Next billing date</span><strong>{formatDate(billing.billing_next_date)}</strong></div>
        </div>

        <div className="billing-detail-grid">
          <article>
            <h3>Plan details</h3>
            <div><span>Monthly subscription</span><strong>{money(billing.billing_monthly_price)}</strong></div>
            <div><span>Standard setup fee</span><strong>{money(billing.billing_setup_fee)}</strong></div>
            <div><span>First-month offer</span><strong>{billing.billing_first_month_offer ? `${money(billing.billing_first_month_price)} · setup included` : 'Not applied'}</strong></div>
            <p>The standard plan includes the RecordsWeb organisation workspace, patient records, consultations, medication, documents, appointments, staff management, web access, desktop access, updates and support.</p>
          </article>

          <article>
            <h3>Optional services</h3>
            <div><span>In-game announcement board</span><strong>{billing.announcement_board_enabled ? 'Enabled' : 'Not enabled'}</strong></div>
            <div><span>One-off integration price</span><strong>{money(billing.announcement_board_fee)}</strong></div>
            <p><Megaphone size={14}/> Additional integrations or bespoke work can be arranged separately where supported.</p>
          </article>
        </div>

        {billing.billing_notes && <div className="billing-notes"><strong>Billing note</strong><p>{billing.billing_notes}</p></div>}

        <div className="billing-support-note"><CheckCircle2 size={16}/><span>Billing is administered by RecordsWeb. For billing changes or questions, contact <strong>contactus@recordsweb.org</strong>.</span></div>
      </>}
    </section>
  )
}
