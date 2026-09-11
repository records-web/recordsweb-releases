import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, CreditCard, LockKeyhole, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import recordsWebLogo from '../assets/recordsweb-update-logo.png'
import { useAuth } from '../contexts/AuthContext'
import { createStripeCheckoutSession, getOrganisationBilling, getStripeCheckoutStatus } from '../lib/billingService'

let stripeScriptPromise = null

function loadStripeScript() {
  if (window.Stripe) return Promise.resolve(window.Stripe)
  if (stripeScriptPromise) return stripeScriptPromise
  stripeScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-recordsweb-stripe]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Stripe), { once: true })
      existing.addEventListener('error', () => reject(new Error('Stripe.js could not be loaded.')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://js.stripe.com/clover/stripe.js'
    script.async = true
    script.dataset.recordswebStripe = 'true'
    script.onload = () => window.Stripe ? resolve(window.Stripe) : reject(new Error('Stripe.js loaded without exposing Stripe.'))
    script.onerror = () => reject(new Error('Stripe.js could not be loaded. Check your network connection and Content Security Policy.'))
    document.head.appendChild(script)
  })
  return stripeScriptPromise
}

function moneyPence(value) {
  const pence = Number(value)
  return Number.isFinite(pence) ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100) : '—'
}

function fallbackSummary(billing) {
  if (!billing) return null
  const monthly = Math.round(Number(billing.billing_monthly_price || 0) * 100)
  const first = Math.round(Number(billing.billing_first_month_price || 0) * 100)
  const setup = Math.round(Number(billing.billing_setup_fee || 0) * 100)
  const board = Math.round(Number(billing.announcement_board_fee || 0) * 100)
  const offer = Boolean(billing.billing_first_month_offer) && !billing.billing_first_month_offer_redeemed_at
  const setupDue = !offer && !billing.billing_setup_fee_paid_at ? setup : 0
  const boardDue = billing.announcement_board_enabled && !billing.announcement_board_paid_at ? board : 0
  return {
    organisationName: billing.name,
    organisationCode: billing.org_code,
    monthlyAmount: monthly,
    firstMonthOffer: offer,
    firstMonthAmount: offer ? first : monthly,
    setupFeeIncluded: offer,
    setupFeeAmount: setupDue,
    announcementBoardAmount: boardDue,
    dueToday: (offer ? first : monthly) + setupDue + boardDue,
    currency: 'gbp',
  }
}

function CheckoutReturn() {
  const navigate = useNavigate()
  const location = useLocation()
  const [state, setState] = useState({ loading: true, ok: false, message: 'Confirming your subscription with Stripe…' })

  useEffect(() => {
    let live = true
    const sessionId = new URLSearchParams(location.search).get('session_id') || ''
    if (!sessionId) {
      setState({ loading: false, ok: false, message: 'The Stripe Checkout Session id is missing.' })
      return undefined
    }
    getStripeCheckoutStatus(sessionId)
      .then((result) => {
        if (!live) return
        const complete = result?.status === 'complete'
        setState({
          loading: false,
          ok: complete,
          message: complete
            ? 'Your Stripe checkout is complete. RecordsWeb has refreshed the organisation billing state.'
            : 'Stripe has not marked this checkout as complete yet. You can return to billing and refresh shortly.',
        })
      })
      .catch((error) => {
        if (live) setState({ loading: false, ok: false, message: error?.message || 'Unable to confirm the Stripe checkout.' })
      })
    return () => { live = false }
  }, [location.search])

  return (
    <main className="stripe-checkout-shell stripe-checkout-result">
      <div className="stripe-checkout-brand"><img src={recordsWebLogo} alt="RecordsWeb" /><div><strong>RecordsWeb</strong><span>Subscription & billing</span></div></div>
      <section className="stripe-checkout-card">
        {state.loading ? <CreditCard className="stripe-checkout-result-icon" size={38}/> : state.ok ? <CheckCircle2 className="stripe-checkout-result-icon success" size={38}/> : <TriangleAlert className="stripe-checkout-result-icon" size={38}/>} 
        <h1>{state.loading ? 'Confirming payment' : state.ok ? 'Subscription confirmed' : 'Checkout status'}</h1>
        <p>{state.message}</p>
        <button type="button" className="stripe-checkout-primary" onClick={() => navigate('/management')} disabled={state.loading}>Return to Management</button>
      </section>
    </main>
  )
}

function StripeCheckoutMain() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const paymentElementRef = useRef(null)
  const checkoutRef = useRef(null)
  const actionsRef = useRef(null)
  const [billing, setBilling] = useState(null)
  const [checkoutData, setCheckoutData] = useState(null)
  const [email, setEmail] = useState('')
  const [stripeTotal, setStripeTotal] = useState('')
  const [ready, setReady] = useState(false)
  const [canConfirm, setCanConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const organisationId = session?.profile?.organisation_id || session?.profile?.organisations?.id || ''
  const summary = useMemo(() => checkoutData?.summary || fallbackSummary(billing), [checkoutData, billing])

  useEffect(() => {
    let live = true
    let mountedElement = null
    async function initialise() {
      try {
        setError('')
        const currentBilling = await getOrganisationBilling(organisationId)
        if (!live) return
        setBilling(currentBilling)
        setEmail(currentBilling.billing_email || '')
        if (currentBilling.billing_payment_exempt) {
          setError('This community is excluded from payment. No Stripe checkout is required.')
          return
        }

        const result = await createStripeCheckoutSession()
        if (!live) return
        setCheckoutData(result)
        if (!result?.clientSecret || !result?.publishableKey) throw new Error('Stripe checkout could not be initialised.')

        const StripeConstructor = await loadStripeScript()
        if (!live) return
        const stripe = StripeConstructor(result.publishableKey)
        const checkout = stripe.initCheckout({
          clientSecret: result.clientSecret,
          elementsOptions: {
            appearance: {
              theme: 'stripe',
              variables: {
                colorPrimary: '#0f6fbd',
                colorText: '#17384d',
                colorDanger: '#b42318',
                borderRadius: '4px',
                fontFamily: 'Arial, Helvetica, sans-serif',
              },
            },
          },
        })
        checkoutRef.current = checkout
        checkout.on('change', (checkoutSession) => {
          if (live) setCanConfirm(Boolean(checkoutSession?.canConfirm))
        })

        const paymentElement = checkout.createPaymentElement()
        mountedElement = paymentElement
        paymentElement.mount(paymentElementRef.current)

        const loaded = await checkout.loadActions()
        if (!live) return
        if (loaded.type !== 'success') throw new Error(loaded?.error?.message || 'Stripe checkout actions could not be loaded.')
        actionsRef.current = loaded.actions
        const stripeSession = loaded.actions.getSession()
        if (stripeSession?.customerDetails?.email) setEmail(stripeSession.customerDetails.email)
        // Stripe requires custom Checkout integrations to render pricing from the
        // Checkout Session. Keep the configured RecordsWeb breakdown above, but
        // use Stripe's authoritative total for the amount being confirmed.
        setStripeTotal(stripeSession?.total?.total?.amount || '')
        setCanConfirm(Boolean(stripeSession?.canConfirm))
        setReady(true)
      } catch (err) {
        if (live) setError(err?.message || 'Unable to initialise Stripe checkout.')
      }
    }
    initialise()
    return () => {
      live = false
      try { mountedElement?.destroy?.() } catch {}
      checkoutRef.current = null
      actionsRef.current = null
    }
  }, [organisationId])

  async function submit(event) {
    event.preventDefault()
    if (!actionsRef.current || submitting) return
    const cleanEmail = String(email || '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Enter a valid billing email address.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      if (checkoutData?.emailUpdateRequired !== false) {
        const emailResult = await actionsRef.current.updateEmail(cleanEmail)
        if (emailResult?.error) throw new Error(emailResult.error.message || 'Stripe could not accept that billing email address.')
      }
      const result = await actionsRef.current.confirm()
      if (result?.type === 'error') throw new Error(result.error?.message || 'Stripe could not confirm the subscription.')
    } catch (err) {
      setError(err?.message || 'Unable to complete the Stripe checkout.')
      setSubmitting(false)
    }
  }

  return (
    <main className="stripe-checkout-shell">
      <div className="stripe-checkout-brand"><img src={recordsWebLogo} alt="RecordsWeb" /><div><strong>RecordsWeb</strong><span>Secure subscription checkout</span></div></div>
      <button type="button" className="stripe-checkout-back" onClick={() => navigate('/management')}><ArrowLeft size={14}/>Back to Management</button>

      <div className="stripe-checkout-layout">
        <section className="stripe-checkout-card stripe-checkout-summary">
          <div className="stripe-checkout-eyebrow">RECORDSWEB STANDARD</div>
          <h1>Set up your subscription</h1>
          <p>Complete the payment securely using Stripe. RecordsWeb never receives your full card number.</p>
          {checkoutData?.environment === 'sandbox' && <div className="stripe-sandbox-badge">STRIPE SANDBOX · TEST PAYMENT ONLY</div>}
          {summary && <div className="stripe-order-summary">
            <div><span>Community</span><strong>{summary.organisationName || 'RecordsWeb community'}{summary.organisationCode ? ` · @${summary.organisationCode}` : ''}</strong></div>
            <div><span>RecordsWeb Standard</span><strong>{moneyPence(summary.monthlyAmount)} / month</strong></div>
            {summary.firstMonthOffer && <div><span>First-month offer</span><strong>{moneyPence(summary.firstMonthAmount)}</strong></div>}
            {summary.setupFeeAmount > 0 && <div><span>One-off setup fee</span><strong>{moneyPence(summary.setupFeeAmount)}</strong></div>}
            {summary.setupFeeIncluded && <div><span>Setup fee</span><strong>Included in first-month offer</strong></div>}
            {summary.announcementBoardAmount > 0 && <div><span>Announcement board integration</span><strong>{moneyPence(summary.announcementBoardAmount)}</strong></div>}
            <div className="stripe-order-total"><span>Due today</span><strong>{stripeTotal || moneyPence(summary.dueToday)}</strong></div>
            <small>After the introductory month, the recurring subscription is {moneyPence(summary.monthlyAmount)} per month unless cancelled.</small>
          </div>}
          <div className="stripe-security-note"><ShieldCheck size={16}/><span>Payment details are collected inside Stripe's secure Payment Element.</span></div>
        </section>

        <form className="stripe-checkout-card stripe-payment-card" onSubmit={submit}>
          <header><CreditCard size={20}/><div><strong>Payment details</strong><span>Securely processed by Stripe</span></div></header>
          <label className="stripe-email-field"><span>Billing email{checkoutData?.emailUpdateRequired === false ? ' · managed by Stripe' : ''}</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="billing@example.org" required disabled={checkoutData?.emailUpdateRequired === false} /></label>
          <div className="stripe-payment-element" ref={paymentElementRef}><span>{ready ? '' : 'Loading secure payment form…'}</span></div>
          {error && <div className="stripe-checkout-error"><TriangleAlert size={15}/><span>{error}</span></div>}
          <button type="submit" className="stripe-checkout-primary" disabled={!ready || !canConfirm || submitting || Boolean(billing?.billing_payment_exempt)}><LockKeyhole size={15}/>{submitting ? 'Confirming…' : `Subscribe${summary ? ` · ${stripeTotal || moneyPence(summary.dueToday)} today` : ''}`}</button>
          <small className="stripe-checkout-legal">By confirming, you authorise RecordsWeb to charge the recurring subscription amount shown above according to the billing schedule. You can manage or cancel the subscription through the RecordsWeb billing page.</small>
        </form>
      </div>
    </main>
  )
}

export default function StripeCheckoutPage({ returnMode = false }) {
  return returnMode ? <CheckoutReturn /> : <StripeCheckoutMain />
}
