import { supabase, supabaseConfigured, listAccounts } from './supabase'
import { recordAudit } from './auditService'

const DEMO_KEY = 'recordsweb-demo-screen-messages-v1'

function getDemoMessages() {
  try { return JSON.parse(localStorage.getItem(DEMO_KEY) || '[]') } catch { return [] }
}
function saveDemoMessages(rows) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(rows))
  window.dispatchEvent(new CustomEvent('recordsweb-demo-screen-message'))
}

export async function listMessageStaff() {
  if (!supabaseConfigured) return (await listAccounts()).filter((x) => x.active !== false)
  const { data, error } = await supabase
    .from('profiles')
    .select('id,username,title,first_name,last_name,display_name,role,roles,active')
    .eq('active', true)
    .order('last_name')
  if (error) throw error
  return data || []
}

export async function listScreenMessages(recipientId) {
  if (!supabaseConfigured) {
    return getDemoMessages().filter((x) => x.recipient_id === recipientId).sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)))
  }
  const { data, error } = await supabase.from('staff_screen_messages').select('*').eq('recipient_id', recipientId).order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return data || []
}



export async function listScreenMessageAudit() {
  if (!supabaseConfigured) {
    return getDemoMessages().sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)))
  }
  const { data, error } = await supabase
    .from('staff_screen_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return data || []
}

export async function sendScreenMessages({ sender, recipientIds, subject, body, urgent }) {
  if (!recipientIds?.length) throw new Error('Select at least one recipient.')
  const cleanSubject = String(subject || '').trim().slice(0, 100)
  const cleanBody = String(body || '').trim().slice(0, 500)
  if (!cleanSubject) throw new Error('Enter a subject.')
  if (!cleanBody) throw new Error('Enter a message.')

  if (!supabaseConfigured) {
    const rows = getDemoMessages()
    const created = recipientIds.map((recipientId) => ({
      id: `demo-message-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      organisation_id: 'grove-way-health-centre',
      sender_id: sender.id,
      recipient_id: recipientId,
      sender_name: sender.display_name || sender.username,
      sender_role: sender.role || 'Staff',
      subject: cleanSubject,
      body: cleanBody,
      urgent: Boolean(urgent),
      read_at: null,
      created_at: new Date().toISOString(),
    }))
    saveDemoMessages([...created, ...rows])
    await recordAudit({ action: 'screen_message.sent', entityType: 'staff_screen_messages', description: `${urgent ? 'Urgent ' : ''}screen message sent to ${recipientIds.length} recipient${recipientIds.length === 1 ? '' : 's'}.`, metadata: { recipient_count: recipientIds.length, urgent: Boolean(urgent), subject: cleanSubject } })
    return created
  }

  const payload = recipientIds.map((recipient_id) => ({ recipient_id, subject: cleanSubject, body: cleanBody, urgent: Boolean(urgent) }))
  const { data, error } = await supabase.from('staff_screen_messages').insert(payload).select()
  if (error) throw error
  await recordAudit({ action: 'screen_message.sent', entityType: 'staff_screen_messages', description: `${urgent ? 'Urgent ' : ''}screen message sent to ${recipientIds.length} recipient${recipientIds.length === 1 ? '' : 's'}.`, metadata: { recipient_count: recipientIds.length, urgent: Boolean(urgent), subject: cleanSubject } })
  return data || []
}

export async function markScreenMessageRead(id) {
  if (!supabaseConfigured) {
    const rows = getDemoMessages().map((x) => x.id === id ? { ...x, read_at: new Date().toISOString() } : x)
    saveDemoMessages(rows)
    return
  }
  const { error } = await supabase.from('staff_screen_messages').update({ read_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export function subscribeToScreenMessages(recipientId, onMessage) {
  if (!recipientId) return () => {}
  if (!supabaseConfigured) {
    const seen = new Set(getDemoMessages().filter(x => x.recipient_id === recipientId).map(x => x.id))
    const listener = () => {
      for (const row of getDemoMessages().filter(x => x.recipient_id === recipientId)) {
        if (!seen.has(row.id)) { seen.add(row.id); onMessage(row) }
      }
    }
    window.addEventListener('recordsweb-demo-screen-message', listener)
    return () => window.removeEventListener('recordsweb-demo-screen-message', listener)
  }
  const channel = supabase.channel(`screen-messages-${recipientId}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_screen_messages', filter: `recipient_id=eq.${recipientId}` }, (payload) => onMessage(payload.new))
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}

export function subscribeStaffPresence(profile, onChange) {
  if (!profile?.id || !supabaseConfigured) {
    onChange(new Set(profile?.id ? [profile.id] : []))
    return () => {}
  }
  const channel = supabase.channel('recordsweb-staff-presence', { config: { presence: { key: profile.id } } })
  const publish = () => {
    const state = channel.presenceState()
    onChange(new Set(Object.keys(state)))
  }
  channel.on('presence', { event: 'sync' }, publish)
  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ user_id: profile.id, username: profile.username, role: profile.role, online_at: new Date().toISOString() })
      publish()
    }
  })
  return () => { channel.untrack().catch(() => {}); supabase.removeChannel(channel) }
}
