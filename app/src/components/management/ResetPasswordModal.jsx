import React, { useState } from 'react'
import { X } from 'lucide-react'
import ModalPortal from '../ModalPortal'
import { validateRecordsWebPassword } from '../../lib/passwordPolicy'

export default function ResetPasswordModal({ user, onClose, onSave }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    const policyError = validateRecordsWebPassword(password, user?.username || '')
    if (policyError) { setError(policyError); return }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSaving(true)
    try {
      await onSave(password)
    } catch (err) {
      setError(err.message || 'Unable to reset password.')
      setSaving(false)
    }
  }

  return (
    <ModalPortal onClose={onClose} ariaLabel="Reset password">
      <div className="records-modal small-modal">
        <header>
          <div><strong>Reset password</strong><span>{user.display_name}</span></div>
          <button onClick={onClose}><X size={18}/></button>
        </header>
        <div className="records-form-grid one-col">
          <label>New password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <small>This temporary password must contain at least 10 characters, including a letter and a number. The user will be forced to change it at next sign-in.</small>
          <label>Confirm password<input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
        </div>
        {error && <div className="form-error modal-error">{error}</div>}
        <footer>
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Set password'}</button>
        </footer>
      </div>
    </ModalPortal>
  )
}
