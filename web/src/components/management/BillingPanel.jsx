import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CreditCard, ExternalLink, Megaphone, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { createStripePortalSession, getOrganisationBilling } from '../../lib/billingService'
import { deriveBillingAccess } from '../../lib/billingAccess'

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
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).format(date)
}

function formatDateTime(value) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

function stripeStatusLabel(value) {
  if (!value) return 'Not connected'
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function BillingPanel() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const organisationId = session?.profile?.organisation_id || session?.profile?.organisations?.id || ''
  const organisationName = session?.profile?.organisation_name || session?.profile?.organisations?.name || 'Your organisation'
  const [billing, setBilling] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    try { setBilling(await getOrganisationBilling(organisationId)) }
    catch (err) { setError(err?.message || 'Unable to load billing information.') }
    finally { setBusy(false) }
  }, [organisationId])

  useEffect(() => { load() }, [load])

  const status = useMemo(() => {
    if (billing?.billing_payment_exempt) return 'Payment exempt'
    if (!billing?.stripe_subscription_id) return 'Stripe setup required'
    return STATUS_LABELS[billing?.billing_status] || billing?.billing_status || 'Unknown'
  }, [billing])

  const statusClass = billing?.billing_payment_exempt
    ? 'complimentary'
    : billing?.stripe_subscription_id
      ? (billing?.billing_status || 'setup')
      : 'setup'

  const billingAccess = useMemo(() => deriveBillingAccess(billing || {}), [billing])

  async function manageBilling() {
    setActionBusy(true)
    setError('')
    try {
      const result = await createStripePortalSession()
      if (!result?.url) throw new Error('Stripe did not return a billing portal link.')
      window.location.assign(result.url)
    } catch (err) {
      setError(err?.message || 'Unable to open Stripe billing.')
      setActionBusy(false)
    }
  }

  const hasStripeSubscription = Boolean(billing?.stripe_subscription_id)
  const paymentConnected = hasStripeSubscription && !['canceled', 'incomplete_expired'].includes(String(billing?.stripe_subscription_status || ''))

  return (
    <section className="organisation-billing-panel">
      <header className="organisation-billing-header">
        <div><span>BILLING</span><h2>Subscription & billing</h2><p>View and manage the RecordsWeb plan and payment details assigned to {organisationName}.</p></div>
        <button type="button" onClick={load} disabled={busy}><RefreshCw size={14}/>{busy ? 'Refreshing…' : 'Refresh'}</button>
      </header>

      {error && <div className="billing-message error"><TriangleAlert size={16}/><span>{error}</span></div>}

      {billing && <>
        {billing.billing_payment_exempt && (
          <div className="billing-exempt-banner">
            <ShieldCheck size={20}/>
            <div><strong>Payment excluded</strong><span>This community does not need to pay a RecordsWeb subscription.</span>{billing.billing_exemption_reason && <small>{billing.billing_exemption_reason}</small>}</div>
          </div>
        )}

        {!billing.billing_payment_exempt && billingAccess.mode === 'grace' && (
          <div className="billing-grace-banner">
            <TriangleAlert size={20}/>
            <div><strong>Payment overdue · grace period active</strong><span>RecordsWeb remains fully available during the 7-day payment grace period.</span><small>Grace ends {formatDateTime(billing.billing_grace_ends_at)}{billingAccess.daysRemaining !== null ? ` · ${billingAccess.daysRemaining} day${billingAccess.daysRemaining === 1 ? '' : 's'} remaining` : ''}.</small></div>
          </div>
        )}

        {!billing.billing_payment_exempt && billingAccess.mode === 'read_only' && (
          <div className="billing-readonly-banner">
            <TriangleAlert size={20}/>
            <div><strong>Subscription suspended · RecordsWeb is read-only</strong><span>Existing records remain available, but new records and changes are blocked until billing is restored.</span><small>Use Manage billing below to update the payment method. Full write access is restored automatically after Stripe confirms payment.</small></div>
          </div>
        )}

        <div className="billing-summary-grid">
          <div className="billing-summary-main"><CreditCard size={22}/><div><span>STANDARD PLAN</span><strong>{billing.billing_payment_exempt ? 'No payment required' : <>{money(billing.billing_monthly_price)} <small>/ month</small></>}</strong><p>RecordsWeb Standard</p></div></div>
          <div><span>Status</span><strong className={`billing-status billing-status-${statusClass}`}>{status}</strong></div>
          <div><span>Billing start</span><strong>{billing.billing_payment_exempt ? 'Not required' : formatDate(billing.billing_start_date)}</strong></div>
          <div><span>Next billing date</span><strong>{billing.billing_payment_exempt ? 'No payment due' : formatDate(billing.billing_next_date)}</strong></div>
        </div>

        <div className="billing-detail-grid">
          <article>
            <h3>Plan details</h3>
            <div><span>Monthly subscription</span><strong>{billing.billing_payment_exempt ? 'Excluded' : money(billing.billing_monthly_price)}</strong></div>
            <div><span>Standard setup fee</span><strong>{billing.billing_payment_exempt ? 'Excluded' : (billing.billing_setup_fee_paid_at ? 'Paid' : money(billing.billing_setup_fee))}</strong></div>
            <div><span>First-month offer</span><strong>{billing.billing_payment_exempt ? 'Not required' : (billing.billing_first_month_offer_redeemed_at ? 'Used' : billing.billing_first_month_offer ? `${money(billing.billing_first_month_price)} · setup included` : 'Not applied')}</strong></div>
            <p>The standard plan includes the RecordsWeb organisation workspace, patient records, consultations, medication, documents, appointments, staff management, web access, desktop access, updates and support.</p>
          </article>

          <article>
            <h3>Payment connection</h3>
            <div><span>Stripe subscription</span><strong>{billing.billing_payment_exempt ? 'Not required' : stripeStatusLabel(billing.stripe_subscription_status)}</strong></div>
            <div><span>Billing email</span><strong>{billing.billing_payment_exempt ? 'Not required' : (billing.billing_email || 'Collected at checkout')}</strong></div>
            <div><span>Environment</span><strong>{billing.stripe_environment === 'sandbox' ? 'Stripe Sandbox' : billing.stripe_environment === 'live' ? 'Stripe Live' : 'Not connected'}</strong></div>
            {!billing.billing_payment_exempt && <div className="billing-action-row">
              {paymentConnected ? (
                <button type="button" onClick={manageBilling} disabled={actionBusy}><ExternalLink size={14}/>{actionBusy ? 'Opening…' : 'Manage billing'}</button>
              ) : (
                <button type="button" className="primary" onClick={() => navigate('/billing/checkout')}><CreditCard size={14}/>Set up subscription</button>
              )}
            </div>}
          </article>

          <article>
            <h3>Optional services</h3>
            <div><span>In-game announcement board</span><strong>{billing.announcement_board_enabled ? 'Enabled' : 'Not enabled'}</strong></div>
            <div><span>One-off integration price</span><strong>{billing.billing_payment_exempt ? 'Excluded' : billing.announcement_board_paid_at ? 'Paid' : money(billing.announcement_board_fee)}</strong></div>
            <p><Megaphone size={14}/> Additional integrations or bespoke work can be arranged separately where supported.</p>
          </article>
        </div>

        {billing.billing_notes && <div className="billing-notes"><strong>Billing note</strong><p>{billing.billing_notes}</p></div>}

        <div className="billing-support-note"><CheckCircle2 size={16}/><span>{billing.billing_payment_exempt ? 'Platform Management has excluded this community from payment. No Stripe checkout is required.' : 'Payments are processed securely by Stripe. RecordsWeb does not receive or store your full card number.'} For billing questions, contact <strong>contactus@recordsweb.org</strong>.</span></div>
      </>}
    </section>
  )
}
