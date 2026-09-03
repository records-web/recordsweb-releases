import React, { useEffect, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { getOwnAccountAccessState, subscribeToOwnAccountAccess } from '../../lib/supabase'

const POLL_MS = 15000

function setLoginNotice(message) {
  try { sessionStorage.setItem('recordsweb-login-notice', message) } catch {}
}

export default function AccountAccessGuard({ children }) {
  const auth = useAuth()
  const { session } = auth
  const signingOutRef = useRef(false)

  useEffect(() => {
    if (!session?.user?.id) return undefined
    signingOutRef.current = false

    const signedInAt = new Date(session.signed_in_at || Date.now()).getTime()

    async function evaluate(state) {
      if (!state || signingOutRef.current) return

      if (state.active === false) {
        signingOutRef.current = true
        const reason = String(state.disabled_reason || '').trim()
        setLoginNotice(reason
          ? `Your RecordsWeb account has been disabled. Reason: ${reason}`
          : 'Your RecordsWeb account has been disabled. Contact Management if you believe this is incorrect.')
        await auth.logout('account_disabled').catch(() => {})
        return
      }

      const forcedAt = state.force_logout_at ? new Date(state.force_logout_at).getTime() : 0
      if (forcedAt && Number.isFinite(forcedAt) && forcedAt > signedInAt) {
        signingOutRef.current = true
        setLoginNotice('You were signed out of RecordsWeb by Management.')
        await auth.logout('forced_by_management').catch(() => {})
      }
    }

    getOwnAccountAccessState(session.user.id).then(evaluate).catch((error) => {
      console.warn('RecordsWeb account access check failed:', error)
    })

    const unsubscribe = subscribeToOwnAccountAccess(session.user.id, evaluate)
    const timer = window.setInterval(() => {
      getOwnAccountAccessState(session.user.id).then(evaluate).catch(() => {})
    }, POLL_MS)

    return () => {
      unsubscribe?.()
      window.clearInterval(timer)
    }
  }, [session?.user?.id, session?.signed_in_at, auth])

  return children
}
