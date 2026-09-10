import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-recordsweb-key',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Server configuration error: ${name} is unavailable.`)
  return value
}

function cleanText(value: unknown, max = 160) {
  return String(value ?? '').trim().slice(0, max)
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
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
      .select('organisation_id,enabled,universe_id,place_ids,display_name_mode,display_duration_seconds')
      .eq('key_hash', keyHash)
      .maybeSingle()
    if (integrationError) throw new Error(integrationError.message)
    if (!integration || !integration.enabled) return json({ error: 'This RecordsWeb Roblox integration is disabled or the connection code has been revoked.' }, 403)

    const { data: organisation, error: orgError } = await admin
      .from('organisations')
      .select('id,org_code,name,active')
      .eq('id', integration.organisation_id)
      .maybeSingle()
    if (orgError) throw new Error(orgError.message)
    if (!organisation?.active) return json({ error: 'This RecordsWeb community is disabled.' }, 403)

    const body = await req.json().catch(() => ({}))
    const action = cleanText(body?.action, 30) || 'poll'
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
