import { supabase, supabaseConfigured } from './supabase'

export const DEFAULT_RECORDSWEB_BILLING = Object.freeze({
  billing_plan: 'standard',
  billing_status: 'active',
  billing_monthly_price: 9.50,
  billing_first_month_price: 5.00,
  billing_first_month_offer: false,
  billing_setup_fee: 7.00,
  billing_start_date: null,
  billing_next_date: null,
  announcement_board_enabled: false,
  announcement_board_fee: 10.00,
  billing_notes: '',
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
  }
}

export async function getOrganisationBilling(organisationId) {
  if (!organisationId) throw new Error('Organisation billing cannot be loaded because the organisation id is missing.')
  if (!supabaseConfigured || !supabase) return normaliseBilling({ id: organisationId })

  const { data, error } = await supabase
    .from('organisations')
    .select('id,org_code,name,billing_plan,billing_status,billing_monthly_price,billing_first_month_price,billing_first_month_offer,billing_setup_fee,billing_start_date,billing_next_date,announcement_board_enabled,announcement_board_fee,billing_notes')
    .eq('id', organisationId)
    .single()

  if (error) {
    if (/billing_plan|billing_status|billing_monthly_price|schema cache|column/i.test(error.message || '')) {
      throw new Error('Billing is not configured in Supabase yet. Run the RecordsWeb 3.2.5 pricing and billing migration.')
    }
    throw error
  }

  return normaliseBilling(data)
}
