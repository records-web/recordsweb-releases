import { supabase, supabaseConfigured } from './supabase'
const KEY='recordsweb-demo-document-versions-v1'
function read(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}}
function write(v){localStorage.setItem(KEY,JSON.stringify(v))}
export async function recordDocumentVersion(document) {
  if (!document?.id) return null
  if (!supabaseConfigured || !supabase) {
    const all=read(); const n=1+Math.max(0,...all.filter(v=>v.document_id===document.id).map(v=>v.version_number||0)); const row={id:`dv-${Date.now()}`,document_id:document.id,patient_id:document.patient_id,version_number:n,snapshot:document,changed_at:new Date().toISOString()}; all.unshift(row); write(all); return row
  }
  const { data: latest } = await supabase.from('document_versions').select('version_number').eq('document_id', document.id).order('version_number',{ascending:false}).limit(1).maybeSingle()
  const { data, error } = await supabase.from('document_versions').insert({ document_id: document.id, patient_id: document.patient_id, version_number: (latest?.version_number||0)+1, snapshot: document }).select().single()
  if (error) { console.warn('Document version could not be recorded:', error.message); return null }
  return data
}
export async function listDocumentVersions(documentId) {
  if (!supabaseConfigured || !supabase) return read().filter(v=>v.document_id===documentId).sort((a,b)=>b.version_number-a.version_number)
  const { data,error }=await supabase.from('document_versions').select('*').eq('document_id',documentId).order('version_number',{ascending:false}); if(error) throw error; return data||[]
}
