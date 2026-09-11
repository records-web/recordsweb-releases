import { supabase, supabaseConfigured } from './supabase'

export const ACCESS_REQUEST_REVIEWER_EMAIL_FORMAT = 'gus.farnsworth@XX.XX or alfie-james@XX.XX'
export const ACCESS_REQUEST_REVIEWER_EMAIL_PATTERN = /^(?:gus\.farnsworth|alfie-james)@[a-z]{2}\.[a-z]{2}$/i

const BUCKET = 'recordsweb-access-request-logos'
const VALID_STATUSES = new Set(['pending', 'reviewing', 'approved', 'declined'])

function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export function isAccessRequestReviewer(userOrSession) {
  const user = userOrSession?.user || userOrSession
  return ACCESS_REQUEST_REVIEWER_EMAIL_PATTERN.test(normaliseEmail(user?.email))
}

export async function verifyAccessRequestReviewer() {
  if (!supabaseConfigured || !supabase) return false
  const { data, error } = await supabase.rpc('recordsweb_is_access_request_reviewer')
  if (error) {
    if (/recordsweb_is_access_request_reviewer|does not exist|schema cache/i.test(error.message || '')) {
      throw new Error('Request review is not configured in Supabase. Run the RecordsWeb review-request migration.')
    }
    throw new Error(error.message || 'Unable to verify reviewer access.')
  }
  return data === true
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
  if (!ACCESS_REQUEST_REVIEWER_EMAIL_PATTERN.test(requestedEmail)) {
    throw new Error(`Reviewer accounts must use the reserved ${ACCESS_REQUEST_REVIEWER_EMAIL_FORMAT} format.`)
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

  let serverAuthorised = false
  try {
    serverAuthorised = await verifyAccessRequestReviewer()
  } catch (err) {
    await supabase.auth.signOut().catch(() => {})
    throw err
  }
  if (!serverAuthorised) {
    await supabase.auth.signOut().catch(() => {})
    throw new Error('This reviewer account is not assigned to the matching active RecordsWeb organisation.')
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
