import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@^22'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Server configuration error: ${name} is unavailable.`)
  return value
}

function cleanText(value: unknown, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

function relationOne(value: any) {
  return Array.isArray(value) ? (value[0] || null) : (value || null)
}

function objectId(value: any) {
  if (!value) return ''
  return typeof value === 'string' ? value : String(value.id || '')
}

function toPence(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 9999) throw new Error('RecordsWeb billing contains an invalid price.')
  return Math.round(number * 100)
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

function publicUrl() {
  return cleanText(Deno.env.get('RECORDSWEB_PUBLIC_URL') || 'https://recordsweb.org', 300).replace(/\/+$/, '')
}

function validEmail(value: unknown) {
  const email = cleanText(value, 254)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

async function findOrganisationForCaller(admin: any, token: string) {
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) throw new Error('Unauthorised session.')

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select(`
      id, organisation_id, is_management, active, display_name, role,
      organisations!inner(
        id, org_code, name, active,
        billing_plan, billing_status, billing_monthly_price,
        billing_first_month_price, billing_first_month_offer, billing_setup_fee,
        billing_start_date, billing_next_date,
        announcement_board_enabled, announcement_board_fee,
        billing_payment_exempt, billing_exemption_reason, billing_email,
        billing_setup_fee_paid_at, billing_first_month_offer_redeemed_at,
        announcement_board_paid_at, stripe_customer_id, stripe_subscription_id,
        stripe_subscription_status, stripe_checkout_session_id, stripe_environment
      )
    `)
    .eq('id', userData.user.id)
    .single()

  if (profileError || !profile) throw new Error('Unable to verify the RecordsWeb billing account.')
  if (!profile.active || !profile.is_management) throw new Error('Organisation management permission is required to manage billing.')

  const organisation = relationOne((profile as any).organisations)
  if (!organisation?.active) throw new Error('This RecordsWeb organisation is disabled.')
  return { user: userData.user, profile, organisation }
}

async function getOrganisation(admin: any, organisationId: string) {
  const { data, error } = await admin
    .from('organisations')
    .select(`
      id, org_code, name, active,
      billing_plan, billing_status, billing_monthly_price,
      billing_first_month_price, billing_first_month_offer, billing_setup_fee,
      billing_start_date, billing_next_date,
      announcement_board_enabled, announcement_board_fee,
      billing_payment_exempt, billing_exemption_reason, billing_email,
      billing_setup_fee_paid_at, billing_first_month_offer_redeemed_at,
      announcement_board_paid_at, stripe_customer_id, stripe_subscription_id,
      stripe_subscription_status, stripe_checkout_session_id, stripe_environment
    `)
    .eq('id', organisationId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('RecordsWeb organisation was not found.')
  return data
}

async function syncCheckoutSession(admin: any, stripe: Stripe, session: any, environment: string) {
  const organisationId = cleanText(session?.metadata?.recordsweb_organisation_id, 80)
  if (!organisationId) return null

  const organisation = await getOrganisation(admin, organisationId)
  if (organisation.billing_payment_exempt) return organisation

  const subscriptionId = objectId(session.subscription)
  const customerId = objectId(session.customer)
  let subscription: any = null
  if (subscriptionId) {
    try { subscription = await stripe.subscriptions.retrieve(subscriptionId) } catch (error) { console.warn('Unable to retrieve Stripe subscription during checkout sync', error) }
  }

  const now = new Date().toISOString()
  const periodEnd = unixIso(subscriptionPeriodEnd(subscription))
  const subscriptionStatus = cleanText(subscription?.status || organisation.stripe_subscription_status || 'incomplete', 80)
  const billingEmail = validEmail(session?.customer_details?.email || organisation.billing_email)

  const patch: Record<string, unknown> = {
    stripe_customer_id: customerId || organisation.stripe_customer_id || null,
    stripe_subscription_id: subscriptionId || organisation.stripe_subscription_id || null,
    stripe_subscription_status: subscriptionStatus || null,
    stripe_checkout_session_id: session.id || organisation.stripe_checkout_session_id || null,
    stripe_current_period_end: periodEnd,
    stripe_environment: environment,
    stripe_updated_at: now,
    billing_status: billingStatusFromSubscription(subscriptionStatus),
    billing_start_date: organisation.billing_start_date || now.slice(0, 10),
    billing_next_date: dateOnly(periodEnd),
  }

  if (billingEmail) patch.billing_email = billingEmail
  if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
    patch.stripe_last_payment_at = now
    patch.stripe_last_invoice_status = 'paid'
  }
  if (session?.metadata?.recordsweb_includes_setup_fee === 'true' && !organisation.billing_setup_fee_paid_at) {
    patch.billing_setup_fee_paid_at = now
  }
  if (session?.metadata?.recordsweb_first_month_offer === 'true') {
    if (!organisation.billing_first_month_offer_redeemed_at) patch.billing_first_month_offer_redeemed_at = now
    // The introductory £5 offer explicitly includes the normal setup fee.
    if (!organisation.billing_setup_fee_paid_at) patch.billing_setup_fee_paid_at = now
  }
  if (session?.metadata?.recordsweb_includes_announcement_board === 'true' && !organisation.announcement_board_paid_at) {
    patch.announcement_board_paid_at = now
  }

  const { data: updated, error } = await admin
    .from('organisations')
    .update(patch)
    .eq('id', organisationId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return updated
}

async function createCheckoutSession(admin: any, stripe: Stripe, organisation: any, environment: string, uiMode: 'custom' | 'hosted') {
  if (organisation.billing_payment_exempt) {
    throw new Error('This community is excluded from payment by RecordsWeb Platform Management. No subscription payment is required.')
  }

  const subscriptionStatus = cleanText(organisation.stripe_subscription_status, 80)
  if (organisation.stripe_subscription_id && ['active', 'trialing', 'past_due', 'unpaid'].includes(subscriptionStatus)) {
    throw new Error('A Stripe subscription already exists for this community. Use Manage billing instead of starting another subscription.')
  }

  // Reuse an existing open Checkout Session where possible to reduce accidental duplicates.
  if (organisation.stripe_checkout_session_id) {
    try {
      const existing: any = await stripe.checkout.sessions.retrieve(organisation.stripe_checkout_session_id)
      if (existing?.status === 'open' && existing?.ui_mode === uiMode) {
        if (uiMode === 'custom' && existing.client_secret) {
          return { session: existing, summary: null }
        }
        if (uiMode === 'hosted' && existing.url) {
          return { session: existing, summary: null }
        }
      }
      if (existing?.status === 'open') await stripe.checkout.sessions.expire(existing.id)
    } catch (error) {
      console.warn('Previous Stripe Checkout Session could not be reused', error)
    }
  }

  const monthlyPence = toPence(organisation.billing_monthly_price)
  if (monthlyPence < 50) throw new Error('The monthly RecordsWeb subscription price must be at least £0.50 for Stripe billing.')

  const setupPence = toPence(organisation.billing_setup_fee)
  const firstMonthPence = toPence(organisation.billing_first_month_price)
  const boardPence = toPence(organisation.announcement_board_fee)

  const firstMonthOffer = Boolean(organisation.billing_first_month_offer) && !organisation.billing_first_month_offer_redeemed_at
  if (firstMonthOffer && firstMonthPence > monthlyPence) {
    throw new Error('The configured first-month offer cannot be greater than the normal monthly subscription price.')
  }

  const includeSetupFee = !firstMonthOffer && setupPence > 0 && !organisation.billing_setup_fee_paid_at
  const includeBoard = Boolean(organisation.announcement_board_enabled) && boardPence > 0 && !organisation.announcement_board_paid_at

  const lineItems: any[] = [
    {
      price_data: {
        currency: 'gbp',
        unit_amount: monthlyPence,
        recurring: { interval: 'month' },
        product_data: {
          name: 'RecordsWeb Standard',
          description: `Monthly RecordsWeb subscription for ${organisation.name}`,
        },
      },
      quantity: 1,
    },
  ]

  if (includeSetupFee) {
    lineItems.push({
      price_data: {
        currency: 'gbp',
        unit_amount: setupPence,
        product_data: { name: 'RecordsWeb setup fee', description: 'One-off RecordsWeb organisation setup fee' },
      },
      quantity: 1,
    })
  }

  if (includeBoard) {
    lineItems.push({
      price_data: {
        currency: 'gbp',
        unit_amount: boardPence,
        product_data: { name: 'RecordsWeb in-game announcement board', description: 'One-off integration charge' },
      },
      quantity: 1,
    })
  }

  const metadata: Record<string, string> = {
    recordsweb_organisation_id: String(organisation.id),
    recordsweb_org_code: String(organisation.org_code || ''),
    recordsweb_first_month_offer: String(firstMonthOffer),
    recordsweb_includes_setup_fee: String(includeSetupFee),
    recordsweb_includes_announcement_board: String(includeBoard),
  }

  const params: any = {
    mode: 'subscription',
    line_items: lineItems,
    billing_address_collection: 'auto',
    metadata,
    subscription_data: { metadata },
  }

  if (organisation.stripe_customer_id) {
    params.customer = organisation.stripe_customer_id
  } else if (uiMode === 'hosted' && validEmail(organisation.billing_email)) {
    // Hosted Checkout can safely prefill the address. For custom Checkout we
    // leave it unset and validate/update it through Checkout actions instead.
    params.customer_email = validEmail(organisation.billing_email)
  }

  if (firstMonthOffer && firstMonthPence < monthlyPence) {
    const coupon = await stripe.coupons.create({
      amount_off: monthlyPence - firstMonthPence,
      currency: 'gbp',
      duration: 'once',
      name: `RecordsWeb first-month offer @${organisation.org_code}`,
      metadata: { recordsweb_organisation_id: String(organisation.id) },
    })
    params.discounts = [{ coupon: coupon.id }]
  }

  const base = publicUrl()
  if (uiMode === 'custom') {
    params.ui_mode = 'custom'
    params.return_url = `${base}/billing/checkout/return?session_id={CHECKOUT_SESSION_ID}`
  } else {
    params.success_url = `${base}/billing/complete?status=success&session_id={CHECKOUT_SESSION_ID}`
    params.cancel_url = `${base}/billing/complete?status=cancelled`
    params.submit_type = 'subscribe'
  }

  const session: any = await stripe.checkout.sessions.create(params)
  const now = new Date().toISOString()
  const { error: updateError } = await admin
    .from('organisations')
    .update({
      stripe_checkout_session_id: session.id,
      stripe_environment: environment,
      stripe_updated_at: now,
    })
    .eq('id', organisation.id)
  if (updateError) throw new Error(updateError.message)

  const dueToday = (firstMonthOffer ? firstMonthPence : monthlyPence) + (includeSetupFee ? setupPence : 0) + (includeBoard ? boardPence : 0)
  return {
    session,
    summary: {
      organisationName: organisation.name,
      organisationCode: organisation.org_code,
      monthlyAmount: monthlyPence,
      firstMonthOffer,
      firstMonthAmount: firstMonthOffer ? firstMonthPence : monthlyPence,
      setupFeeIncluded: firstMonthOffer,
      setupFeeAmount: includeSetupFee ? setupPence : 0,
      announcementBoardAmount: includeBoard ? boardPence : 0,
      dueToday,
      currency: 'gbp',
    },
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const supabaseUrl = requiredEnv('SUPABASE_URL')
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const stripeSecretKey = requiredEnv('STRIPE_SECRET_KEY')
    const stripePublishableKey = requiredEnv('STRIPE_PUBLISHABLE_KEY')
    const environment = stripeEnvironment(stripeSecretKey)
    const stripe = new Stripe(stripeSecretKey)
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token || token === authHeader) return json({ error: 'Unauthorised: missing bearer token.' }, 401)

    const { organisation } = await findOrganisationForCaller(admin, token)
    const body = await req.json().catch(() => ({}))
    const action = cleanText(body.action, 80)

    if (action === 'create-checkout-session' || action === 'create-hosted-checkout') {
      const uiMode = action === 'create-hosted-checkout' ? 'hosted' : 'custom'
      const result = await createCheckoutSession(admin, stripe, organisation, environment, uiMode)
      return json({
        ok: true,
        environment,
        publishableKey: stripePublishableKey,
        clientSecret: uiMode === 'custom' ? result.session.client_secret : null,
        url: uiMode === 'hosted' ? result.session.url : null,
        sessionId: result.session.id,
        summary: result.summary,
        emailUpdateRequired: uiMode === 'custom' && !organisation.stripe_customer_id,
      })
    }

    if (action === 'create-portal-session') {
      if (organisation.billing_payment_exempt) return json({ error: 'This community is payment-exempt and does not require Stripe billing.' }, 400)
      if (!organisation.stripe_customer_id) return json({ error: 'No Stripe customer exists for this community yet. Set up the subscription first.' }, 400)
      const portal = await stripe.billingPortal.sessions.create({
        customer: organisation.stripe_customer_id,
        return_url: `${publicUrl()}/management`,
      })
      return json({ ok: true, url: portal.url })
    }

    if (action === 'get-session-status') {
      const sessionId = cleanText(body.session_id, 200)
      if (!sessionId.startsWith('cs_')) return json({ error: 'A valid Stripe Checkout Session id is required.' }, 400)
      const session: any = await stripe.checkout.sessions.retrieve(sessionId)
      if (cleanText(session?.metadata?.recordsweb_organisation_id, 80) !== String(organisation.id)) {
        return json({ error: 'This Checkout Session does not belong to your RecordsWeb community.' }, 403)
      }
      if (session.status === 'complete') await syncCheckoutSession(admin, stripe, session, environment)
      return json({
        ok: true,
        status: session.status,
        paymentStatus: session.payment_status,
        customerEmail: session?.customer_details?.email || null,
      })
    }

    return json({ error: 'Unknown Stripe billing action.' }, 400)
  } catch (error) {
    console.error('recordsweb-stripe-billing error', error)
    return json({ error: error instanceof Error ? error.message : 'Unexpected Stripe billing error.' }, 500)
  }
})
