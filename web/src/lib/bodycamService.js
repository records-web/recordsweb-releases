import { supabase, supabaseConfigured } from './supabase'

const DEMO_KEY = 'recordsweb-bodycam-demo-v1'

function clean(value, max = 160) {
  return String(value ?? '').trim().slice(0, max)
}

function demoSessions() {
  try {
    const value = JSON.parse(localStorage.getItem(DEMO_KEY) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function saveDemo(rows) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(rows))
}

async function invoke(action, payload = {}) {
  if (!supabaseConfigured) throw new Error('Live bodycam streaming requires a configured RecordsWeb Supabase deployment.')
  const { data, error } = await supabase.functions.invoke('recordsweb-bodycam', {
    body: { action, ...payload },
  })
  if (error) {
    const message = data?.error || error?.context?.body?.error || error.message || 'RecordsWeb Bodycam service failed.'
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data || {}
}

export async function getBodycamStatus() {
  if (!supabaseConfigured) return { configured: false, provider: 'LiveKit Cloud', demo: true }
  return invoke('status')
}

export async function listActiveBodycams() {
  if (!supabaseConfigured) {
    return demoSessions().filter((row) => row.status === 'live')
  }
  const data = await invoke('list')
  return Array.isArray(data.sessions) ? data.sessions : []
}

export async function startBodycamSession(input = {}) {
  if (!supabaseConfigured) {
    const now = new Date().toISOString()
    const row = {
      id: crypto.randomUUID?.() || `${Date.now()}`,
      status: 'live',
      officer_name: 'Demo Officer',
      officer_role: 'Police Constable',
      organisation_name: 'RecordsWeb Police Service',
      callsign: clean(input.callsign) || 'DEMO-1',
      camera_label: clean(input.camera_label) || 'BWC-DEMO',
      location_label: clean(input.location_label),
      microphone_enabled: Boolean(input.microphone_enabled),
      started_at: now,
      last_heartbeat_at: now,
      incident: null,
      demo: true,
    }
    const rows = demoSessions().filter((item) => item.status !== 'live')
    rows.unshift(row)
    saveDemo(rows)
    throw new Error('LiveKit streaming is unavailable in demo mode. Configure Supabase and LiveKit Cloud first.')
  }

  return invoke('start', {
    callsign: clean(input.callsign, 60),
    camera_label: clean(input.camera_label, 80),
    location_label: clean(input.location_label, 160),
    incident_id: clean(input.incident_id, 80) || null,
    microphone_enabled: Boolean(input.microphone_enabled),
  })
}

export async function heartbeatBodycamSession(sessionId) {
  if (!supabaseConfigured || !sessionId) return { ok: true }
  return invoke('heartbeat', { session_id: sessionId })
}

export async function stopBodycamSession(sessionId) {
  if (!sessionId) return { ok: true }
  if (!supabaseConfigured) {
    const rows = demoSessions().map((row) => row.id === sessionId ? { ...row, status: 'ended', ended_at: new Date().toISOString() } : row)
    saveDemo(rows)
    return { ok: true }
  }
  return invoke('stop', { session_id: sessionId })
}

export async function getBodycamViewerToken(sessionId) {
  return invoke('viewer-token', { session_id: sessionId })
}

export async function endBodycamView(eventId) {
  if (!supabaseConfigured || !eventId) return { ok: true }
  return invoke('end-view', { event_id: eventId })
}
