import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@^22'

function requiredEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Server configuration error: ${name} is unavailable.`)
  return value
}

function cleanText(value: unknown, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

function objectId(value: any) {
  if (!value) return ''
  return typeof value === 'string' ? value : String(value.id || '')
}

function stripeEnvironment(secretKey: string) {
  return secretKey.startsWith('sk_test_') ? 'sandbox' : 'live'
}

function billingStatusFromSubscription(status: string) {
  if (status === 'active' || status === 'trialing') return 'active'
  if (status === 'past_due' || status === 'unpaid') return 'overdue'
  if (status === 'canceled' || status === 'incomplete_expired' || status === 'paused') return 'suspended'
  return 'setup'
}

function unixIso(value: unknown) {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null
}

function subscriptionPeriodEnd(subscription: any) {
  // Stripe API versions from 2025-03-31 onward moved billing-period dates
  // from the Subscription onto Subscription Items. Support both shapes so
  // RecordsWeb also works with older Stripe API versions.
  const topLevel = Number(subscription?.current_period_end)
  if (Number.isFinite(topLevel) && topLevel > 0) return topLevel
  const ends = Array.isArray(subscription?.items?.data)
    ? subscription.items.data.map((item: any) => Number(item?.current_period_end)).filter((value: number) => Number.isFinite(value) && value > 0)
    : []
  return ends.length ? Math.max(...ends) : null
}

function dateOnly(iso: string | null) {
  return iso ? iso.slice(0, 10) : null
}

function validEmail(value: unknown) {
  const email = cleanText(value, 254)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

async function getOrganisation(admin: any, organisationId: string) {
  if (!organisationId) return null
  const { data, error } = await admin
    .from('organisations')
    .select('id,org_code,name,billing_payment_exempt,billing_status,billing_start_date,billing_email,billing_setup_fee_paid_at,billing_first_month_offer_redeemed_at,announcement_board_paid_at,stripe_customer_id,stripe_subscription_id,stripe_subscription_status')
    .eq('id', organisationId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data || null
}

async function findOrganisation(admin: any, { organisationId = '', customerId = '', subscriptionId = '' } = {}) {
  if (organisationId) {
    const direct = await getOrganisation(admin, organisationId)
    if (direct) return direct
  }
  if (subscriptionId) {
    const { data, error } = await admin
      .from('organisations')
      .select('id,org_code,name,billing_payment_exempt,billing_status,billing_start_date,billing_email,billing_setup_fee_paid_at,billing_first_month_offer_redeemed_at,announcement_board_paid_at,stripe_customer_id,stripe_subscription_id,stripe_subscription_status')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (data) return data
  }
  if (customerId) {
    const { data, error } = await admin
      .from('organisations')
      .select('id,org_code,name,billing_payment_exempt,billing_status,billing_start_date,billing_email,billing_setup_fee_paid_at,billing_first_month_offer_redeemed_at,announcement_board_paid_at,stripe_customer_id,stripe_subscription_id,stripe_subscription_status')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (data) return data
  }
  return null
}

async function applySubscription(admin: any, subscription: any, environment: string, explicitOrganisationId = '') {
  const subscriptionId = objectId(subscription?.id)
  const customerId = objectId(subscription?.customer)
  const organisationId = cleanText(explicitOrganisationId || subscription?.metadata?.recordsweb_organisation_id, 80)
  const organisation = await findOrganisation(admin, { organisationId, customerId, subscriptionId })
  if (!organisation) {
    console.warn('Stripe subscription event did not match a RecordsWeb organisation', subscriptionId, customerId)
    return
  }

  const now = new Date().toISOString()
  const status = cleanText(subscription?.status, 80)
  const periodEnd = unixIso(subscriptionPeriodEnd(subscription))
  const patch: Record<string, unknown> = {
    stripe_customer_id: customerId || organisation.stripe_customer_id || null,
    stripe_subscription_id: subscriptionId || organisation.stripe_subscription_id || null,
    stripe_subscription_status: status || null,
    stripe_current_period_end: periodEnd,
    stripe_environment: environment,
    stripe_updated_at: now,
  }

  if (!organisation.billing_payment_exempt) {
    patch.billing_status = billingStatusFromSubscription(status)
    patch.billing_start_date = organisation.billing_start_date || now.slice(0, 10)
    patch.billing_next_date = dateOnly(periodEnd)
  }

  const { error } = await admin.from('organisations').update(patch).eq('id', organisation.id)
  if (error) throw new Error(error.message)
}

async function applyCheckoutSession(admin: any, stripe: Stripe, session: any, environment: string) {
  const organisationId = cleanText(session?.metadata?.recordsweb_organisation_id, 80)
  const subscriptionId = objectId(session?.subscription)
  const customerId = objectId(session?.customer)
  const organisation = await findOrganisation(admin, { organisationId, customerId, subscriptionId })
  if (!organisation) {
    console.warn('Stripe Checkout Session did not match a RecordsWeb organisation', session?.id)
    return
  }

  let subscription: any = null
  if (subscriptionId) {
    try { subscription = await stripe.subscriptions.retrieve(subscriptionId) } catch (error) { console.warn('Unable to retrieve Stripe subscription', error) }
  }

  const now = new Date().toISOString()
  const status = cleanText(subscription?.status || organisation.stripe_subscription_status || 'incomplete', 80)
  const periodEnd = unixIso(subscriptionPeriodEnd(subscription))
  const billingEmail = validEmail(session?.customer_details?.email || organisation.billing_email)

  const patch: Record<string, unknown> = {
    stripe_customer_id: customerId || organisation.stripe_customer_id || null,
    stripe_subscription_id: subscriptionId || organisation.stripe_subscription_id || null,
    stripe_subscription_status: status || null,
    stripe_checkout_session_id: session.id || null,
    stripe_current_period_end: periodEnd,
    stripe_environment: environment,
    stripe_updated_at: now,
  }

  if (billingEmail) patch.billing_email = billingEmail

  if (!organisation.billing_payment_exempt) {
    patch.billing_status = billingStatusFromSubscription(status)
    patch.billing_start_date = organisation.billing_start_date || now.slice(0, 10)
    patch.billing_next_date = dateOnly(periodEnd)
  }

  if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
    patch.stripe_last_invoice_status = 'paid'
    patch.stripe_last_payment_at = now
    if (session?.metadata?.recordsweb_includes_setup_fee === 'true' && !organisation.billing_setup_fee_paid_at) patch.billing_setup_fee_paid_at = now
    if (session?.metadata?.recordsweb_first_month_offer === 'true') {
      if (!organisation.billing_first_month_offer_redeemed_at) patch.billing_first_month_offer_redeemed_at = now
      // The introductory first-month price includes the normal setup fee.
      if (!organisation.billing_setup_fee_paid_at) patch.billing_setup_fee_paid_at = now
    }
    if (session?.metadata?.recordsweb_includes_announcement_board === 'true' && !organisation.announcement_board_paid_at) patch.announcement_board_paid_at = now
  }

  const { error } = await admin.from('organisations').update(patch).eq('id', organisation.id)
  if (error) throw new Error(error.message)
}

async function applyInvoice(admin: any, stripe: Stripe, invoice: any, environment: string, paid: boolean) {
  const customerId = objectId(invoice?.customer)
  const subscriptionId = objectId(invoice?.subscription) || objectId(invoice?.parent?.subscription_details?.subscription)
  const organisation = await findOrganisation(admin, { customerId, subscriptionId })
  if (!organisation) {
    console.warn('Stripe invoice did not match a RecordsWeb organisation', invoice?.id)
    return
  }

  // Refresh the subscription period first. Invoice state is applied afterwards so
  // a failed renewal remains visibly overdue even when Stripe temporarily keeps
  // the subscription itself in an active state during retry handling.
  if (subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      await applySubscription(admin, subscription, environment, organisation.id)
    } catch (error) {
      console.warn('Unable to refresh subscription after invoice event', error)
    }
  }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    stripe_customer_id: customerId || organisation.stripe_customer_id || null,
    stripe_subscription_id: subscriptionId || organisation.stripe_subscription_id || null,
    stripe_last_invoice_status: cleanText(invoice?.status || (paid ? 'paid' : 'open'), 80),
    stripe_environment: environment,
    stripe_updated_at: now,
  }

  if (paid) patch.stripe_last_payment_at = now
  if (!organisation.billing_payment_exempt) patch.billing_status = paid ? 'active' : 'overdue'

  const { error } = await admin.from('organisations').update(patch).eq('id', organisation.id)
  if (error) throw new Error(error.message)
}

const stripeSecretKey = requiredEnv('STRIPE_SECRET_KEY')
const stripe = new Stripe(stripeSecretKey)
const cryptoProvider = Stripe.createSubtleCryptoProvider()
const environment = stripeEnvironment(stripeSecretKey)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const signature = req.headers.get('stripe-signature') || ''
  const rawBody = await req.text()

  let event: any
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      requiredEnv('STRIPE_WEBHOOK_SECRET'),
      undefined,
      cryptoProvider,
    )
  } catch (error) {
    console.error('RecordsWeb Stripe webhook signature verification failed', error)
    return new Response('Invalid Stripe webhook signature', { status: 400 })
  }

  try {
    const admin = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const object: any = event.data.object

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await applyCheckoutSession(admin, stripe, object, environment)
        break
      case 'checkout.session.async_payment_failed': {
        const organisationId = cleanText(object?.metadata?.recordsweb_organisation_id, 80)
        const organisation = await getOrganisation(admin, organisationId)
        if (organisation && !organisation.billing_payment_exempt) {
          await admin.from('organisations').update({ billing_status: 'overdue', stripe_last_invoice_status: 'payment_failed', stripe_updated_at: new Date().toISOString() }).eq('id', organisation.id)
        }
        break
      }
      case 'invoice.paid':
        await applyInvoice(admin, stripe, object, environment, true)
        break
      case 'invoice.payment_failed':
        await applyInvoice(admin, stripe, object, environment, false)
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await applySubscription(admin, object, environment)
        break
      default:
        break
    }

    return Response.json({ received: true })
  } catch (error) {
    console.error('recordsweb-stripe-webhook processing error', event?.type, error)
    return new Response('Webhook processing failed', { status: 500 })
  }
})
