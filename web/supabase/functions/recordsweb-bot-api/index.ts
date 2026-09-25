import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-recordsweb-bot-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function env(name: string) {
  const value = String(Deno.env.get(name) || '').trim()
  if (!value) throw new Error(`Missing ${name}.`)
  return value
}

async function secretMatches(left: string, right: string) {
  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ])
  const aa = new Uint8Array(a)
  const bb = new Uint8Array(b)
  if (aa.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i]
  return diff === 0
}

function clean(value: unknown, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

function integer(value: unknown, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function discordId(value: unknown) {
  const id = clean(value, 24)
  return /^\d{17,20}$/.test(id) ? id : ''
}

function colourForSeverity(value: string) {
  if (value === 'critical') return 0xB91C1C
  if (value === 'warning') return 0xD97706
  if (value === 'success') return 0x15803D
  return 0x0F6FBD
}

async function exactCount(query: any) {
  const { count, error } = await query
  if (error) throw error
  return Number(count || 0)
}

async function getIntegrationByGuild(admin: any, guildId: string) {
  const { data, error } = await admin
    .from('recordsweb_discord_integrations')
    .select('*')
    .eq('guild_id', guildId)
    .maybeSingle()
  if (error) throw error
  return data || null
}

async function getProfileByDiscord(admin: any, userId: string, organisationId: string | null = null) {
  let query = admin
    .from('profiles')
    .select('id,organisation_id,username,display_name,role,roles,is_management,active,discord_user_id')
    .eq('discord_user_id', userId)
    .eq('active', true)
  if (organisationId) query = query.eq('organisation_id', organisationId)
  const { data, error } = await query.limit(1).maybeSingle()
  if (error) throw error
  return data || null
}

async function effectivePermission(admin: any, profile: any, permission: string) {
  if (!profile) return false
  const roles = [...new Set([clean(profile.role, 120), ...asArray<string>(profile.roles).map((x) => clean(x, 120))].filter(Boolean))]
  if (!roles.length) return false

  const { data, error } = await admin
    .from('recordsweb_role_permissions')
    .select('organisation_id,role_name,permission_key,allowed')
    .eq('permission_key', permission)
    .in('role_name', roles)
  if (error) throw error

  for (const role of roles) {
    const specific = (data || []).find((row: any) => row.role_name === role && String(row.organisation_id || '') === String(profile.organisation_id || ''))
    if (specific) {
      if (specific.allowed === true) return true
      continue
    }
    const global = (data || []).find((row: any) => row.role_name === role && !row.organisation_id)
    if (global?.allowed === true) return true
  }
  return false
}

async function communityAccess(admin: any, guildId: string, userId: string, permission = 'organisation.settings') {
  const integration = await getIntegrationByGuild(admin, guildId)
  if (!integration) return { allowed: false, reason: 'This Discord server is not linked to a RecordsWeb community.', integration: null, profile: null }

  const profile = await getProfileByDiscord(admin, userId, String(integration.organisation_id))
  if (!profile) return { allowed: false, reason: 'Your Discord account is not linked to an active RecordsWeb staff account.', integration, profile: null }
  if (String(profile.organisation_id) !== String(integration.organisation_id)) {
    return { allowed: false, reason: 'Your RecordsWeb account belongs to a different community.', integration, profile }
  }

  const allowed = profile.is_management === true || await effectivePermission(admin, profile, permission)
  return { allowed, reason: allowed ? null : `Your RecordsWeb account does not have ${permission} permission.`, integration, profile }
}

async function resolvePlatformTarget(admin: any, raw: string) {
  const target = clean(raw, 180)
  if (!target) return null
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target)) {
    const { data, error } = await admin.from('profiles').select('id,organisation_id,username,display_name,role,active').eq('id', target).maybeSingle()
    if (error) throw error
    return data || null
  }
  const { data, error } = await admin
    .from('profiles')
    .select('id,organisation_id,username,display_name,role,active')
    .ilike('username', target)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

async function logSecurityEvent(admin: any, actorProfile: any, actorName: string, action: string, severity: string, reason: string | null, metadata: Record<string, unknown> = {}) {
  try {
    await admin.from('recordsweb_security_events').insert({
      actor_id: actorProfile?.id || null,
      actor_name: actorProfile?.display_name || actorProfile?.username || actorName || 'RecordsWeb Discord operator',
      actor_role: actorProfile?.role || 'Discord internal operator',
      action,
      severity,
      reason,
      metadata,
    })
  } catch (error) {
    console.warn('[RecordsWeb Bot API] Security event logging failed:', error)
  }
}

async function recomputeBroadcast(admin: any, broadcastId: string) {
  if (!broadcastId) return
  const { data, error } = await admin
    .from('recordsweb_discord_deliveries')
    .select('organisation_id,status,attempted_at')
    .eq('broadcast_id', broadcastId)
    .order('attempted_at', { ascending: false })
  if (error) throw error

  const latest = new Map<string, string>()
  for (const row of data || []) {
    const orgId = String(row.organisation_id || '')
    if (orgId && !latest.has(orgId)) latest.set(orgId, String(row.status || 'pending'))
  }
  const states = [...latest.values()]
  if (!states.length) return

  const pending = states.filter((x) => x === 'pending').length
  const sent = states.filter((x) => x === 'sent').length
  const failed = states.filter((x) => x === 'failed').length
  const terminal = pending === 0
  const status = pending > 0 ? 'sending' : failed === 0 ? 'sent' : sent > 0 ? 'partial' : 'failed'
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (terminal) patch.sent_at = new Date().toISOString()
  const { error: updateError } = await admin.from('recordsweb_discord_broadcasts').update(patch).eq('id', broadcastId)
  if (updateError) throw updateError
}

async function requeueStaleJobs(admin: any) {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('recordsweb_discord_jobs')
    .select('id,attempts,max_attempts,delivery_id,organisation_id,payload')
    .eq('status', 'processing')
    .lt('claimed_at', cutoff)
    .limit(50)
  if (error) return

  for (const row of data || []) {
    if (Number(row.attempts || 0) >= Number(row.max_attempts || 3)) {
      await admin.from('recordsweb_discord_jobs').update({
        status: 'failed', completed_at: now,
        last_error: 'Worker claim timed out before completion.',
        payload: row?.payload?.redact_after_delivery === true ? { redacted: true, kind: row?.payload?.kind || 'discord_delivery' } : row.payload,
        updated_at: now,
      }).eq('id', row.id)
      if (row.delivery_id) {
        const { data: delivery } = await admin.from('recordsweb_discord_deliveries').update({
          status: 'failed', error: 'Worker claim timed out before completion.'
        }).eq('id', row.delivery_id).select('broadcast_id').maybeSingle()
        if (delivery?.broadcast_id) await recomputeBroadcast(admin, String(delivery.broadcast_id))
      }
    } else {
      await admin.from('recordsweb_discord_jobs').update({
        status: 'pending', available_at: now, claimed_at: null, claimed_by: null,
        last_error: 'Previous worker claim expired; automatically requeued.', updated_at: now,
      }).eq('id', row.id)
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const expectedSecret = env('RECORDSWEB_BOT_API_SECRET')
    const suppliedSecret = clean(req.headers.get('x-recordsweb-bot-secret'), 512)
    if (!suppliedSecret || !(await secretMatches(suppliedSecret, expectedSecret))) {
      return json({ error: 'Unauthorised RecordsWeb Bot request.' }, 401)
    }

    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const body = await req.json().catch(() => ({}))
    const action = clean(body.action, 80)
    const now = new Date().toISOString()

    if (action === 'community-count') {
      const count = await exactCount(admin.from('organisations').select('id', { count: 'exact', head: true }).eq('active', true))
      return json({ ok: true, count, community_count: count, server_time: now })
    }

    if (action === 'platform-public-status') {
      const [{ data: state, error: stateError }, communityCount] = await Promise.all([
        admin.from('recordsweb_platform_state').select('*').eq('id', 'global').maybeSingle(),
        exactCount(admin.from('organisations').select('id', { count: 'exact', head: true }).eq('active', true)),
      ])
      if (stateError) throw stateError
      return json({ ok: true, state: state || {}, community_count: communityCount })
    }

    if (action === 'maintenance-status') {
      const { data, error } = await admin.from('recordsweb_platform_state').select('*').eq('id', 'global').maybeSingle()
      if (error) throw error
      return json({ ok: true, state: data || {} })
    }

    if (action === 'incident-status') {
      const { data, error } = await admin
        .from('recordsweb_discord_broadcasts')
        .select('id,broadcast_type,severity,title,message,status,created_at,starts_at,ends_at')
        .in('broadcast_type', ['incident', 'critical'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return json({ ok: true, incident: data || null })
    }

    if (action === 'verification-status') {
      const userId = discordId(body.discord_user_id)
      if (!userId) return json({ error: 'A valid Discord user ID is required.' }, 400)
      const [{ data: profile, error: profileError }, pendingChallenges] = await Promise.all([
        admin.from('profiles').select('id').eq('discord_user_id', userId).eq('active', true).limit(1).maybeSingle(),
        exactCount(admin.from('recordsweb_discord_link_challenges').select('id', { count: 'exact', head: true }).eq('discord_user_id', userId).is('verified_at', null).is('cancelled_at', null).gt('expires_at', now)),
      ])
      if (profileError) throw profileError
      return json({ ok: true, account_linked: Boolean(profile), pending_challenges: pendingChallenges })
    }

    if (action === 'community-info') {
      const guildId = discordId(body.guild_id)
      if (!guildId) return json({ error: 'A valid Discord guild ID is required.' }, 400)
      const integration = await getIntegrationByGuild(admin, guildId)
      if (!integration) return json({ ok: true, linked: false })
      const { data: organisation, error } = await admin
        .from('organisations')
        .select('id,org_code,name,system_mode,default_location,active')
        .eq('id', integration.organisation_id)
        .maybeSingle()
      if (error) throw error
      return json({ ok: true, linked: true, organisation: organisation || null, integration })
    }

    if (action === 'community-authorize') {
      const guildId = discordId(body.guild_id)
      const userId = discordId(body.discord_user_id)
      if (!guildId || !userId) return json({ error: 'Valid guild_id and discord_user_id are required.' }, 400)
      const permission = clean(body.permission, 120) || 'organisation.settings'
      const access = await communityAccess(admin, guildId, userId, permission)
      return json({
        ok: true,
        allowed: access.allowed,
        reason: access.reason,
        organisation_id: access.integration?.organisation_id || null,
        profile_id: access.profile?.id || null,
      })
    }

    if (action === 'set-integration-channel') {
      const guildId = discordId(body.guild_id)
      const userId = discordId(body.discord_user_id)
      const channelId = discordId(body.channel_id)
      if (!guildId || !userId || !channelId) return json({ error: 'Valid guild, user and channel IDs are required.' }, 400)
      const access = await communityAccess(admin, guildId, userId, 'organisation.settings')
      if (!access.allowed) return json({ error: access.reason || 'Access denied.' }, 403)
      const kind = clean(body.kind, 20) === 'log' ? 'log' : 'status'
      const patch = kind === 'log'
        ? { log_channel_id: channelId, log_channel_name: clean(body.channel_name, 120), updated_at: now }
        : { channel_id: channelId, channel_name: clean(body.channel_name, 120), updated_at: now }
      const { error } = await admin.from('recordsweb_discord_integrations').update(patch).eq('guild_id', guildId)
      if (error) throw error
      return json({ ok: true, kind, channel_id: channelId })
    }

    if (action === 'set-notification-preferences') {
      const guildId = discordId(body.guild_id)
      const userId = discordId(body.discord_user_id)
      if (!guildId || !userId) return json({ error: 'Valid guild_id and discord_user_id are required.' }, 400)
      const access = await communityAccess(admin, guildId, userId, 'organisation.settings')
      if (!access.allowed) return json({ error: access.reason || 'Access denied.' }, 403)
      const patch: Record<string, unknown> = { updated_at: now }
      if (typeof body.announcements === 'boolean') patch.platform_announcements_enabled = body.announcements
      if (typeof body.maintenance === 'boolean') patch.maintenance_notifications = body.maintenance
      if (typeof body.critical === 'boolean') patch.critical_notifications_enabled = body.critical
      if (typeof body.login_dms === 'boolean') patch.login_dm_enabled = body.login_dms
      const { error } = await admin.from('recordsweb_discord_integrations').update(patch).eq('guild_id', guildId)
      if (error) throw error
      return json({ ok: true })
    }

    if (action === 'unlink-integration') {
      const guildId = discordId(body.guild_id)
      const userId = discordId(body.discord_user_id)
      if (!guildId || !userId) return json({ error: 'Valid guild_id and discord_user_id are required.' }, 400)
      const access = await communityAccess(admin, guildId, userId, 'organisation.settings')
      if (!access.allowed) return json({ error: access.reason || 'Access denied.' }, 403)
      const { error } = await admin.from('recordsweb_discord_integrations').delete().eq('guild_id', guildId)
      if (error) throw error
      return json({ ok: true })
    }

    if (action === 'bot-health') {
      const [{ data: bot, error: botError }, pending, processing, failed] = await Promise.all([
        admin.from('recordsweb_discord_bot_state').select('*').eq('id', 'primary').maybeSingle(),
        exactCount(admin.from('recordsweb_discord_jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
        exactCount(admin.from('recordsweb_discord_jobs').select('id', { count: 'exact', head: true }).eq('status', 'processing')),
        exactCount(admin.from('recordsweb_discord_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed')),
      ])
      if (botError) throw botError
      return json({ ok: true, bot: bot || {}, jobs: { pending, processing, failed } })
    }

    if (action === 'platform-dashboard') {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const sessionCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const [{ data: maintenance, error: maintenanceError }, active, linked, activeSessions, pending, failed] = await Promise.all([
        admin.from('recordsweb_platform_state').select('*').eq('id', 'global').maybeSingle(),
        exactCount(admin.from('organisations').select('id', { count: 'exact', head: true }).eq('active', true)),
        exactCount(admin.from('recordsweb_discord_integrations').select('organisation_id', { count: 'exact', head: true })),
        exactCount(admin.from('recordsweb_security_sessions').select('id', { count: 'exact', head: true }).is('revoked_at', null).is('ended_at', null).gt('last_seen_at', sessionCutoff)),
        exactCount(admin.from('recordsweb_discord_jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
        exactCount(admin.from('recordsweb_discord_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed').gt('updated_at', dayAgo)),
      ])
      if (maintenanceError) throw maintenanceError
      return json({ ok: true, maintenance: maintenance || {}, communities: { active, discord_linked: linked }, active_sessions: activeSessions, jobs: { pending, failed } })
    }

    if (action === 'platform-communities') {
      const [active, disabled, discordLinked] = await Promise.all([
        exactCount(admin.from('organisations').select('id', { count: 'exact', head: true }).eq('active', true)),
        exactCount(admin.from('organisations').select('id', { count: 'exact', head: true }).eq('active', false)),
        exactCount(admin.from('recordsweb_discord_integrations').select('organisation_id', { count: 'exact', head: true })),
      ])
      return json({ ok: true, active, disabled, discord_linked: discordLinked })
    }

    if (action === 'platform-jobs') {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const [pending, processing, failed, sent24h] = await Promise.all([
        exactCount(admin.from('recordsweb_discord_jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
        exactCount(admin.from('recordsweb_discord_jobs').select('id', { count: 'exact', head: true }).eq('status', 'processing')),
        exactCount(admin.from('recordsweb_discord_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed')),
        exactCount(admin.from('recordsweb_discord_jobs').select('id', { count: 'exact', head: true }).eq('status', 'sent').gt('completed_at', dayAgo)),
      ])
      return json({ ok: true, pending, processing, failed, sent_24h: sent24h })
    }

    if (action === 'platform-failed') {
      const limit = integer(body.limit, 5, 1, 10)
      const { data, error } = await admin
        .from('recordsweb_discord_jobs')
        .select('id,job_type,target_guild_id,target_channel_id,target_user_id,last_error,attempts,max_attempts,updated_at')
        .eq('status', 'failed')
        .order('updated_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return json({ ok: true, failures: data || [] })
    }

    if (action === 'platform-retry-job') {
      const jobId = clean(body.job_id, 80)
      if (!jobId) return json({ error: 'job_id is required.' }, 400)
      const { data, error } = await admin.from('recordsweb_discord_jobs').update({
        status: 'pending', attempts: 0, available_at: now, claimed_at: null, claimed_by: null,
        completed_at: null, last_error: null, updated_at: now,
      }).eq('id', jobId).eq('status', 'failed').select('id').maybeSingle()
      if (error) throw error
      if (!data) return json({ error: 'Failed job not found.' }, 404)
      return json({ ok: true })
    }

    if (action === 'platform-broadcast') {
      const title = clean(body.title, 120)
      const message = clean(body.message, 1500)
      const severity = ['info', 'warning', 'critical', 'success'].includes(clean(body.severity, 20)) ? clean(body.severity, 20) : 'info'
      if (!title || !message) return json({ error: 'Broadcast title and message are required.' }, 400)
      const actorProfile = await getProfileByDiscord(admin, discordId(body.discord_user_id))
      const actorName = clean(body.discord_tag, 120) || actorProfile?.display_name || 'RecordsWeb Discord operator'

      const { data: broadcast, error: broadcastError } = await admin.from('recordsweb_discord_broadcasts').insert({
        broadcast_type: 'announcement', severity, title, message, target_scope: 'all', status: 'queued',
        created_by: actorProfile?.id || null, created_by_name: actorName, created_at: now, updated_at: now,
      }).select('id').single()
      if (broadcastError) throw broadcastError

      const { data: integrations, error: integrationsError } = await admin
        .from('recordsweb_discord_integrations')
        .select('organisation_id,guild_id,guild_name,channel_id,channel_name')
        .eq('platform_announcements_enabled', true)
      if (integrationsError) throw integrationsError

      let queued = 0
      for (const row of integrations || []) {
        if (!row.channel_id) continue
        const { data: delivery, error: deliveryError } = await admin.from('recordsweb_discord_deliveries').insert({
          broadcast_id: broadcast.id, organisation_id: row.organisation_id, guild_id: row.guild_id,
          guild_name: row.guild_name || '', channel_id: row.channel_id, channel_name: row.channel_name || '', status: 'pending', attempted_at: now,
        }).select('id').single()
        if (deliveryError) throw deliveryError
        const { error: jobError } = await admin.from('recordsweb_discord_jobs').insert({
          organisation_id: row.organisation_id, delivery_id: delivery.id, job_type: 'channel_message',
          target_guild_id: row.guild_id, target_channel_id: row.channel_id, priority: severity === 'critical' ? 10 : 100,
          payload: {
            embeds: [{ title, description: message, color: colourForSeverity(severity), footer: { text: 'RecordsWeb Platform' }, timestamp: now }],
            allowed_mentions: { parse: [] },
          },
          created_by: actorProfile?.id || null,
        })
        if (jobError) throw jobError
        queued += 1
      }
      await logSecurityEvent(admin, actorProfile, actorName, 'discord.platform.broadcast.created', severity === 'critical' ? 'high' : 'notice', message, { broadcast_id: broadcast.id, queued, severity })
      return json({ ok: true, broadcast_id: broadcast.id, queued })
    }

    if (action === 'platform-maintenance') {
      const mode = clean(body.mode, 20)
      if (!['start', 'update', 'end'].includes(mode)) return json({ error: 'mode must be start, update or end.' }, 400)
      const actorProfile = await getProfileByDiscord(admin, discordId(body.discord_user_id))
      const actorName = clean(body.discord_tag, 120) || actorProfile?.display_name || 'RecordsWeb Discord operator'
      const { data: current, error: readError } = await admin.from('recordsweb_platform_state').select('*').eq('id', 'global').maybeSingle()
      if (readError) throw readError
      const message = clean(body.message, 500) || current?.maintenance_message || 'RecordsWeb is currently unavailable while scheduled maintenance is being carried out.'
      const minutes = body.minutes == null ? null : integer(body.minutes, 0, 1, 10080)
      const enabled = mode !== 'end'
      const patch: Record<string, unknown> = {
        maintenance_enabled: enabled,
        maintenance_message: message,
        maintenance_estimated_end_at: enabled && minutes ? new Date(Date.now() + minutes * 60 * 1000).toISOString() : (mode === 'update' ? current?.maintenance_estimated_end_at || null : null),
        maintenance_enabled_at: mode === 'start' ? now : (enabled ? current?.maintenance_enabled_at || now : null),
        maintenance_enabled_by_name: enabled ? actorName : null,
        updated_at: now,
      }
      const { data, error } = await admin.from('recordsweb_platform_state').update(patch).eq('id', 'global').select('*').single()
      if (error) throw error
      await logSecurityEvent(admin, actorProfile, actorName, `system.maintenance.${mode}`, mode === 'start' ? 'high' : 'notice', message, { estimated_end_at: data.maintenance_estimated_end_at })
      return json({ ok: true, enabled: data.maintenance_enabled, estimated_end_at: data.maintenance_estimated_end_at })
    }

    if (action === 'platform-community') {
      const code = clean(body.code, 40).toUpperCase()
      const { data: organisation, error } = await admin
        .from('organisations')
        .select('id,org_code,name,system_mode,default_location,active,created_at')
        .eq('org_code', code)
        .maybeSingle()
      if (error) throw error
      if (!organisation) return json({ ok: true, organisation: null })
      const [staffCount, integrationResult] = await Promise.all([
        exactCount(admin.from('profiles').select('id', { count: 'exact', head: true }).eq('organisation_id', organisation.id).eq('active', true)),
        admin.from('recordsweb_discord_integrations').select('*').eq('organisation_id', organisation.id).maybeSingle(),
      ])
      if (integrationResult.error) throw integrationResult.error
      return json({ ok: true, organisation, staff_count: staffCount, integration: integrationResult.data || null })
    }

    if (action === 'platform-sessions') {
      const profile = await resolvePlatformTarget(admin, clean(body.user, 180))
      if (!profile) return json({ ok: true, profile: null, sessions: [] })
      const { data, error } = await admin
        .from('recordsweb_security_sessions')
        .select('id,client_type,device_hash,device_name,platform,app_version,ip_address,started_at,last_seen_at,expires_at,revoked_at,revoke_reason,ended_at,end_reason')
        .eq('user_id', profile.id)
        .order('last_seen_at', { ascending: false })
        .limit(8)
      if (error) throw error
      return json({ ok: true, profile, sessions: data || [] })
    }

    if (action === 'platform-restrict') {
      const actorProfile = await getProfileByDiscord(admin, discordId(body.discord_user_id))
      if (!actorProfile) return json({ error: 'Your Discord account must be linked to an active RecordsWeb staff profile before creating restrictions.' }, 403)
      const profile = await resolvePlatformTarget(admin, clean(body.user, 180))
      if (!profile) return json({ error: 'RecordsWeb user not found.' }, 404)
      const reason = clean(body.reason, 500)
      if (!reason) return json({ error: 'A moderation reason is required.' }, 400)
      const hours = body.hours == null ? null : integer(body.hours, 0, 1, 8760)
      const expiresAt = hours ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() : null
      const { data: ban, error } = await admin.from('recordsweb_platform_bans').insert({
        ban_type: 'account', user_id: profile.id, scope: 'platform', reason,
        created_by: actorProfile.id, created_by_name: actorProfile.display_name || actorProfile.username,
        expires_at: expiresAt, metadata: { source: 'discord_platform_command', discord_actor_id: discordId(body.discord_user_id) },
      }).select('id').single()
      if (error) throw error
      await admin.from('recordsweb_security_sessions').update({ revoked_at: now, revoked_by: actorProfile.id, revoke_reason: 'platform_account_restriction' }).eq('user_id', profile.id).is('revoked_at', null).is('ended_at', null)
      await logSecurityEvent(admin, actorProfile, clean(body.discord_tag, 120), 'platform.moderation.ban.created', 'high', reason, { ban_id: ban.id, target_user_id: profile.id, expires_at: expiresAt })
      return json({ ok: true, ban_id: ban.id, profile, expires_at: expiresAt })
    }

    if (action === 'heartbeat') {
      const botUserId = clean(body.bot_user_id, 24)
      const clientId = clean(body.client_id || botUserId, 24)
      const state = {
        id: 'primary', bot_user_id: botUserId || null, client_id: clientId || null,
        username: clean(body.username, 120) || 'RecordsWeb Bot', discriminator: clean(body.discriminator, 8) || '0',
        avatar: clean(body.avatar, 200) || null, host_name: clean(body.host_name, 120), version: clean(body.version, 40),
        status: ['starting','online','degraded'].includes(String(body.status)) ? String(body.status) : 'online',
        guild_count: integer(body.guild_count, 0, 0, 100000), websocket_ping_ms: integer(body.websocket_ping_ms, 0, 0, 600000),
        process_uptime_seconds: integer(body.process_uptime_seconds, 0, 0, 10_000_000_000),
        started_at: body.started_at || null, last_heartbeat_at: now, updated_at: now,
      }
      const { error } = await admin.from('recordsweb_discord_bot_state').upsert(state, { onConflict: 'id' })
      if (error) throw error
      return json({ ok: true, server_time: now })
    }

    if (action === 'sync-guilds') {
      const guilds = asArray(body.guilds).slice(0, 1000)
      const seenGuildIds: string[] = []
      const seenChannelIds: string[] = []

      for (const item of guilds) {
        const guildId = clean(item?.id, 24)
        if (!/^\d{17,20}$/.test(guildId)) continue
        seenGuildIds.push(guildId)
        const { error: guildError } = await admin.from('recordsweb_discord_guild_cache').upsert({
          guild_id: guildId, guild_name: clean(item?.name, 120) || 'Discord server', icon: clean(item?.icon, 200) || null,
          member_count: item?.member_count == null ? null : integer(item.member_count, 0, 0, 100000000),
          owner_id: /^\d{17,20}$/.test(clean(item?.owner_id, 24)) ? clean(item.owner_id, 24) : null,
          last_seen_at: now, updated_at: now,
        }, { onConflict: 'guild_id' })
        if (guildError) throw guildError

        for (const channel of asArray(item?.channels).slice(0, 1000)) {
          const channelId = clean(channel?.id, 24)
          if (!/^\d{17,20}$/.test(channelId)) continue
          seenChannelIds.push(channelId)
          const { error: channelError } = await admin.from('recordsweb_discord_channel_cache').upsert({
            channel_id: channelId, guild_id: guildId, channel_name: clean(channel?.name, 120) || 'channel',
            channel_type: integer(channel?.type, 0, 0, 99), position: integer(channel?.position, 0, -100000, 100000),
            last_seen_at: now, updated_at: now,
          }, { onConflict: 'channel_id' })
          if (channelError) throw channelError
        }
      }

      const { data: existingGuilds } = await admin.from('recordsweb_discord_guild_cache').select('guild_id')
      const staleGuildIds = (existingGuilds || []).map((row: any) => String(row.guild_id || '')).filter((id: string) => id && !seenGuildIds.includes(id))
      if (staleGuildIds.length) await admin.from('recordsweb_discord_guild_cache').delete().in('guild_id', staleGuildIds)
      const { data: existingChannels } = await admin.from('recordsweb_discord_channel_cache').select('channel_id')
      const staleChannelIds = (existingChannels || []).map((row: any) => String(row.channel_id || '')).filter((id: string) => id && !seenChannelIds.includes(id))
      if (staleChannelIds.length) await admin.from('recordsweb_discord_channel_cache').delete().in('channel_id', staleChannelIds)
      return json({ ok: true, guilds: seenGuildIds.length, channels: seenChannelIds.length })
    }

    if (action === 'claim-jobs') {
      await requeueStaleJobs(admin)
      const limit = integer(body.limit, 10, 1, 25)
      const worker = clean(body.worker, 120) || 'recordsweb-bot'
      const { data, error } = await admin.rpc('recordsweb_claim_discord_jobs', { p_limit: limit, p_worker: worker })
      if (error) throw error
      return json({ jobs: data || [] })
    }

    if (action === 'complete-job') {
      const jobId = clean(body.job_id, 80)
      if (!jobId) return json({ error: 'job_id is required.' }, 400)
      const result = body.result && typeof body.result === 'object' ? body.result : {}
      const { data: job, error: jobError } = await admin.from('recordsweb_discord_jobs').update({
        status: 'sent', completed_at: now, result, last_error: null, updated_at: now,
      }).eq('id', jobId).eq('status', 'processing').select('*').maybeSingle()
      if (jobError) throw jobError
      if (!job) return json({ error: 'Job was not found or is no longer processing.' }, 409)

      if (job?.payload?.redact_after_delivery === true) {
        await admin.from('recordsweb_discord_jobs').update({ payload: { redacted: true, kind: job?.payload?.kind || 'discord_delivery' }, updated_at: now }).eq('id', jobId)
      }
      if (job.delivery_id) {
        const { data: delivery, error: deliveryError } = await admin.from('recordsweb_discord_deliveries').update({
          status: 'sent', discord_message_id: clean(result?.message_id, 40) || null, error: null, delivered_at: now,
        }).eq('id', job.delivery_id).select('broadcast_id').maybeSingle()
        if (deliveryError) throw deliveryError
        if (delivery?.broadcast_id) await recomputeBroadcast(admin, String(delivery.broadcast_id))
      }
      if (job.organisation_id) {
        await admin.from('recordsweb_discord_integrations').update({ last_notification_at: now, last_error: null, updated_at: now }).eq('organisation_id', job.organisation_id)
      }
      return json({ ok: true })
    }

    if (action === 'fail-job') {
      const jobId = clean(body.job_id, 80)
      const message = clean(body.error, 1000) || 'Discord delivery failed.'
      const retryable = body.retryable !== false
      if (!jobId) return json({ error: 'job_id is required.' }, 400)
      const { data: job, error: readError } = await admin.from('recordsweb_discord_jobs').select('*').eq('id', jobId).maybeSingle()
      if (readError) throw readError
      if (!job) return json({ error: 'Job not found.' }, 404)

      const canRetry = retryable && Number(job.attempts || 0) < Number(job.max_attempts || 3)
      if (canRetry) {
        const delaySeconds = Math.min(300, Math.max(15, 15 * Math.pow(Number(job.attempts || 1), 2)))
        await admin.from('recordsweb_discord_jobs').update({
          status: 'pending', available_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
          claimed_at: null, claimed_by: null, last_error: message, updated_at: now,
        }).eq('id', jobId)
        return json({ ok: true, requeued: true, retry_in_seconds: delaySeconds })
      }

      await admin.from('recordsweb_discord_jobs').update({
        status: 'failed', completed_at: now, last_error: message,
        payload: job?.payload?.redact_after_delivery === true ? { redacted: true, kind: job?.payload?.kind || 'discord_delivery' } : job.payload,
        updated_at: now,
      }).eq('id', jobId)

      if (job.delivery_id) {
        const { data: delivery, error: deliveryError } = await admin.from('recordsweb_discord_deliveries').update({ status: 'failed', error: message }).eq('id', job.delivery_id).select('broadcast_id').maybeSingle()
        if (deliveryError) throw deliveryError
        if (delivery?.broadcast_id) await recomputeBroadcast(admin, String(delivery.broadcast_id))
      }
      if (job.organisation_id) {
        await admin.from('recordsweb_discord_integrations').update({ last_error: message.slice(0, 500), updated_at: now }).eq('organisation_id', job.organisation_id)
      }
      return json({ ok: true, requeued: false })
    }

    if (action === 'list-commands') {
      const { data, error } = await admin
        .from('recordsweb_discord_commands')
        .select('id,name,description,response,response_mode,ephemeral,enabled,show_in_help,accent_color,updated_at')
        .eq('enabled', true)
        .order('name')
      if (error) throw error
      return json({ commands: data || [] })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (error) {
    console.error('recordsweb-bot-api', error)
    return json({ error: error instanceof Error ? error.message : 'RecordsWeb Bot API failed.' }, 500)
  }
})
