import React, { useEffect, useRef, useState } from 'react'
import { Image, Palette, RotateCcw, Save, Trash2, Upload } from 'lucide-react'
import Panel from '../Panel'
import { DEFAULT_ORGANISATION_SETTINGS, loadOrganisationSettings, resetOrganisationSettings, saveOrganisationSettings } from '../../lib/organisationSettings'
import recordsWebIcon from '../../assets/recordsweb-update-logo.png'
import { supabaseConfigured } from '../../lib/supabase'

const colourFields = [
  ['primaryColor', 'Primary colour', 'Buttons, active items, borders and RecordsWeb accent text.'],
  ['navigationColor', 'Navigation colour', 'Ribbon and navigation areas throughout this community.'],
  ['patientBannerColor', 'Patient banner colour', 'The active patient identity banner across clinical records.'],
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
      .catch((err) => live && setError(err.message || 'Unable to load community branding.'))
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
    if (!previewUrlRef.current) return
    URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = ''
  }

  function chooseLogo(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setError('')
    setSuccess('')

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Community logo must be a PNG, JPEG or WebP image.')
      return
    }

    if (file.size > 4 * 1024 * 1024) {
      setError('Community logo files must be 4 MB or smaller.')
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
    setForm((current) => ({
      ...current,
      logoUrl: '',
      logoDataUrl: '',
      logoFileName: '',
    }))
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
      setSuccess(supabaseConfigured ? 'Community branding saved.' : 'Community branding saved locally.')
    } catch (err) {
      setError(err.message || 'Unable to save community branding.')
    } finally {
      setSaving(false)
    }
  }

  async function reset() {
    if (!window.confirm('Restore the standard RecordsWeb colours and RecordsWeb icon for this community?')) return

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      clearPreviewUrl()
      setLogoFile(null)
      setRemoveLogo(false)
      const next = await resetOrganisationSettings()
      setForm(next)
      setSuccess('Standard RecordsWeb appearance restored for this community.')
    } catch (err) {
      setError(err.message || 'Unable to restore the standard appearance.')
    } finally {
      setSaving(false)
    }
  }

  const previewLogo = form.logoUrl || recordsWebIcon

  return (
    <Panel title="Community branding">
      <div className="branding-settings">
        <div className="branding-intro">
          <Palette size={19}/>
          <div>
            <strong>{form.organisationName || 'RecordsWeb community'}</strong>
            <span>Customise this community only. Custom branding changes the community-facing header while RecordsWeb remains the underlying product.</span>
          </div>
        </div>

        <div className="community-brand-preview" style={{ '--community-preview-primary': form.primaryColor }}>
          <div className={`community-brand-preview-left ${form.logoUrl ? 'custom-logo-only' : ''}`}>
            <img src={previewLogo} alt="Community branding preview" draggable={false}/>
            {!form.logoUrl && <strong>RecordsWeb</strong>}
          </div>
          <div className="community-brand-preview-right">
            <strong>{form.organisationName || 'Community name'}</strong>
            <span>Health care records</span>
          </div>
        </div>

        <div className="branding-colour-grid">
          {colourFields.map(([key, label, description]) => (
            <label className="branding-colour-card" key={key}>
              <div>
                <strong>{label}</strong>
                <span>{description}</span>
              </div>
              <div className="colour-input-row">
                <input type="color" value={form[key]} onChange={(event) => set(key, event.target.value)} />
                <input className="colour-hex-input" value={form[key]} onChange={(event) => set(key, event.target.value)} maxLength={7} />
              </div>
            </label>
          ))}
        </div>

        <div className="branding-logo-section">
          <div className="branding-logo-heading">
            <Image size={18}/>
            <div>
              <strong>Community icon</strong>
              <span>When set, this icon is shown on its own in the community sign-in and staff header instead of the standard RecordsWeb lockup.</span>
            </div>
          </div>

          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={chooseLogo} />

          <div className="branding-logo-box">
            <div className="branding-logo-preview">
              <img draggable={false} src={previewLogo} alt="Community icon preview" />
              <div>
                <strong>{form.logoUrl ? (form.logoFileName || 'Community icon') : 'Standard RecordsWeb icon'}</strong>
                <span>{logoFile ? 'Ready to upload when saved.' : form.logoUrl ? 'This community is using a custom icon.' : 'Upload an icon to replace the standard RecordsWeb icon for this community.'}</span>
              </div>
            </div>

            <div className="branding-logo-actions">
              <button className="secondary-button" type="button" onClick={() => fileRef.current?.click()}>
                <Upload size={13}/>{form.logoUrl ? 'Replace icon' : 'Upload icon'}
              </button>
              {form.logoUrl && (
                <button className="secondary-button" type="button" onClick={markLogoForRemoval}>
                  <Trash2 size={13}/> Use RecordsWeb icon
                </button>
              )}
            </div>
          </div>

          <small className="branding-file-note">PNG, JPEG or WebP. Maximum file size 4 MB.</small>
        </div>

        {error && <div className="form-error branding-message">{error}</div>}
        {success && <div className="form-success branding-message">{success}</div>}

        <div className="branding-actions">
          <button className="secondary-button" disabled={saving || loading} onClick={reset}>
            <RotateCcw size={13}/> Restore RecordsWeb defaults
          </button>
          <button className="primary-button" disabled={saving || loading} onClick={save}>
            <Save size={13}/>{saving ? 'Saving…' : 'Save community branding'}
          </button>
        </div>
      </div>
    </Panel>
  )
}
