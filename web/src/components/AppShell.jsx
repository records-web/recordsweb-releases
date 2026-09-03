import React, { useEffect, useRef, useState } from 'react'
import { CircleHelp, LogOut, Moon, Search, Settings, ShieldCheck, Sun, UserCog, UserRound } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ORGANISATION } from '../lib/demoData'
import { listAppointments } from '../lib/dataService'
import { getSettings, saveSettings } from '../lib/settings'
import { getCachedOrganisationSettings, loadOrganisationSettings } from '../lib/organisationSettings'
import { subscribeToPatientRecordChanges } from '../lib/patientRealtime'
import PatientRecordUpdateBanner from './PatientRecordUpdateBanner'
import ScreenMessageCenter from './messaging/ScreenMessageCenter'
import { recordAudit } from '../lib/auditService'
import { subscribeToPatientPresence } from '../lib/patientPresence'
import ForcedPasswordChange from './security/ForcedPasswordChange'
import SessionLockOverlay from './security/SessionLockOverlay'
import SystemNotificationCenter from './SystemNotificationCenter'
import PatientPresenceBanner from './PatientPresenceBanner'

export default function AppShell({ children }) {
  const { session, logout, updateProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const profile = session?.profile || {}
  const primaryRole = profile.role || (Array.isArray(profile.roles) && profile.roles[0]) || 'Patient Coordinator'
  const staffName = [String(profile.last_name || '').trim().toUpperCase(), String(profile.first_name || '').trim()].filter(Boolean).join(', ')
  const staffIdentity = `${primaryRole} | ${staffName || profile.display_name || 'Clinical User'}${profile.title ? ` (${profile.title})` : ''}`
  const [notice, setNotice] = useState('')
  const [appointmentCount, setAppointmentCount] = useState(0)
  const [settings, setSettings] = useState(() => getSettings())
  const [organisationSettings, setOrganisationSettings] = useState(() => getCachedOrganisationSettings())
  const [recordUpdate, setRecordUpdate] = useState(null)
  const [contentRevision, setContentRevision] = useState(0)
  const [patientPeers, setPatientPeers] = useState([])
  const [locked, setLocked] = useState(false)
  const lastActivityRef = useRef(Date.now())
  const lastPatientAuditRef = useRef('')


  const patientMatch = location.pathname.match(/^\/patients\/([^/]+)/)
  const openPatientId = patientMatch ? decodeURIComponent(patientMatch[1]) : ''

  useEffect(() => {
    const syncOrganisationSettings = (event) => setOrganisationSettings(event?.detail || getCachedOrganisationSettings())
    window.addEventListener('recordsweb-organisation-settings-changed', syncOrganisationSettings)
    loadOrganisationSettings().then(setOrganisationSettings).catch(() => {})
    return () => window.removeEventListener('recordsweb-organisation-settings-changed', syncOrganisationSettings)
  }, [])

  useEffect(() => {
    const syncSettings = (event) => setSettings(event?.detail || getSettings())
    window.addEventListener('recordsweb-settings-changed', syncSettings)
    return () => window.removeEventListener('recordsweb-settings-changed', syncSettings)
  }, [])

  useEffect(() => {
    let live = true
    listAppointments(new Date().toISOString().slice(0,10))
      .then((appointments) => { if (live) setAppointmentCount(appointments.length) })
      .catch(() => {})
    return () => { live = false }
  }, [location.pathname])

  useEffect(() => {
    setRecordUpdate(null)
    if (!openPatientId) return undefined

    return subscribeToPatientRecordChanges(openPatientId, (event) => {
      const currentUserId = session?.user?.id || profile?.id
      if (currentUserId && event.actor_id === currentUserId) return
      setRecordUpdate(event)
    })
  }, [openPatientId, session?.user?.id, profile?.id])

  useEffect(() => {
    setPatientPeers([])
    if (!openPatientId) return undefined
    return subscribeToPatientPresence(openPatientId, { ...profile, id: session?.user?.id || profile?.id }, setPatientPeers)
  }, [openPatientId, session?.user?.id, profile?.id, profile?.display_name, profile?.role])

  useEffect(() => {
    if (!openPatientId || lastPatientAuditRef.current === openPatientId) return
    lastPatientAuditRef.current = openPatientId
    recordAudit({ action: 'patient.record.viewed', entityType: 'patient', entityId: openPatientId, patientId: openPatientId, description: 'Opened patient record.' }).catch(() => {})
  }, [openPatientId])

  useEffect(() => {
    const minutes = Number(settings.autoLockMinutes || 15)
    if (!minutes || minutes < 1) return undefined
    const noteActivity = () => { lastActivityRef.current = Date.now() }
    const events = ['mousedown', 'keydown', 'touchstart', 'wheel']
    events.forEach((name) => window.addEventListener(name, noteActivity, { passive: true }))
    const timer = window.setInterval(() => {
      if (!locked && Date.now() - lastActivityRef.current >= minutes * 60 * 1000) setLocked(true)
    }, 15000)
    return () => { events.forEach((name) => window.removeEventListener(name, noteActivity)); window.clearInterval(timer) }
  }, [settings.autoLockMinutes, locked])

  useEffect(() => {
    const onBeforePrint = () => {
      recordAudit({ action: 'record.printed', entityType: openPatientId ? 'patient' : 'workspace', entityId: openPatientId || null, patientId: openPatientId || null, description: openPatientId ? 'Printed patient record content.' : 'Printed RecordsWeb workspace content.' }).catch(() => {})
    }
    window.addEventListener('beforeprint', onBeforePrint)
    return () => window.removeEventListener('beforeprint', onBeforePrint)
  }, [openPatientId])

  function refreshPatientRecord() {
    setRecordUpdate(null)
    // Remount only the routed page. This re-runs its data loaders without
    // reloading Electron, so the staff member stays signed in.
    setContentRevision((value) => value + 1)
  }

  function temporaryNotice(message) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2200)
  }

  async function doLogout() {
    if (settings.confirmSignOut && !window.confirm('Sign out of RecordsWeb?')) return
    await logout()
    navigate('/login', { replace: true })
  }

  function toggleTheme() {
    const nextTheme = settings.theme === 'dark' ? 'light' : 'dark'
    setSettings(saveSettings({ ...settings, theme: nextTheme }))
  }

  return (
    <div className="app-frame">
      <header className="desktop-titlebar">
        <strong>RecordsWeb Health Care System - {ORGANISATION.name}</strong>
        <div className="titlebar-spacer" />
        <button onClick={() => temporaryNotice('RecordsWeb Help is managed by the local deployment administrator.')} title="Help"><CircleHelp size={15} /></button>
        <SystemNotificationCenter session={session} />
      </header>

      <div className="ribbon-tabs">
        <Link className={location.pathname === '/' ? 'active' : ''} to="/">Summary</Link>
        <Link className={location.pathname.startsWith('/patients') ? 'active' : ''} to="/patients">Care Record</Link>
        <Link className={location.pathname.startsWith('/appointments') ? 'active' : ''} to="/appointments">Appointments</Link>
        <Link className={location.pathname.startsWith('/registration') ? 'active' : ''} to="/registration">Registration</Link>
        <Link className={location.pathname.startsWith('/staff-area') ? 'active' : ''} to="/staff-area">Staff Area</Link>
        {profile.is_management && <Link className={location.pathname.startsWith('/management') ? 'active' : ''} to="/management">Management</Link>}
      </div>

      <header className="global-header">
        <div className="brand-lockup" onClick={() => navigate('/')} role="button" tabIndex={0}>
          {organisationSettings.logoUrl && <img draggable={false} className="brand-logo-image" src={organisationSettings.logoUrl} alt={`${ORGANISATION.name} logo`} />}
          <div><div className="brand-name">RecordsWeb</div><div className="brand-subtitle">{ORGANISATION.name}</div></div>
        </div>
        <div className="global-search">
          <Search size={16} />
          <input aria-label="Search patients" placeholder="Search patient, NHS number or record number" onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) navigate(`/patients?q=${encodeURIComponent(e.currentTarget.value.trim())}`) }} />
        </div>
        <div className="header-actions">
          <ScreenMessageCenter session={session} />
          <button className={`icon-btn ${location.pathname === '/security' ? 'active' : ''}`} title="Account & Security" onClick={() => navigate('/security')}><ShieldCheck size={18} /></button>
          {profile.is_management && <button className={`icon-btn ${location.pathname === '/management' ? 'active' : ''}`} title="Management" onClick={() => navigate('/management')}><UserCog size={18} /></button>}
          <button className={`icon-btn ${location.pathname === '/settings' ? 'active' : ''}`} title="Settings" onClick={() => navigate('/settings')}><Settings size={18} /></button>
          {settings.showProfileChip && <div className="profile-chip"><UserRound size={17} /><div><strong>{profile.display_name || 'Clinical User'}</strong><span>{profile.role || 'User'}</span></div></div>}
          <button className="icon-btn" title="Sign out" onClick={doLogout}><LogOut size={18} /></button>
        </div>
      </header>

      <div className="worklist-strip">
        <Link to="/appointments">Appointments {settings.showWorklistCounts && <strong>{appointmentCount}</strong>}</Link>
        <Link to="/patients">Patient Search</Link>
        <Link to="/registration">Registration</Link>
        <Link to="/staff-area">Staff Area</Link>
        <div className="worklist-spacer" />
        <span>Organisation: {ORGANISATION.name}</span>
      </div>

      {notice && <div className="system-toast">{notice}</div>}
      <PatientPresenceBanner peers={patientPeers} />
      <PatientRecordUpdateBanner event={recordUpdate} onRefresh={refreshPatientRecord} />
      <main className="app-content" key={`${location.pathname}:${contentRevision}`}>{children}</main>
      <footer className="status-bar recordsweb-status-bar">
        <img draggable={false} className="status-nhs-logo" src={`${import.meta.env.BASE_URL}nhs-logo-footer.jpg`} alt="NHS" />
        <span>{staffIdentity}</span>
        <span>Organisation: {ORGANISATION.name}</span>
        <span>Location: Main Building</span>
        <button
          type="button"
          className="status-theme-toggle"
          onClick={toggleTheme}
          title={settings.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={settings.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {settings.theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
          <span>{settings.theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
        <span className="status-ok">● Connected</span>
      </footer>
      {locked && <SessionLockOverlay session={session} onUnlock={() => { lastActivityRef.current = Date.now(); setLocked(false); recordAudit({ action: 'account.session.unlocked', entityType: 'session', description: 'Unlocked RecordsWeb after inactivity.' }).catch(() => {}) }} onSignOut={doLogout} />}
      {profile.must_change_password && <ForcedPasswordChange session={session} onChanged={() => updateProfile({ must_change_password: false, password_changed_at: new Date().toISOString() })} />}
    </div>
  )
}
