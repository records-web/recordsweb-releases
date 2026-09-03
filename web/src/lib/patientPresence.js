import { supabase, supabaseConfigured } from './supabase'

export function subscribeToPatientPresence(patientId, profile, onChange) {
  if (!supabaseConfigured || !supabase || !patientId || !profile || typeof onChange !== 'function') {
    onChange?.([])
    return () => {}
  }
  const userId = profile.id || profile.user_id
  const channel = supabase.channel(`recordsweb-open-patient:${patientId}`, { config: { presence: { key: userId || crypto.randomUUID() } } })
  const publish = async () => {
    await channel.track({
      user_id: userId,
      display_name: profile.display_name || profile.username || 'Staff member',
      role: profile.role || 'Staff',
      patient_id: patientId,
      opened_at: new Date().toISOString(),
    })
  }
  const sync = () => {
    const state = channel.presenceState()
    const peers = Object.values(state).flat().filter((item) => item?.patient_id === patientId && item?.user_id !== userId)
    const unique = [...new Map(peers.map((item) => [item.user_id || item.presence_ref, item])).values()]
    onChange(unique)
  }
  channel.on('presence', { event: 'sync' }, sync).on('presence', { event: 'join' }, sync).on('presence', { event: 'leave' }, sync).subscribe((status) => { if (status === 'SUBSCRIBED') publish().catch(() => {}) })
  return () => { channel.untrack().catch(() => {}); supabase.removeChannel(channel); onChange([]) }
}
