import React, { useState } from 'react'
import { CheckCircle2, LayoutList, MonitorCog, RotateCcw, Save, UserRound } from 'lucide-react'
import Panel from '../components/Panel'
import { getSettings, resetSettings, saveSettings } from '../lib/settings'

export default function SettingsPage() {
  const [settings, setSettings] = useState(() => getSettings())
  const [saved, setSaved] = useState(false)

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
          <p>Configure this RecordsWeb workstation interface. Settings are stored locally for this Windows user.</p>
        </div>
      </div>

      <Panel title="Display">
        <div className="settings-section">
          <div className="settings-section-icon"><LayoutList size={20}/></div>
          <div className="settings-section-main">
            <strong>Workspace density</strong>
            <span>Choose how tightly RecordsWeb displays clinical lists and workspace controls.</span>
            <div className="segmented-setting">
              <button className={settings.density === 'standard' ? 'selected' : ''} onClick={()=>update('density','standard')}>Standard</button>
              <button className={settings.density === 'compact' ? 'selected' : ''} onClick={()=>update('density','compact')}>Compact</button>
            </div>
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-section-icon"><MonitorCog size={20}/></div>
          <div className="settings-section-main">
            <strong>Colour theme</strong>
            <span>Choose the RecordsWeb light or dark workspace appearance. You can also switch instantly from the bottom status bar.</span>
            <div className="segmented-setting">
              <button className={settings.theme !== 'dark' ? 'selected' : ''} onClick={()=>update('theme','light')}>Light</button>
              <button className={settings.theme === 'dark' ? 'selected' : ''} onClick={()=>update('theme','dark')}>Dark</button>
            </div>
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
        <button className="primary-button" onClick={save}><Save size={14}/> Save settings</button>
      </div>
      {saved && <div className="settings-saved"><CheckCircle2 size={14}/> Settings saved.</div>}
    </div>
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
