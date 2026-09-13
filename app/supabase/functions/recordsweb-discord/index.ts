import { createClient } from 'npm:@supabase/supabase-js@2'
import React from 'npm:react@^19'
import { ImageResponse } from 'npm:@vercel/og@^0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DISCORD_API = 'https://discord.com/api/v10'
const BOT_PERMISSIONS = '19456' // View Channel + Send Messages + Embed Links
const OPERATOR_EMAIL_PATTERN = /^(?:gus\.farnsworth|alfie\.james)@[a-z]{2}\.[a-z]{2}$/i

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Server configuration error: ${name} is unavailable.`)
  return value
}

function snowflake(value: unknown, label: string) {
  const clean = String(value || '').trim()
  if (!/^\d{17,20}$/.test(clean)) {
    const error = new Error(`${label} must be a 17–20 digit Discord ID.`) as Error & { status?: number }
    error.status = 400
    throw error
  }
  return clean
}

function cleanText(value: unknown, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

const COMMON_PASSWORDS = new Set(['password123','password1','qwerty123','letmein123','welcome123','recordsweb1','groveway123','changeme123','admin12345','1234567890'])

function validatePassword(password: string, username = '') {
  if (password.length < 10) return 'Password must contain at least 10 characters.'
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Password must contain at least one letter and one number.'
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'Choose a less common password.'
  const local = String(username || '').split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase()
  if (local.length >= 5 && password.replace(/[^a-z0-9]/gi, '').toLowerCase().includes(local)) return 'Password must not contain the RecordsWeb username.'
  return ''
}

const h = React.createElement

function loginField(label: string, value: string, mono = false) {
  return h('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      width: '100%',
      marginBottom: 22,
    },
  },
    h('div', {
      style: {
        display: 'flex',
        width: 205,
        color: '#f0f7fb',
        fontSize: 22,
        fontWeight: 600,
      },
    }, label),
    h('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        width: 650,
        height: 64,
        padding: '0 22px',
        border: '1px solid #436274',
        background: '#0d1b23',
        color: '#dceaf2',
        fontSize: 24,
        fontWeight: mono ? 600 : 500,
        fontFamily: mono ? 'monospace' : 'sans-serif',
      },
    }, value || '—'),
  )
}

let recordsWebLogoDataUri: string | null = null

async function getRecordsWebLogoDataUri() {
  if (recordsWebLogoDataUri) return recordsWebLogoDataUri
  const logoUrl = String(Deno.env.get('RECORDSWEB_LOGO_URL') || 'https://cdn.recordsweb.org/RW-Logo.png').trim()
  const response = await fetch(logoUrl, { headers: { 'User-Agent': 'RecordsWeb-Bot/3.8.0' } })
  if (!response.ok) {
    throw Object.assign(new Error(`Unable to load the official RecordsWeb logo (HTTP ${response.status}).`), { status: 502 })
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)))
  }
  recordsWebLogoDataUri = `data:image/png;base64,${btoa(binary)}`
  return recordsWebLogoDataUri
}

async function renderRecordsWebLoginCard(payload: {
  username: string
  temporaryPassword: string
  organisationName: string
  organisationCode: string
  publicUrl: string
  version: string
}) {
  const { username, temporaryPassword, organisationName, organisationCode, publicUrl, version } = payload
  const logoDataUri = await getRecordsWebLogoDataUri()
  const staffArea = publicUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '')

  const element = h('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      background: '#0d171d',
      color: '#ffffff',
      fontFamily: 'sans-serif',
    },
  },
    h('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#101c23',
      },
    },
      h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          minHeight: 150,
          padding: '24px 34px 18px',
          background: '#101c23',
        },
      },
        h('img', {
          src: logoDataUri,
          width: 360,
          height: 120,
          style: {
            objectFit: 'contain',
            objectPosition: 'left center',
          },
        }),
        h('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: 6,
            maxWidth: 520,
          },
        },
          h('div', { style: { color: '#73a8c7', fontSize: 15, textAlign: 'right' } }, `RecordsWeb ${version} · Desktop Clinical System`),
          h('div', { style: { color: '#ffffff', fontSize: 29, fontWeight: 800, textAlign: 'right' } }, organisationName),
          h('div', { style: { color: '#64a8d0', fontSize: 17, textAlign: 'right' } }, 'Health care records'),
        ),
      ),

      h('div', { style: { display: 'flex', width: '100%', height: 4, background: '#078ce1' } }),

      h('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          padding: '38px 58px 30px',
          background: '#101c23',
        },
      },
        h('div', {
          style: {
            display: 'flex',
            color: '#ffffff',
            fontSize: 27,
            fontWeight: 800,
            marginBottom: 34,
          },
        }, 'Your RecordsWeb login details'),

        loginField('Username', username, true),
        loginField('Temporary password', temporaryPassword, true),

        h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            marginLeft: 205,
            gap: 18,
            marginTop: 4,
          },
        },
          h('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 176,
              height: 58,
              border: '1px solid #5e8094',
              background: '#1a3545',
              color: '#ffffff',
              fontSize: 21,
              fontWeight: 700,
            },
          }, 'Sign in'),
          h('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 176,
              height: 58,
              border: '1px solid #5e8094',
              background: '#142832',
              color: '#ffffff',
              fontSize: 21,
              fontWeight: 700,
            },
          }, 'Close'),
        ),

        h('div', {
          style: {
            display: 'flex',
            marginLeft: 205,
            gap: 34,
            marginTop: 25,
            color: '#1b9bf0',
            fontSize: 17,
          },
        },
          h('div', null, `Staff area: ${staffArea}`),
          h('div', null, 'Change password after sign-in'),
        ),
      ),

      h('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          borderTop: '1px solid #355264',
          background: '#10222c',
        },
      },
        h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 66,
            padding: '0 30px',
            borderBottom: '1px solid #355264',
            color: '#a8cee5',
            fontSize: 16,
          },
        },
          h('div', null, 'Connection: RecordsWeb Supabase'),
          h('div', { style: { display: 'flex', gap: 20 } },
            h('div', null, `Organisation: ${organisationCode}`),
            h('div', { style: { color: '#1b9bf0' } }, 'Keep credentials private'),
          ),
        ),
        h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            minHeight: 74,
            padding: '0 30px',
            color: '#7fa4ba',
            fontSize: 14,
            lineHeight: 1.4,
          },
        }, `${organisationName} · RecordsWeb temporary staff credentials. Sign in with the password above, then choose a new password when prompted. Do not share this image.`),
      ),
    ),
  )

  const response = new ImageResponse(element as any, { width: 1200, height: 900 })
  if (!response.ok) throw Object.assign(new Error(`Unable to generate RecordsWeb login image (HTTP ${response.status}).`), { status: 502 })
  return new Uint8Array(await response.arrayBuffer())
}


async function discordMultipartRequest(path: string, payload: Record<string, unknown>, imageBytes: Uint8Array, filename: string) {
  const token = requiredEnv('RECORDSWEB_DISCORD_BOT_TOKEN')
  const form = new FormData()
  form.append('payload_json', JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }))
  form.append('files[0]', new Blob([imageBytes], { type: 'image/png' }), filename)
  const response = await fetch(`${DISCORD_API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bot ${token}` },
    body: form,
  })
  const raw = await response.text()
  let data: any = null
  try { data = raw ? JSON.parse(raw) : null } catch { data = raw }
  if (!response.ok) {
    const detail = data?.message || (typeof data === 'string' ? data : '') || `Discord returned HTTP ${response.status}.`
    const error = new Error(detail) as Error & { status?: number, code?: unknown }
    error.status = response.status
    error.code = data?.code
    throw error
  }
  return data
}

async function sendRecordsWebLoginImageDm(payload: {
  discordUserId: string
  username: string
  temporaryPassword: string
  organisationName: string
  organisationCode: string
  publicUrl: string
  version: string
}) {
  const dm = await discordRequest('/users/@me/channels', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: payload.discordUserId }),
  })
  const image = await renderRecordsWebLoginCard(payload)
  const filename = 'recordsweb-login-details.png'

  // v3.4.2 deliberately sends ONLY the generated RecordsWeb image.
  // No Discord content, embed, fields or fallback credential message is sent.
  return discordMultipartRequest(`/channels/${String(dm.id)}/messages`, {
    attachments: [{ id: 0, filename, description: 'RecordsWeb temporary login details' }],
  }, image, filename)
}


function formatDiscordDate(value: unknown) {
  if (!value) return 'Not specified'
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return 'Not specified'
  return `<t:${Math.floor(date.getTime() / 1000)}:F> (<t:${Math.floor(date.getTime() / 1000)}:R>)`
}

async function discordRequest(path: string, init: RequestInit = {}) {
  const token = requiredEnv('RECORDSWEB_DISCORD_BOT_TOKEN')
  const response = await fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const raw = await response.text()
  let data: any = null
  try { data = raw ? JSON.parse(raw) : null } catch { data = raw }
  if (!response.ok) {
    const detail = data?.message || (typeof data === 'string' ? data : '') || `Discord returned HTTP ${response.status}.`
    const error = new Error(detail) as Error & { status?: number, code?: unknown }
    error.status = response.status
    error.code = data?.code
    throw error
  }
  return data
}

async function getBotIdentity() {
  const bot = await discordRequest('/users/@me')
  const clientId = String(Deno.env.get('RECORDSWEB_DISCORD_CLIENT_ID') || bot?.id || '').trim()
  return {
    id: String(bot?.id || ''),
    username: String(bot?.username || 'RecordsWeb Bot'),
    discriminator: String(bot?.discriminator || '0'),
    avatar: bot?.avatar || null,
    client_id: clientId,
    invite_url: clientId
      ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&permissions=${BOT_PERMISSIONS}&scope=bot%20applications.commands`
      : '',
  }
}

async function discoverGuild(guildId: string) {
  const guild = await discordRequest(`/guilds/${guildId}`)
  const allChannels = await discordRequest(`/guilds/${guildId}/channels`)
  const channels = (Array.isArray(allChannels) ? allChannels : [])
    .filter((channel: any) => [0, 5].includes(Number(channel.type)))
    .sort((a: any, b: any) => Number(a.position || 0) - Number(b.position || 0) || String(a.name || '').localeCompare(String(b.name || '')))
    .map((channel: any) => ({ id: String(channel.id), name: String(channel.name || 'channel'), type: Number(channel.type) }))
  return { guild: { id: String(guild.id), name: String(guild.name || 'Discord server'), icon: guild.icon || null }, channels }
}

async function verifyChannel(guildId: string, channelId: string) {
  const channel = await discordRequest(`/channels/${channelId}`)
  if (String(channel?.guild_id || '') !== guildId) throw new Error('The selected channel does not belong to that Discord server.')
  if (![0, 5].includes(Number(channel?.type))) throw new Error('Choose a Discord text or announcement channel for maintenance messages.')
  return { id: String(channel.id), name: String(channel.name || 'channel'), type: Number(channel.type) }
}

async function sendMessage(channelId: string, payload: Record<string, unknown>) {
  return discordRequest(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }),
  })
}

async function writeAudit(admin: any, caller: any, action: string, entityType: string, entityId: string | null, description: string, metadata: Record<string, unknown> = {}) {
  try {
    await admin.from('audit_log').insert({
      organisation_id: caller.organisation_id,
      actor_id: caller.id,
      actor_name: caller.display_name,
      actor_role: caller.role,
      action,
      entity_type: entityType,
      entity_id: entityId,
      description,
      metadata,
    })
  } catch (error) {
    console.warn('RecordsWeb Discord audit write failed', error)
  }
}

async function getIntegration(admin: any, organisationId: string) {
  const { data, error } = await admin
    .from('recordsweb_discord_integrations')
    .select('*')
    .eq('organisation_id', organisationId)
    .maybeSingle()
  if (error) {
    if (/does not exist|schema cache|recordsweb_discord_integrations/i.test(error.message || '')) {
      throw new Error('Discord integration is not installed in Supabase. Run supabase/recordsweb-3.4.0-discord-integration.sql.')
    }
    throw error
  }
  return data
}

function integrationPayload(row: any) {
  if (!row) return null
  return {
    organisation_id: row.organisation_id,
    guild_id: row.guild_id,
    guild_name: row.guild_name,
    channel_id: row.channel_id,
    channel_name: row.channel_name,
    maintenance_notifications: row.maintenance_notifications !== false,
    platform_announcements_enabled: row.platform_announcements_enabled !== false,
    critical_notifications_enabled: row.critical_notifications_enabled !== false,
    login_dm_enabled: row.login_dm_enabled !== false,
    verified_at: row.verified_at,
    connected_by_name: row.connected_by_name,
    last_notification_at: row.last_notification_at,
    last_health_check_at: row.last_health_check_at || null,
    last_error: row.last_error,
    updated_at: row.updated_at,
  }
}

async function getSessionContext(admin: any, token: string) {
  const { data: callerData, error: callerError } = await admin.auth.getUser(token)
  if (callerError || !callerData.user) throw Object.assign(new Error('Unauthorised session.'), { status: 401 })
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id,organisation_id,is_management,active,display_name,role,username,organisations!inner(id,org_code,name,active)')
    .eq('id', callerData.user.id)
    .single()
  if (error || !profile) throw Object.assign(new Error('Unable to verify the RecordsWeb account.'), { status: 403 })
  const organisation = (profile as any).organisations
  if (!profile.active || !organisation?.active) throw Object.assign(new Error('This RecordsWeb account or community is inactive.'), { status: 403 })
  return { user: callerData.user, profile, organisation }
}

function platformOperator(context: any) {
  const email = String(context?.user?.email || '').trim().toLowerCase()
  const orgCode = String(context?.organisation?.org_code || '').trim().toLowerCase()
  const emailCode = email.split('@')[1] || ''
  return Boolean(OPERATOR_EMAIL_PATTERN.test(email) && orgCode && orgCode === emailCode)
}

async function botStatusSafe() {
  try { return { configured: true, bot: await getBotIdentity(), error: '' } }
  catch (error) {
    const message = error instanceof Error ? error.message : 'RecordsWeb Bot is unavailable.'
    if (/RECORDSWEB_DISCORD_BOT_TOKEN|configuration error/i.test(message)) return { configured: false, bot: null, error: message }
    return { configured: true, bot: null, error: message }
  }
}


function relationOne(value: any) {
  return Array.isArray(value) ? value[0] || null : value || null
}

function discordBroadcastColour(severity: string, type: string) {
  if (severity === 'critical' || type === 'critical' || type === 'incident') return 0xB91C1C
  if (severity === 'warning' || type.startsWith('maintenance_')) return 0xD97706
  if (severity === 'success' || type === 'maintenance_complete') return 0x15803D
  return 0x0F6FBD
}

function discordBroadcastTitle(type: string, requested: string) {
  const clean = cleanText(requested, 120)
  if (clean) return clean
  const defaults: Record<string, string> = {
    announcement: 'RecordsWeb announcement',
    incident: 'RecordsWeb service incident',
    critical: 'Critical RecordsWeb notice',
    maintenance_planned: 'Planned RecordsWeb Maintenance',
    maintenance_started: 'RecordsWeb maintenance has started',
    maintenance_update: 'RecordsWeb maintenance update',
    maintenance_complete: 'RecordsWeb maintenance complete',
  }
  return defaults[type] || 'RecordsWeb platform notice'
}

function discordBroadcastEmbed(broadcast: any, organisation: any, operatorName: string) {
  const publicBase = String(Deno.env.get('RECORDSWEB_PUBLIC_URL') || 'https://www.recordsweb.org').replace(/\/$/, '')
  const statusUrl = `${publicBase}/#/status`
  const fields: any[] = []
  if (broadcast.starts_at) fields.push({ name: 'Starts', value: formatDiscordDate(broadcast.starts_at), inline: true })
  if (broadcast.ends_at) fields.push({ name: 'Expected end', value: formatDiscordDate(broadcast.ends_at), inline: true })
  if (Array.isArray(broadcast.affected_services) && broadcast.affected_services.length) {
    fields.push({ name: 'Affected services', value: broadcast.affected_services.map((item: string) => `• ${cleanText(item, 80)}`).join('\n').slice(0, 1024), inline: false })
  }
  fields.push({ name: 'Community', value: `${organisation?.name || 'RecordsWeb community'} (@${organisation?.org_code || 'XX.XX'})`, inline: false })
  return {
    title: discordBroadcastTitle(String(broadcast.broadcast_type || ''), String(broadcast.title || '')),
    description: cleanText(broadcast.message, 1800),
    color: discordBroadcastColour(String(broadcast.severity || 'info'), String(broadcast.broadcast_type || 'announcement')),
    fields,
    url: statusUrl,
    footer: { text: `RecordsWeb Platform Operations${operatorName ? ` · ${operatorName}` : ''}` },
    timestamp: new Date().toISOString(),
  }
}

async function platformIntegrationRows(admin: any) {
  const { data, error } = await admin
    .from('recordsweb_discord_integrations')
    .select('*, organisations!inner(id,name,org_code,system_mode,active)')
    .eq('organisations.active', true)
    .order('updated_at', { ascending: false })
  if (error) {
    if (/does not exist|schema cache|recordsweb_discord_integrations/i.test(error.message || '')) {
      throw new Error('Discord integration is not installed in Supabase. Run the RecordsWeb Discord migrations first.')
    }
    throw error
  }
  return data || []
}

function flattenedIntegration(row: any) {
  const org = relationOne(row.organisations)
  return {
    organisation_id: row.organisation_id,
    organisation_name: org?.name || 'RecordsWeb community',
    organisation_code: org?.org_code || '',
    system_mode: org?.system_mode || 'general_practice',
    guild_id: row.guild_id,
    guild_name: row.guild_name,
    channel_id: row.channel_id,
    channel_name: row.channel_name,
    maintenance_notifications: row.maintenance_notifications !== false,
    platform_announcements_enabled: row.platform_announcements_enabled !== false,
    critical_notifications_enabled: row.critical_notifications_enabled !== false,
    login_dm_enabled: row.login_dm_enabled !== false,
    verified_at: row.verified_at,
    last_health_check_at: row.last_health_check_at || null,
    last_notification_at: row.last_notification_at,
    last_error: row.last_error,
    updated_at: row.updated_at,
  }
}

function broadcastAllowedForIntegration(row: any, type: string) {
  if (type.startsWith('maintenance_')) return row.maintenance_notifications !== false
  if (type === 'critical' || type === 'incident') return row.critical_notifications_enabled !== false
  return row.platform_announcements_enabled !== false
}

function targetIntegration(row: any, broadcast: any, forcedOrganisationIds: string[] | null = null) {
  const org = relationOne(row.organisations)
  const orgId = String(row.organisation_id || '')
  if (forcedOrganisationIds) return forcedOrganisationIds.includes(orgId)
  if (broadcast.target_scope === 'selected') return (broadcast.target_organisation_ids || []).map(String).includes(orgId)
  if (broadcast.target_scope === 'modes') return (broadcast.target_modes || []).map(String).includes(String(org?.system_mode || 'general_practice'))
  return true
}

async function createPlatformBroadcast(admin: any, context: any, input: any) {
  const broadcastType = cleanText(input.broadcast_type, 60) || 'announcement'
  const severity = cleanText(input.severity, 30) || 'info'
  const title = discordBroadcastTitle(broadcastType, input.title)
  const message = cleanText(input.message, 1800)
  if (!message) throw Object.assign(new Error('Enter a Discord broadcast message.'), { status: 400 })
  const targetScope = ['all','modes','selected'].includes(String(input.target_scope)) ? String(input.target_scope) : 'all'
  const targetModes = Array.isArray(input.target_modes) ? input.target_modes.map((x: unknown) => cleanText(x, 40)).filter(Boolean).slice(0, 10) : []
  const targetOrganisationIds = Array.isArray(input.target_organisation_ids) ? input.target_organisation_ids.map((x: unknown) => cleanText(x, 80)).filter(Boolean).slice(0, 200) : []
  const affectedServices = Array.isArray(input.affected_services) ? input.affected_services.map((x: unknown) => cleanText(x, 80)).filter(Boolean).slice(0, 20) : []
  if (targetScope === 'modes' && !targetModes.length) throw Object.assign(new Error('Select at least one care setting.'), { status: 400 })
  if (targetScope === 'selected' && !targetOrganisationIds.length) throw Object.assign(new Error('Select at least one community.'), { status: 400 })

  const row = {
    broadcast_type: broadcastType,
    severity,
    title,
    message,
    target_scope: targetScope,
    target_modes: targetModes,
    target_organisation_ids: targetOrganisationIds,
    affected_services: affectedServices,
    starts_at: input.starts_at || null,
    ends_at: input.ends_at || null,
    status: 'sending',
    created_by: context.profile.id,
    created_by_name: context.profile.display_name || context.user.email || 'Platform operator',
  }
  const { data, error } = await admin.from('recordsweb_discord_broadcasts').insert(row).select('*').single()
  if (error) {
    if (/does not exist|schema cache|recordsweb_discord_broadcasts/i.test(error.message || '')) {
      throw new Error('Platform Discord Operations is not installed in Supabase. Run supabase/recordsweb-3.8.0-platform-discord-operations.sql.')
    }
    throw error
  }
  return data
}

async function deliverPlatformBroadcast(admin: any, context: any, broadcast: any, forcedOrganisationIds: string[] | null = null) {
  const integrations = await platformIntegrationRows(admin)
  const targets = integrations.filter((row: any) => targetIntegration(row, broadcast, forcedOrganisationIds))
  let sent = 0
  let failed = 0
  let skipped = 0
  const failures: Array<{ organisation_id: string, error: string }> = []

  for (const row of targets) {
    const org = relationOne(row.organisations)
    if (!broadcastAllowedForIntegration(row, String(broadcast.broadcast_type || 'announcement'))) {
      skipped += 1
      await admin.from('recordsweb_discord_deliveries').insert({
        broadcast_id: broadcast.id,
        organisation_id: row.organisation_id,
        guild_id: row.guild_id,
        guild_name: row.guild_name || '',
        channel_id: row.channel_id,
        channel_name: row.channel_name || '',
        status: 'skipped',
        error: 'Community notification preference disabled for this broadcast type.',
      })
      continue
    }

    try {
      const result = await sendMessage(String(row.channel_id), { embeds: [discordBroadcastEmbed(broadcast, org, context.profile.display_name || '')] })
      sent += 1
      await admin.from('recordsweb_discord_deliveries').insert({
        broadcast_id: broadcast.id,
        organisation_id: row.organisation_id,
        guild_id: row.guild_id,
        guild_name: row.guild_name || '',
        channel_id: row.channel_id,
        channel_name: row.channel_name || '',
        status: 'sent',
        discord_message_id: String(result?.id || ''),
        delivered_at: new Date().toISOString(),
      })
      await admin.from('recordsweb_discord_integrations').update({ last_notification_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq('organisation_id', row.organisation_id)
    } catch (error) {
      failed += 1
      const message = error instanceof Error ? error.message : 'Discord notification failed.'
      failures.push({ organisation_id: String(row.organisation_id), error: message })
      await admin.from('recordsweb_discord_deliveries').insert({
        broadcast_id: broadcast.id,
        organisation_id: row.organisation_id,
        guild_id: row.guild_id,
        guild_name: row.guild_name || '',
        channel_id: row.channel_id,
        channel_name: row.channel_name || '',
        status: 'failed',
        error: message.slice(0, 1000),
      })
      await admin.from('recordsweb_discord_integrations').update({ last_error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq('organisation_id', row.organisation_id)
    }
  }

  const finalStatus = failed === 0 ? 'sent' : sent > 0 ? 'partial' : 'failed'
  await admin.from('recordsweb_discord_broadcasts').update({ status: finalStatus, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', broadcast.id)
  await writeAudit(admin, context.profile, 'platform.discord.broadcast.sent', 'discord_broadcast', broadcast.id, `Sent ${broadcast.broadcast_type} Discord broadcast to ${sent} community channel(s); ${failed} failed; ${skipped} skipped.`, { sent, failed, skipped, broadcast_type: broadcast.broadcast_type })
  return { ok: failed === 0, broadcast_id: broadcast.id, sent, failed, skipped, failures }
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
    const context = await getSessionContext(admin, token)
    const body = await req.json().catch(() => ({}))
    const action = cleanText(body.action, 80)

    if (action === 'broadcast-maintenance') {
      if (!platformOperator(context)) return json({ error: 'RecordsWeb platform operator permission is required.' }, 403)
      const botState = await botStatusSafe()
      if (!botState.configured || !botState.bot) return json({ ok: false, configured: botState.configured, error: botState.error || 'RecordsWeb Bot is unavailable.', sent: 0, failed: 0 }, 200)
      const enabled = Boolean(body.enabled)
      const broadcast = await createPlatformBroadcast(admin, context, {
        broadcast_type: enabled ? 'maintenance_started' : 'maintenance_complete',
        severity: enabled ? 'warning' : 'success',
        title: enabled ? 'RecordsWeb platform maintenance' : 'RecordsWeb maintenance complete',
        message: enabled
          ? (cleanText(body.message, 1800) || 'RecordsWeb is currently unavailable while scheduled maintenance is being carried out.')
          : 'RecordsWeb is available again. Staff can sign in normally.',
        target_scope: 'all',
        affected_services: enabled ? ['RecordsWeb staff website', 'Desktop clinical system'] : [],
        ends_at: enabled ? (body.estimated_end_at || null) : null,
      })
      return json({ configured: true, ...(await deliverPlatformBroadcast(admin, context, broadcast)) })
    }

    if (action === 'platform-overview') {
      if (!platformOperator(context)) return json({ error: 'RecordsWeb platform operator permission is required.' }, 403)
      const botState = await botStatusSafe()
      const integrations = await platformIntegrationRows(admin)
      const { count: activeCommunityCount } = await admin.from('organisations').select('id', { count: 'exact', head: true }).eq('active', true)
      const midnight = new Date(); midnight.setUTCHours(0, 0, 0, 0)
      const { data: todayRows, error: todayError } = await admin.from('recordsweb_discord_deliveries').select('status').gte('attempted_at', midnight.toISOString())
      if (todayError && /does not exist|schema cache/i.test(todayError.message || '')) throw new Error('Platform Discord Operations is not installed in Supabase. Run supabase/recordsweb-3.8.0-platform-discord-operations.sql.')
      if (todayError) throw todayError
      return json({
        configured: botState.configured,
        bot: botState.bot,
        error: botState.error || '',
        counts: {
          connected: integrations.length,
          status_channels: integrations.filter((row: any) => row.channel_id).length,
          missing: Math.max(0, Number(activeCommunityCount || 0) - integrations.length),
          sent_today: (todayRows || []).filter((row: any) => row.status === 'sent').length,
          failed_today: (todayRows || []).filter((row: any) => row.status === 'failed').length,
        },
      })
    }

    if (action === 'platform-integrations') {
      if (!platformOperator(context)) return json({ error: 'RecordsWeb platform operator permission is required.' }, 403)
      const rows = await platformIntegrationRows(admin)
      return json({ integrations: rows.map(flattenedIntegration) })
    }

    if (action === 'platform-logs') {
      if (!platformOperator(context)) return json({ error: 'RecordsWeb platform operator permission is required.' }, 403)
      const limit = Math.max(1, Math.min(500, Number(body.limit || 250)))
      const { data, error } = await admin
        .from('recordsweb_discord_deliveries')
        .select('*, recordsweb_discord_broadcasts(title,broadcast_type,severity), organisations(name,org_code)')
        .order('attempted_at', { ascending: false })
        .limit(limit)
      if (error) {
        if (/does not exist|schema cache/i.test(error.message || '')) throw new Error('Platform Discord Operations is not installed in Supabase. Run supabase/recordsweb-3.8.0-platform-discord-operations.sql.')
        throw error
      }
      const logs = (data || []).map((row: any) => {
        const broadcast = relationOne(row.recordsweb_discord_broadcasts)
        const org = relationOne(row.organisations)
        return {
          id: row.id,
          broadcast_id: row.broadcast_id,
          broadcast_title: broadcast?.title || '',
          broadcast_type: broadcast?.broadcast_type || '',
          severity: broadcast?.severity || '',
          organisation_id: row.organisation_id,
          organisation_name: org?.name || '',
          organisation_code: org?.org_code || '',
          guild_id: row.guild_id,
          guild_name: row.guild_name,
          channel_id: row.channel_id,
          channel_name: row.channel_name,
          status: row.status,
          discord_message_id: row.discord_message_id,
          error: row.error,
          attempted_at: row.attempted_at,
          delivered_at: row.delivered_at,
        }
      })
      return json({ logs })
    }

    if (action === 'platform-health-check') {
      if (!platformOperator(context)) return json({ error: 'RecordsWeb platform operator permission is required.' }, 403)
      const botState = await botStatusSafe()
      if (!botState.configured || !botState.bot) return json({ error: botState.error || 'RecordsWeb Bot is unavailable.' }, 503)
      const rows = await platformIntegrationRows(admin)
      let failed = 0
      const results: any[] = []
      for (const row of rows) {
        try {
          const channel = await verifyChannel(String(row.guild_id), String(row.channel_id))
          const now = new Date().toISOString()
          await admin.from('recordsweb_discord_integrations').update({ channel_name: channel.name, verified_at: now, last_health_check_at: now, last_error: null, updated_at: now }).eq('organisation_id', row.organisation_id)
          results.push({ organisation_id: row.organisation_id, ok: true })
        } catch (error) {
          failed += 1
          const message = error instanceof Error ? error.message : 'Discord connection check failed.'
          const now = new Date().toISOString()
          await admin.from('recordsweb_discord_integrations').update({ last_health_check_at: now, last_error: message.slice(0, 500), updated_at: now }).eq('organisation_id', row.organisation_id)
          results.push({ organisation_id: row.organisation_id, ok: false, error: message })
        }
      }
      await writeAudit(admin, context.profile, 'platform.discord.health_check', 'discord', null, `Checked ${rows.length} Discord integration(s); ${failed} failed.`, { checked: rows.length, failed })
      return json({ ok: failed === 0, checked: rows.length, failed, results })
    }

    if (action === 'platform-send-test') {
      if (!platformOperator(context)) return json({ error: 'RecordsWeb platform operator permission is required.' }, 403)
      const organisationId = cleanText(body.organisation_id, 80)
      const rows = await platformIntegrationRows(admin)
      const row = rows.find((item: any) => String(item.organisation_id) === organisationId)
      if (!row) return json({ error: 'That community does not have a configured Discord status channel.' }, 404)
      const org = relationOne(row.organisations)
      const result = await sendMessage(String(row.channel_id), { embeds: [{
        title: 'RecordsWeb Platform Management test',
        description: 'This is a test message from RecordsWeb Platform Management. This channel is configured correctly for platform notices.',
        color: 0x0F6FBD,
        fields: [{ name: 'Community', value: `${org?.name || 'RecordsWeb community'} (@${org?.org_code || 'XX.XX'})`, inline: false }],
        footer: { text: `RecordsWeb Platform Operations · ${context.profile.display_name || 'Operator'}` },
        timestamp: new Date().toISOString(),
      }] })
      const now = new Date().toISOString()
      await admin.from('recordsweb_discord_integrations').update({ verified_at: now, last_health_check_at: now, last_error: null, updated_at: now }).eq('organisation_id', row.organisation_id)
      await writeAudit(admin, context.profile, 'platform.discord.test', 'organisation', row.organisation_id, `Sent a platform Discord test to ${org?.name || 'community'} #${row.channel_name || row.channel_id}.`)
      return json({ ok: true, message_id: String(result?.id || '') })
    }

    if (action === 'platform-broadcast') {
      if (!platformOperator(context)) return json({ error: 'RecordsWeb platform operator permission is required.' }, 403)
      const botState = await botStatusSafe()
      if (!botState.configured || !botState.bot) return json({ error: botState.error || 'RecordsWeb Bot is unavailable.' }, 503)
      const broadcast = await createPlatformBroadcast(admin, context, body)
      return json(await deliverPlatformBroadcast(admin, context, broadcast))
    }

    if (action === 'platform-retry-broadcast') {
      if (!platformOperator(context)) return json({ error: 'RecordsWeb platform operator permission is required.' }, 403)
      const broadcastId = cleanText(body.broadcast_id, 80)
      if (!broadcastId) return json({ error: 'Broadcast id is required.' }, 400)
      const { data: broadcast, error: broadcastError } = await admin.from('recordsweb_discord_broadcasts').select('*').eq('id', broadcastId).maybeSingle()
      if (broadcastError || !broadcast) return json({ error: 'Discord broadcast was not found.' }, 404)
      const { data: deliveries, error: deliveriesError } = await admin.from('recordsweb_discord_deliveries').select('organisation_id,status,attempted_at').eq('broadcast_id', broadcastId).order('attempted_at', { ascending: false })
      if (deliveriesError) throw deliveriesError
      const latest = new Map<string, string>()
      for (const row of deliveries || []) {
        const orgId = String(row.organisation_id || '')
        if (orgId && !latest.has(orgId)) latest.set(orgId, String(row.status || ''))
      }
      const failedOrganisationIds = [...latest.entries()].filter(([, status]) => status === 'failed').map(([orgId]) => orgId)
      if (!failedOrganisationIds.length) return json({ ok: true, sent: 0, failed: 0, skipped: 0, message: 'There are no failed deliveries to retry.' })
      return json(await deliverPlatformBroadcast(admin, context, broadcast, failedOrganisationIds))
    }

    if (!context.profile.is_management) return json({ error: 'Management permission is required.' }, 403)

    if (action === 'status') {
      const botState = await botStatusSafe()
      const integration = await getIntegration(admin, context.profile.organisation_id)
      let channels: any[] = []
      let liveError = ''
      if (botState.configured && botState.bot && integration?.guild_id) {
        try {
          const discovered = await discoverGuild(String(integration.guild_id))
          channels = discovered.channels
        } catch (error) {
          liveError = error instanceof Error ? error.message : 'Discord server verification failed.'
        }
      }
      return json({ ...botState, integration: integrationPayload(integration), channels, live_error: liveError })
    }

    if (action === 'discover-server') {
      const botState = await botStatusSafe()
      if (!botState.configured || !botState.bot) return json({ error: botState.error || 'RecordsWeb Bot is not configured.' }, 503)
      const guildId = snowflake(body.guild_id, 'Discord Server ID')
      const discovered = await discoverGuild(guildId)
      return json({ configured: true, bot: botState.bot, ...discovered })
    }

    if (action === 'save-integration') {
      const botState = await botStatusSafe()
      if (!botState.configured || !botState.bot) return json({ error: botState.error || 'RecordsWeb Bot is not configured.' }, 503)
      const guildId = snowflake(body.guild_id, 'Discord Server ID')
      const channelId = snowflake(body.channel_id, 'Discord Channel ID')
      const discovered = await discoverGuild(guildId)
      const channel = await verifyChannel(guildId, channelId)
      const now = new Date().toISOString()
      const row = {
        organisation_id: context.profile.organisation_id,
        guild_id: guildId,
        guild_name: discovered.guild.name,
        channel_id: channelId,
        channel_name: channel.name,
        maintenance_notifications: body.maintenance_notifications !== false,
        platform_announcements_enabled: body.platform_announcements_enabled !== false,
        critical_notifications_enabled: true,
        login_dm_enabled: body.login_dm_enabled !== false,
        connected_by: context.profile.id,
        connected_by_name: context.profile.display_name,
        verified_at: now,
        last_error: null,
        updated_at: now,
      }
      const { data, error } = await admin.from('recordsweb_discord_integrations').upsert(row, { onConflict: 'organisation_id' }).select('*').single()
      if (error) {
        if (/duplicate|unique|23505/i.test(error.message || '')) return json({ error: 'That Discord channel is already linked to another RecordsWeb community.' }, 409)
        throw error
      }
      await writeAudit(admin, context.profile, 'discord.integration.saved', 'organisation', context.profile.organisation_id, `Connected RecordsWeb Bot to ${discovered.guild.name} #${channel.name}.`, { guild_id: guildId, channel_id: channelId })
      return json({ configured: true, bot: botState.bot, integration: integrationPayload(data), channels: discovered.channels })
    }

    if (action === 'disconnect') {
      const existing = await getIntegration(admin, context.profile.organisation_id)
      const { error } = await admin.from('recordsweb_discord_integrations').delete().eq('organisation_id', context.profile.organisation_id)
      if (error) throw error
      await writeAudit(admin, context.profile, 'discord.integration.disconnected', 'organisation', context.profile.organisation_id, 'Disconnected the community from RecordsWeb Bot.', { guild_id: existing?.guild_id || null, channel_id: existing?.channel_id || null })
      const botState = await botStatusSafe()
      return json({ ...botState, integration: null, channels: [] })
    }

    if (action === 'send-test') {
      const integration = await getIntegration(admin, context.profile.organisation_id)
      if (!integration?.channel_id) return json({ error: 'Connect a Discord server and RecordsWeb status channel first.' }, 400)
      await sendMessage(String(integration.channel_id), {
        embeds: [{
          title: 'RecordsWeb Bot connected',
          description: 'This channel is configured to receive RecordsWeb platform announcements, incidents and maintenance notifications.',
          color: 0x0F6FBD,
          fields: [
            { name: 'Community', value: `${context.organisation.name} (@${context.organisation.org_code})`, inline: true },
            { name: 'Channel', value: `#${integration.channel_name || 'configured-channel'}`, inline: true },
            { name: 'Automatic notifications', value: integration.maintenance_notifications ? 'Enabled' : 'Disabled', inline: true },
          ],
          footer: { text: `Test sent by ${context.profile.display_name}` },
          timestamp: new Date().toISOString(),
        }],
      })
      await admin.from('recordsweb_discord_integrations').update({ verified_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq('organisation_id', context.profile.organisation_id)
      await writeAudit(admin, context.profile, 'discord.integration.test', 'organisation', context.profile.organisation_id, `Sent a RecordsWeb Bot test message to #${integration.channel_name || integration.channel_id}.`)
      return json({ ok: true })
    }

    if (action === 'send-login-dm') {
      const integration = await getIntegration(admin, context.profile.organisation_id)
      if (!integration?.login_dm_enabled) return json({ error: 'Staff login DMs are disabled for this community.' }, 403)
      const userId = cleanText(body.user_id, 80)
      const temporaryPassword = String(body.temporary_password || '')
      const resetPassword = body.reset_password === true
      if (!userId) return json({ error: 'Staff account is required.' }, 400)
      if (temporaryPassword.length < 10) return json({ error: 'A valid temporary password is required before sending login details.' }, 400)
      const { data: target, error: targetError } = await admin.from('profiles').select('id,organisation_id,username,display_name,discord_user_id,active,must_change_password').eq('id', userId).maybeSingle()
      if (targetError || !target || target.organisation_id !== context.profile.organisation_id) return json({ error: 'Staff account not found.' }, 404)
      if (!target.active) return json({ error: 'This RecordsWeb staff account is disabled.' }, 400)
      const discordUserId = snowflake(target.discord_user_id, 'Staff Discord User ID')
      const publicUrl = String(Deno.env.get('RECORDSWEB_PUBLIC_URL') || 'https://www.recordsweb.org').replace(/\/$/, '')

      // When Management selects "Set password & send DM", do both operations in this
      // already-authorised server request. This prevents a self-password reset from
      // invalidating the browser session before the Discord delivery call is made.
      if (resetPassword) {
        const policy = validatePassword(temporaryPassword, target.username)
        if (policy) return json({ error: policy }, 400)
        const { data: recent, error: recentError } = await admin.rpc('recordsweb_service_password_recently_used', { p_user_id: target.id, p_password: temporaryPassword })
        if (recentError) return json({ error: recentError.message || 'Unable to check password history.' }, 500)
        if (recent) return json({ error: 'Choose a temporary password this user has not used recently.' }, 400)
        const { error: resetError } = await admin.auth.admin.updateUserById(target.id, { password: temporaryPassword })
        if (resetError) return json({ error: resetError.message }, 400)
        const { error: historyError } = await admin.rpc('recordsweb_service_record_password', { p_user_id: target.id, p_password: temporaryPassword })
        if (historyError) return json({ error: 'Password changed, but password history could not be recorded. Contact the RecordsWeb administrator.' }, 500)
        await admin.from('profiles').update({ must_change_password: true, updated_at: new Date().toISOString() }).eq('id', target.id)
        await writeAudit(admin, context.profile, 'account.password.reset_by_management', 'profile', target.id, `Reset password for ${target.username}; password change required at next sign-in.`, { delivery: 'discord' })
      }
      const deliveryFormat = 'image-only'
      await sendRecordsWebLoginImageDm({
        discordUserId,
        username: target.username,
        temporaryPassword,
        organisationName: context.organisation.name,
        organisationCode: context.organisation.org_code,
        publicUrl,
        version: String(Deno.env.get('RECORDSWEB_VERSION') || '3.8.0'),
      })

      await writeAudit(admin, context.profile, 'account.discord_login_dm.sent', 'profile', target.id, `Sent RecordsWeb login details by Discord DM to ${target.display_name}.`, { discord_user_id: discordUserId, delivery_format: deliveryFormat, password_reset: resetPassword })
      return json({ ok: true, recipient_id: discordUserId, delivery_format: deliveryFormat, password_reset: resetPassword })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (error) {
    console.error('recordsweb-discord error', error)
    const status = Number((error as any)?.status || 500)
    let message = error instanceof Error ? error.message : 'Unexpected RecordsWeb Discord service error.'
    if (status === 403 && /Cannot send messages to this user|50007/i.test(message)) message = 'Discord would not accept a DM for this user. Make sure they share the community server with RecordsWeb Bot and allow DMs from server members.'
    if (status === 404 && /Unknown Guild|10004/i.test(message)) message = 'RecordsWeb Bot is not in that Discord server. Add the bot first, then retry.'
    if (status === 403 && /Missing Permissions|50013/i.test(message)) message = 'RecordsWeb Bot does not have permission to send messages in the selected channel.'
    return json({ error: message }, status >= 400 && status < 600 ? status : 500)
  }
})
