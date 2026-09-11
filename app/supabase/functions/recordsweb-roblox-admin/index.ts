import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Server configuration error: ${name} is unavailable.`)
  return value
}

function cleanText(value: unknown) {
  return String(value ?? '').trim()
}

function numericId(value: unknown, label: string, optional = true) {
  const clean = cleanText(value)
  if (!clean && optional) return ''
  if (!/^\d{1,20}$/.test(clean)) throw new Error(`${label} must contain numbers only.`)
  return clean
}

function placeIds(value: unknown) {
  if (!Array.isArray(value)) return []
  const unique = new Set<string>()
  for (const item of value) {
    const clean = numericId(item, 'Place ID')
    if (clean) unique.add(clean)
  }
  return [...unique].slice(0, 25)
}

function displayMode(value: unknown) {
  const clean = cleanText(value) || 'first_name_last_initial'
  if (!['first_name_last_initial', 'full_name', 'record_number'].includes(clean)) {
    throw new Error('Patient display mode is invalid.')
  }
  return clean
}

function displayDuration(value: unknown) {
  const n = Math.round(Number(value) || 12)
  if (n < 5 || n > 60) throw new Error('Display duration must be between 5 and 60 seconds.')
  return n
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function randomConnectionCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  return `rw_live_${token}`
}

async function callerContext(admin: any, token: string) {
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) throw new Error('UNAUTHORISED')

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id,organisation_id,username,display_name,role,is_management,active')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (profileError || !profile || !profile.active) throw new Error('PROFILE_UNAVAILABLE')
  if (!profile.is_management) throw new Error('MANAGEMENT_REQUIRED')

  const { data: organisation, error: organisationError } = await admin
    .from('organisations')
    .select('id,org_code,name,active')
    .eq('id', profile.organisation_id)
    .maybeSingle()
  if (organisationError || !organisation || !organisation.active) throw new Error('ORGANISATION_UNAVAILABLE')

  return { user: userData.user, profile, organisation }
}

function publicIntegration(row: any, organisation: any, identityCount = 0) {
  return {
    organisation_id: organisation.id,
    organisation_code: organisation.org_code,
    organisation_name: organisation.name,
    enabled: Boolean(row?.enabled),
    has_key: Boolean(row?.key_hash),
    key_last_four: row?.key_last_four || null,
    universe_id: row?.universe_id || '',
    place_ids: Array.isArray(row?.place_ids) ? row.place_ids : [],
    display_name_mode: row?.display_name_mode || 'first_name_last_initial',
    display_duration_seconds: Number(row?.display_duration_seconds) || 12,
    patient_identity_enabled: row?.patient_identity_enabled !== false,
    identity_count: Number(identityCount) || 0,
    identity_scope: 'community',
    last_heartbeat_at: row?.last_heartbeat_at || null,
    last_universe_id: row?.last_universe_id || null,
    last_place_id: row?.last_place_id || null,
    last_server_id: row?.last_server_id || null,
    updated_at: row?.updated_at || null,
  }
}

async function getIntegration(admin: any, organisationId: string) {
  const { data, error } = await admin
    .from('recordsweb_roblox_integrations')
    .select('*')
    .eq('organisation_id', organisationId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data || null
}

async function ensureIntegration(admin: any, organisationId: string) {
  let row = await getIntegration(admin, organisationId)
  if (row) return row
  const { data, error } = await admin
    .from('recordsweb_roblox_integrations')
    .insert({ organisation_id: organisationId })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function getIdentityCount(admin: any, organisationId: string) {
  const { count, error } = await admin
    .from('recordsweb_roblox_patient_identities')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', organisationId)
  if (error) {
    console.warn('Unable to count RecordsWeb Roblox patient identities', error)
    return 0
  }
  return Number(count) || 0
}

async function audit(admin: any, ctx: any, action: string, description: string, metadata: Record<string, unknown> = {}) {
  try {
    await admin.from('audit_log').insert({
      organisation_id: ctx.organisation.id,
      actor_id: ctx.profile.id,
      actor_name: ctx.profile.display_name,
      actor_role: ctx.profile.role,
      action,
      entity_type: 'roblox_integration',
      description,
      metadata,
    })
  } catch (error) {
    console.warn('RecordsWeb Roblox audit write failed', error)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const supabaseUrl = requiredEnv('SUPABASE_URL')
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token || token === authHeader) return json({ error: 'Unauthorised: missing bearer token.' }, 401)

    let ctx
    try { ctx = await callerContext(admin, token) }
    catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (code === 'UNAUTHORISED') return json({ error: 'Unauthorised session.' }, 401)
      if (code === 'MANAGEMENT_REQUIRED') return json({ error: 'Management permission is required.' }, 403)
      if (code === 'ORGANISATION_UNAVAILABLE') return json({ error: 'This RecordsWeb community is disabled or unavailable.' }, 403)
      return json({ error: 'Your RecordsWeb staff profile is unavailable.' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const action = cleanText(body?.action)
    let row = await ensureIntegration(admin, ctx.organisation.id)

    if (action === 'status') {
      const identityCount = await getIdentityCount(admin, ctx.organisation.id)
      return json({ ok: true, integration: publicIntegration(row, ctx.organisation, identityCount) })
    }

    if (action === 'save') {
      const nextEnabled = Boolean(body?.enabled)
      if (nextEnabled && !row.key_hash) return json({ error: 'Generate a connection code before enabling the Roblox integration.' }, 400)
      const universeId = numericId(body?.universe_id, 'Universe ID')
      const allowedPlaceIds = placeIds(body?.place_ids)
      const mode = displayMode(body?.display_name_mode)
      const duration = displayDuration(body?.display_duration_seconds)
      const patientIdentityEnabled = body?.patient_identity_enabled !== false
      const { data, error } = await admin
        .from('recordsweb_roblox_integrations')
        .update({
          enabled: nextEnabled,
          universe_id: universeId || null,
          place_ids: allowedPlaceIds,
          display_name_mode: mode,
          display_duration_seconds: duration,
          patient_identity_enabled: patientIdentityEnabled,
          updated_at: new Date().toISOString(),
        })
        .eq('organisation_id', ctx.organisation.id)
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 400)
      row = data
      await audit(admin, ctx, 'roblox.integration.updated', `Updated Roblox integration settings for @${ctx.organisation.org_code}.`, {
        enabled: nextEnabled, universe_id: universeId || null, place_ids: allowedPlaceIds, display_name_mode: mode, display_duration_seconds: duration,
        patient_identity_enabled: patientIdentityEnabled,
      })
      const identityCount = await getIdentityCount(admin, ctx.organisation.id)
      return json({ ok: true, integration: publicIntegration(row, ctx.organisation, identityCount) })
    }

    if (action === 'generate-key') {
      const connectionCode = randomConnectionCode()
      const hash = await sha256(connectionCode)
      const { data, error } = await admin
        .from('recordsweb_roblox_integrations')
        .update({
          key_hash: hash,
          key_last_four: connectionCode.slice(-4),
          key_created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('organisation_id', ctx.organisation.id)
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 400)
      row = data
      await audit(admin, ctx, 'roblox.connection_code.generated', `Generated a new Roblox connection code for @${ctx.organisation.org_code}.`)
      const identityCount = await getIdentityCount(admin, ctx.organisation.id)
      return json({ ok: true, connection_code: connectionCode, integration: publicIntegration(row, ctx.organisation, identityCount) })
    }

    if (action === 'revoke-key') {
      const { data, error } = await admin
        .from('recordsweb_roblox_integrations')
        .update({
          enabled: false,
          key_hash: null,
          key_last_four: null,
          key_created_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('organisation_id', ctx.organisation.id)
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 400)
      row = data
      await audit(admin, ctx, 'roblox.connection_code.revoked', `Revoked the Roblox connection code for @${ctx.organisation.org_code}.`)
      const identityCount = await getIdentityCount(admin, ctx.organisation.id)
      return json({ ok: true, integration: publicIntegration(row, ctx.organisation, identityCount) })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (error) {
    console.error('recordsweb-roblox-admin error', error)
    return json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, 500)
  }
})
