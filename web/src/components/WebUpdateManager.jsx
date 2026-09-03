import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCcw, ShieldAlert } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { APP_VERSION } from '../lib/webRuntime'
import { checkForWebUpdate, RELEASE_CHANNEL, UPDATE_CHECK_SECONDS, UPDATE_GRACE_SECONDS } from '../lib/releaseService'
import { supabaseConfigured } from '../lib/supabase'

function formatCountdown(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds || 0))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function buildRefreshUrl(version) {
  const url = new URL(window.location.href)
  url.searchParams.set('rw-update', String(version || Date.now()))
  return url.toString()
}

export default function WebUpdateManager() {
  const location = useLocation()
  const [release, setRelease] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(UPDATE_GRACE_SECONDS)
  const [safetyRevision, setSafetyRevision] = useState(0)
  const dirtyRootsRef = useRef(new Set())
  const refreshStartedRef = useRef(false)

  const purgeDirtyRoots = useCallback(() => {
    const next = new Set([...dirtyRootsRef.current].filter((element) => element?.isConnected))
    dirtyRootsRef.current = next
    return next
  }, [])

  const updateBlocked = useMemo(() => {
    if (typeof document === 'undefined' || location.pathname === '/login') return false
    purgeDirtyRoots()
    if (document.querySelector('[data-recordsweb-update-blocked="true"]')) return true
    return dirtyRootsRef.current.size > 0
  }, [location.pathname, purgeDirtyRoots, safetyRevision])

  const refreshIntoUpdate = useCallback((manual = false) => {
    if (!release || refreshStartedRef.current) return
    if (manual && updateBlocked) {
      const confirmed = window.confirm('RecordsWeb has unsaved work open. Refreshing now may discard changes that have not been saved. Refresh anyway?')
      if (!confirmed) return
    }
    refreshStartedRef.current = true
    try { sessionStorage.setItem('recordsweb-web-update-refresh', JSON.stringify({ version: release.version, at: new Date().toISOString() })) } catch {}
    window.location.replace(buildRefreshUrl(release.version))
  }, [release, updateBlocked])

  useEffect(() => {
    if (!supabaseConfigured) return undefined
    let active = true
    let running = false

    const check = async () => {
      if (running) return
      running = true
      try {
        const found = await checkForWebUpdate()
        if (!active) return
        if (found) {
          setRelease((current) => {
            if (!current || current.version !== found.version) setSecondsLeft(UPDATE_GRACE_SECONDS)
            return found
          })
        }
      } catch (error) {
        console.warn('RecordsWeb web update check failed:', error?.message || error)
      } finally {
        running = false
      }
    }

    check()
    const timer = window.setInterval(check, UPDATE_CHECK_SECONDS * 1000)
    const onVisible = () => { if (!document.hidden) check() }
    window.addEventListener('online', check)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('online', check)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    dirtyRootsRef.current.clear()
    setSafetyRevision((value) => value + 1)
  }, [location.pathname])

  useEffect(() => {
    const markDirty = (event) => {
      if (location.pathname === '/login') return
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      const root = target.closest('.modal-portal-content, .registration-form, .clinical-template-layout')
      if (!root) return
      dirtyRootsRef.current.add(root)
      setSafetyRevision((value) => value + 1)
    }
    const observe = new MutationObserver(() => setSafetyRevision((value) => value + 1))
    observe.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-recordsweb-update-blocked'] })
    document.addEventListener('input', markDirty, true)
    document.addEventListener('change', markDirty, true)
    return () => {
      observe.disconnect()
      document.removeEventListener('input', markDirty, true)
      document.removeEventListener('change', markDirty, true)
    }
  }, [location.pathname])

  useEffect(() => {
    if (!release || updateBlocked || refreshStartedRef.current) return undefined
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer)
          window.setTimeout(() => refreshIntoUpdate(false), 0)
          return 0
        }
        return current - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [release, updateBlocked, refreshIntoUpdate])

  if (!release) return null

  return (
    <aside className={`web-update-notice ${updateBlocked ? 'is-deferred' : ''}`} role="status" aria-live="polite">
      <div className="web-update-icon"><ShieldAlert size={20} /></div>
      <div className="web-update-copy">
        <strong>RecordsWeb needs an update</strong>
        <span>Version {release.version} is available. You are using {APP_VERSION}.</span>
        {release.release_notes && <small>{release.release_notes}</small>}
        {updateBlocked ? (
          <em>Automatic refresh is paused while you have unsaved work open.</em>
        ) : (
          <em>RecordsWeb will refresh automatically in {formatCountdown(secondsLeft)}.</em>
        )}
      </div>
      <button type="button" className="web-update-refresh" onClick={() => refreshIntoUpdate(true)}>
        <RefreshCcw size={15} /> Refresh now
      </button>
      <div className="web-update-channel" title="Supabase release channel">{RELEASE_CHANNEL}</div>
    </aside>
  )
}
