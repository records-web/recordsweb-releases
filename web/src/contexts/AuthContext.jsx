import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { demoUser, ORGANISATION } from '../lib/demoData'
import { signOut as supabaseSignOut } from '../lib/supabase'
import { recordAudit, setDemoAuditActor } from '../lib/auditService'
import { endStaffSession, heartbeatStaffSession, startStaffSession } from '../lib/staffSessions'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // Authentication is intentionally memory-only. Closing or reloading
  // RecordsWeb always returns the user to the sign-in page.
  const [session, setSession] = useState(null)


  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return undefined

    let live = true
    startStaffSession(userId).catch((error) => console.warn('RecordsWeb staff session could not be started:', error))
    const heartbeat = () => {
      if (!live) return
      heartbeatStaffSession().catch((error) => console.warn('RecordsWeb staff session heartbeat failed:', error))
    }
    const timer = window.setInterval(heartbeat, 30000)
    window.addEventListener('focus', heartbeat)
    document.addEventListener('visibilitychange', heartbeat)

    return () => {
      live = false
      window.clearInterval(timer)
      window.removeEventListener('focus', heartbeat)
      document.removeEventListener('visibilitychange', heartbeat)
      endStaffSession('session_ended').catch(() => {})
    }
  }, [session?.user?.id])

  const auth = useMemo(() => ({
    session,
    login: (value) => {
      const next = value?.profile
        ? {
            user: value.user,
            signed_in_at: new Date().toISOString(),
            profile: {
              ...value.profile,
              organisation_name: value.profile.organisations?.name || value.profile.organisation_name || ORGANISATION.name,
              organisation_code: value.profile.organisations?.org_code || ORGANISATION.org_code,
            },
          }
        : { user: { id: 'demo-user' }, profile: demoUser, signed_in_at: new Date().toISOString() }

      setSession(next)
      setDemoAuditActor(next.profile, next.user)
    },
    updateProfile: (patch) => {
      setSession((current) => current
        ? { ...current, profile: { ...current.profile, ...patch } }
        : current)
    },
    logout: async (reason = 'signed_out') => {
      try {
        await recordAudit({ action: 'account.logout', entityType: 'session', description: 'Signed out of RecordsWeb.', metadata: { reason } }).catch(() => {})
        await endStaffSession(reason).catch(() => {})
        await supabaseSignOut()
      } finally {
        setSession(null)
      }
    },
  }), [session])

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
