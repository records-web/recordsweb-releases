import React, { useEffect, useRef, useState } from 'react'
import { Image, Palette, RotateCcw, Save, Trash2, Upload } from 'lucide-react'
import Panel from '../Panel'
import { DEFAULT_ORGANISATION_SETTINGS, loadOrganisationSettings, resetOrganisationSettings, saveOrganisationSettings } from '../../lib/organisationSettings'
import { ORGANISATION } from '../../lib/demoData'
import { supabaseConfigured } from '../../lib/supabase'

const colourFields = [
  ['primaryColor', 'Primary interface colour', 'Used for RecordsWeb branding, buttons and active highlights.'],
  ['navigationColor', 'Navigation colour', 'Used across the ribbon and navigation areas.'],
  ['patientBannerColor', 'Patient banner colour', 'Used for the active patient identity banner.'],
]

export default function BrandingPanel() {
  const [form, setForm] = useState(DEFAULT_ORGANISATION_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [logoFile, setLogoFile] = useState(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const previewUrlRef = useRef('')
  const fileRef = useRef(null)

  useEffect(() => {
    let live = true
    loadOrganisationSettings()
      .then((settings) => live && setForm(settings))
      .catch((err) => live && setError(err.message || 'Unable to load organisation branding.'))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  function set(key, value) {
    setSuccess('')
    setForm((current) => ({ ...current, [key]: value }))
  }

  function clearPreviewUrl() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = ''
    }
  }

  function chooseLogo(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setSuccess('')
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Logo must be a PNG, JPEG or WebP image.')
      return
    }
    if (file.size > 1024 * 1024) {
      setError('Logo files must be 1 MB or smaller.')
      return
    }

    clearPreviewUrl()
    const previewUrl = URL.createObjectURL(file)
    previewUrlRef.current = previewUrl
    setLogoFile(file)
    setRemoveLogo(false)
    setForm((current) => ({
      ...current,
      logoUrl: previewUrl,
      logoFileName: file.name,
    }))
  }

  function markLogoForRemoval() {
    clearPreviewUrl()
    setLogoFile(null)
    setRemoveLogo(true)
    setSuccess('')
    setForm((current) => ({ ...current, logoUrl: '', logoPath: '', logoDataUrl: '', logoFileName: '' }))
  }

  async function save() {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const next = await saveOrganisationSettings(form, { logoFile, removeLogo })
      clearPreviewUrl()
      setLogoFile(null)
      setRemoveLogo(false)
      setForm(next)
      setSuccess(supabaseConfigured ? 'Organisation appearance saved to Supabase.' : 'Organisation appearance saved locally.')
    } catch (err) {
      setError(err.message || 'Unable to save organisation appearance.')
    } finally {
      setSaving(false)
    }
  }

  async function reset() {
    if (!window.confirm('Restore the default RecordsWeb colours and remove the organisation logo?')) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      clearPreviewUrl()
      setLogoFile(null)
      setRemoveLogo(false)
      const next = await resetOrganisationSettings()
      setForm(next)
      setSuccess('Default organisation appearance restored.')
    } catch (err) {
      setError(err.message || 'Unable to restore defaults.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel title="Organisation appearance">
      <div className="branding-settings">
        <div className="branding-intro"><Palette size={19}/><div><strong>{ORGANISATION.name}</strong><span>These settings apply to RecordsWeb on Grove Way Health Centre workstations.</span></div></div>

        <div className="branding-colour-grid">
          {colourFields.map(([key, label, description]) => (
            <label className="branding-colour-card" key={key}>
              <div><strong>{label}</strong><span>{description}</span></div>
              <div className="colour-input-row">
                <input type="color" value={form[key]} onChange={(event) => set(key, event.target.value)} />
                <input className="colour-hex-input" value={form[key]} onChange={(event) => set(key, event.target.value)} maxLength={7} />
              </div>
            </label>
          ))}
        </div>

        <div className="branding-logo-section">
          <div className="branding-logo-heading"><Image size={18}/><div><strong>Organisation logo</strong><span>Displayed beside RecordsWeb in the application header and on the sign-in window.</span></div></div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={chooseLogo} />
          <div className="branding-logo-box">
            {form.logoUrl ? (
              <div className="branding-logo-preview"><img draggable={false} src={form.logoUrl} alt="Organisation logo preview" /><div><strong>{form.logoFileName || 'Uploaded logo'}</strong><span>{logoFile ? 'Ready to upload when you save.' : (supabaseConfigured ? 'Stored in Supabase Storage.' : 'Stored locally in demo mode.')}</span></div></div>
            ) : (
              <div className="branding-no-logo"><span>No logo uploaded.</span><small>RecordsWeb will not render an image when no logo exists.</small></div>
            )}
            <div className="branding-logo-actions">
              <button className="secondary-button" type="button" onClick={() => fileRef.current?.click()}><Upload size={13}/>{form.logoUrl ? 'Replace logo' : 'Upload logo'}</button>
              {form.logoUrl && <button className="secondary-button" type="button" onClick={markLogoForRemoval}><Trash2 size={13}/> Remove logo</button>}
            </div>
          </div>
          <small className="branding-file-note">PNG, JPEG or WebP. Maximum file size 1 MB. In Supabase mode the file is stored in the <code>recordsweb-branding</code> Storage bucket.</small>
        </div>

        {error && <div className="form-error branding-message">{error}</div>}
        {success && <div className="form-success branding-message">{success}</div>}

        <div className="branding-actions">
          <button className="secondary-button" disabled={saving || loading} onClick={reset}><RotateCcw size={13}/> Restore defaults</button>
          <button className="primary-button" disabled={saving || loading} onClick={save}><Save size={13}/>{saving ? 'Saving…' : 'Save appearance'}</button>
        </div>
      </div>
    </Panel>
  )
}
