import React, { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { getInstallationState, normaliseOrganisationCode, saveInstalledOrganisationCode } from '../../lib/installation'
import { supabaseConfigured } from '../../lib/supabase'
import { verifyOrganisationCode } from '../../lib/organisationDirectory'

export default function InstallationGate({ children }) {
  const [state, setState] = useState(() => getInstallationState())
  const [extension, setExtension] = useState(() => {
    const current = getInstallationState().organisationCode
    return current ? `@${current}` : ''
  })
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(() => Boolean(getInstallationState().configured && supabaseConfigured))
  const [requiresCorrection, setRequiresCorrection] = useState(false)
  const [error, setError] = useState('')
  const [appVersion, setAppVersion] = useState('3.2.4')

  useEffect(() => {
    Promise.resolve(window.recordsWebDesktop?.setWindowMode?.('login')).catch(() => {})
    Promise.resolve(window.recordsWebDesktop?.getAppInfo?.()).then((info) => {
      if (info?.version) setAppVersion(info.version)
    }).catch(() => {})

    const sync = (event) => {
      const next = event?.detail || getInstallationState()
      setState(next)
      if (next.organisationCode) setExtension(`@${next.organisationCode}`)
    }
    window.addEventListener('recordsweb-installation-changed', sync)
    return () => window.removeEventListener('recordsweb-installation-changed', sync)
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!state.configured || !supabaseConfigured) {
      setChecking(false)
      return undefined
    }

    setChecking(true)
    setRequiresCorrection(false)
    setError('')
    verifyOrganisationCode(state.organisationCode)
      .then(() => {
        if (!cancelled) {
          setRequiresCorrection(false)
          setChecking(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || 'Unable to verify this RecordsWeb organisation.')
          setRequiresCorrection(true)
          setChecking(false)
        }
      })

    return () => { cancelled = true }
  }, [state.configured, state.organisationCode])

  if (state.configured && !checking && !requiresCorrection) return children

  async function submit(event) {
    event.preventDefault()
    setError('')
    const code = normaliseOrganisationCode(extension)
    if (!code) {
      setError('Enter the four-letter organisation extension in the format @XX.XX.')
      return
    }

    setSaving(true)
    try {
      await verifyOrganisationCode(code)
      await saveInstalledOrganisationCode(code)
      // The RecordsWeb namespace is read during module initialisation. Reloading
      // once here guarantees every service starts with the selected organisation.
      window.location.reload()
    } catch (err) {
      setError(err?.message || 'Unable to save the organisation extension.')
      setSaving(false)
    }
  }

  return (
    <div className="emis-login-screen">
      <div className="emis-login-window simplified-login-window installation-setup-window">
        <div className="login-version">RecordsWeb {appVersion} · Desktop Clinical System</div>

        <div className="legacy-brand-row simplified-brand-row">
          <div className="recordsweb-logo recordsweb-logo-text"><strong>RecordsWeb</strong></div>
          <div className="centre-lockup"><strong>Organisation setup</strong><span>Clinical records deployment</span></div>
        </div>

        <div className="legacy-blue-rule" />

        <section className="legacy-credentials simplified-credentials">
          <div className="maintenance-heading">
            <Building2 size={19}/>
            <div>
              <h2>{checking ? 'Checking this installation' : requiresCorrection ? 'Check organisation extension' : 'Connect this installation'}</h2>
              <span>{checking ? 'RecordsWeb is verifying the installed organisation.' : 'Enter the organisation extension supplied for this deployment.'}</span>
            </div>
          </div>

          {checking ? (
            <div className="maintenance-help">Verifying <strong>@{state.organisationCode}</strong> with RecordsWeb…</div>
          ) : (
            <form onSubmit={submit} autoComplete="off">
              <label>
                <span>Extension</span>
                <input
                  value={extension}
                  onChange={(event) => setExtension(event.target.value.toUpperCase())}
                  placeholder="@GW.HC"
                  maxLength={6}
                  autoFocus
                  required
                />
              </label>
              <p className="maintenance-help">The extension contains four letters separated by a full stop, for example <strong>@GW.HC</strong>. RecordsWeb uses it to select the correct organisation and login namespace.</p>
              {error && <div className="form-error legacy-error">{error}</div>}
              <div className="legacy-login-actions">
                <button className="legacy-signin" disabled={saving}>{saving ? 'Checking…' : 'Continue'}</button>
                <button type="button" className="legacy-close" onClick={() => window.recordsWebDesktop?.quit?.() || window.close()}>Close</button>
              </div>
            </form>
          )}
        </section>

        <div className="legacy-login-footer"><span>RecordsWeb deployment setup</span><span>Format: @XX.XX</span></div>
        <div className="legacy-copyright">RecordsWeb · Organisation-controlled clinical records platform.</div>
      </div>
    </div>
  )
}
