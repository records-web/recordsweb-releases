import React, { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { normaliseLoginName } from '../../lib/supabase'
import { STAFF_TITLES, normaliseRoles } from '../../lib/staffOptions'
import RoleSelector from './RoleSelector'
import ModalPortal from '../ModalPortal'
import { validateRecordsWebPassword } from '../../lib/passwordPolicy'
import { ORGANISATION } from '../../lib/demoData'
import { getInstalledOrganisationCode, normaliseOrganisationCode } from '../../lib/installation'


function normaliseStaffUsername(value, organisationCode) {
  const localOrganisationCode = normaliseOrganisationCode(organisationCode)
  const raw = String(value || '').trim()
  if (!raw || !localOrganisationCode) return normaliseLoginName(raw)
  const withDomain = raw.includes('@') ? raw : `${raw}@${localOrganisationCode}`
  const atIndex = withDomain.lastIndexOf('@')
  const local = withDomain.slice(0, atIndex).trim().toLowerCase()
  const domain = normaliseOrganisationCode(withDomain.slice(atIndex + 1))
  return local && domain === localOrganisationCode ? `${local}@${localOrganisationCode}` : withDomain
}

function suggestedUsername(firstName, lastName, organisationSuffix) {
  const local = `${firstName}.${lastName}`
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '')
    .replace(/^\.|\.$/g, '')
  return local ? `${local}${organisationSuffix}` : ''
}

export default function StaffAccountModal({ account = null, currentUserId, organisationCode = '', onClose, onSave }) {
  const editing = Boolean(account)
  const activeOrganisationCode = normaliseOrganisationCode(organisationCode) || getInstalledOrganisationCode()
  const organisationSuffix = activeOrganisationCode ? `@${activeOrganisationCode}` : '@XX.XX'
  const initialRoles = normaliseRoles(account?.roles, account?.role || 'Patient Coordinator')
  const [form, setForm] = useState({
    title: account?.title || '',
    first_name: account?.first_name || '',
    last_name: account?.last_name || '',
    username: account?.username || '',
    password: '',
    confirm: '',
    role: account?.role || initialRoles[0],
    roles: initialRoles,
    is_management: Boolean(account?.is_management),
  })
  const [touchedUsername, setTouchedUsername] = useState(editing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isSelf = editing && account?.id === currentUserId

  const modalTitle = useMemo(() => editing ? 'Edit staff account' : 'Create RecordsWeb account', [editing])

  function set(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value }
      if (!editing && !touchedUsername && (key === 'first_name' || key === 'last_name')) {
        next.username = suggestedUsername(key === 'first_name' ? value : current.first_name, key === 'last_name' ? value : current.last_name, organisationSuffix)
      }
      return next
    })
  }

  async function save() {
    setError('')
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First and last name are required.')
      return
    }
    if (!editing) { const policyError = validateRecordsWebPassword(form.password, form.username); if (policyError) { setError(policyError); return } }
    if (!editing && form.password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }
    if (!form.roles.length) {
      setError('Select at least one staff role.')
      return
    }
    if (isSelf && account?.is_management && !form.is_management) {
      setError('You cannot remove your own Management access while signed in.')
      return
    }

    setSaving(true)
    try {
      await onSave({
        ...form,
        username: editing ? account.username : normaliseStaffUsername(form.username, activeOrganisationCode),
        roles: normaliseRoles(form.roles, form.role),
      })
    } catch (err) {
      setError(err.message || `Could not ${editing ? 'update' : 'create'} account.`)
      setSaving(false)
    }
  }

  return (
    <ModalPortal onClose={onClose} ariaLabel={modalTitle}>
      <div className="records-modal management-modal staff-account-modal">
        <header>
          <div><strong>{modalTitle}</strong><span>{ORGANISATION.name}</span></div>
          <button onClick={onClose}><X size={18}/></button>
        </header>
        <div className="modal-patient-strip">Account usernames use the {organisationSuffix} namespace</div>

        <div className="records-form-grid staff-account-grid">
          <label>
            Title
            <select value={form.title} onChange={(event) => set('title', event.target.value)}>
              {STAFF_TITLES.map((title) => <option value={title} key={title || 'none'}>{title || 'No title'}</option>)}
            </select>
          </label>
          <label>First name<input value={form.first_name} onChange={(event) => set('first_name', event.target.value)} /></label>
          <label>Last name<input value={form.last_name} onChange={(event) => set('last_name', event.target.value)} /></label>
          <label className="span-two">
            Username
            <input
              value={form.username}
              readOnly={editing}
              onChange={(event) => { setTouchedUsername(true); set('username', event.target.value) }}
              onBlur={(event) => !editing && set('username', normaliseStaffUsername(event.target.value, activeOrganisationCode))}
              placeholder={`first.last${organisationSuffix}`}
            />
            {editing && <small>Usernames are fixed after account creation.</small>}
          </label>

          <RoleSelector
            roles={form.roles}
            primaryRole={form.role}
            onChange={(roles, role) => setForm((current) => ({ ...current, roles, role }))}
          />

          <label className="check-label management-access-check span-two">
            <input
              type="checkbox"
              checked={form.is_management}
              disabled={isSelf && account?.is_management}
              onChange={(event) => set('is_management', event.target.checked)}
            />
            <span>
              <strong>Grant Management access</strong>
              <small>Can create/edit staff accounts, manage branding and change organisation-wide settings.</small>
            </span>
          </label>

          {!editing && <>
            <label>Password<input type="password" value={form.password} onChange={(event) => set('password', event.target.value)} autoComplete="new-password" /></label>
            <label>Confirm password<input type="password" value={form.confirm} onChange={(event) => set('confirm', event.target.value)} autoComplete="new-password" /></label>
          </>}
        </div>

        {error && <div className="form-error modal-error">{error}</div>}
        <footer>
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" onClick={save} disabled={saving || !form.first_name.trim() || !form.last_name.trim() || (!editing && !form.username.trim())}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create account'}
          </button>
        </footer>
      </div>
    </ModalPortal>
  )
}
