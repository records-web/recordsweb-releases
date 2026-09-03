import { supabase, supabaseConfigured } from './supabase'

export function subscribeToPatientRecordChanges(patientId, onChange) {
  if (!supabaseConfigured || !supabase || !patientId || typeof onChange !== 'function') {
    return () => {}
  }

  const channel = supabase
    .channel(`recordsweb-patient-record-${patientId}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'patient_record_events',
        filter: `patient_id=eq.${patientId}`,
      },
      (payload) => {
        if (payload?.new) onChange(payload.new)
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
