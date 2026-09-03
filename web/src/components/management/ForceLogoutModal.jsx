import React, { useState } from 'react'
import { LogOut, X } from 'lucide-react'
import ModalPortal from '../ModalPortal'

export default function ForceLogoutModal({ user, onClose, onConfirm }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setSaving(true)
    setError('')
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      setError(err.message || 'Unable to sign this user out.')
      setSaving(false)
    }
  }

  return (
    <ModalPortal onClose={onClose} ariaLabel="Force staff logout">
      <div className="records-modal management-modal account-action-modal">
        <header>
          <div><strong>Force staff logout</strong><span>Management access control</span></div>
          <button onClick={onClose}><X size={18}/></button>
        </header>
        <div className="account-action-body">
          <div className="account-action-summary"><LogOut size={18}/><span><strong>{user.display_name}</strong><small>{user.username}</small></span></div>
          <p>This ends the staff member's active RecordsWeb session. Their account remains enabled and they can sign in again normally.</p>
          {error && <div className="form-error modal-error">{error}</div>}
        </div>
        <footer>
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" onClick={submit} disabled={saving}>{saving ? 'Signing out…' : 'Force logout'}</button>
        </footer>
      </div>
    </ModalPortal>
  )
}
