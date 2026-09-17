import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-recordsweb-device, x-recordsweb-session',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function clean(value: unknown, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

function ipFrom(req: Request) {
  const candidates = [
    req.headers.get('cf-connecting-ip'),
    req.headers.get('x-real-ip'),
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
  ]
  return candidates.find(Boolean) || null
}

function deviceHashFrom(req: Request, body: any) {
  const value = clean(req.headers.get('x-recordsweb-device') || body?.deviceHash || body?.device_hash, 200)
  return /^[a-f0-9]{32,128}$/i.test(value) ? value.toLowerCase() : null
}

function sessionIdFrom(req: Request, body: any) {
  const value = clean(req.headers.get('x-recordsweb-session') || body?.sessionId || body?.session_id, 80)
  return /^[0-9a-f-]{36}$/i.test(value) ? value : null
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return String(n).padStart(6, '0')
}

async function getAuthContext(admin: any, req: Request) {
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token || token === authHeader) return null
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData?.user) return null
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id,organisation_id,display_name,username,role,roles,active,is_management,organisations(id,name,org_code,active)')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (profileError || !profile) return null
  return { user: userData.user, profile }
}

const PLATFORM_OPERATOR_EMAIL_PATTERN = /^(?:gus\.farnsworth|alfie\.james)@[a-z]{2}\.[a-z]{2}$/i

function normaliseOrganisationCode(value: unknown) {
  return clean(value, 32).toUpperCase()
}

function isPlatformOperator(context: any) {
  const email = clean(context?.user?.email, 320).toLowerCase()
  const relation = context?.profile?.organisations
  const organisation = Array.isArray(relation) ? relation[0] : relation
  const organisationCode = normaliseOrganisationCode(organisation?.org_code)
  const emailCode = (email.split('@')[1] || '').toUpperCase()

  return Boolean(
    context?.profile?.active === true &&
    organisation?.active === true &&
    PLATFORM_OPERATOR_EMAIL_PATTERN.test(email) &&
    organisationCode &&
    organisationCode === emailCode
  )
}

async function securityEvent(admin: any, values: any) {
  const { error } = await admin.from('recordsweb_security_events').insert(values)
  if (error) console.warn('recordsweb-security event insert failed', error.message)
}

async function activeBans(admin: any, { userId, email, ip, deviceHash, organisationId }: any) {
  const now = new Date().toISOString()
  const { data: rows, error } = await admin
    .from('recordsweb_platform_bans')
    .select('*')
    .is('revoked_at', null)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
  if (error) throw error
  const emailNorm = clean(email, 320).toLowerCase()
  const matched: any[] = []
  for (const row of rows || []) {
    if (row.scope === 'organisation' && row.organisation_id && organisationId && row.organisation_id !== organisationId) continue
    if (row.scope === 'organisation' && row.organisation_id && !organisationId) continue
    if (row.ban_type === 'account' && ((userId && row.user_id === userId) || (emailNorm && row.email_normalised === emailNorm))) matched.push(row)
    else if (row.ban_type === 'device' && deviceHash && row.device_hash === deviceHash) matched.push(row)
    else if (row.ban_type === 'ip' && ip && row.ip_network) {
      const { data: inNetwork } = await admin.rpc('recordsweb_ip_in_network', { p_ip: ip, p_network: row.ip_network })
      if (inNetwork === true) matched.push(row)
    }
  }
  return matched
}

async function rateLimitState(admin: any, { emailHash, ip, deviceHash }: any) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  let query = admin.from('recordsweb_login_attempts').select('attempted_at,success,failure_code').gte('attempted_at', since).eq('success', false)
  const filters: string[] = []
  if (emailHash) filters.push(`email_hash.eq.${emailHash}`)
  if (ip) filters.push(`ip_address.eq.${ip}`)
  if (deviceHash) filters.push(`device_hash.eq.${deviceHash}`)
  if (!filters.length) return { blocked: false, attempts: 0, retryAfterSeconds: 0 }
  query = query.or(filters.join(','))
  const { data, error } = await query
  if (error) throw error
  const attempts = (data || []).length
  if (attempts < 8) return { blocked: false, attempts, retryAfterSeconds: 0 }
  const newest = new Date((data || [])[0]?.attempted_at || Date.now()).getTime()
  const delay = Math.min(15 * 60, 30 * 2 ** Math.min(5, attempts - 8))
  const retryAfterSeconds = Math.max(1, Math.round((newest + delay * 1000 - Date.now()) / 1000))
  return { blocked: retryAfterSeconds > 0, attempts, retryAfterSeconds }
}

async function assertSessionAllowed(admin: any, context: any, req: Request, body: any) {
  const sessionId = sessionIdFrom(req, body)
  if (!sessionId) return { sessionId: null, row: null }
  const { data: row } = await admin.from('recordsweb_security_sessions').select('*').eq('id', sessionId).eq('user_id', context.user.id).maybeSingle()
  if (!row) throw new Error('Security session is invalid.')
  if (row.revoked_at) throw new Error('This RecordsWeb session has been revoked.')
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) throw new Error('This RecordsWeb session has expired.')
  return { sessionId, row }
}

async function discordDm(discordUserId: string, content: string) {
  const token = Deno.env.get('RECORDSWEB_DISCORD_BOT_TOKEN')
  if (!token) throw new Error('RecordsWeb Bot is not configured.')
  const headers = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' }
  const channelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST', headers, body: JSON.stringify({ recipient_id: discordUserId }),
  })
  if (!channelRes.ok) throw new Error(`Discord DM channel failed (${channelRes.status}).`)
  const channel = await channelRes.json()
  const sendRes = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
    method: 'POST', headers, body: JSON.stringify({ content }),
  })
  if (!sendRes.ok) throw new Error(`Discord DM failed (${sendRes.status}).`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!supabaseUrl || !serviceRole) return json({ error: 'RecordsWeb security service is not configured.' }, 500)
    const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
    const body = await req.json().catch(() => ({}))
    const action = clean(body.action, 80)
    const ip = ipFrom(req)
    const deviceHash = deviceHashFrom(req, body)
    const userAgent = clean(req.headers.get('user-agent'), 500) || null

    // -----------------------------------------------------------------------
    // Unauthenticated login guard
    // -----------------------------------------------------------------------
    if (action === 'preflight-login') {
      const email = clean(body.email, 320).toLowerCase()
      const organisationCode = clean(body.organisationCode || body.organisation_code, 80).toUpperCase()
      const emailHash = email ? await sha256(email) : null
      let organisationId: string | null = null
      if (organisationCode) {
        const { data: org } = await admin.from('organisations').select('id').eq('org_code', organisationCode).maybeSingle()
        organisationId = org?.id || null
      }
      const bans = await activeBans(admin, { email, ip, deviceHash, organisationId })
      const limit = await rateLimitState(admin, { emailHash, ip, deviceHash })
      if (bans.length || limit.blocked) {
        await admin.from('recordsweb_login_attempts').insert({ email_hash: emailHash, organisation_code: organisationCode || null, ip_address: ip, device_hash: deviceHash, success: false, failure_code: bans.length ? 'banned' : 'rate_limited' })
        return json({
          allowed: false,
          code: bans.length ? 'ACCESS_BANNED' : 'RATE_LIMITED',
          message: bans.length ? 'Access to RecordsWeb has been suspended for this account, network or device.' : 'Too many sign-in attempts. Try again later.',
          retryAfterSeconds: limit.retryAfterSeconds || null,
        }, bans.length ? 403 : 429)
      }
      return json({ allowed: true, attempts: limit.attempts })
    }

    if (action === 'login-result') {
      const email = clean(body.email, 320).toLowerCase()
      const emailHash = email ? await sha256(email) : null
      await admin.from('recordsweb_login_attempts').insert({
        email_hash: emailHash,
        organisation_code: clean(body.organisationCode || body.organisation_code, 80).toUpperCase() || null,
        user_id: body.userId || null,
        ip_address: ip,
        device_hash: deviceHash,
        success: body.success === true,
        failure_code: body.success === true ? null : clean(body.failureCode || 'invalid_credentials', 80),
      })
      return json({ ok: true })
    }

    // Everything below requires an authenticated account.
    const context = await getAuthContext(admin, req)
    if (!context) return json({ error: 'Unauthorised.' }, 401)
    if (context.profile.active === false) return json({ error: 'This RecordsWeb account is disabled.' }, 403)

    const accountBans = await activeBans(admin, {
      userId: context.user.id,
      email: context.user.email,
      ip,
      deviceHash,
      organisationId: context.profile.organisation_id,
    })
    if (accountBans.length) {
      await securityEvent(admin, {
        organisation_id: context.profile.organisation_id, actor_id: context.user.id,
        actor_name: context.profile.display_name, actor_role: context.profile.role,
        action: 'security.access.blocked', severity: 'high', ip_address: ip, device_hash: deviceHash,
        success: false, reason: accountBans[0].reason, metadata: { ban_id: accountBans[0].id, ban_type: accountBans[0].ban_type },
      })
      return json({ error: 'Access to RecordsWeb has been suspended.', code: 'ACCESS_BANNED' }, 403)
    }

    if (action !== 'register-session') await assertSessionAllowed(admin, context, req, body)

    if (action === 'register-session') {
      const { data: row, error } = await admin.from('recordsweb_security_sessions').insert({
        user_id: context.user.id,
        organisation_id: context.profile.organisation_id,
        device_hash: deviceHash,
        device_name: clean(body.deviceName, 120) || null,
        platform: clean(body.platform, 80) || null,
        app_version: clean(body.appVersion, 40) || null,
        user_agent: userAgent,
        ip_address: ip,
        expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      }).select('*').single()
      if (error) throw error
      await securityEvent(admin, { organisation_id: context.profile.organisation_id, actor_id: context.user.id, actor_name: context.profile.display_name, actor_role: context.profile.role, action: 'account.session.started', entity_type: 'security_session', entity_id: row.id, session_id: row.id, ip_address: ip, device_hash: deviceHash })
      return json({ ok: true, session: row })
    }

    if (action === 'session-heartbeat') {
      const sid = sessionIdFrom(req, body)
      const { data: row, error } = await admin.from('recordsweb_security_sessions').update({ last_seen_at: new Date().toISOString(), ip_address: ip, device_hash: deviceHash || undefined }).eq('id', sid).eq('user_id', context.user.id).is('revoked_at', null).select('id,last_seen_at,expires_at').maybeSingle()
      if (error) throw error
      if (!row) return json({ error: 'Session is no longer active.' }, 401)
      return json({ ok: true, session: row })
    }

    if (action === 'list-my-sessions') {
      const { data, error } = await admin.from('recordsweb_security_sessions').select('*').eq('user_id', context.user.id).order('last_seen_at', { ascending: false }).limit(30)
      if (error) throw error
      return json({ ok: true, sessions: data || [] })
    }

    if (action === 'revoke-session') {
      const target = clean(body.targetSessionId || body.target_session_id, 80)
      const { error } = await admin.from('recordsweb_security_sessions').update({ revoked_at: new Date().toISOString(), revoked_by: context.user.id, revoke_reason: clean(body.reason || 'user_revoked', 240) }).eq('id', target).eq('user_id', context.user.id)
      if (error) throw error
      return json({ ok: true })
    }

    if (action === 'record-access') {
      const patientId = clean(body.patientId || body.patient_id, 80)
      const { data: patient } = await admin.from('patients').select('id,organisation_id').eq('id', patientId).maybeSingle()
      if (!patient || patient.organisation_id !== context.profile.organisation_id) return json({ error: 'Patient record not available.' }, 404)
      const sid = sessionIdFrom(req, body)
      const accessType = ['view','update','download','print','export','break_glass'].includes(body.accessType) ? body.accessType : 'view'
      await admin.from('recordsweb_record_access').insert({
        organisation_id: patient.organisation_id, patient_id: patient.id, actor_id: context.user.id,
        actor_name: context.profile.display_name, section: clean(body.section, 80) || 'summary', access_type: accessType,
        reason: clean(body.reason, 1000) || null, session_id: sid, ip_address: ip, device_hash: deviceHash, metadata: body.metadata || {},
      })
      return json({ ok: true })
    }

    if (action === 'break-glass') {
      const patientId = clean(body.patientId || body.patient_id, 80)
      const reason = clean(body.reason, 1000)
      if (reason.length < 8) return json({ error: 'A meaningful emergency-access reason is required.' }, 400)
      const { data: patient } = await admin.from('patients').select('id,organisation_id,security_classification').eq('id', patientId).maybeSingle()
      if (!patient || patient.organisation_id !== context.profile.organisation_id) return json({ error: 'Patient record not available.' }, 404)
      const { data: grant, error } = await admin.from('recordsweb_break_glass_grants').insert({ organisation_id: patient.organisation_id, patient_id: patient.id, user_id: context.user.id, reason, expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), metadata: { classification: patient.security_classification, ip, deviceHash } }).select('*').single()
      if (error) throw error
      await securityEvent(admin, { organisation_id: patient.organisation_id, actor_id: context.user.id, actor_name: context.profile.display_name, actor_role: context.profile.role, action: 'patient.break_glass.used', severity: 'critical', entity_type: 'patient', entity_id: patient.id, patient_id: patient.id, session_id: sessionIdFrom(req, body), ip_address: ip, device_hash: deviceHash, reason })
      await admin.from('recordsweb_record_access').insert({ organisation_id: patient.organisation_id, patient_id: patient.id, actor_id: context.user.id, actor_name: context.profile.display_name, section: 'restricted_record', access_type: 'break_glass', reason, session_id: sessionIdFrom(req, body), ip_address: ip, device_hash: deviceHash })
      return json({ ok: true, grant })
    }

    if (action === 'set-security-pin') {
      const pin = clean(body.pin, 12)
      if (!/^\d{6}$/.test(pin)) return json({ error: 'Security PIN must contain exactly 6 digits.' }, 400)
      const hash = await sha256(`${context.user.id}:${pin}:${Deno.env.get('RECORDSWEB_SECURITY_PEPPER') || 'recordsweb'}`)
      const { error } = await admin.from('profiles').update({ security_pin_hash: hash, security_pin_set_at: new Date().toISOString() }).eq('id', context.user.id)
      if (error) throw error
      return json({ ok: true })
    }

    if (action === 'step-up') {
      const pin = clean(body.pin, 12)
      const purpose = clean(body.purpose, 120)
      if (!/^\d{6}$/.test(pin) || !purpose) return json({ error: 'Security PIN and purpose are required.' }, 400)
      const { data: profile } = await admin.from('profiles').select('security_pin_hash').eq('id', context.user.id).single()
      if (!profile?.security_pin_hash) return json({ error: 'Configure your 6-digit Security PIN first.' }, 409)
      const hash = await sha256(`${context.user.id}:${pin}:${Deno.env.get('RECORDSWEB_SECURITY_PEPPER') || 'recordsweb'}`)
      if (hash !== profile.security_pin_hash) {
        await securityEvent(admin, { organisation_id: context.profile.organisation_id, actor_id: context.user.id, actor_name: context.profile.display_name, actor_role: context.profile.role, action: 'security.step_up.failed', severity: 'warning', success: false, ip_address: ip, device_hash: deviceHash, reason: purpose })
        return json({ error: 'Security PIN is incorrect.' }, 403)
      }
      const { data: token, error } = await admin.from('recordsweb_step_up_tokens').insert({ user_id: context.user.id, purpose, session_id: sessionIdFrom(req, body), expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() }).select('id,expires_at,purpose').single()
      if (error) throw error
      return json({ ok: true, stepUp: token })
    }

    if (action === 'discord-link-start') {
      const patientId = clean(body.patientId, 80)
      const discordUserId = clean(body.discordUserId, 24)
      if (!/^\d{17,20}$/.test(discordUserId)) return json({ error: 'Discord ID must contain 17-20 digits.' }, 400)
      const { data: patient } = await admin.from('patients').select('id,organisation_id,first_name,last_name').eq('id', patientId).maybeSingle()
      if (!patient || patient.organisation_id !== context.profile.organisation_id) return json({ error: 'Patient record not available.' }, 404)
      const code = randomCode()
      const codeHash = await sha256(code)
      const { data: challenge, error } = await admin.from('recordsweb_discord_link_challenges').insert({ organisation_id: patient.organisation_id, patient_id: patient.id, discord_user_id: discordUserId, code_hash: codeHash, requested_by: context.user.id }).select('id,expires_at').single()
      if (error) throw error
      await discordDm(discordUserId, `**RecordsWeb verification**\nA RecordsWeb patient record is attempting to link to this Discord account.\n\nVerification code: **${code}**\n\nThis code expires in 10 minutes. If you did not request this link, ignore this message.`)
      return json({ ok: true, challenge })
    }

    if (action === 'discord-link-confirm') {
      const challengeId = clean(body.challengeId, 80)
      const code = clean(body.code, 12)
      const { data: challenge } = await admin.from('recordsweb_discord_link_challenges').select('*').eq('id', challengeId).eq('requested_by', context.user.id).maybeSingle()
      if (!challenge || challenge.cancelled_at || challenge.verified_at || new Date(challenge.expires_at).getTime() <= Date.now()) return json({ error: 'This verification challenge is no longer valid.' }, 400)
      if (challenge.attempts >= 5) return json({ error: 'Too many verification attempts.' }, 429)
      const codeHash = await sha256(code)
      if (codeHash !== challenge.code_hash) {
        await admin.from('recordsweb_discord_link_challenges').update({ attempts: challenge.attempts + 1 }).eq('id', challenge.id)
        return json({ error: 'Verification code is incorrect.' }, 403)
      }
      await admin.from('patients').update({ discord_user_id: challenge.discord_user_id, updated_at: new Date().toISOString() }).eq('id', challenge.patient_id).eq('organisation_id', challenge.organisation_id)
      await admin.from('recordsweb_discord_link_challenges').update({ verified_at: new Date().toISOString() }).eq('id', challenge.id)
      await securityEvent(admin, { organisation_id: challenge.organisation_id, actor_id: context.user.id, actor_name: context.profile.display_name, actor_role: context.profile.role, action: 'patient.discord.verified', severity: 'notice', entity_type: 'patient', entity_id: challenge.patient_id, patient_id: challenge.patient_id, ip_address: ip, device_hash: deviceHash })
      return json({ ok: true })
    }

    const platform = isPlatformOperator(context)
    if (action.startsWith('platform-') && !platform) return json({ error: 'RecordsWeb platform operator permission is required.' }, 403)

    if (action === 'platform-security-overview') {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const [bans, failed, breakGlass, sessions, events] = await Promise.all([
        admin.from('recordsweb_platform_bans').select('id', { count: 'exact', head: true }).is('revoked_at', null),
        admin.from('recordsweb_login_attempts').select('id', { count: 'exact', head: true }).eq('success', false).gte('attempted_at', since),
        admin.from('recordsweb_break_glass_grants').select('id', { count: 'exact', head: true }).gte('granted_at', since),
        admin.from('recordsweb_security_sessions').select('id', { count: 'exact', head: true }).is('revoked_at', null).is('ended_at', null),
        admin.from('recordsweb_security_events').select('*').order('occurred_at', { ascending: false }).limit(100),
      ])
      return json({ ok: true, metrics: { activeBans: bans.count || 0, failedLogins24h: failed.count || 0, breakGlass24h: breakGlass.count || 0, activeSessions: sessions.count || 0 }, events: events.data || [] })
    }

    if (action === 'platform-list-bans') {
      const { data, error } = await admin.from('recordsweb_platform_bans').select('*, organisations(name,org_code)').order('created_at', { ascending: false }).limit(250)
      if (error) throw error
      return json({ ok: true, bans: data || [] })
    }

    if (action === 'platform-create-ban') {
      const banType = clean(body.banType, 20).toLowerCase()
      if (!['account','ip','device'].includes(banType)) return json({ error: 'Ban type must be account, ip or device.' }, 400)
      const reason = clean(body.reason, 1000)
      if (reason.length < 3) return json({ error: 'A moderation reason is required.' }, 400)
      const target: any = {
        ban_type: banType,
        user_id: body.userId || null,
        email_normalised: clean(body.email, 320).toLowerCase() || null,
        ip_network: banType === 'ip' ? (clean(body.ipNetwork || body.ip, 80) || null) : null,
        device_hash: banType === 'device' ? (clean(body.deviceHash, 200).toLowerCase() || null) : null,
        scope: body.scope === 'organisation' ? 'organisation' : 'platform',
        organisation_id: body.scope === 'organisation' ? (body.organisationId || null) : null,
        reason,
        internal_note: clean(body.internalNote, 2000) || null,
        created_by: context.user.id,
        created_by_name: context.profile.display_name || context.profile.username,
        expires_at: body.expiresAt || null,
        metadata: body.metadata || {},
      }
      const { data: row, error } = await admin.from('recordsweb_platform_bans').insert(target).select('*').single()
      if (error) throw error
      await securityEvent(admin, { organisation_id: target.organisation_id, actor_id: context.user.id, actor_name: context.profile.display_name, actor_role: context.profile.role, action: 'platform.moderation.ban.created', severity: 'high', entity_type: 'platform_ban', entity_id: row.id, reason, metadata: { ban_type: banType, scope: target.scope } })
      return json({ ok: true, ban: row })
    }

    if (action === 'platform-revoke-ban') {
      const banId = clean(body.banId, 80)
      const reason = clean(body.reason, 1000)
      const { error } = await admin.from('recordsweb_platform_bans').update({ revoked_at: new Date().toISOString(), revoked_by: context.user.id, revoke_reason: reason || 'Revoked by platform operator' }).eq('id', banId).is('revoked_at', null)
      if (error) throw error
      await securityEvent(admin, { actor_id: context.user.id, actor_name: context.profile.display_name, actor_role: context.profile.role, action: 'platform.moderation.ban.revoked', severity: 'notice', entity_type: 'platform_ban', entity_id: banId, reason })
      return json({ ok: true })
    }

    if (action === 'platform-start-support-session') {
      const organisationId = clean(body.organisationId, 80)
      const reason = clean(body.reason, 1000)
      if (!organisationId || reason.length < 8) return json({ error: 'Organisation and support reason are required.' }, 400)
      const { data: row, error } = await admin.from('recordsweb_platform_support_sessions').insert({ operator_id: context.user.id, operator_name: context.profile.display_name || context.profile.username, organisation_id: organisationId, reason, reference: clean(body.reference, 120) || null, ip_address: ip, device_hash: deviceHash, expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() }).select('*').single()
      if (error) throw error
      await securityEvent(admin, { organisation_id: organisationId, actor_id: context.user.id, actor_name: context.profile.display_name, actor_role: context.profile.role, action: 'platform.support_session.started', severity: 'high', entity_type: 'support_session', entity_id: row.id, reason, ip_address: ip, device_hash: deviceHash })
      return json({ ok: true, supportSession: row })
    }

    if (action === 'platform-end-support-session') {
      const id = clean(body.supportSessionId, 80)
      const { error } = await admin.from('recordsweb_platform_support_sessions').update({ ended_at: new Date().toISOString() }).eq('id', id).eq('operator_id', context.user.id)
      if (error) throw error
      return json({ ok: true })
    }

    return json({ error: 'Unknown RecordsWeb security action.' }, 400)
  } catch (error) {
    console.error('recordsweb-security error', error)
    return json({ error: error instanceof Error ? error.message : 'RecordsWeb security request failed.' }, 500)
  }
})
