import React, { useState } from 'react'
import { Ban, X } from 'lucide-react'
import ModalPortal from '../ModalPortal'

export default function DisableAccountModal({ user, onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    const clean = reason.trim()
    if (!clean) {
      setError('Enter a reason for disabling this account.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onConfirm(clean)
      onClose()
    } catch (err) {
      setError(err.message || 'Unable to disable this account.')
      setSaving(false)
    }
  }

  return (
    <ModalPortal onClose={onClose} ariaLabel="Disable staff account">
      <div className="records-modal management-modal account-action-modal">
        <header>
          <div><strong>Disable staff account</strong><span>Management access control</span></div>
          <button onClick={onClose}><X size={18}/></button>
        </header>
        <div className="account-action-body">
          <div className="account-action-summary"><Ban size={18}/><span><strong>{user.display_name}</strong><small>{user.username}</small></span></div>
          <p>This account will be blocked from signing in. If the staff member currently has RecordsWeb open, their session will also be ended.</p>
          <label>
            Reason for disabling
            <textarea maxLength={500} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} autoFocus placeholder="Enter the reason that will be shown to this user when they try to sign in." />
            <small>{reason.length}/500</small>
          </label>
          {error && <div className="form-error modal-error">{error}</div>}
        </div>
        <footer>
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button danger-action-button" onClick={submit} disabled={saving || !reason.trim()}>{saving ? 'Disabling…' : 'Disable account'}</button>
        </footer>
      </div>
    </ModalPortal>
  )
}
