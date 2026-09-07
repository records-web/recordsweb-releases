import { supabase, supabaseConfigured } from './supabase'

const BUCKET = 'recordsweb-access-request-logos'
const MAX_LOGO_BYTES = 4 * 1024 * 1024
const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max)
}

function requireHttpsUrl(value, label) {
  const text = clean(value, 500)
  let parsed
  try { parsed = new URL(text) } catch { throw new Error(`${label} must be a valid URL.`) }
  if (parsed.protocol !== 'https:') throw new Error(`${label} must use https://.`)
  return parsed.toString()
}

function validateEmail(value) {
  const email = clean(value, 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid contact email address.')
  return email
}

function logoExtension(file) {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

export async function submitRecordsWebAccessRequest(values, logoFile) {
  const request = {
    communityName: clean(values.communityName, 120),
    requestedMode: values.requestedMode === 'hospital' ? 'hospital' : 'general_practice',
    discordUrl: requireHttpsUrl(values.discordUrl, 'Discord URL'),
    robloxGroupUrl: requireHttpsUrl(values.robloxGroupUrl, 'Roblox group link'),
    memberRange: clean(values.memberRange, 20),
    contactName: clean(values.contactName, 120),
    contactEmail: validateEmail(values.contactEmail),
    discordUsername: clean(values.discordUsername, 80),
    additionalDetails: clean(values.additionalDetails, 2000),
    authorisedContact: Boolean(values.authorisedContact),
  }

  if (!request.communityName) throw new Error('Community name is required.')
  if (!request.contactName) throw new Error('Contact name is required.')
  if (!['10-99', '100-999', '1000-9999', '10000+'].includes(request.memberRange)) throw new Error('Choose the community size.')
  if (!request.authorisedContact) throw new Error('Confirm that you are authorised to request access for this community.')
  if (!logoFile) throw new Error('Upload a community logo.')
  if (!ALLOWED_LOGO_TYPES.has(logoFile.type)) throw new Error('Logo must be a PNG, JPEG or WebP image.')
  if (logoFile.size > MAX_LOGO_BYTES) throw new Error('Logo must be 4 MB or smaller.')

  const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`

  if (!supabaseConfigured || !supabase) {
    const existing = JSON.parse(localStorage.getItem('recordsweb-demo-access-requests') || '[]')
    existing.unshift({ id: requestId, ...request, logoFileName: logoFile.name, createdAt: new Date().toISOString(), status: 'pending' })
    localStorage.setItem('recordsweb-demo-access-requests', JSON.stringify(existing.slice(0, 50)))
    return { id: requestId, demo: true }
  }

  const logoPath = `requests/${requestId}/logo.${logoExtension(logoFile)}`
  const upload = await supabase.storage.from(BUCKET).upload(logoPath, logoFile, {
    cacheControl: '3600',
    contentType: logoFile.type,
    upsert: false,
  })
  if (upload.error) {
    if (/row-level security|bucket|not found/i.test(upload.error.message || '')) {
      throw new Error('Request uploads are not configured in Supabase. Run the RecordsWeb 3.2.1 public access-request migration.')
    }
    throw upload.error
  }

  const { data, error } = await supabase.rpc('recordsweb_submit_access_request', {
    p_request_id: requestId,
    p_community_name: request.communityName,
    p_requested_mode: request.requestedMode,
    p_discord_url: request.discordUrl,
    p_roblox_group_url: request.robloxGroupUrl,
    p_member_range: request.memberRange,
    p_contact_name: request.contactName,
    p_contact_email: request.contactEmail,
    p_discord_username: request.discordUsername || null,
    p_logo_path: logoPath,
    p_additional_details: request.additionalDetails || null,
    p_authorised_contact: request.authorisedContact,
  })

  if (error) {
    if (/recordsweb_submit_access_request|does not exist|schema cache/i.test(error.message || '')) {
      throw new Error('Request access is not configured in Supabase. Run the RecordsWeb 3.2.1 public access-request migration.')
    }
    throw new Error(error.message || 'Unable to submit the access request.')
  }

  return { id: data || requestId, demo: false }
}
