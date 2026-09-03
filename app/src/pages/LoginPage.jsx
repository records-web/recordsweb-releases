import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { normaliseLoginName, signInRecordsWeb, supabaseConfigured } from '../lib/supabase'
import { ORGANISATION } from '../lib/demoData'
import { applyOrganisationSettings, getCachedOrganisationSettings, loadOrganisationSettings } from '../lib/organisationSettings'
import AccountRecoveryModal from '../components/security/AccountRecoveryModal'

export default function LoginPage() {
  const [username, setUsername] = useState(supabaseConfigured ? '' : 'manager.grove@GW.HC')
  const [password, setPassword] = useState(supabaseConfigured ? '' : 'demo')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(() => {
    try {
      const value = sessionStorage.getItem('recordsweb-login-notice') || ''
      sessionStorage.removeItem('recordsweb-login-notice')
      return value
    } catch { return '' }
  })
  const [organisationSettings, setOrganisationSettings] = useState(() => getCachedOrganisationSettings())
  const [appVersion, setAppVersion] = useState('3.1.9')
  const [recoveryMode, setRecoveryMode] = useState('')
  const usernameRef = useRef(null)
  const { login, session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const restoreLoginFocus = useCallback((force = false) => {
    const field = usernameRef.current
    if (!field || field.disabled) return

    const active = document.activeElement
    const focusIsAlreadyUseful = active && (
      active === field ||
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT' ||
      active.tagName === 'BUTTON'
    )
    if (!force && focusIsAlreadyUseful) return

    try { field.focus({ preventScroll: true }) } catch { field.focus() }
  }, [])

  useEffect(() => {
    let cancelled = false
    let delayedFocus = null

    Promise.resolve(window.recordsWebDesktop?.setWindowMode?.('login'))
      .catch(() => {})
      .finally(() => {
        if (cancelled) return
        window.requestAnimationFrame(() => restoreLoginFocus(true))
        delayedFocus = window.setTimeout(() => restoreLoginFocus(), 120)
      })
    window.recordsWebDesktop?.getAppInfo?.().then((info) => {
      if (info?.version) setAppVersion(info.version)
    }).catch(() => {})

    applyOrganisationSettings(organisationSettings)
    const sync = (event) => setOrganisationSettings(event?.detail || getCachedOrganisationSettings())
    const recoverFocus = () => restoreLoginFocus()
    const recoverVisibleFocus = () => {
      if (!document.hidden) restoreLoginFocus()
    }

    window.addEventListener('recordsweb-organisation-settings-changed', sync)
    window.addEventListener('focus', recoverFocus)
    document.addEventListener('visibilitychange', recoverVisibleFocus)
    loadOrganisationSettings().then(setOrganisationSettings).catch(() => {})
    return () => {
      cancelled = true
      if (delayedFocus) window.clearTimeout(delayedFocus)
      window.removeEventListener('recordsweb-organisation-settings-changed', sync)
      window.removeEventListener('focus', recoverFocus)
      document.removeEventListener('visibilitychange', recoverVisibleFocus)
    }
    // Load once on the sign-in screen; later changes arrive through the event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreLoginFocus])

  if (session) return <Navigate to="/" replace />

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')

    try {
      const result = await signInRecordsWeb({ username, password })
      login(result)
      navigate(location.state?.from?.pathname || '/', { replace: true })
    } catch (err) {
      const message = String(err?.message || '')
      setError(/rpc\(|\.catch|TypeError|schema cache/i.test(message) ? 'Unable to sign in. Please check your username and password and try again.' : (message || 'Unable to sign in.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="emis-login-screen">
      <div className="emis-login-window simplified-login-window">
        <div className="login-version">RecordsWeb {appVersion} · Desktop Clinical System</div>

        <div className="legacy-brand-row simplified-brand-row">
          <div className="recordsweb-logo recordsweb-logo-text">{organisationSettings.logoUrl && <img draggable={false} className="login-organisation-logo" src={organisationSettings.logoUrl} alt={`${ORGANISATION.name} logo`} />}<strong>RecordsWeb</strong></div>
          <div className="centre-lockup">
            <strong>{ORGANISATION.name}</strong>
            <span>Health care records</span>
          </div>
        </div>

        <div className="legacy-blue-rule" />

        <section className="legacy-credentials simplified-credentials">
          <h2>Sign in with RecordsWeb credentials</h2>
          <form onSubmit={submit} autoComplete="off">
            <label>
              <span>Username</span>
              <input
                ref={usernameRef}
                name="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                onBlur={() => setUsername(normaliseLoginName(username))}
                placeholder="first.last@GW.HC"
                autoComplete="off"
                autoFocus
                required
              />
            </label>
            <label>
              <span>Password</span>
              <input
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="off"
                required
              />
            </label>

            {notice && <div className="legacy-login-notice">{notice}</div>}
            {error && <div className="form-error legacy-error">{error}</div>}

            <div className="legacy-login-actions">
              <button className="legacy-signin" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              <button type="button" className="legacy-close" onClick={() => window.close()}>
                Close
              </button>
            </div>
          </form>

          <div className="legacy-login-links">
            <button type="button" onClick={() => setRecoveryMode('password')}>Reset password</button>
            <button type="button" onClick={() => setRecoveryMode('username')}>Username reminder</button>
          </div>
        </section>

        {!supabaseConfigured && (
          <div className="legacy-demo-notice">
            <strong>Demo mode:</strong> <code>manager.grove@GW.HC</code> / <code>demo</code>. Accounts created in Management are saved locally on this computer.
          </div>
        )}

        <div className="legacy-login-footer">
          <span>Connection: {supabaseConfigured ? 'Grove Way Supabase' : 'Local demo database'}</span>
          <span>Organisation: {ORGANISATION.org_code}</span>
        </div>

        <div className="legacy-copyright">
          RecordsWeb · {ORGANISATION.name}. Prototype clinical software. Do not use with live patient data until security, information-governance and clinical-safety requirements have been completed.
        </div>
        {recoveryMode && <AccountRecoveryModal mode={recoveryMode} onClose={() => setRecoveryMode('')} />}
      </div>
    </div>
  )
}
