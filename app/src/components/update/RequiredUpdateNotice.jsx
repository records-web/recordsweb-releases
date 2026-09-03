import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { getLatestAppRelease, isNewerVersion } from '../../lib/appUpdates'
import { supabaseConfigured } from '../../lib/supabase'

const POLL_INTERVAL_MS = 60_000
const FORCED_UPDATE_SECONDS = 120

function formatCountdown(value) {
  const seconds = Math.max(0, Number(value || 0))
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export default function RequiredUpdateNotice() {
  const [release, setRelease] = useState(null)
  const [starting, setStarting] = useState(false)
  const [countdown, setCountdown] = useState(FORCED_UPDATE_SECONDS)
  const currentVersionRef = useRef('')
  const startedRef = useRef(false)
  const deadlineRef = useRef(0)

  const check = useCallback(async () => {
    if (!supabaseConfigured || !window.recordsWebDesktop?.getAppInfo) return
    try {
      const appInfo = await window.recordsWebDesktop.getAppInfo()
      if (!appInfo?.isPackaged || appInfo?.updateTestMode) return
      currentVersionRef.current = String(appInfo.version || '')
      const latest = await getLatestAppRelease('stable')
      if (latest?.version && isNewerVersion(latest.version, currentVersionRef.current)) {
        setRelease((current) => current?.version === latest.version ? current : latest)
      } else {
        setRelease(null)
      }
    } catch {
      // Background checks must never interrupt clinical work. The normal startup
      // update gate still handles mandatory-version connectivity failures.
    }
  }, [])

  useEffect(() => {
    void check()
    const timer = window.setInterval(() => void check(), POLL_INTERVAL_MS)
    const onFocus = () => void check()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [check])

  const startUpdate = useCallback(() => {
    if (!release?.version || starting || startedRef.current) return
    startedRef.current = true
    setStarting(true)
    window.dispatchEvent(new CustomEvent('recordsweb:start-required-update', { detail: { version: release.version } }))
  }, [release?.version, starting])

  useEffect(() => {
    if (!release?.version) {
      deadlineRef.current = 0
      return undefined
    }

    startedRef.current = false
    setStarting(false)
    deadlineRef.current = Date.now() + (FORCED_UPDATE_SECONDS * 1000)

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000))
      setCountdown(remaining)
    }

    updateCountdown()
    const timer = window.setInterval(updateCountdown, 500)
    return () => window.clearInterval(timer)
  }, [release?.version])

  useEffect(() => {
    if (release?.version && countdown <= 0 && !starting) startUpdate()
  }, [countdown, release?.version, starting, startUpdate])

  if (!release) return null

  const progress = Math.max(0, Math.min(100, ((FORCED_UPDATE_SECONDS - countdown) / FORCED_UPDATE_SECONDS) * 100))

  return (
    <aside className="required-update-notice" role="alert" aria-live="assertive">
      <div className="required-update-icon"><Download size={20}/></div>
      <div className="required-update-main">
        <div className="required-update-title-row">
          <strong>An update is required</strong>
          <span className="required-update-mandatory">Mandatory</span>
        </div>
        <p className="required-update-copy">
          RecordsWeb v{release.version} is ready. Save any work now. RecordsWeb will automatically update when the countdown reaches zero.
        </p>
        <div className="required-update-actions">
          <div className="required-update-countdown">
            <span>Update starts in</span>
            <b>{starting ? 'Starting…' : formatCountdown(countdown)}</b>
          </div>
          <button type="button" className="required-update-start" onClick={startUpdate} disabled={starting}>
            {starting ? 'Starting update…' : 'Update now'}
          </button>
        </div>
        <div className="required-update-timer-track" aria-hidden="true">
          <div className="required-update-timer-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </aside>
  )
}
