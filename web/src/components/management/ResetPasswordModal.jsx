import React, { useEffect, useState } from 'react'
import { Send, X } from 'lucide-react'
import ModalPortal from '../ModalPortal'
import { validateRecordsWebPassword } from '../../lib/passwordPolicy'

export default function ResetPasswordModal({ user, forceDiscord = false, onClose, onSave }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [sendDiscord, setSendDiscord] = useState(Boolean(forceDiscord && user?.discord_user_id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setSendDiscord(Boolean(forceDiscord && user?.discord_user_id)) }, [forceDiscord, user?.discord_user_id])

  async function save() {
    const policyError = validateRecordsWebPassword(password, user?.username || '')
    if (policyError) { setError(policyError); return }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (forceDiscord && !user?.discord_user_id) {
      setError('This staff account does not have a Discord User ID. Edit the account and add one first.')
      return
    }
    setSaving(true)
    try {
      await onSave(password, { sendDiscord })
    } catch (err) {
      setError(err.message || 'Unable to reset password.')
      setSaving(false)
    }
  }

  const discordMode = Boolean(forceDiscord)

  return (
    <ModalPortal onClose={onClose} ariaLabel={discordMode ? 'Send login details by Discord' : 'Reset password'}>
      <div className="records-modal small-modal">
        <header>
          <div><strong>{discordMode ? 'Send login details by Discord' : 'Reset password'}</strong><span>{user.display_name}</span></div>
          <button onClick={onClose}><X size={18}/></button>
        </header>
        <div className="records-form-grid one-col">
          {discordMode && <div className="discord-login-modal-intro"><Send size={16}/><span>RecordsWeb will set a new temporary password and the official RecordsWeb Bot will DM a branded login image containing the username and temporary password to Discord user <strong>{user.discord_user_id || 'not linked'}</strong>.</span></div>}
          <label>New temporary password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label>
          <small>This temporary password must contain at least 10 characters, including a letter and a number. The user will be forced to change it at next sign-in.</small>
          <label>Confirm password<input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" /></label>
          {user?.discord_user_id && !discordMode && (
            <label className="check-label discord-reset-send-check"><input type="checkbox" checked={sendDiscord} onChange={(event) => setSendDiscord(event.target.checked)} /><span><strong>Send the new login details by Discord DM</strong><small>Uses RecordsWeb Bot and the Discord User ID linked to this staff account.</small></span></label>
          )}
          {discordMode && <input type="hidden" value={sendDiscord ? '1' : '0'} readOnly />}
        </div>
        {error && <div className="form-error modal-error">{error}</div>}
        <footer>
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={saving} onClick={save}>{saving ? 'Saving…' : discordMode ? 'Set password & send DM' : 'Set password'}</button>
        </footer>
      </div>
    </ModalPortal>
  )
}
