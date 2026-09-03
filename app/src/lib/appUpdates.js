import { supabase, supabaseConfigured } from './supabase'

export function compareVersions(left, right) {
  const parse = (value) => String(value || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0)

  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] || 0) > (b[index] || 0)) return 1
    if ((a[index] || 0) < (b[index] || 0)) return -1
  }
  return 0
}

export function isNewerVersion(candidate, current) {
  return compareVersions(candidate, current) > 0
}

export async function getLatestAppRelease(channel = 'stable') {
  if (!supabaseConfigured || !supabase) return null

  const { data, error } = await supabase
    .from('app_releases')
    .select('id, version, channel, release_notes, published_at, active')
    .eq('channel', channel)
    .eq('active', true)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data || null
}
