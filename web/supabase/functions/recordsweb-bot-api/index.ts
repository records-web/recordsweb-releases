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
        status: 'failed',
        completed_at: now,
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
        status: 'pending',
        available_at: now,
        claimed_at: null,
        claimed_by: null,
        last_error: 'Previous worker claim expired; automatically requeued.',
        updated_at: now,
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

    if (action === 'heartbeat') {
      const botUserId = clean(body.bot_user_id, 24)
      const clientId = clean(body.client_id || botUserId, 24)
      const state = {
        id: 'primary',
        bot_user_id: botUserId || null,
        client_id: clientId || null,
        username: clean(body.username, 120) || 'RecordsWeb Bot',
        discriminator: clean(body.discriminator, 8) || '0',
        avatar: clean(body.avatar, 200) || null,
        host_name: clean(body.host_name, 120),
        version: clean(body.version, 40),
        status: ['starting','online','degraded'].includes(String(body.status)) ? String(body.status) : 'online',
        guild_count: integer(body.guild_count, 0, 0, 100000),
        websocket_ping_ms: integer(body.websocket_ping_ms, 0, 0, 600000),
        process_uptime_seconds: integer(body.process_uptime_seconds, 0, 0, 10_000_000_000),
        started_at: body.started_at || null,
        last_heartbeat_at: now,
        updated_at: now,
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
          guild_id: guildId,
          guild_name: clean(item?.name, 120) || 'Discord server',
          icon: clean(item?.icon, 200) || null,
          member_count: item?.member_count == null ? null : integer(item.member_count, 0, 0, 100000000),
          owner_id: /^\d{17,20}$/.test(clean(item?.owner_id, 24)) ? clean(item.owner_id, 24) : null,
          last_seen_at: now,
          updated_at: now,
        }, { onConflict: 'guild_id' })
        if (guildError) throw guildError

        for (const channel of asArray(item?.channels).slice(0, 1000)) {
          const channelId = clean(channel?.id, 24)
          if (!/^\d{17,20}$/.test(channelId)) continue
          seenChannelIds.push(channelId)
          const { error: channelError } = await admin.from('recordsweb_discord_channel_cache').upsert({
            channel_id: channelId,
            guild_id: guildId,
            channel_name: clean(channel?.name, 120) || 'channel',
            channel_type: integer(channel?.type, 0, 0, 99),
            position: integer(channel?.position, 0, -100000, 100000),
            last_seen_at: now,
            updated_at: now,
          }, { onConflict: 'channel_id' })
          if (channelError) throw channelError
        }
      }

      const { data: existingGuilds } = await admin.from('recordsweb_discord_guild_cache').select('guild_id')
      const staleGuildIds = (existingGuilds || []).map((row: any) => String(row.guild_id || '')).filter((id: string) => id && !seenGuildIds.includes(id))
      if (staleGuildIds.length) await admin.from('recordsweb_discord_guild_cache').delete().in('guild_id', staleGuildIds)

      // Channels cascade when a guild is removed. Remove channels that no longer
      // appear in the current bot inventory as well.
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
        status: 'sent',
        completed_at: now,
        result,
        last_error: null,
        updated_at: now,
      }).eq('id', jobId).eq('status', 'processing').select('*').maybeSingle()
      if (jobError) throw jobError
      if (!job) return json({ error: 'Job was not found or is no longer processing.' }, 409)

      if (job?.payload?.redact_after_delivery === true) {
        await admin.from('recordsweb_discord_jobs').update({ payload: { redacted: true, kind: job?.payload?.kind || 'discord_delivery' }, updated_at: now }).eq('id', jobId)
      }

      if (job.delivery_id) {
        const { data: delivery, error: deliveryError } = await admin.from('recordsweb_discord_deliveries').update({
          status: 'sent',
          discord_message_id: clean(result?.message_id, 40) || null,
          error: null,
          delivered_at: now,
        }).eq('id', job.delivery_id).select('broadcast_id').maybeSingle()
        if (deliveryError) throw deliveryError
        if (delivery?.broadcast_id) await recomputeBroadcast(admin, String(delivery.broadcast_id))
      }
      if (job.organisation_id) {
        await admin.from('recordsweb_discord_integrations').update({
          last_notification_at: now,
          last_error: null,
          updated_at: now,
        }).eq('organisation_id', job.organisation_id)
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
          status: 'pending',
          available_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
          claimed_at: null,
          claimed_by: null,
          last_error: message,
          updated_at: now,
        }).eq('id', jobId)
        return json({ ok: true, requeued: true, retry_in_seconds: delaySeconds })
      }

      await admin.from('recordsweb_discord_jobs').update({
        status: 'failed',
        completed_at: now,
        last_error: message,
        payload: job?.payload?.redact_after_delivery === true ? { redacted: true, kind: job?.payload?.kind || 'discord_delivery' } : job.payload,
        updated_at: now,
      }).eq('id', jobId)

      if (job.delivery_id) {
        const { data: delivery, error: deliveryError } = await admin.from('recordsweb_discord_deliveries').update({
          status: 'failed',
          error: message,
        }).eq('id', job.delivery_id).select('broadcast_id').maybeSingle()
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
