import { supabase, supabaseConfigured } from './supabase'
import { ORGANISATION } from './demoData'
import { getWebDeviceContext } from './webRuntime'

const DEMO_SESSION_KEY = 'recordsweb-demo-staff-sessions-v1'
const HEARTBEAT_STALE_MS = 90 * 1000
let currentSessionKey = null

function nowIso() { return new Date().toISOString() }
function makeSessionKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `00000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`
}
function getDemoRows() { try { return JSON.parse(localStorage.getItem(DEMO_SESSION_KEY) || '[]') } catch { return [] } }
function saveDemoRows(rows) { try { localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(rows.slice(0, 1000))) } catch {} }

async function getDeviceContext() {
  return getWebDeviceContext()
}

export async function startStaffSession(userId) {
  if (!userId || currentSessionKey) return currentSessionKey
  const sessionKey = makeSessionKey()
  const device = await getDeviceContext()

  if (!supabaseConfigured || !supabase) {
    const row = {
      id: `demo-session-${Date.now()}`,
      organisation_id: ORGANISATION.id,
      user_id: userId,
      session_key: sessionKey,
      started_at: nowIso(),
      last_seen_at: nowIso(),
      ended_at: null,
      end_reason: null,
      app_version: device.appVersion,
      device_name: device.deviceName,
      platform: device.platform,
    }
    saveDemoRows([row, ...getDemoRows()])
    currentSessionKey = sessionKey
    return sessionKey
  }

  const { data, error } = await supabase.rpc('recordsweb_start_staff_session', {
    p_session_key: sessionKey,
    p_app_version: device.appVersion,
    p_device_name: device.deviceName,
    p_platform: device.platform,
  })
  if (error) throw error
  currentSessionKey = data?.session_key || sessionKey
  return currentSessionKey
}

export async function heartbeatStaffSession() {
  if (!currentSessionKey) return false
  if (!supabaseConfigured || !supabase) {
    const rows = getDemoRows().map((row) => row.session_key === currentSessionKey && !row.ended_at ? { ...row, last_seen_at: nowIso() } : row)
    saveDemoRows(rows)
    return true
  }
  const { data, error } = await supabase.rpc('recordsweb_heartbeat_staff_session', { p_session_key: currentSessionKey })
  if (error) throw error
  return Boolean(data)
}

export async function endStaffSession(reason = 'signed_out') {
  if (!currentSessionKey) return false
  const key = currentSessionKey
  currentSessionKey = null
  if (!supabaseConfigured || !supabase) {
    const rows = getDemoRows().map((row) => row.session_key === key && !row.ended_at ? { ...row, last_seen_at: nowIso(), ended_at: nowIso(), end_reason: reason } : row)
    saveDemoRows(rows)
    return true
  }
  const { data, error } = await supabase.rpc('recordsweb_end_staff_session', { p_session_key: key, p_reason: String(reason || 'signed_out').slice(0, 80) })
  if (error) throw error
  return Boolean(data)
}

export async function listStaffSessions({ userId = '', limit = 500 } = {}) {
  if (!supabaseConfigured || !supabase) {
    return getDemoRows()
      .filter((row) => !userId || row.user_id === userId)
      .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
      .slice(0, limit)
  }
  let query = supabase.from('staff_sessions').select('*').order('started_at', { ascending: false }).limit(limit)
  if (userId) query = query.eq('user_id', userId)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export function subscribeToStaffSessionChanges(onChange) {
  if (!supabaseConfigured || !supabase) return () => {}
  const channel = supabase
    .channel('recordsweb-management-staff-sessions')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_sessions' }, () => onChange?.())
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}

export function isSessionOnline(session, now = Date.now()) {
  if (!session || session.ended_at) return false
  const seen = new Date(session.last_seen_at || session.started_at || 0).getTime()
  return Number.isFinite(seen) && now - seen <= HEARTBEAT_STALE_MS
}

export function summariseStaffSessions(sessions = [], now = Date.now()) {
  const byUser = {}
  for (const row of sessions) {
    if (!row?.user_id) continue
    if (!byUser[row.user_id]) byUser[row.user_id] = { latest: null, current: null, sessions: [] }
    const bucket = byUser[row.user_id]
    bucket.sessions.push(row)
    if (!bucket.latest || new Date(row.started_at) > new Date(bucket.latest.started_at)) bucket.latest = row
    if (isSessionOnline(row, now)) {
      if (!bucket.current || new Date(row.last_seen_at) > new Date(bucket.current.last_seen_at)) bucket.current = row
    }
  }
  for (const bucket of Object.values(byUser)) bucket.online = Boolean(bucket.current)
  return byUser
}
