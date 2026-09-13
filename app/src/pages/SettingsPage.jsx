import React, { useMemo, useState } from 'react'
import { CheckCircle2, LayoutDashboard, LayoutList, MonitorCog, RotateCcw, Save, Sparkles, UserRound } from 'lucide-react'
import Panel from '../components/Panel'
import { getCachedOrganisationSettings } from '../lib/organisationSettings'
import { getResolvedInterfaceStyle, getResolvedTheme, getSettings, resetSettings, saveSettings } from '../lib/settings'

export default function SettingsPage() {
  const [settings, setSettings] = useState(() => getSettings())
  const [saved, setSaved] = useState(false)
  const organisationSettings = useMemo(() => getCachedOrganisationSettings(), [])
  const organisationDefault = organisationSettings.defaultInterfaceStyle === 'modern' ? 'modern' : 'classic'
  const resolvedStyle = settings.interfaceStyle === 'organisation' ? organisationDefault : getResolvedInterfaceStyle(settings)
  const resolvedTheme = getResolvedTheme(settings)

  function update(key, value) {
    setSettings((current) => ({ ...current, [key]: value }))
    setSaved(false)
  }

  function save() {
    const next = saveSettings(settings)
    setSettings(next)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  function restore() {
    const next = resetSettings()
    setSettings(next)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div className="page-pad workspace-page settings-page">
      <div className="page-title-row">
        <div>
          <h1>Settings</h1>
          <p>Personalise RecordsWeb on this device. The login screen and clinical functionality remain unchanged.</p>
        </div>
      </div>

      <Panel title="Interface style">
        <div className="interface-style-setting">
          <div className="settings-section-icon"><Sparkles size={20}/></div>
          <div className="settings-section-main">
            <strong>RecordsWeb interface</strong>
            <span>Classic keeps the established dense clinical layout. Modern keeps the same workflows and permissions with updated spacing, cards and controls.</span>
            <div className="interface-style-options" role="radiogroup" aria-label="RecordsWeb interface style">
              <InterfaceStyleOption
                selected={settings.interfaceStyle === 'organisation'}
                onClick={() => update('interfaceStyle', 'organisation')}
                icon={<LayoutDashboard size={18}/>} title="Organisation default"
                description={`Use this community's default (${organisationDefault === 'modern' ? 'Modern' : 'Classic'}).`}
              />
              <InterfaceStyleOption
                selected={settings.interfaceStyle === 'classic'}
                onClick={() => update('interfaceStyle', 'classic')}
                icon={<LayoutList size={18}/>} title="Classic"
                description="The established compact RecordsWeb clinical interface."
              />
              <InterfaceStyleOption
                selected={settings.interfaceStyle === 'modern'}
                onClick={() => update('interfaceStyle', 'modern')}
                icon={<Sparkles size={18}/>} title="Modern"
                description="Rounded panels, clearer hierarchy and roomier controls."
              />
            </div>
            <div className="settings-current-value">Current after save: <strong>{resolvedStyle === 'modern' ? 'Modern' : 'Classic'}</strong></div>
          </div>
        </div>
      </Panel>

      <Panel title="Display">
        <div className="settings-section">
          <div className="settings-section-icon"><LayoutList size={20}/></div>
          <div className="settings-section-main">
            <strong>Workspace density</strong>
            <span>Choose how tightly RecordsWeb displays clinical lists and workspace controls. Density is independent from Classic/Modern style.</span>
            <div className="segmented-setting">
              <button className={settings.density === 'compact' ? 'selected' : ''} onClick={()=>update('density','compact')}>Compact</button>
              <button className={settings.density === 'standard' ? 'selected' : ''} onClick={()=>update('density','standard')}>Standard</button>
              <button className={settings.density === 'comfortable' ? 'selected' : ''} onClick={()=>update('density','comfortable')}>Comfortable</button>
            </div>
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-section-icon"><MonitorCog size={20}/></div>
          <div className="settings-section-main">
            <strong>Colour mode</strong>
            <span>Use a fixed light/dark workspace or follow the device setting automatically.</span>
            <div className="segmented-setting">
              <button className={settings.theme === 'system' ? 'selected' : ''} onClick={()=>update('theme','system')}>System</button>
              <button className={settings.theme === 'light' ? 'selected' : ''} onClick={()=>update('theme','light')}>Light</button>
              <button className={settings.theme === 'dark' ? 'selected' : ''} onClick={()=>update('theme','dark')}>Dark</button>
            </div>
            <div className="settings-current-value">Resolved colour mode: <strong>{resolvedTheme === 'dark' ? 'Dark' : 'Light'}</strong></div>
          </div>
        </div>
        <SettingToggle icon={<MonitorCog size={19}/>} title="Higher contrast interface" description="Increase border and text contrast in clinical workspaces." checked={settings.highContrast} onChange={(v)=>update('highContrast',v)}/>
        <div className="settings-section">
          <div className="settings-section-icon"><MonitorCog size={20}/></div>
          <div className="settings-section-main">
            <strong>Automatic session lock</strong>
            <span>Lock RecordsWeb after inactivity without signing the current staff member out.</span>
            <div className="segmented-setting">
              {[5,10,15,30].map((minutes)=><button key={minutes} className={Number(settings.autoLockMinutes)===minutes?'selected':''} onClick={()=>update('autoLockMinutes',minutes)}>{minutes} min</button>)}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Header &amp; navigation">
        <SettingToggle icon={<UserRound size={19}/>} title="Show signed-in user in header" description="Display your name and role beside the security and settings controls." checked={settings.showProfileChip} onChange={(v)=>update('showProfileChip',v)}/>
        <SettingToggle icon={<LayoutList size={19}/>} title="Show worklist counts" description="Display the live appointment total in the worklist strip." checked={settings.showWorklistCounts} onChange={(v)=>update('showWorklistCounts',v)}/>
        <SettingToggle icon={<MonitorCog size={19}/>} title="Confirm before signing out" description="Ask for confirmation before ending the current RecordsWeb session." checked={settings.confirmSignOut} onChange={(v)=>update('confirmSignOut',v)}/>
      </Panel>

      <div className="settings-actions">
        <button className="secondary-button" onClick={restore}><RotateCcw size={14}/> Restore defaults</button>
        <button className="primary-button" onClick={save}><Save size={14}/> Save &amp; apply</button>
      </div>
      {saved && <div className="settings-saved"><CheckCircle2 size={14}/> Settings applied.</div>}
    </div>
  )
}

function InterfaceStyleOption({ selected, onClick, icon, title, description }) {
  return (
    <button type="button" role="radio" aria-checked={selected} className={`interface-style-option ${selected ? 'selected' : ''}`} onClick={onClick}>
      <span className="interface-style-option-icon">{icon}</span>
      <span><strong>{title}</strong><small>{description}</small></span>
      <span className="interface-style-radio" aria-hidden="true"><i/></span>
    </button>
  )
}

function SettingToggle({ icon, title, description, checked, onChange }) {
  return (
    <label className="setting-toggle-row">
      <span className="settings-section-icon">{icon}</span>
      <span className="settings-section-main"><strong>{title}</strong><span>{description}</span></span>
      <input type="checkbox" checked={checked} onChange={(e)=>onChange(e.target.checked)}/>
      <span className="switch-control" aria-hidden="true"><span/></span>
    </label>
  )
}
