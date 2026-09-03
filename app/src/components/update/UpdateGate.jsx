import React, { useCallback, useEffect, useRef, useState } from 'react'
import { getLatestAppRelease, isNewerVersion } from '../../lib/appUpdates'
import { getGitHubUpdateConfig, hasGitHubUpdateConfig } from '../../lib/updateConfig'
import { supabaseConfigured } from '../../lib/supabase'
import UpdateScreen from './UpdateScreen'

const desktop = typeof window !== 'undefined' ? window.recordsWebDesktop : null

export default function UpdateGate({ children }) {
  const [state, setState] = useState({ stage: 'checking', percent: 0 })
  const latestReleaseRef = useRef(null)
  const currentVersionRef = useRef(null)
  const installStartedRef = useRef(false)

  const installDownloadedUpdate = useCallback(async () => {
    if (installStartedRef.current) return
    installStartedRef.current = true
    setState((current) => ({ ...current, stage: 'installing', percent: 100 }))
    await new Promise((resolve) => setTimeout(resolve, 900))
    try {
      await desktop?.installUpdate?.()
    } catch (error) {
      installStartedRef.current = false
      setState((current) => ({ ...current, stage: 'error', error: String(error?.message || error) }))
    }
  }, [])

  useEffect(() => {
    if (!desktop?.onUpdateState) return undefined

    return desktop.onUpdateState((event) => {
      if (!event || typeof event !== 'object') return

      if (event.status === 'checking' || event.status === 'available') {
        setState((current) => ({ ...current, stage: 'updating' }))
      } else if (event.status === 'downloading') {
        setState((current) => ({
          ...current,
          stage: 'updating',
          percent: Number(event.percent || 0),
          transferred: event.transferred,
          total: event.total,
        }))
      } else if (event.status === 'downloaded') {
        void installDownloadedUpdate()
      } else if (event.status === 'test-complete') {
        installStartedRef.current = false
        setState((previous) => ({ ...previous, stage: 'ready', testComplete: true }))
      } else if (event.status === 'not-available') {
        const expected = latestReleaseRef.current?.version
        const current = currentVersionRef.current
        if (expected && current && isNewerVersion(expected, current)) {
          setState((previous) => ({
            ...previous,
            stage: 'error',
            error: `GitHub did not provide required RecordsWeb version ${expected}. Check that the matching release is published and marked as the latest release.`,
          }))
        } else {
          setState((previous) => ({ ...previous, stage: 'ready' }))
        }
      } else if (event.status === 'error') {
        setState((previous) => ({ ...previous, stage: 'error', error: event.error || 'The update failed.' }))
      }
    })
  }, [installDownloadedUpdate])

  const startRequiredUpdate = useCallback(async (targetVersion) => {
    const version = String(targetVersion || '').trim()
    if (!version) return

    try {
      const appInfo = await desktop?.getAppInfo?.()
      const currentVersion = String(appInfo?.version || currentVersionRef.current || '').trim()
      currentVersionRef.current = currentVersion
      latestReleaseRef.current = { ...(latestReleaseRef.current || {}), version }

      if (!appInfo?.isPackaged && !appInfo?.updateTestMode) {
        setState({ stage: 'ready', percent: 0, currentVersion, targetVersion: version, developmentBypass: true })
        return
      }

      const github = getGitHubUpdateConfig()
      if (!appInfo?.updateTestMode && !hasGitHubUpdateConfig(github)) {
        throw new Error(
          `RecordsWeb v${version} is required, but the GitHub update repository is not configured. ` +
          'Set VITE_GITHUB_UPDATE_OWNER and VITE_GITHUB_UPDATE_REPO in the app .env before building.'
        )
      }

      installStartedRef.current = false
      setState({ stage: 'updating', percent: 0, currentVersion, targetVersion: version })
      await desktop?.setWindowMode?.('update')
      const result = await desktop?.startUpdate?.({
        provider: 'github',
        owner: github.owner,
        repo: github.repo,
        channel: github.channel,
        expectedVersion: version,
      })

      if (result?.development) {
        setState({ stage: 'ready', percent: 0, currentVersion, targetVersion: version, developmentBypass: true })
      }
    } catch (error) {
      setState((current) => ({
        ...current,
        stage: 'error',
        error: String(error?.message || error || 'The update failed.'),
      }))
    }
  }, [])

  const checkVersion = useCallback(async () => {
    installStartedRef.current = false
    setState({ stage: 'checking', percent: 0 })

    try {
      if (!desktop?.getAppInfo) {
        setState({ stage: 'ready', percent: 0 })
        return
      }

      const appInfo = await desktop.getAppInfo()
      const currentVersion = String(appInfo?.version || '').trim()
      currentVersionRef.current = currentVersion
      setState((current) => ({ ...current, currentVersion }))

      // Development-only UI/progress simulator. It does not download or install a binary.
      if (appInfo?.updateTestMode) {
        const targetVersion = '9.9.9-test'
        latestReleaseRef.current = { version: targetVersion }
        setState({ stage: 'updating', percent: 0, currentVersion, targetVersion })
        await desktop.startUpdate({ expectedVersion: targetVersion })
        return
      }

      if (!supabaseConfigured) {
        setState({ stage: 'ready', percent: 0, currentVersion })
        return
      }

      const release = await getLatestAppRelease('stable')
      latestReleaseRef.current = release

      if (!release?.version || !isNewerVersion(release.version, currentVersion)) {
        setState({ stage: 'ready', percent: 0, currentVersion, targetVersion: release?.version || null })
        return
      }

      const targetVersion = release.version
      await startRequiredUpdate(targetVersion)
    } catch (error) {
      setState((current) => ({
        ...current,
        stage: 'error',
        error: String(error?.message || error || 'RecordsWeb could not verify the installed version.'),
      }))
    }
  }, [startRequiredUpdate])

  useEffect(() => {
    void checkVersion()
  }, [checkVersion])

  useEffect(() => {
    const onStartRequiredUpdate = (event) => {
      const version = event?.detail?.version
      if (version) void startRequiredUpdate(version)
    }
    window.addEventListener('recordsweb:start-required-update', onStartRequiredUpdate)
    return () => window.removeEventListener('recordsweb:start-required-update', onStartRequiredUpdate)
  }, [startRequiredUpdate])

  useEffect(() => {
    if (state.stage === 'ready') return
    Promise.resolve(desktop?.setWindowMode?.('update')).catch(() => {})
  }, [state.stage])

  if (state.stage === 'ready') return children

  return (
    <UpdateScreen
      stage={state.stage}
      percent={state.percent}
      currentVersion={state.currentVersion}
      targetVersion={state.targetVersion || latestReleaseRef.current?.version}
      transferred={state.transferred}
      total={state.total}
      error={state.error}
      onRetry={checkVersion}
      onQuit={() => desktop?.quit?.()}
    />
  )
}
