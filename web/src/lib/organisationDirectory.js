import { normaliseOrganisationCode } from './installation'
import { supabase, supabaseConfigured } from './supabase'

/**
 * Publicly verifies that an organisation extension is registered and active.
 * This deliberately uses only the limited pre-login organisation RPC.
 */
export async function verifyOrganisationCode(value) {
  const code = normaliseOrganisationCode(value)
  if (!code) {
    throw new Error('Enter the four-letter organisation extension in the format @XX.XX.')
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
    throw new Error(error.message || 'RecordsWeb could not verify this organisation extension.')
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.id) throw new Error(`The organisation extension @${code} is not registered in RecordsWeb.`)
  if (row.active === false) throw new Error(`The organisation extension @${code} is currently disabled.`)

  return {
    ok: true,
    code: normaliseOrganisationCode(row.org_code) || code,
    organisation: row,
  }
}
