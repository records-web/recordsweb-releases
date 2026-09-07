import { supabase, supabaseConfigured } from './supabase'

export const ACCESS_REQUEST_REVIEWER_EMAIL = 'gusfarnsworth@gmail.com'

const BUCKET = 'recordsweb-access-request-logos'
const VALID_STATUSES = new Set(['pending', 'reviewing', 'approved', 'declined'])

function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export function isAccessRequestReviewer(userOrSession) {
  const user = userOrSession?.user || userOrSession
  return normaliseEmail(user?.email) === ACCESS_REQUEST_REVIEWER_EMAIL
}

export async function getAccessRequestReviewerSession() {
  if (!supabaseConfigured || !supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data?.session || null
}

export async function signInAccessRequestReviewer({ email, password }) {
  if (!supabaseConfigured || !supabase) throw new Error('Supabase is not configured for this RecordsWeb website.')
  const requestedEmail = normaliseEmail(email)
  if (requestedEmail !== ACCESS_REQUEST_REVIEWER_EMAIL) {
    throw new Error('This account is not authorised to review RecordsWeb access requests.')
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: requestedEmail,
    password: String(password || ''),
  })
  if (error) throw new Error('Unable to sign in with that reviewer account.')
  if (!isAccessRequestReviewer(data?.user)) {
    await supabase.auth.signOut().catch(() => {})
    throw new Error('This account is not authorised to review RecordsWeb access requests.')
  }
  return data?.session || null
}

export async function signOutAccessRequestReviewer() {
  if (supabase) await supabase.auth.signOut()
}

export async function listRecordsWebAccessRequests(status = '') {
  if (!supabaseConfigured || !supabase) throw new Error('Supabase is not configured for request review.')
  const normalisedStatus = String(status || '').trim().toLowerCase()
  if (normalisedStatus && !VALID_STATUSES.has(normalisedStatus)) throw new Error('Invalid request status filter.')

  const { data, error } = await supabase.rpc('recordsweb_list_access_requests', {
    p_status: normalisedStatus || null,
  })
  if (error) {
    if (/recordsweb_list_access_requests|does not exist|schema cache/i.test(error.message || '')) {
      throw new Error('Request review is not configured in Supabase. Run supabase/recordsweb-3.2.1-review-request.sql.')
    }
    if (/permission|access denied|not authorised|not authorized/i.test(error.message || '')) {
      throw new Error('This signed-in account is not authorised to review RecordsWeb access requests.')
    }
    throw new Error(error.message || 'Unable to load access requests.')
  }
  return Array.isArray(data) ? data : []
}

export async function saveRecordsWebAccessRequestReview({ id, status, operatorNotes }) {
  if (!supabaseConfigured || !supabase) throw new Error('Supabase is not configured for request review.')
  const normalisedStatus = String(status || '').trim().toLowerCase()
  if (!VALID_STATUSES.has(normalisedStatus)) throw new Error('Choose a valid request status.')

  const { data, error } = await supabase.rpc('recordsweb_review_access_request', {
    p_request_id: id,
    p_status: normalisedStatus,
    p_operator_notes: String(operatorNotes || '').trim() || null,
  })
  if (error) {
    if (/recordsweb_review_access_request|does not exist|schema cache/i.test(error.message || '')) {
      throw new Error('Request review is not configured in Supabase. Run supabase/recordsweb-3.2.1-review-request.sql.')
    }
    if (/permission|access denied|not authorised|not authorized/i.test(error.message || '')) {
      throw new Error('This signed-in account is not authorised to review RecordsWeb access requests.')
    }
    throw new Error(error.message || 'Unable to save the request review.')
  }
  return data
}

export async function createAccessRequestLogoUrl(path, expiresIn = 600) {
  if (!path || !supabase) return ''
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn)
  if (error) return ''
  return data?.signedUrl || ''
}
