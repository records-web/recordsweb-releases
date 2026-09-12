import React, { useEffect, useMemo, useState } from 'react'
import { Activity, Bot, CreditCard, Gamepad2, Handshake, KeyRound, MessageSquareText, Palette, RotateCcw, ServerCog, ShieldCheck, UsersRound } from 'lucide-react'
import StaffAccountsPanel from '../components/management/StaffAccountsPanel'
import StaffAccountModal from '../components/management/StaffAccountModal'
import ResetPasswordModal from '../components/management/ResetPasswordModal'
import DisableAccountModal from '../components/management/DisableAccountModal'
import ForceLogoutModal from '../components/management/ForceLogoutModal'
import ScreenMessageAuditPanel from '../components/management/ScreenMessageAuditPanel'
import SystemStatusPanel from '../components/management/SystemStatusPanel'
import DeletedItemsPanel from '../components/management/DeletedItemsPanel'
import AuditLogPanel from '../components/management/AuditLogPanel'
import StaffProfileDetailsModal from '../components/management/StaffProfileDetailsModal'
import RobloxIntegrationPanel from '../components/management/RobloxIntegrationPanel'
import BrandingPanel from '../components/management/BrandingPanel'
import BillingPanel from '../components/management/BillingPanel'
import SharedCarePanel from '../components/management/SharedCarePanel'
import DiscordIntegrationPanel from '../components/management/DiscordIntegrationPanel'
import { checkAdminService, createAccount, forceLogoutAccount, listAccounts, resetAccountPassword, setAccountActive, updateAccount } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { listStaffSessions, subscribeToStaffSessionChanges, summariseStaffSessions } from '../lib/staffSessions'
import { getInstalledOrganisationCode, normaliseOrganisationCode } from '../lib/installation'
import { sendDiscordLoginDetails } from '../lib/discordIntegrationService'

export default function ManagementPage() {
  const { session, updateProfile } = useAuth()
  const organisationCode = normaliseOrganisationCode(session?.profile?.organisation_code) || getInstalledOrganisationCode()
  const organisationSuffix = organisationCode ? `@${organisationCode}` : '@XX.XX'
  const [rows, setRows] = useState([])
  const [section, setSection] = useState('staff')
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [passwordUser, setPasswordUser] = useState(null)
  const [passwordDelivery, setPasswordDelivery] = useState('manual')
  const [disableUser, setDisableUser] = useState(null)
  const [logoutUser, setLogoutUser] = useState(null)
  const [profileUser, setProfileUser] = useState(null)
  const [staffSessions, setStaffSessions] = useState([])
  const [error, setError] = useState('')
  const [adminService, setAdminService] = useState({ checking: true, ok: false, message: '' })

  async function load() {
    setError('')
    try {
      setRows(await listAccounts())
    } catch (err) {
      setError(err.message || 'Unable to load accounts.')
    }
  }


  async function loadSessions() {
    try {
      setStaffSessions(await listStaffSessions({ limit: 1000 }))
    } catch (err) {
      console.warn('Unable to load staff sessions:', err)
    }
  }

  const sessionSummary = useMemo(() => summariseStaffSessions(staffSessions), [staffSessions])

  useEffect(() => {
    load()
    loadSessions()
    const unsubscribeSessions = subscribeToStaffSessionChanges(() => loadSessions())
    const sessionTimer = window.setInterval(loadSessions, 30000)
    let live = true
    checkAdminService()
      .then(() => { if (live) setAdminService({ checking: false, ok: true, message: 'Online' }) })
      .catch((err) => { if (live) setAdminService({ checking: false, ok: false, message: err.message || 'Unavailable' }) })
    return () => { live = false; unsubscribeSessions?.(); window.clearInterval(sessionTimer) }
  }, [])

  async function toggle(user) {
    if (user.id === session?.user?.id) {
      setError('You cannot disable your own account while signed in.')
      return
    }
    if (user.active) {
      setDisableUser(user)
      return
    }
    try {
      await setAccountActive(user.id, true)
      await load()
    } catch (err) {
      setError(err.message || 'Unable to update account.')
    }
  }

  async function saveEdit(payload) {
    const updated = await updateAccount(editUser.id, payload)
    if (updated.id === session?.user?.id) updateProfile(updated)
    setEditUser(null)
    await load()
  }

  return (
    <div className="page-pad workspace-page management-page">
      <div className="page-title-row">
        <div>
          <h1>Management</h1>
          <p>Manage RecordsWeb staff access, community branding and organisation operations.</p>
        </div>
      </div>

      {error && <div className="form-error management-error">{error}</div>}

      <div className="management-summary">
        <div><UsersRound size={20}/><strong>{rows.filter((item) => item.active).length}</strong><span>Active accounts</span></div>
        <div><ShieldCheck size={20}/><strong>{rows.filter((item) => item.is_management).length}</strong><span>Management accounts</span></div>
        <div><KeyRound size={20}/><strong>{organisationSuffix}</strong><span>Login namespace</span></div>
        <div className={adminService.ok ? 'admin-service-online' : 'admin-service-offline'} title={adminService.message}><ServerCog size={20}/><strong>{adminService.checking ? 'Checking…' : adminService.ok ? 'Online' : 'Unavailable'}</strong><span>Admin service</span></div>
      </div>

      <div className="management-section-tabs">
        <button className={section === 'staff' ? 'active' : ''} onClick={() => setSection('staff')}><UsersRound size={14}/> Staff accounts</button>
        <button className={section === 'branding' ? 'active' : ''} onClick={() => setSection('branding')}><Palette size={14}/> Community branding</button>
        <button className={section === 'billing' ? 'active' : ''} onClick={() => setSection('billing')}><CreditCard size={14}/> Subscription & billing</button>
        <button className={section === 'shared-care' ? 'active' : ''} onClick={() => setSection('shared-care')}><Handshake size={14}/> Shared Care</button>
        <button className={section === 'discord' ? 'active' : ''} onClick={() => setSection('discord')}><Bot size={14}/> Discord bot</button>
        <button className={section === 'messages' ? 'active' : ''} onClick={() => setSection('messages')}><MessageSquareText size={14}/> Screen message logs</button>
        <button className={section === 'audit' ? 'active' : ''} onClick={() => setSection('audit')}><Activity size={14}/> Audit log</button>
        <button className={section === 'deleted' ? 'active' : ''} onClick={() => setSection('deleted')}><RotateCcw size={14}/> Deleted items</button>
        <button className={section === 'status' ? 'active' : ''} onClick={() => setSection('status')}><ServerCog size={14}/> System status</button>
        <button className={section === 'roblox' ? 'active' : ''} onClick={() => setSection('roblox')}><Gamepad2 size={14}/> Roblox integration</button>
      </div>

      {section === 'staff' && (
        <StaffAccountsPanel
          rows={rows}
          currentUserId={session?.user?.id}
          onCreate={() => setCreateOpen(true)}
          onEdit={setEditUser}
          onPassword={(user) => { setPasswordDelivery('manual'); setPasswordUser(user) }}
          onDiscordLogin={(user) => { setPasswordDelivery('discord'); setPasswordUser(user) }}
          onToggle={toggle}
          onForceLogout={setLogoutUser}
          onViewProfile={setProfileUser}
          sessionSummary={sessionSummary}
        />
      )}

      {section === 'branding' && <BrandingPanel />}
      {section === 'billing' && <BillingPanel />}
      {section === 'shared-care' && <SharedCarePanel />}
      {section === 'discord' && <DiscordIntegrationPanel />}
      {section === 'messages' && <ScreenMessageAuditPanel staff={rows} />}
      {section === 'audit' && <AuditLogPanel />}
      {section === 'deleted' && <DeletedItemsPanel />}
      {section === 'status' && <SystemStatusPanel />}
      {section === 'roblox' && <RobloxIntegrationPanel />}


      {profileUser && (
        <StaffProfileDetailsModal
          user={profileUser}
          sessionSummary={sessionSummary[profileUser.id]}
          onClose={() => setProfileUser(null)}
        />
      )}

      {createOpen && (
        <StaffAccountModal
          currentUserId={session?.user?.id}
          organisationCode={organisationCode}
          organisationMode={session?.profile?.organisation_mode || 'general_practice'}
          onClose={() => setCreateOpen(false)}
          onSave={async (payload) => {
            const { send_discord_login: sendDiscordLogin, ...accountPayload } = payload
            const created = await createAccount({ ...accountPayload, organisation_code: organisationCode })
            let discordWarning = ''
            if (sendDiscordLogin && created?.discord_user_id) {
              try { await sendDiscordLoginDetails({ userId: created.id, temporaryPassword: accountPayload.password }) }
              catch (err) { discordWarning = err.message || 'Discord login DM could not be sent.' }
            }
            setCreateOpen(false)
            await load()
            if (discordWarning) setError(`Account created, but the Discord DM failed: ${discordWarning}`)
          }}
        />
      )}

      {editUser && (
        <StaffAccountModal
          account={editUser}
          currentUserId={session?.user?.id}
          organisationCode={organisationCode}
          organisationMode={session?.profile?.organisation_mode || 'general_practice'}
          onClose={() => setEditUser(null)}
          onSave={saveEdit}
        />
      )}

      {disableUser && (
        <DisableAccountModal
          user={disableUser}
          onClose={() => setDisableUser(null)}
          onConfirm={async (reason) => {
            await setAccountActive(disableUser.id, false, reason)
            await load()
          }}
        />
      )}

      {logoutUser && (
        <ForceLogoutModal
          user={logoutUser}
          onClose={() => setLogoutUser(null)}
          onConfirm={async () => {
            await forceLogoutAccount(logoutUser.id)
            await load()
          }}
        />
      )}

      {passwordUser && (
        <ResetPasswordModal
          user={passwordUser}
          forceDiscord={passwordDelivery === 'discord'}
          onClose={() => setPasswordUser(null)}
          onSave={async (password, options = {}) => {
            await resetAccountPassword(passwordUser.id, password)
            let discordWarning = ''
            if (options.sendDiscord) {
              try { await sendDiscordLoginDetails({ userId: passwordUser.id, temporaryPassword: password }) }
              catch (err) { discordWarning = err.message || 'Discord login DM could not be sent.' }
            }
            setPasswordUser(null)
            await load()
            if (discordWarning) setError(`Password was reset, but the Discord DM failed: ${discordWarning}`)
          }}
        />
      )}
    </div>
  )
}
