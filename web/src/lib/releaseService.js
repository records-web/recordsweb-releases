import { supabase, supabaseConfigured } from './supabase'
import { APP_VERSION } from './webRuntime'

export const RELEASE_CHANNEL = String(import.meta.env.VITE_RECORDSWEB_RELEASE_CHANNEL || 'stable').trim() || 'stable'
export const UPDATE_CHECK_SECONDS = Math.max(30, Number(import.meta.env.VITE_RECORDSWEB_UPDATE_CHECK_SECONDS || 60))
export const UPDATE_GRACE_SECONDS = Math.max(15, Number(import.meta.env.VITE_RECORDSWEB_UPDATE_GRACE_SECONDS || 120))

function splitVersion(value) {
  const clean = String(value || '').trim().replace(/^v/i, '')
  const [main = '0.0.0', prerelease = ''] = clean.split('-', 2)
  const numbers = main.split('.').map((part) => Number.parseInt(part, 10) || 0)
  while (numbers.length < 3) numbers.push(0)
  return { numbers: numbers.slice(0, 4), prerelease: prerelease ? prerelease.split('.') : [] }
}

function comparePrerelease(a, b) {
  if (!a.length && !b.length) return 0
  if (!a.length) return 1
  if (!b.length) return -1
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    if (a[index] === undefined) return -1
    if (b[index] === undefined) return 1
    const aNumber = /^\d+$/.test(a[index]) ? Number(a[index]) : null
    const bNumber = /^\d+$/.test(b[index]) ? Number(b[index]) : null
    if (aNumber !== null && bNumber !== null && aNumber !== bNumber) return aNumber > bNumber ? 1 : -1
    if (aNumber !== null && bNumber === null) return -1
    if (aNumber === null && bNumber !== null) return 1
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1
  }
  return 0
}

export function compareVersions(a, b) {
  const left = splitVersion(a)
  const right = splitVersion(b)
  const length = Math.max(left.numbers.length, right.numbers.length)
  for (let index = 0; index < length; index += 1) {
    const l = left.numbers[index] || 0
    const r = right.numbers[index] || 0
    if (l !== r) return l > r ? 1 : -1
  }
  return comparePrerelease(left.prerelease, right.prerelease)
}

export async function getLatestRelease() {
  if (!supabaseConfigured || !supabase) return null

  const { data, error } = await supabase
    .from('app_releases')
    .select('version, channel, release_notes, published_at')
    .eq('active', true)
    .eq('channel', RELEASE_CHANNEL)
    .order('published_at', { ascending: false })
    .limit(20)

  if (error) throw error
  const rows = Array.isArray(data) ? data : []
  if (!rows.length) return null

  return rows.reduce((latest, row) => {
    if (!latest) return row
    return compareVersions(row.version, latest.version) > 0 ? row : latest
  }, null)
}

export async function checkForWebUpdate() {
  const latest = await getLatestRelease()
  if (!latest || compareVersions(latest.version, APP_VERSION) <= 0) return null
  return latest
}
