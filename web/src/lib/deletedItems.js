import { supabase, supabaseConfigured } from './supabase'

const DEMO_KEY='recordsweb-demo-deleted-items-v1'
function rows(){try{return JSON.parse(localStorage.getItem(DEMO_KEY)||'[]')}catch{return[]}}
function save(v){localStorage.setItem(DEMO_KEY,JSON.stringify(v))}

export async function archiveDeletedRecord(sourceTable, snapshot, patientId = null) {
  if (!snapshot?.id) return
  if (!supabaseConfigured || !supabase) { const all=rows(); all.unshift({id:`deleted-${Date.now()}`,source_table:sourceTable,source_id:snapshot.id,patient_id:patientId,snapshot,deleted_at:new Date().toISOString()}); save(all); return }
  const { error } = await supabase.from('deleted_records').insert({ source_table: sourceTable, source_id: snapshot.id, patient_id: patientId, snapshot })
  if (error) throw new Error(`Unable to create a recoverable deletion record: ${error.message}`)
}
export async function listDeletedRecords() {
  if (!supabaseConfigured || !supabase) return rows()
  const { data, error } = await supabase.from('deleted_records').select('*').is('restored_at', null).order('deleted_at', { ascending:false }).limit(500)
  if (error) throw error
  return data||[]
}
export async function restoreDeletedRecord(id) {
  if (!supabaseConfigured || !supabase) { const all=rows(); save(all.map(r=>r.id===id?{...r,restored_at:new Date().toISOString()}:r)); return true }
  const { error } = await supabase.rpc('recordsweb_restore_deleted_record', { p_deleted_id: id })
  if (error) throw new Error(error.message || 'Unable to restore deleted item.')
  return true
}
