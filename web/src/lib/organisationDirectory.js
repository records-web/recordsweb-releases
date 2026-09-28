import { normaliseOrganisationCode } from './installation'
import { supabase, supabaseConfigured } from './supabase'

/**
 * Publicly verifies that an organisation code is registered and active.
 * This deliberately uses only the limited pre-login organisation RPC.
 */
export async function verifyOrganisationCode(value) {
  const code = normaliseOrganisationCode(value)
  if (!code) {
    throw new Error('Enter the organisation code in the format @XX.XX, using letters or numbers (for example @GW.HS or @UH.S1).')
  }

  if (!supabaseConfigured || !supabase) {
    return { ok: true, code, organisation: null }
  }

  const { data, error } = await supabase.rpc('recordsweb_public_organisation_config', {
    p_organisation_code: code,
  })

  if (error) {
    if (/recordsweb_public_organisation_config|does not exist|schema cache/i.test(error.message || '')) {
      throw new Error('Multi-organisation support is not installed in Supabase. Run supabase/recordsweb-3.2.0-multi-organisation.sql, then restart RecordsWeb.')
    }
    throw new Error(error.message || 'RecordsWeb could not verify this organisation code.')
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.id) throw new Error(`The organisation code @${code} is not registered in RecordsWeb.`)
  if (row.active === false) throw new Error(`The organisation code @${code} is currently disabled.`)

  return {
    ok: true,
    code: normaliseOrganisationCode(row.org_code) || code,
    organisation: row,
  }
}
