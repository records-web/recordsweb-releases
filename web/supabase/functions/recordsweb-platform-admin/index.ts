import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OPERATOR_EMAIL_PATTERN = /^gus\.farnsworth@[a-z]{2}\.[a-z]{2}$/i
const COMMON_PASSWORDS = new Set([
  'password123','password1','qwerty123','letmein123','welcome123',
  'recordsweb1','groveway123','changeme123','admin12345','1234567890',
])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Server configuration error: ${name} is unavailable.`)
  return value
}

function normaliseOrganisationCode(value: unknown) {
  const clean = String(value || '').trim().replace(/^@+/, '').replace(/\s+/g, '').toUpperCase()
  return /^[A-Z]{2}\.[A-Z]{2}$/.test(clean) ? clean : ''
}

function validatePassword(password: string, username = '') {
  if (password.length < 10) return 'Password must contain at least 10 characters.'
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Password must contain at least one letter and one number.'
  if (/^\s|\s$/.test(password)) return 'Password cannot start or end with a space.'
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'Choose a less common password.'
  const local = String(username || '').split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase()
  if (local.length >= 5 && password.replace(/[^a-z0-9]/gi, '').toLowerCase().includes(local)) return 'Password must not contain the RecordsWeb username.'
  return ''
}

async function cleanupCreatedCommunity(admin: any, userId: string | null, organisationId: string | null) {
  if (userId) {
    try { await admin.auth.admin.deleteUser(userId) } catch {}
  }
  if (organisationId) {
    try { await admin.from('organisations').delete().eq('id', organisationId) } catch {}
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

    const { data: callerData, error: callerError } = await admin.auth.getUser(token)
    if (callerError || !callerData.user) return json({ error: 'Unauthorised session.' }, 401)

    const { data: callerProfile, error: profileError } = await admin
      .from('profiles')
      .select('id,organisation_id,active,display_name,role,username,organisations!inner(org_code,active)')
      .eq('id', callerData.user.id)
      .single()
    if (profileError || !callerProfile) return json({ error: 'Unable to verify the RecordsWeb platform operator profile.' }, 403)

    const callerEmail = String(callerData.user.email || '').trim().toLowerCase()
    const callerOrganisation = (callerProfile as any).organisations
    const callerCode = normaliseOrganisationCode(callerOrganisation?.org_code)
    const emailCode = callerEmail.split('@')[1]?.toUpperCase() || ''
    if (!callerProfile.active || !callerOrganisation?.active || !OPERATOR_EMAIL_PATTERN.test(callerEmail) || callerCode !== emailCode) {
      return json({ error: 'RecordsWeb platform operator permission is required.' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    if (body.action !== 'create-community') return json({ error: 'Unknown platform administration action.' }, 400)

    const organisationCode = normaliseOrganisationCode(body.organisation_code)
    const communityName = String(body.community_name || '').trim()
    const systemMode = String(body.system_mode || 'general_practice').trim().toLowerCase()
    const defaultLocation = String(body.default_location || 'Main Site').trim()
    const password = String(body.password || '')

    if (!organisationCode) return json({ error: 'Organisation extension must use four letters in the format @XX.XX.' }, 400)
    if (!communityName) return json({ error: 'Community name is required.' }, 400)
    if (communityName.length > 120) return json({ error: 'Community name must be 120 characters or fewer.' }, 400)
    if (!['general_practice', 'hospital'].includes(systemMode)) return json({ error: 'RecordsWeb mode must be General Practitioner or Hospital.' }, 400)
    if (!defaultLocation) return json({ error: 'Default location is required.' }, 400)
    if (defaultLocation.length > 120) return json({ error: 'Default location must be 120 characters or fewer.' }, 400)

    const operatorEmail = `gus.farnsworth@${organisationCode.toLowerCase()}`
    const operatorUsername = `gus.farnsworth@${organisationCode}`
    const passwordError = validatePassword(password, operatorEmail)
    if (passwordError) return json({ error: passwordError }, 400)

    const { data: existingOrganisation, error: existingOrganisationError } = await admin
      .from('organisations')
      .select('id,org_code,name')
      .eq('org_code', organisationCode)
      .maybeSingle()
    if (existingOrganisationError) return json({ error: existingOrganisationError.message }, 500)
    if (existingOrganisation) return json({ error: `The organisation extension @${organisationCode} is already registered to ${existingOrganisation.name}.` }, 409)

    let createdUserId: string | null = null
    let createdOrganisationId: string | null = null

    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email: operatorEmail,
      password,
      email_confirm: true,
      user_metadata: { recordsweb: true, display_name: 'Mr Gus Farnsworth' },
    })
    if (createUserError || !createdUser.user) {
      const duplicate = /already|registered|exists/i.test(createUserError?.message || '')
      return json({ error: duplicate ? `The reserved account ${operatorEmail} already exists in Supabase Authentication.` : (createUserError?.message || 'Unable to create the reserved operator account.') }, 400)
    }
    createdUserId = createdUser.user.id

    const { data: organisation, error: organisationError } = await admin
      .from('organisations')
      .insert({
        org_code: organisationCode,
        name: communityName,
        system_mode: systemMode,
        default_location: defaultLocation,
        active: true,
        primary_color: '#0f6fbd',
        navigation_color: '#cfe7f8',
        patient_banner_color: '#753b0d',
        logo_data_url: null,
        logo_path: null,
        logo_file_name: null,
        logo_updated_at: null,
      })
      .select('*')
      .single()
    if (organisationError || !organisation) {
      await cleanupCreatedCommunity(admin, createdUserId, null)
      return json({ error: organisationError?.message || 'Unable to create the RecordsWeb organisation.' }, 400)
    }
    createdOrganisationId = organisation.id

    const { error: maintenanceError } = await admin
      .from('system_maintenance')
      .insert({ organisation_code: organisationCode, organisation_id: organisation.id })
    if (maintenanceError && !/does not exist|schema cache/i.test(maintenanceError.message || '')) {
      await cleanupCreatedCommunity(admin, createdUserId, createdOrganisationId)
      return json({ error: `Community creation was rolled back because the organisation state could not be initialised: ${maintenanceError.message}` }, 500)
    }

    const role = systemMode === 'hospital' ? 'Practice Manager' : 'GP Partner'
    const now = new Date().toISOString()
    const { data: profile, error: profileInsertError } = await admin
      .from('profiles')
      .insert({
        id: createdUserId,
        organisation_id: organisation.id,
        username: operatorUsername,
        title: 'Mr',
        first_name: 'Gus',
        last_name: 'Farnsworth',
        display_name: 'Mr Gus Farnsworth',
        role,
        roles: [role],
        is_management: true,
        active: true,
        must_change_password: false,
        password_changed_at: now,
      })
      .select('id,username,display_name,role,is_management,active')
      .single()
    if (profileInsertError || !profile) {
      await cleanupCreatedCommunity(admin, createdUserId, createdOrganisationId)
      return json({ error: `Community creation was rolled back because the reserved operator profile could not be created: ${profileInsertError?.message || 'Unknown profile error.'}` }, 500)
    }

    const { error: historyError } = await admin.rpc('recordsweb_service_record_password', {
      p_user_id: createdUserId,
      p_password: password,
    })
    if (historyError) {
      await cleanupCreatedCommunity(admin, createdUserId, createdOrganisationId)
      return json({ error: 'Community creation was rolled back because password history could not be initialised. Ensure the RecordsWeb 2.7.0 migration is installed.' }, 500)
    }

    await admin.from('audit_log').insert({
      organisation_id: callerProfile.organisation_id,
      actor_id: callerProfile.id,
      actor_name: callerProfile.display_name,
      actor_role: callerProfile.role,
      action: 'platform.community.created',
      entity_type: 'organisation',
      entity_id: organisation.id,
      description: `Created RecordsWeb community ${communityName} (@${organisationCode}) and reserved operator ${operatorUsername}.`,
      metadata: { organisation_code: organisationCode, community_name: communityName, system_mode: systemMode, operator_username: operatorUsername },
    })

    return json({
      ok: true,
      community: {
        id: organisation.id,
        org_code: organisation.org_code,
        name: organisation.name,
        system_mode: organisation.system_mode,
        default_location: organisation.default_location,
        active: organisation.active,
      },
      operator_email: operatorUsername,
      operator_profile: profile,
    })
  } catch (error) {
    console.error('recordsweb-platform-admin error', error)
    return json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, 500)
  }
})
