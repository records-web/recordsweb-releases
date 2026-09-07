import React, { useState } from 'react'
import { Building2, X } from 'lucide-react'
import ModalPortal from '../ModalPortal'
import {
  getInstalledOrganisationCode,
  normaliseOrganisationCode,
  saveInstalledOrganisationCode,
} from '../../lib/installation'
import { verifyOrganisationCode } from '../../lib/organisationDirectory'

export default function OrganisationChangeModal({ onClose }) {
  const currentCode = getInstalledOrganisationCode()
  const [extension, setExtension] = useState(currentCode ? `@${currentCode}` : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event?.preventDefault?.()
    if (busy) return

    setError('')
    const requestedCode = normaliseOrganisationCode(extension)
    if (!requestedCode) {
      setError('Enter the four-letter organisation extension in the format @XX.XX.')
      return
    }

    if (requestedCode === currentCode) {
      onClose?.()
      return
    }

    setBusy(true)
    try {
      const verified = await verifyOrganisationCode(requestedCode)
      const organisationCode = verified.code || requestedCode
      await saveInstalledOrganisationCode(organisationCode)

      try {
        sessionStorage.setItem(
          'recordsweb-login-notice',
          `Organisation changed to @${organisationCode}. Sign in with an account for this organisation.`,
        )
      } catch {}

      // Organisation-specific service/storage keys are resolved when modules load.
      // A reload guarantees that no previous organisation namespace stays active.
      window.location.reload()
    } catch (err) {
      setError(err?.message || 'Unable to change the RecordsWeb organisation.')
      setBusy(false)
    }
  }

  return (
    <ModalPortal onClose={busy ? undefined : onClose} closeOnBackdrop={!busy} ariaLabel="Change RecordsWeb organisation">
      <div className="records-modal login-organisation-modal">
        <header>
          <div>
            <strong>Change organisation</strong>
            <span>Switch this browser to another approved RecordsWeb organisation</span>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={18}/>
          </button>
        </header>

        <div className="modal-patient-strip">
          Current organisation: {currentCode ? `@${currentCode}` : 'Not configured'}
        </div>

        <form className="login-organisation-form" onSubmit={submit} autoComplete="off">
          <div className="organisation-change-heading">
            <Building2 size={17}/>
            <div>
              <strong>Organisation extension</strong>
              <span>Enter the extension supplied for the organisation you want to use.</span>
            </div>
          </div>

          <label>
            Extension
            <input
              autoFocus
              value={extension}
              onChange={(event) => setExtension(event.target.value.toUpperCase())}
              placeholder="@GW.HC"
              maxLength={6}
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>

          <p className="organisation-change-help">
            Extensions contain four letters separated by a full stop, for example <strong>@GW.HC</strong>. RecordsWeb will verify that the organisation exists and is active before switching.
          </p>

          <div className="organisation-change-warning">
            Changing organisation changes the login namespace and the organisation data this browser connects to. You will remain on the sign-in screen and must use an account belonging to the selected organisation.
          </div>

          {error && <div className="form-error modal-error organisation-change-error">{error}</div>}
        </form>

        <footer>
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="primary-button" onClick={submit} disabled={busy}>
            {busy ? 'Checking…' : 'Change organisation'}
          </button>
        </footer>
      </div>
    </ModalPortal>
  )
}
