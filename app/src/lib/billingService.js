import { supabase, supabaseConfigured } from './supabase'

export const DEFAULT_RECORDSWEB_BILLING = Object.freeze({
  billing_plan: 'standard',
  billing_status: 'setup',
  billing_monthly_price: 9.50,
  billing_first_month_price: 5.00,
  billing_first_month_offer: false,
  billing_setup_fee: 7.00,
  billing_start_date: null,
  billing_next_date: null,
  announcement_board_enabled: false,
  announcement_board_fee: 10.00,
  billing_notes: '',
  billing_payment_exempt: false,
  billing_exemption_reason: '',
  billing_email: '',
  billing_setup_fee_paid_at: null,
  billing_first_month_offer_redeemed_at: null,
  announcement_board_paid_at: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  stripe_subscription_status: null,
  stripe_last_invoice_status: null,
  stripe_checkout_session_id: null,
  stripe_current_period_end: null,
  stripe_last_payment_at: null,
  stripe_environment: null,
  stripe_updated_at: null,
  billing_grace_started_at: null,
  billing_grace_ends_at: null,
  billing_read_only_since: null,
})

export function normaliseBilling(row = {}) {
  return {
    ...DEFAULT_RECORDSWEB_BILLING,
    ...row,
    billing_monthly_price: Number(row?.billing_monthly_price ?? DEFAULT_RECORDSWEB_BILLING.billing_monthly_price),
    billing_first_month_price: Number(row?.billing_first_month_price ?? DEFAULT_RECORDSWEB_BILLING.billing_first_month_price),
    billing_first_month_offer: Boolean(row?.billing_first_month_offer),
    billing_setup_fee: Number(row?.billing_setup_fee ?? DEFAULT_RECORDSWEB_BILLING.billing_setup_fee),
    announcement_board_enabled: Boolean(row?.announcement_board_enabled),
    announcement_board_fee: Number(row?.announcement_board_fee ?? DEFAULT_RECORDSWEB_BILLING.announcement_board_fee),
    billing_notes: String(row?.billing_notes || ''),
    billing_payment_exempt: Boolean(row?.billing_payment_exempt),
    billing_exemption_reason: String(row?.billing_exemption_reason || ''),
    billing_email: String(row?.billing_email || ''),
  }
}

export async function getOrganisationBilling(organisationId) {
  if (!organisationId) throw new Error('Organisation billing cannot be loaded because the organisation id is missing.')
  if (!supabaseConfigured || !supabase) return normaliseBilling({ id: organisationId })

  // Refresh an expired 7-day payment grace period into stored suspended/read-only state.
  // Older deployments without the 3.2.7 migration simply ignore this helper call.
  try {
    await supabase.rpc('recordsweb_refresh_billing_access_state')
  } catch {}

  const { data, error } = await supabase
    .from('organisations')
    .select('id,org_code,name,billing_plan,billing_status,billing_monthly_price,billing_first_month_price,billing_first_month_offer,billing_setup_fee,billing_start_date,billing_next_date,announcement_board_enabled,announcement_board_fee,billing_notes,billing_payment_exempt,billing_exemption_reason,billing_email,billing_setup_fee_paid_at,billing_first_month_offer_redeemed_at,announcement_board_paid_at,stripe_customer_id,stripe_subscription_id,stripe_subscription_status,stripe_last_invoice_status,stripe_checkout_session_id,stripe_current_period_end,stripe_last_payment_at,stripe_environment,stripe_updated_at,billing_grace_started_at,billing_grace_ends_at,billing_read_only_since')
    .eq('id', organisationId)
    .single()

  if (error) {
    if (/billing_grace_ends_at|billing_payment_exempt|stripe_customer_id|billing_plan|billing_status|billing_monthly_price|schema cache|column/i.test(error.message || '')) {
      throw new Error('Stripe billing is not configured in Supabase yet. Run the RecordsWeb 3.2.7 billing grace/read-only migration (after the 3.2.6 Stripe migration).')
    }
    throw error
  }

  return normaliseBilling(data)
}

async function invokeStripeBilling(body) {
  if (!supabaseConfigured || !supabase) throw new Error('Supabase is not configured for RecordsWeb billing.')
  const { data, error } = await supabase.functions.invoke('recordsweb-stripe-billing', { body })
  if (error) {
    let message = error.message || 'RecordsWeb Stripe billing service failed.'
    try {
      const response = error.context
      if (response && typeof response.clone === 'function') {
        const payload = await response.clone().json()
        if (payload?.error) message = payload.error
        else if (payload?.message) message = payload.message
      }
    } catch {}
    if (/non-2xx/i.test(message)) message = 'RecordsWeb Stripe billing returned an error. Check that the recordsweb-stripe-billing Edge Function is deployed and its Stripe secrets are configured.'
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export function createStripeCheckoutSession() {
  return invokeStripeBilling({ action: 'create-checkout-session' })
}

export function createStripeHostedCheckout() {
  return invokeStripeBilling({ action: 'create-hosted-checkout' })
}

export function createStripePortalSession() {
  return invokeStripeBilling({ action: 'create-portal-session' })
}

export function getStripeCheckoutStatus(sessionId) {
  return invokeStripeBilling({ action: 'get-session-status', session_id: String(sessionId || '').trim() })
}
