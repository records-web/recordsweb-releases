import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@^22'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OPERATOR_EMAIL_PATTERN = /^(?:gus\.farnsworth|alfie-james)@[a-z]{2}\.[a-z]{2}$/i
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

function cleanText(value: unknown, fallback = '') {
  return String(value ?? fallback).trim()
}

function stripeEnvironment(secretKey: string) {
  return secretKey.startsWith('sk_test_') ? 'sandbox' : 'live'
}

function stripeResourceMissing(error: any) {
  return error?.code === 'resource_missing' || error?.raw?.code === 'resource_missing' || /no such (customer|subscription|checkout session)/i.test(String(error?.message || ''))
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

function validateCommunityDetails(communityName: string, systemMode: string, defaultLocation: string) {
  if (!communityName) return 'Community name is required.'
  if (communityName.length > 120) return 'Community name must be 120 characters or fewer.'
  if (!['general_practice', 'hospital'].includes(systemMode)) return 'RecordsWeb mode must be General Practitioner or Hospital.'
  if (!defaultLocation) return 'Default location is required.'
  if (defaultLocation.length > 120) return 'Default location must be 120 characters or fewer.'
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

async function writeAudit(admin: any, callerProfile: any, action: string, entityId: string, description: string, metadata: Record<string, unknown> = {}) {
  try {
    await admin.from('audit_log').insert({
      organisation_id: callerProfile.organisation_id,
      actor_id: callerProfile.id,
      actor_name: callerProfile.display_name,
      actor_role: callerProfile.role,
      action,
      entity_type: 'organisation',
      entity_id: entityId,
      description,
      metadata,
    })
  } catch (error) {
    console.warn('RecordsWeb platform audit write failed', error)
  }
}

async function getOrganisation(admin: any, organisationId: string) {
  if (!organisationId) return { organisation: null, error: 'Organisation id is required.' }
  const { data, error } = await admin
    .from('organisations')
    .select('id,org_code,name,system_mode,default_location,active,created_at,billing_payment_exempt,billing_exemption_reason,stripe_customer_id,stripe_subscription_id,stripe_subscription_status,stripe_checkout_session_id,stripe_environment,billing_status,billing_grace_started_at,billing_grace_ends_at,billing_read_only_since')
    .eq('id', organisationId)
    .maybeSingle()
  if (error) return { organisation: null, error: error.message }
  if (!data) return { organisation: null, error: 'RecordsWeb community was not found.' }
  return { organisation: data, error: '' }
}

async function findReservedOperatorProfile(admin: any, organisation: any) {
  const username = `gus.farnsworth@${organisation.org_code}`
  const { data, error } = await admin
    .from('profiles')
    .select('id,organisation_id,username,display_name,role,roles,is_management,active,disabled_reason')
    .eq('organisation_id', organisation.id)
    .ilike('username', username)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data || null
}

async function findAuthUserByEmail(admin: any, email: string) {
  const wanted = email.toLowerCase()
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(error.message)
    const users = data?.users || []
    const found = users.find((user: any) => String(user.email || '').toLowerCase() === wanted)
    if (found) return found
    if (users.length < 1000) break
  }
  return null
}

async function recordPasswordHistory(admin: any, userId: string, password: string) {
  const { error } = await admin.rpc('recordsweb_service_record_password', {
    p_user_id: userId,
    p_password: password,
  })
  if (error) throw new Error('Password history could not be updated. Ensure the RecordsWeb 2.7.0 migration is installed.')
}

async function ensureReservedOperator(admin: any, organisation: any, password: string) {
  const operatorEmail = `gus.farnsworth@${String(organisation.org_code).toLowerCase()}`
  const operatorUsername = `gus.farnsworth@${organisation.org_code}`
  const passwordError = validatePassword(password, operatorEmail)
  if (passwordError) throw new Error(passwordError)

  const existingProfile = await findReservedOperatorProfile(admin, organisation)
  const role = organisation.system_mode === 'hospital' ? 'Practice Manager' : 'GP Partner'
  const now = new Date().toISOString()

  if (existingProfile) {
    const { error: authError } = await admin.auth.admin.updateUserById(existingProfile.id, {
      password,
      user_metadata: { recordsweb: true, display_name: 'Mr Gus Farnsworth' },
    })
    if (authError) throw new Error(authError.message || 'Unable to reset the reserved operator password.')

    const { error: profileError } = await admin
      .from('profiles')
      .update({
        title: 'Mr',
        first_name: 'Gus',
        last_name: 'Farnsworth',
        display_name: 'Mr Gus Farnsworth',
        role,
        roles: [role],
        is_management: true,
        active: true,
        disabled_reason: null,
        must_change_password: false,
        password_changed_at: now,
      })
      .eq('id', existingProfile.id)
    if (profileError) throw new Error(profileError.message || 'Unable to update the reserved operator profile.')

    await recordPasswordHistory(admin, existingProfile.id, password)
    return { created: false, userId: existingProfile.id, operatorEmail: operatorUsername, role }
  }

  if (!organisation.active) throw new Error('Enable the community before creating its missing reserved operator account.')

  let authUser = await findAuthUserByEmail(admin, operatorEmail)
  let createdAuthUser = false
  if (!authUser) {
    const { data, error } = await admin.auth.admin.createUser({
      email: operatorEmail,
      password,
      email_confirm: true,
      user_metadata: { recordsweb: true, display_name: 'Mr Gus Farnsworth' },
    })
    if (error || !data.user) throw new Error(error?.message || 'Unable to create the reserved operator account.')
    authUser = data.user
    createdAuthUser = true
  } else {
    const { error } = await admin.auth.admin.updateUserById(authUser.id, {
      password,
      user_metadata: { recordsweb: true, display_name: 'Mr Gus Farnsworth' },
    })
    if (error) throw new Error(error.message || 'Unable to prepare the reserved operator account.')
  }

  const { data: profileById, error: profileByIdError } = await admin
    .from('profiles')
    .select('id,organisation_id,username')
    .eq('id', authUser.id)
    .maybeSingle()
  if (profileByIdError) throw new Error(profileByIdError.message)
  if (profileById && profileById.organisation_id !== organisation.id) {
    if (createdAuthUser) { try { await admin.auth.admin.deleteUser(authUser.id) } catch {} }
    throw new Error(`The reserved authentication account ${operatorEmail} is already linked to another RecordsWeb profile.`)
  }

  if (!profileById) {
    const { error: profileError } = await admin.from('profiles').insert({
      id: authUser.id,
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
    if (profileError) {
      if (createdAuthUser) { try { await admin.auth.admin.deleteUser(authUser.id) } catch {} }
      throw new Error(profileError.message || 'Unable to create the reserved operator profile.')
    }
  }

  await recordPasswordHistory(admin, authUser.id, password)
  return { created: true, userId: authUser.id, operatorEmail: operatorUsername, role }
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
    const action = cleanText(body.action)

    if (action === 'create-community') {
      const organisationCode = normaliseOrganisationCode(body.organisation_code)
      const communityName = cleanText(body.community_name)
      const systemMode = cleanText(body.system_mode, 'general_practice').toLowerCase()
      const defaultLocation = cleanText(body.default_location, 'Main Site')
      const password = String(body.password || '')

      if (!organisationCode) return json({ error: 'Organisation extension must use four letters in the format @XX.XX.' }, 400)
      const detailsError = validateCommunityDetails(communityName, systemMode, defaultLocation)
      if (detailsError) return json({ error: detailsError }, 400)

      const operatorEmail = `gus.farnsworth@${organisationCode.toLowerCase()}`
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
          billing_plan: 'standard',
          billing_status: 'setup',
          billing_monthly_price: 9.50,
          billing_first_month_price: 5.00,
          billing_first_month_offer: true,
          billing_setup_fee: 7.00,
          billing_start_date: null,
          billing_next_date: null,
          announcement_board_enabled: false,
          announcement_board_fee: 10.00,
          billing_notes: null,
          billing_payment_exempt: false,
          billing_exemption_reason: null,
          billing_email: null,
          stripe_customer_id: null,
          stripe_subscription_id: null,
          stripe_subscription_status: null,
          stripe_environment: null,
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
      const operatorUsername = `gus.farnsworth@${organisationCode}`
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

      try { await recordPasswordHistory(admin, createdUserId, password) }
      catch (error) {
        await cleanupCreatedCommunity(admin, createdUserId, createdOrganisationId)
        return json({ error: error instanceof Error ? error.message : 'Password history could not be initialised.' }, 500)
      }

      await writeAudit(admin, callerProfile, 'platform.community.created', organisation.id, `Created RecordsWeb community ${communityName} (@${organisationCode}) and reserved operator ${operatorUsername}.`, {
        organisation_code: organisationCode,
        community_name: communityName,
        system_mode: systemMode,
        operator_username: operatorUsername,
      })

      return json({
        ok: true,
        community: { id: organisation.id, org_code: organisation.org_code, name: organisation.name, system_mode: organisation.system_mode, default_location: organisation.default_location, active: organisation.active },
        operator_email: operatorUsername,
        operator_profile: profile,
      })
    }

    if (action === 'update-community') {
      const organisationId = cleanText(body.organisation_id)
      const communityName = cleanText(body.community_name)
      const systemMode = cleanText(body.system_mode, 'general_practice').toLowerCase()
      const defaultLocation = cleanText(body.default_location, 'Main Site')
      const detailsError = validateCommunityDetails(communityName, systemMode, defaultLocation)
      if (detailsError) return json({ error: detailsError }, 400)

      const { organisation, error } = await getOrganisation(admin, organisationId)
      if (error || !organisation) return json({ error }, 404)

      const { data: updated, error: updateError } = await admin
        .from('organisations')
        .update({ name: communityName, system_mode: systemMode, default_location: defaultLocation })
        .eq('id', organisation.id)
        .select('id,org_code,name,system_mode,default_location,active')
        .single()
      if (updateError || !updated) return json({ error: updateError?.message || 'Unable to update the RecordsWeb community.' }, 400)

      const reserved = await findReservedOperatorProfile(admin, updated)
      if (reserved) {
        const role = systemMode === 'hospital' ? 'Practice Manager' : 'GP Partner'
        await admin.from('profiles').update({ role, roles: [role], is_management: true }).eq('id', reserved.id)
      }

      await writeAudit(admin, callerProfile, 'platform.community.updated', organisation.id, `Updated RecordsWeb community ${communityName} (@${organisation.org_code}).`, {
        organisation_code: organisation.org_code,
        previous_name: organisation.name,
        community_name: communityName,
        previous_mode: organisation.system_mode,
        system_mode: systemMode,
        previous_location: organisation.default_location,
        default_location: defaultLocation,
      })

      return json({ ok: true, community: updated })
    }

    if (action === 'set-community-active') {
      const organisationId = cleanText(body.organisation_id)
      const active = Boolean(body.active)
      const { organisation, error } = await getOrganisation(admin, organisationId)
      if (error || !organisation) return json({ error }, 404)

      if (!active && organisation.id === callerProfile.organisation_id) {
        return json({ error: `You cannot disable @${organisation.org_code} while authenticated through that community. Sign in with a reserved operator account from another active community first.` }, 400)
      }

      const { data: updated, error: updateError } = await admin
        .from('organisations')
        .update({ active })
        .eq('id', organisation.id)
        .select('id,org_code,name,system_mode,default_location,active')
        .single()
      if (updateError || !updated) return json({ error: updateError?.message || 'Unable to change community status.' }, 400)

      await writeAudit(admin, callerProfile, active ? 'platform.community.enabled' : 'platform.community.disabled', organisation.id, `${active ? 'Enabled' : 'Disabled'} RecordsWeb community ${organisation.name} (@${organisation.org_code}).`, {
        organisation_code: organisation.org_code,
        active,
      })

      return json({ ok: true, community: updated })
    }


    if (action === 'update-community-billing') {
      const organisationId = cleanText(body.organisation_id)
      const requestedBillingStatus = cleanText(body.billing_status, 'active').toLowerCase()
      const allowedStatuses = ['setup', 'active', 'overdue', 'suspended', 'complimentary']
      if (!allowedStatuses.includes(requestedBillingStatus)) return json({ error: 'Invalid billing status.' }, 400)

      const amounts = {
        billing_monthly_price: Number(body.billing_monthly_price),
        billing_first_month_price: Number(body.billing_first_month_price),
        billing_setup_fee: Number(body.billing_setup_fee),
        announcement_board_fee: Number(body.announcement_board_fee),
      }
      for (const [name, value] of Object.entries(amounts)) {
        if (!Number.isFinite(value) || value < 0 || value > 9999) return json({ error: `${name} must be a valid non-negative amount below 10000.` }, 400)
      }

      const firstMonthOffer = Boolean(body.billing_first_month_offer)
      if (firstMonthOffer && amounts.billing_first_month_price > amounts.billing_monthly_price) {
        return json({ error: 'The first-month offer cannot be higher than the normal monthly price.' }, 400)
      }

      const datePattern = /^\d{4}-\d{2}-\d{2}$/
      const billingStartDate = cleanText(body.billing_start_date) || null
      const billingNextDate = cleanText(body.billing_next_date) || null
      if (billingStartDate && !datePattern.test(billingStartDate)) return json({ error: 'Billing start date must use YYYY-MM-DD.' }, 400)
      if (billingNextDate && !datePattern.test(billingNextDate)) return json({ error: 'Next billing date must use YYYY-MM-DD.' }, 400)

      const billingNotes = cleanText(body.billing_notes)
      if (billingNotes.length > 1000) return json({ error: 'Billing notes must be 1000 characters or fewer.' }, 400)

      const paymentExempt = Boolean(body.billing_payment_exempt)
      const exemptionReason = cleanText(body.billing_exemption_reason)
      if (exemptionReason.length > 500) return json({ error: 'Payment exemption reason must be 500 characters or fewer.' }, 400)

      const { organisation, error } = await getOrganisation(admin, organisationId)
      if (error || !organisation) return json({ error }, 404)

      let cancelledStripeStatus = cleanText((organisation as any).stripe_subscription_status) || null
      let stripeSubscriptionId = cleanText((organisation as any).stripe_subscription_id) || null
      const stripeCheckoutSessionId = cleanText((organisation as any).stripe_checkout_session_id) || null

      // Payment exemption means no payment at all. Before writing the exemption,
      // invalidate any open checkout and stop any subscription that could still
      // charge this community. Stale sandbox identifiers are automatically
      // discarded after a move to live Stripe when the stored subscription is
      // already cancelled, rather than blocking the exemption.
      if (paymentExempt && (stripeSubscriptionId || stripeCheckoutSessionId || cleanText((organisation as any).stripe_customer_id))) {
        const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
        const storedStripeEnvironment = cleanText((organisation as any).stripe_environment).toLowerCase()
        const storedSubscriptionStatus = cleanText((organisation as any).stripe_subscription_status).toLowerCase()
        const terminalStoredStatus = ['canceled', 'incomplete_expired'].includes(storedSubscriptionStatus)

        if (!stripeSecretKey) {
          if (!terminalStoredStatus && stripeSubscriptionId) {
            return json({ error: 'This community has an existing Stripe subscription. Configure STRIPE_SECRET_KEY before excluding it from payment so RecordsWeb can stop future charges safely.' }, 503)
          }
        } else {
          const currentStripeEnvironment = stripeEnvironment(stripeSecretKey)
          const environmentMismatch = Boolean(storedStripeEnvironment) && storedStripeEnvironment !== currentStripeEnvironment

          if (environmentMismatch && stripeSubscriptionId && !terminalStoredStatus) {
            return json({
              error: `This community is linked to an active ${storedStripeEnvironment} Stripe subscription, but RecordsWeb is currently using ${currentStripeEnvironment} Stripe credentials. Cancel the subscription in the ${storedStripeEnvironment} Stripe environment first, then retry the exemption.`,
            }, 409)
          }

          if (!environmentMismatch) {
            try {
              const stripe = new Stripe(stripeSecretKey)

              if (stripeCheckoutSessionId) {
                try {
                  const checkout: any = await stripe.checkout.sessions.retrieve(stripeCheckoutSessionId)
                  if (checkout.status === 'open') await stripe.checkout.sessions.expire(checkout.id)
                  const sessionSubscriptionId = typeof checkout.subscription === 'string'
                    ? checkout.subscription
                    : cleanText(checkout.subscription?.id)
                  if (!stripeSubscriptionId && sessionSubscriptionId) stripeSubscriptionId = sessionSubscriptionId
                } catch (checkoutError) {
                  if (!stripeResourceMissing(checkoutError)) throw checkoutError
                }
              }

              if (stripeSubscriptionId) {
                try {
                  const subscription: any = await stripe.subscriptions.retrieve(stripeSubscriptionId)
                  if (subscription.status !== 'canceled') {
                    const cancelled: any = await stripe.subscriptions.cancel(subscription.id)
                    cancelledStripeStatus = cancelled.status || 'canceled'
                  } else {
                    cancelledStripeStatus = 'canceled'
                  }
                } catch (subscriptionError) {
                  if (!(terminalStoredStatus && stripeResourceMissing(subscriptionError))) throw subscriptionError
                  cancelledStripeStatus = 'canceled'
                }
              }
            } catch (stripeError) {
              console.error('Unable to stop Stripe billing before enabling RecordsWeb payment exemption', stripeError)
              return json({ error: 'RecordsWeb could not stop the existing Stripe checkout/subscription, so the payment exemption was not applied. Check the Stripe configuration and try again.' }, 502)
            }
          }
        }
      }

      const billingStatus = paymentExempt ? 'complimentary' : requestedBillingStatus
      const now = new Date().toISOString()
      const addGraceDays = (value: string, days = 7) => new Date(new Date(value).getTime() + days * 24 * 60 * 60 * 1000).toISOString()
      const patch: Record<string, unknown> = {
        billing_plan: 'standard',
        billing_status: billingStatus,
        ...amounts,
        billing_first_month_offer: firstMonthOffer,
        billing_start_date: billingStartDate,
        billing_next_date: paymentExempt ? null : billingNextDate,
        announcement_board_enabled: Boolean(body.announcement_board_enabled),
        billing_notes: billingNotes || null,
        billing_payment_exempt: paymentExempt,
        billing_exemption_reason: paymentExempt ? (exemptionReason || 'Payment excluded by RecordsWeb Platform Management.') : null,
      }

      if (paymentExempt || billingStatus === 'complimentary' || billingStatus === 'active' || billingStatus === 'setup') {
        patch.billing_grace_started_at = null
        patch.billing_grace_ends_at = null
        patch.billing_read_only_since = null
      } else if (billingStatus === 'overdue') {
        const graceStartedAt = cleanText((organisation as any).billing_grace_started_at) || now
        patch.billing_grace_started_at = graceStartedAt
        patch.billing_grace_ends_at = cleanText((organisation as any).billing_grace_ends_at) || addGraceDays(graceStartedAt)
        patch.billing_read_only_since = null
      } else if (billingStatus === 'suspended') {
        patch.billing_read_only_since = cleanText((organisation as any).billing_read_only_since) || now
      }
      if (paymentExempt) {
        // Once future charges are safely stopped (or a stale cancelled sandbox
        // link is detected), detach Stripe completely. Complimentary communities
        // should not keep environment-specific customer/subscription/session IDs.
        patch.stripe_customer_id = null
        patch.stripe_subscription_id = null
        patch.stripe_subscription_status = null
        patch.stripe_last_invoice_status = null
        patch.stripe_checkout_session_id = null
        patch.stripe_current_period_end = null
        patch.stripe_last_payment_at = null
        patch.stripe_environment = null
        patch.stripe_updated_at = now
      }

      const { data: updated, error: updateError } = await admin
        .from('organisations')
        .update(patch)
        .eq('id', organisation.id)
        .select('id,org_code,name,billing_plan,billing_status,billing_monthly_price,billing_first_month_price,billing_first_month_offer,billing_setup_fee,billing_start_date,billing_next_date,announcement_board_enabled,announcement_board_fee,billing_notes,billing_payment_exempt,billing_exemption_reason,billing_email,stripe_customer_id,stripe_subscription_id,stripe_subscription_status,stripe_last_invoice_status,stripe_current_period_end,stripe_last_payment_at,stripe_environment,stripe_updated_at,billing_grace_started_at,billing_grace_ends_at,billing_read_only_since')
        .single()
      if (updateError || !updated) return json({ error: updateError?.message || 'Unable to update community billing.' }, 400)

      await writeAudit(admin, callerProfile, 'platform.community.billing_updated', organisation.id, `Updated RecordsWeb billing for ${organisation.name} (@${organisation.org_code}).`, {
        organisation_code: organisation.org_code,
        billing_status: billingStatus,
        billing_monthly_price: amounts.billing_monthly_price,
        billing_next_date: paymentExempt ? null : billingNextDate,
        billing_payment_exempt: paymentExempt,
        billing_exemption_reason: paymentExempt ? (exemptionReason || 'Payment excluded by RecordsWeb Platform Management.') : null,
        announcement_board_enabled: Boolean(body.announcement_board_enabled),
      })

      return json({ ok: true, community: updated })
    }

    if (action === 'set-community-operator-password') {
      const organisationId = cleanText(body.organisation_id)
      const password = String(body.password || '')
      const { organisation, error } = await getOrganisation(admin, organisationId)
      if (error || !organisation) return json({ error }, 404)

      let result
      try { result = await ensureReservedOperator(admin, organisation, password) }
      catch (operatorError) { return json({ error: operatorError instanceof Error ? operatorError.message : 'Unable to update the reserved operator account.' }, 400) }

      await writeAudit(admin, callerProfile, result.created ? 'platform.community.operator.created' : 'platform.community.operator.password_reset', organisation.id, result.created
        ? `Created missing reserved operator ${result.operatorEmail} for ${organisation.name} (@${organisation.org_code}).`
        : `Reset the reserved operator password for ${result.operatorEmail} in ${organisation.name} (@${organisation.org_code}).`, {
        organisation_code: organisation.org_code,
        operator_username: result.operatorEmail,
        created: result.created,
      })

      return json({ ok: true, created: result.created, operator_email: result.operatorEmail, role: result.role })
    }

    return json({ error: 'Unknown platform administration action.' }, 400)
  } catch (error) {
    console.error('recordsweb-platform-admin error', error)
    return json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, 500)
  }
})
