import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-recordsweb-key',
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

function cleanText(value: unknown, max = 160) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max)
}

function numericId(value: unknown, label: string) {
  const clean = cleanText(value, 24)
  if (!/^\d{1,20}$/.test(clean)) throw new Error(`${label} must contain numbers only.`)
  return clean
}

function roleplayName(value: unknown, label: string) {
  const clean = cleanText(value, 80).replace(/\s+/g, ' ')
  if (clean.length < 1) throw new Error(`${label} is required.`)
  return clean
}

function roleplayDate(value: unknown) {
  const clean = cleanText(value, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) throw new Error('Roleplay date of birth must use YYYY-MM-DD.')
  const date = new Date(`${clean}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== clean) throw new Error('Roleplay date of birth is invalid.')
  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  if (clean > todayIso) throw new Error('Roleplay date of birth cannot be in the future.')
  if (clean < '1900-01-01') throw new Error('Roleplay date of birth must be 1900-01-01 or later.')
  return clean
}

function roleplaySex(value: unknown) {
  const clean = cleanText(value, 40)
  return clean || null
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function formatNhsNumber(digits: string) {
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
}

function generateNhsNumberCandidate() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const bytes = crypto.getRandomValues(new Uint8Array(9))
    const firstNine = Array.from(bytes, (byte) => byte % 10)
    const weighted = firstNine.reduce((sum, digit, index) => sum + digit * (10 - index), 0)
    let checkDigit = 11 - (weighted % 11)
    if (checkDigit === 11) checkDigit = 0
    if (checkDigit === 10) continue
    return formatNhsNumber(`${firstNine.join('')}${checkDigit}`)
  }
  throw new Error('Unable to generate a RecordsWeb patient identifier.')
}

function billingWriteAllowed(organisation: any) {
  if (Boolean(organisation?.billing_payment_exempt)) return true
  const status = cleanText(organisation?.billing_status, 40).toLowerCase()
  if (status === 'complimentary') return true
  if (status === 'suspended') return false
  if (status === 'overdue' && organisation?.billing_grace_ends_at) {
    const graceEnd = new Date(organisation.billing_grace_ends_at).getTime()
    if (Number.isFinite(graceEnd) && Date.now() >= graceEnd) return false
  }
  return true
}

function patientPayload(patient: any) {
  if (!patient) return null
  return {
    id: patient.id,
    title: patient.title || '',
    firstName: patient.first_name,
    lastName: patient.last_name,
    fullName: [patient.title, patient.first_name, patient.last_name].filter(Boolean).join(' '),
    dob: patient.dob,
    sex: patient.sex || '',
    gender: patient.gender || '',
    recordNumber: patient.emis_number || '',
    nhsNumber: patient.nhs_number || '',
    status: patient.status || 'Active',
  }
}

function identityPayload(identity: any, patient: any) {
  if (!identity || !patient) return null
  return {
    id: identity.id,
    scope: 'community',
    robloxUserId: identity.roblox_user_id,
    robloxUsername: identity.roblox_username || '',
    robloxDisplayName: identity.roblox_display_name || '',
    patient: patientPayload(patient),
    createdAt: identity.created_at,
    updatedAt: identity.updated_at,
    lastSeenAt: identity.last_seen_at,
  }
}

async function getIdentity(admin: any, organisationId: string, robloxUserId: string) {
  const { data: identity, error } = await admin
    .from('recordsweb_roblox_patient_identities')
    .select('*')
    .eq('organisation_id', organisationId)
    .eq('roblox_user_id', robloxUserId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!identity) return null

  const { data: patient, error: patientError } = await admin
    .from('patients')
    .select('id,title,first_name,last_name,dob,sex,gender,emis_number,nhs_number,status')
    .eq('id', identity.patient_id)
    .eq('organisation_id', organisationId)
    .maybeSingle()
  if (patientError) throw new Error(patientError.message)
  if (!patient) return null

  return { identity, patient }
}

async function touchIdentity(
  admin: any,
  identityId: string,
  context: { robloxUsername: string; robloxDisplayName: string; universeId: string; placeId: string; serverId: string; now: string },
) {
  const patch: Record<string, unknown> = {
    last_seen_at: context.now,
    last_seen_universe_id: context.universeId,
    last_seen_place_id: context.placeId,
    last_seen_server_id: context.serverId || null,
    updated_at: context.now,
  }
  if (context.robloxUsername) patch.roblox_username = context.robloxUsername
  if (context.robloxDisplayName) patch.roblox_display_name = context.robloxDisplayName

  const { error } = await admin
    .from('recordsweb_roblox_patient_identities')
    .update(patch)
    .eq('id', identityId)
  if (error) throw new Error(error.message)
}

async function audit(
  admin: any,
  organisationId: string,
  patientId: string | null,
  action: string,
  description: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    await admin.from('audit_log').insert({
      organisation_id: organisationId,
      actor_id: null,
      actor_name: 'RecordsWeb Roblox',
      actor_role: 'Game integration',
      patient_id: patientId,
      action,
      entity_type: 'roblox_patient_identity',
      entity_id: patientId,
      description,
      metadata,
    })
  } catch (error) {
    console.warn('RecordsWeb Roblox identity audit write failed', error)
  }
}

async function createRoleplayPatient(
  admin: any,
  organisationId: string,
  robloxUserId: string,
  details: { firstName: string; lastName: string; dob: string; sex: string | null; title: string },
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const nhsNumber = generateNhsNumberCandidate()
    const { data, error } = await admin
      .from('patients')
      .insert({
        organisation_id: organisationId,
        title: details.title || null,
        first_name: details.firstName,
        last_name: details.lastName,
        dob: details.dob,
        sex: details.sex,
        gender: details.sex,
        emis_number: `RBX-${robloxUserId}`,
        nhs_number: nhsNumber,
        status: 'Active',
      })
      .select('id,title,first_name,last_name,dob,sex,gender,emis_number,nhs_number,status')
      .single()

    if (!error) return data
    if (error.code !== '23505') throw new Error(error.message)
  }
  throw new Error('Unable to create a unique RecordsWeb roleplay patient record.')
}

async function registerIdentity(
  admin: any,
  organisation: any,
  request: {
    robloxUserId: string
    robloxUsername: string
    robloxDisplayName: string
    universeId: string
    placeId: string
    serverId: string
    now: string
    roleplay: any
  },
) {
  const existing = await getIdentity(admin, organisation.id, request.robloxUserId)
  if (existing) {
    await touchIdentity(admin, existing.identity.id, request)
    return { ...existing, created: false }
  }

  if (!billingWriteAllowed(organisation)) {
    throw new Error('This RecordsWeb community is read-only because its subscription is suspended. A new roleplay patient cannot be created until billing access is restored.')
  }

  const roleplay = request.roleplay || {}
  const firstName = roleplayName(roleplay.firstName ?? roleplay.first_name, 'Roleplay first name')
  const lastName = roleplayName(roleplay.lastName ?? roleplay.last_name, 'Roleplay last name')
  const dob = roleplayDate(roleplay.dob)
  const sex = roleplaySex(roleplay.sex)
  const title = cleanText(roleplay.title, 20)

  const patient = await createRoleplayPatient(admin, organisation.id, request.robloxUserId, {
    firstName,
    lastName,
    dob,
    sex,
    title,
  })

  const { data: identity, error } = await admin
    .from('recordsweb_roblox_patient_identities')
    .insert({
      organisation_id: organisation.id,
      roblox_user_id: request.robloxUserId,
      roblox_username: request.robloxUsername || null,
      roblox_display_name: request.robloxDisplayName || null,
      patient_id: patient.id,
      last_seen_at: request.now,
      last_seen_universe_id: request.universeId,
      last_seen_place_id: request.placeId,
      last_seen_server_id: request.serverId || null,
      updated_at: request.now,
    })
    .select('*')
    .single()

  if (error) {
    // Two Roblox servers can theoretically register the same user at the same
    // moment. The unique organisation+Roblox-user constraint decides the winner;
    // remove the orphan patient created by the losing request and return the
    // already-established identity.
    if (error.code === '23505') {
      await admin.from('patients').delete().eq('id', patient.id).eq('organisation_id', organisation.id)
      const winner = await getIdentity(admin, organisation.id, request.robloxUserId)
      if (winner) {
        await touchIdentity(admin, winner.identity.id, request)
        return { ...winner, created: false }
      }
    }
    await admin.from('patients').delete().eq('id', patient.id).eq('organisation_id', organisation.id)
    throw new Error(error.message)
  }

  await audit(
    admin,
    organisation.id,
    patient.id,
    'roblox.patient_identity.created',
    `Created a community-scoped Roblox roleplay patient for Roblox user ${request.robloxUserId}.`,
    {
      roblox_user_id: request.robloxUserId,
      roblox_username: request.robloxUsername || null,
      patient_id: patient.id,
      scope: 'community',
    },
  )

  return { identity, patient, created: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const suppliedKey = cleanText(req.headers.get('x-recordsweb-key'), 256)
    if (!suppliedKey || !suppliedKey.startsWith('rw_live_')) return json({ error: 'Invalid RecordsWeb connection code.' }, 401)

    const supabaseUrl = requiredEnv('SUPABASE_URL')
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const keyHash = await sha256(suppliedKey)

    const { data: integration, error: integrationError } = await admin
      .from('recordsweb_roblox_integrations')
      .select('organisation_id,enabled,universe_id,place_ids,display_name_mode,display_duration_seconds,patient_identity_enabled')
      .eq('key_hash', keyHash)
      .maybeSingle()
    if (integrationError) throw new Error(integrationError.message)
    if (!integration || !integration.enabled) return json({ error: 'This RecordsWeb Roblox integration is disabled or the connection code has been revoked.' }, 403)

    const { data: organisation, error: orgError } = await admin
      .from('organisations')
      .select('id,org_code,name,active,billing_status,billing_payment_exempt,billing_grace_ends_at')
      .eq('id', integration.organisation_id)
      .maybeSingle()
    if (orgError) throw new Error(orgError.message)
    if (!organisation?.active) return json({ error: 'This RecordsWeb community is disabled.' }, 403)

    const body = await req.json().catch(() => ({}))
    const action = cleanText(body?.action, 40) || 'poll'
    const universeId = cleanText(body?.universeId, 24)
    const placeId = cleanText(body?.placeId, 24)
    const serverId = cleanText(body?.serverId, 120)

    if (!/^\d+$/.test(universeId) || !/^\d+$/.test(placeId)) return json({ error: 'Roblox universeId and placeId are required.' }, 400)
    if (integration.universe_id && universeId !== String(integration.universe_id)) return json({ error: 'This Roblox universe is not authorised for the RecordsWeb community.' }, 403)
    const allowedPlaces = Array.isArray(integration.place_ids) ? integration.place_ids.map(String) : []
    if (allowedPlaces.length > 0 && !allowedPlaces.includes(placeId)) return json({ error: 'This Roblox place is not authorised for the RecordsWeb community.' }, 403)

    const now = new Date().toISOString()
    await admin
      .from('recordsweb_roblox_integrations')
      .update({ last_heartbeat_at: now, last_universe_id: universeId, last_place_id: placeId, last_server_id: serverId || null })
      .eq('organisation_id', integration.organisation_id)

    const common = {
      ok: true,
      organisation: { code: organisation.org_code, name: organisation.name },
      displayDurationSeconds: Number(integration.display_duration_seconds) || 12,
      patientIdentityEnabled: integration.patient_identity_enabled !== false,
      identityScope: 'community',
      serverTime: now,
    }

    if (action === 'heartbeat') {
      const { data: latestRows, error: latestError } = await admin
        .from('recordsweb_roblox_display_events')
        .select('id')
        .eq('organisation_id', integration.organisation_id)
        .order('id', { ascending: false })
        .limit(1)
      if (latestError) throw new Error(latestError.message)
      const latestEventId = Array.isArray(latestRows) && latestRows.length ? Number(latestRows[0].id) : 0
      return json({ ...common, latestEventId })
    }

    if (['identity-get', 'identity-resolve', 'identity-register', 'identity-update'].includes(action)) {
      if (integration.patient_identity_enabled === false) {
        return json({ error: 'Persistent Roblox roleplay patient identities are disabled for this RecordsWeb community.' }, 403)
      }

      let robloxUserId: string
      try { robloxUserId = numericId(body?.robloxUserId ?? body?.roblox_user_id, 'Roblox UserId') }
      catch (error) { return json({ error: error instanceof Error ? error.message : 'A valid Roblox UserId is required.' }, 400) }

      const robloxUsername = cleanText(body?.robloxUsername ?? body?.roblox_username, 50)
      const robloxDisplayName = cleanText(body?.robloxDisplayName ?? body?.roblox_display_name, 80)
      const identityContext = { robloxUsername, robloxDisplayName, universeId, placeId, serverId, now }
      let result = await getIdentity(admin, organisation.id, robloxUserId)

      if (action === 'identity-get') {
        if (result) await touchIdentity(admin, result.identity.id, identityContext)
        return json({
          ...common,
          needsRegistration: !result,
          identity: result ? identityPayload(result.identity, result.patient) : null,
        })
      }

      if (action === 'identity-resolve') {
        if (!result) {
          const roleplay = body?.roleplay || body?.patient || null
          const hasRegistration = roleplay && cleanText(roleplay?.firstName ?? roleplay?.first_name, 80) && cleanText(roleplay?.lastName ?? roleplay?.last_name, 80) && cleanText(roleplay?.dob, 10)
          if (!hasRegistration) {
            return json({ ...common, needsRegistration: true, identity: null })
          }
          result = await registerIdentity(admin, organisation, { robloxUserId, ...identityContext, roleplay })
        } else {
          await touchIdentity(admin, result.identity.id, identityContext)
        }
        const refreshed = await getIdentity(admin, organisation.id, robloxUserId)
        return json({ ...common, needsRegistration: false, identity: refreshed ? identityPayload(refreshed.identity, refreshed.patient) : null })
      }

      if (action === 'identity-register') {
        let registrationCreated = false
        try {
          const registration = await registerIdentity(admin, organisation, {
            robloxUserId,
            ...identityContext,
            roleplay: body?.roleplay || body?.patient || {},
          })
          registrationCreated = Boolean(registration.created)
          result = { identity: registration.identity, patient: registration.patient }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to register the roleplay patient identity.'
          const status = /read-only|subscription/i.test(message) ? 403 : 400
          return json({ error: message }, status)
        }
        const refreshed = await getIdentity(admin, organisation.id, robloxUserId)
        return json({ ...common, needsRegistration: false, created: registrationCreated, identity: refreshed ? identityPayload(refreshed.identity, refreshed.patient) : null })
      }

      if (!result) return json({ error: 'No roleplay patient identity exists for this Roblox user in this RecordsWeb community.' }, 404)
      if (!billingWriteAllowed(organisation)) return json({ error: 'This RecordsWeb community is read-only because its subscription is suspended.' }, 403)

      const roleplay = body?.roleplay || body?.patient || {}
      const patientPatch: Record<string, unknown> = {}
      if (roleplay.firstName !== undefined || roleplay.first_name !== undefined) patientPatch.first_name = roleplayName(roleplay.firstName ?? roleplay.first_name, 'Roleplay first name')
      if (roleplay.lastName !== undefined || roleplay.last_name !== undefined) patientPatch.last_name = roleplayName(roleplay.lastName ?? roleplay.last_name, 'Roleplay last name')
      if (roleplay.dob !== undefined) patientPatch.dob = roleplayDate(roleplay.dob)
      if (roleplay.sex !== undefined) {
        const sex = roleplaySex(roleplay.sex)
        patientPatch.sex = sex
        patientPatch.gender = sex
      }
      if (roleplay.title !== undefined) patientPatch.title = cleanText(roleplay.title, 20) || null
      if (Object.keys(patientPatch).length === 0) return json({ error: 'No roleplay patient fields were supplied to update.' }, 400)

      const { error: patientUpdateError } = await admin
        .from('patients')
        .update({ ...patientPatch, updated_at: now })
        .eq('id', result.patient.id)
        .eq('organisation_id', organisation.id)
      if (patientUpdateError) throw new Error(patientUpdateError.message)

      await touchIdentity(admin, result.identity.id, identityContext)
      await audit(admin, organisation.id, result.patient.id, 'roblox.patient_identity.updated', `Updated the community-scoped roleplay patient for Roblox user ${robloxUserId}.`, {
        roblox_user_id: robloxUserId,
        changed_fields: Object.keys(patientPatch),
      })
      const refreshed = await getIdentity(admin, organisation.id, robloxUserId)
      return json({ ...common, needsRegistration: false, identity: refreshed ? identityPayload(refreshed.identity, refreshed.patient) : null })
    }

    if (action !== 'poll') return json({ error: 'Unknown action.' }, 400)

    const afterId = Math.max(0, Math.floor(Number(body?.afterId) || 0))
    const { data: events, error: eventError } = await admin
      .from('recordsweb_roblox_display_events')
      .select('id,event_type,display_name,destination,clinician,created_at,expires_at')
      .eq('organisation_id', integration.organisation_id)
      .gt('id', afterId)
      .gt('expires_at', now)
      .order('id', { ascending: true })
      .limit(20)
    if (eventError) throw new Error(eventError.message)

    const rows = Array.isArray(events) ? events : []
    return json({
      ...common,
      events: rows.map((event: any) => ({
        id: Number(event.id),
        type: event.event_type,
        displayName: event.display_name,
        destination: event.destination,
        clinician: event.clinician || '',
        createdAt: event.created_at,
        expiresAt: event.expires_at,
      })),
      nextAfterId: rows.length ? Number(rows[rows.length - 1].id) : afterId,
    })
  } catch (error) {
    console.error('recordsweb-game-api error', error)
    return json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, 500)
  }
})
