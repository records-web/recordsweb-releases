import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { DEFAULT_MAINTENANCE_STATE, loadMaintenanceState, subscribeToMaintenance } from '../../lib/maintenanceMode'
import MaintenanceScreen from './MaintenanceScreen'
import MaintenanceSessionCountdown from './MaintenanceSessionCountdown'

const SESSION_EXIT_SECONDS = 60

export default function MaintenanceGate({ children }) {
  const auth = useAuth()
  const { session } = auth
  const [state, setState] = useState(DEFAULT_MAINTENANCE_STATE)
  const [loading, setLoading] = useState(true)
  const [seconds, setSeconds] = useState(null)
  const deadlineRef = useRef(null)

  const refresh = useCallback(async () => {
    try {
      const next = await loadMaintenanceState()
      setState(next)
      return next
    } catch (error) {
      console.warn('RecordsWeb platform maintenance check failed:', error)
      return state
    } finally {
      setLoading(false)
    }
  }, [state])

  useEffect(() => {
    Promise.resolve(window.recordsWebDesktop?.setWindowMode?.('login')).catch(() => {})
    let live = true
    loadMaintenanceState()
      .then((next) => { if (live) setState(next) })
      .catch((error) => console.warn('RecordsWeb platform maintenance check failed:', error))
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadMaintenanceState().then(setState).catch(() => {})
    }, session ? 30000 : 15000)
    return () => window.clearInterval(timer)
  }, [session])

  useEffect(() => {
    if (!session) return undefined
    return subscribeToMaintenance(setState)
  }, [session])

  useEffect(() => {
    // Platform maintenance applies to every community account, including local
    // community management. The restricted website operator area is outside
    // this gate and is the only place that can end platform maintenance.
    const staffMustExit = Boolean(state.enabled && session)
    if (!staffMustExit) {
      deadlineRef.current = null
      setSeconds(null)
      return undefined
    }

    if (!deadlineRef.current) deadlineRef.current = Date.now() + SESSION_EXIT_SECONDS * 1000
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000))
      setSeconds(remaining)
      if (remaining <= 0) {
        deadlineRef.current = null
        auth.logout('platform_maintenance').catch(() => {})
      }
    }
    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [state.enabled, session, auth])

  if (loading && !session) {
    return <div className="emis-login-screen"><div className="emis-login-window simplified-login-window maintenance-loading"><strong>RecordsWeb</strong><span>Checking system availability…</span></div></div>
  }

  if (state.enabled && !session) {
    return <MaintenanceScreen state={state} onRetry={refresh} />
  }

  return (
    <>
      {children}
      {state.enabled && session && seconds !== null && (
        <MaintenanceSessionCountdown seconds={seconds} message={state.message} onSignOut={() => auth.logout('platform_maintenance').catch(() => {})} />
      )}
    </>
  )
}
