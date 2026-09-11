const DAY_MS = 24 * 60 * 60 * 1000

let currentAccess = Object.freeze({
  mode: 'full',
  billingStatus: 'setup',
  paymentExempt: false,
  graceStartedAt: null,
  graceEndsAt: null,
  readOnlySince: null,
  daysRemaining: null,
})

function asTime(value) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

export function deriveBillingAccess(billing = {}) {
  const paymentExempt = Boolean(billing?.billing_payment_exempt) || billing?.billing_status === 'complimentary'
  const billingStatus = String(billing?.billing_status || 'setup')
  const graceEndsTime = asTime(billing?.billing_grace_ends_at)
  const now = Date.now()

  let mode = 'full'
  if (paymentExempt) mode = 'exempt'
  else if (billingStatus === 'suspended') mode = 'read_only'
  else if (billingStatus === 'overdue') {
    mode = graceEndsTime && now >= graceEndsTime ? 'read_only' : 'grace'
  }

  const daysRemaining = mode === 'grace' && graceEndsTime
    ? Math.max(0, Math.ceil((graceEndsTime - now) / DAY_MS))
    : null

  return Object.freeze({
    mode,
    billingStatus,
    paymentExempt,
    graceStartedAt: billing?.billing_grace_started_at || null,
    graceEndsAt: billing?.billing_grace_ends_at || null,
    readOnlySince: billing?.billing_read_only_since || null,
    daysRemaining,
  })
}

export function setBillingAccess(billing) {
  currentAccess = deriveBillingAccess(billing)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('recordsweb-billing-access-changed', { detail: currentAccess }))
  }
  return currentAccess
}

export function getBillingAccess() {
  return currentAccess
}

export function assertBillingWriteAllowed(action = 'make changes') {
  if (currentAccess.mode !== 'read_only') return
  throw new Error(
    `RecordsWeb is currently read-only because this organisation's subscription is suspended or its 7-day payment grace period has ended. You can still view existing records, but you cannot ${action} until billing is restored. Organisation management can update payment details from Subscription & billing.`,
  )
}
