import { createClient } from 'npm:@supabase/supabase-js@2'
import { AccessToken } from 'npm:livekit-server-sdk@2.19.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function env(name: string, required = true) {
  const value = String(Deno.env.get(name) || '').trim()
  if (required && !value) throw new Error(`Missing ${name}.`)
  return value
}

function clean(value: unknown, max = 200) {
  return String(value ?? '').trim().slice(0, max)
}

function uuid(value: unknown) {
  const text = clean(value, 80)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : ''
}

function liveKitConfigured() {
  return Boolean(env('LIVEKIT_URL', false) && env('LIVEKIT_API_KEY', false) && env('LIVEKIT_API_SECRET', false))
}

function opaqueIdentity(prefix: string, id: string) {
  return `${prefix}_${id.replaceAll('-', '')}_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`
}

function roomNameForSession(id: string) {
  return `rw-bwc-${id.replaceAll('-', '')}`
}

async function sessionContext(admin: any, req: Request) {
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token || token === authHeader) throw Object.assign(new Error('Unauthorised RecordsWeb session.'), { status: 401 })

  const { data: authData, error: authError } = await admin.auth.getUser(token)
  if (authError || !authData.user) throw Object.assign(new Error('Unauthorised RecordsWeb session.'), { status: 401 })

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id,organisation_id,display_name,username,role,roles,is_management,active')
    .eq('id', authData.user.id)
    .maybeSingle()
  if (profileError || !profile || !profile.active) throw Object.assign(new Error('This RecordsWeb staff account is not active.'), { status: 403 })

  const { data: organisation, error: orgError } = await admin
    .from('organisations')
    .select('id,name,org_code,active,enabled_products,tester_program,system_mode')
    .eq('id', profile.organisation_id)
    .maybeSingle()
  if (orgError || !organisation || !organisation.active) throw Object.assign(new Error('This RecordsWeb community is not active.'), { status: 403 })

  const enabled = organisation.tester_program || (Array.isArray(organisation.enabled_products) && organisation.enabled_products.includes('policing'))
  if (!enabled) throw Object.assign(new Error('RecordsWeb Policing is not enabled for this community.'), { status: 403 })

  return { user: authData.user, profile, organisation }
}

async function createJoinToken({ room, identity, name, publish }: { room: string, identity: string, name?: string, publish: boolean }) {
  const token = new AccessToken(env('LIVEKIT_API_KEY'), env('LIVEKIT_API_SECRET'), {
    identity,
    name: clean(name, 100) || undefined,
    ttl: '15m',
  })
  token.addGrant({
    roomJoin: true,
    room,
    canPublish: publish,
    canSubscribe: true,
    canPublishData: false,
  })
  return await token.toJwt()
}

async function closeStaleSessions(admin: any, organisationId: string) {
  const cutoff = new Date(Date.now() - 90_000).toISOString()
  const now = new Date().toISOString()
  await admin
    .from('police_bodycam_sessions')
    .update({ status: 'ended', ended_at: now, updated_at: now })
    .eq('organisation_id', organisationId)
    .eq('status', 'live')
    .lt('last_heartbeat_at', cutoff)
}

async function publicSessions(admin: any, organisationId: string) {
  await closeStaleSessions(admin, organisationId)
  const { data: rows, error } = await admin
    .from('police_bodycam_sessions')
    .select('id,officer_id,incident_id,status,callsign,camera_label,location_label,microphone_enabled,started_at,last_heartbeat_at')
    .eq('organisation_id', organisationId)
    .eq('status', 'live')
    .order('started_at', { ascending: false })
    .limit(100)
  if (error) throw error

  const officerIds = [...new Set((rows || []).map((row: any) => row.officer_id).filter(Boolean))]
  const incidentIds = [...new Set((rows || []).map((row: any) => row.incident_id).filter(Boolean))]
  const [{ data: officers }, { data: incidents }, { data: org }] = await Promise.all([
    officerIds.length ? admin.from('profiles').select('id,display_name,role').in('id', officerIds) : Promise.resolve({ data: [] }),
    incidentIds.length ? admin.from('police_incidents').select('id,reference,title').in('id', incidentIds) : Promise.resolve({ data: [] }),
    admin.from('organisations').select('id,name').eq('id', organisationId).maybeSingle(),
  ])
  const officerMap = new Map((officers || []).map((row: any) => [String(row.id), row]))
  const incidentMap = new Map((incidents || []).map((row: any) => [String(row.id), row]))

  return (rows || []).map((row: any) => {
    const officer: any = officerMap.get(String(row.officer_id)) || {}
    return {
      id: row.id,
      status: row.status,
      officer_name: officer.display_name || 'RecordsWeb officer',
      officer_role: officer.role || 'Policing staff',
      organisation_name: org?.name || 'RecordsWeb policing community',
      callsign: row.callsign || '',
      camera_label: row.camera_label || '',
      location_label: row.location_label || '',
      microphone_enabled: Boolean(row.microphone_enabled),
      started_at: row.started_at,
      last_heartbeat_at: row.last_heartbeat_at,
      incident: row.incident_id ? incidentMap.get(String(row.incident_id)) || null : null,
    }
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const context = await sessionContext(admin, req)
    const body = await req.json().catch(() => ({}))
    const action = clean(body.action, 60)
    const now = new Date().toISOString()

    if (action === 'status') {
      return json({ ok: true, configured: liveKitConfigured(), provider: 'LiveKit Cloud' })
    }

    if (action === 'list') {
      return json({ ok: true, sessions: await publicSessions(admin, context.organisation.id) })
    }

    if (action === 'start') {
      if (!liveKitConfigured()) return json({ error: 'LiveKit Cloud is not configured for RecordsWeb Bodycam.' }, 503)
      await closeStaleSessions(admin, context.organisation.id)
      await admin
        .from('police_bodycam_sessions')
        .update({ status: 'ended', ended_at: now, updated_at: now })
        .eq('organisation_id', context.organisation.id)
        .eq('officer_id', context.profile.id)
        .eq('status', 'live')

      const incidentId = uuid(body.incident_id) || null
      if (incidentId) {
        const { data: incident } = await admin.from('police_incidents').select('id').eq('id', incidentId).eq('organisation_id', context.organisation.id).maybeSingle()
        if (!incident) return json({ error: 'The selected incident does not belong to this policing community.' }, 400)
      }

      const id = crypto.randomUUID()
      const roomName = roomNameForSession(id)
      const row = {
        id,
        organisation_id: context.organisation.id,
        officer_id: context.profile.id,
        incident_id: incidentId,
        room_name: roomName,
        status: 'live',
        callsign: clean(body.callsign, 60) || null,
        camera_label: clean(body.camera_label, 80) || null,
        location_label: clean(body.location_label, 160) || null,
        microphone_enabled: Boolean(body.microphone_enabled),
        started_at: now,
        last_heartbeat_at: now,
        created_at: now,
        updated_at: now,
      }
      const { error: insertError } = await admin.from('police_bodycam_sessions').insert(row)
      if (insertError) throw insertError

      const token = await createJoinToken({
        room: roomName,
        identity: opaqueIdentity('pub', context.profile.id),
        name: undefined,
        publish: true,
      })
      const sessions = await publicSessions(admin, context.organisation.id)
      const session = sessions.find((item: any) => String(item.id) === id) || { id, ...row, officer_name: context.profile.display_name, officer_role: context.profile.role, organisation_name: context.organisation.name }
      return json({ ok: true, livekit_url: env('LIVEKIT_URL'), token, session_id: id, session })
    }

    if (action === 'heartbeat') {
      const sessionId = uuid(body.session_id)
      if (!sessionId) return json({ error: 'session_id is required.' }, 400)
      const { data, error } = await admin
        .from('police_bodycam_sessions')
        .update({ last_heartbeat_at: now, updated_at: now })
        .eq('id', sessionId)
        .eq('organisation_id', context.organisation.id)
        .eq('officer_id', context.profile.id)
        .eq('status', 'live')
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) return json({ error: 'That bodycam session is no longer active.' }, 409)
      return json({ ok: true, server_time: now })
    }

    if (action === 'stop') {
      const sessionId = uuid(body.session_id)
      if (!sessionId) return json({ error: 'session_id is required.' }, 400)
      let query = admin.from('police_bodycam_sessions').update({ status: 'ended', ended_at: now, updated_at: now }).eq('id', sessionId).eq('organisation_id', context.organisation.id)
      if (!context.profile.is_management) query = query.eq('officer_id', context.profile.id)
      const { data, error } = await query.select('id').maybeSingle()
      if (error) throw error
      if (!data) return json({ error: 'Bodycam session not found or you do not have permission to stop it.' }, 404)
      await admin.from('police_bodycam_view_events').update({ left_at: now }).eq('session_id', sessionId).is('left_at', null)
      return json({ ok: true })
    }

    if (action === 'viewer-token') {
      if (!liveKitConfigured()) return json({ error: 'LiveKit Cloud is not configured for RecordsWeb Bodycam.' }, 503)
      const sessionId = uuid(body.session_id)
      if (!sessionId) return json({ error: 'session_id is required.' }, 400)
      await closeStaleSessions(admin, context.organisation.id)
      const { data: session, error } = await admin
        .from('police_bodycam_sessions')
        .select('id,organisation_id,room_name,status,last_heartbeat_at')
        .eq('id', sessionId)
        .eq('organisation_id', context.organisation.id)
        .eq('status', 'live')
        .maybeSingle()
      if (error) throw error
      if (!session) return json({ error: 'This bodycam is no longer live.' }, 404)

      const viewEventId = crypto.randomUUID()
      const { error: viewError } = await admin.from('police_bodycam_view_events').insert({
        id: viewEventId,
        organisation_id: context.organisation.id,
        session_id: session.id,
        viewer_id: context.profile.id,
        joined_at: now,
      })
      if (viewError) throw viewError

      const token = await createJoinToken({
        room: session.room_name,
        identity: opaqueIdentity('view', context.profile.id),
        name: undefined,
        publish: false,
      })
      return json({ ok: true, livekit_url: env('LIVEKIT_URL'), token, view_event_id: viewEventId })
    }

    if (action === 'end-view') {
      const eventId = uuid(body.event_id)
      if (!eventId) return json({ error: 'event_id is required.' }, 400)
      const { error } = await admin
        .from('police_bodycam_view_events')
        .update({ left_at: now })
        .eq('id', eventId)
        .eq('organisation_id', context.organisation.id)
        .eq('viewer_id', context.profile.id)
      if (error) throw error
      return json({ ok: true })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (error) {
    console.error('recordsweb-bodycam', error)
    const status = Number((error as any)?.status || 500)
    return json({ error: error instanceof Error ? error.message : 'RecordsWeb Bodycam service failed.' }, status >= 400 && status < 600 ? status : 500)
  }
})
