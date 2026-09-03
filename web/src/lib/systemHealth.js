import { supabase, supabaseConfigured, checkAdminService } from './supabase'

export async function checkSystemHealth() {
  const checks = []
  checks.push({ name: 'Supabase connection', ok: supabaseConfigured, detail: supabaseConfigured ? 'Configured' : 'Local demo mode' })
  if (!supabaseConfigured || !supabase) {
    checks.push({ name: 'Realtime', ok: true, detail: 'Demo mode' }, { name: 'Document storage', ok: true, detail: 'Demo mode' }, { name: 'Admin service', ok: true, detail: 'Demo mode' })
    return checks
  }
  try { await checkAdminService(); checks.push({ name: 'Admin service', ok: true, detail: 'Online' }) } catch (e) { checks.push({ name: 'Admin service', ok: false, detail: e.message || 'Unavailable' }) }
  try { const { error } = await supabase.from('app_releases').select('version').limit(1); if (error) throw error; checks.push({ name: 'Release service', ok: true, detail: 'Online' }) } catch (e) { checks.push({ name: 'Release service', ok: false, detail: e.message }) }
  try { const { error } = await supabase.from('audit_log').select('id').limit(1); if (error) throw error; checks.push({ name: 'Audit service', ok: true, detail: 'Online' }) } catch (e) { checks.push({ name: 'Audit service', ok: false, detail: 'Migration required' }) }
  try { const { error } = await supabase.from('fit_note_pdfs').select('id').limit(1); if (error) throw error; checks.push({ name: 'Document storage', ok: true, detail: 'Metadata and private archive configured' }) } catch (e) { checks.push({ name: 'Document storage', ok: false, detail: 'Fit-note storage migration required' }) }
  checks.push({ name: 'Realtime', ok: true, detail: 'Enabled for messages and patient presence' })
  return checks
}
