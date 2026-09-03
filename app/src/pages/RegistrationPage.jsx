import React, { useState } from 'react'
import { Save, UserPlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Panel from '../components/Panel'
import { createPatient } from '../lib/dataService'
import { ORGANISATION } from '../lib/demoData'

export default function RegistrationPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    title: 'Mr',
    first_name: '',
    last_name: '',
    dob: '',
    sex: '',
    gender: '',
    usual_gp: '',
    address: '',
    phone: '',
    mobile: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const patient = await createPatient(form)
      navigate(`/patients/${patient.id}`)
    } catch (err) {
      setError(err.message || 'Could not register patient.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-pad workspace-page">
      <div className="page-title-row">
        <div>
          <h1>Registration</h1>
          <p>Register a new patient at {ORGANISATION.name}.</p>
        </div>
      </div>

      <Panel title="New patient registration">
        <form className="registration-form" onSubmit={save}>
          <div className="registration-section">
            <h3><UserPlus size={16}/> Patient details</h3>
            <div className="records-form-grid embedded">
              <label>
                Title
                <select value={form.title} onChange={(event) => set('title', event.target.value)}>
                  <option>Mr</option>
                  <option>Mrs</option>
                  <option>Miss</option>
                  <option>Ms</option>
                  <option>Dr</option>
                  <option>Mx</option>
                </select>
              </label>
              <label>First name<input value={form.first_name} onChange={(event) => set('first_name', event.target.value)} required/></label>
              <label>Last name<input value={form.last_name} onChange={(event) => set('last_name', event.target.value)} required/></label>
              <label>Date of birth<input type="date" value={form.dob} onChange={(event) => set('dob', event.target.value)} required/></label>
              <label>
                Sex
                <select value={form.sex} onChange={(event) => set('sex', event.target.value)}>
                  <option value="">Not recorded</option>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Intersex</option>
                </select>
              </label>
              <label>Gender<input value={form.gender} onChange={(event) => set('gender', event.target.value)} placeholder="Optional"/></label>
              <label>
                NHS number
                <input value="Generated automatically on registration" readOnly aria-readonly="true" />
                <small>The generated number is stored on this patient record and remains the same for future visits.</small>
              </label>
              <label>Usual GP<input value={form.usual_gp} onChange={(event) => set('usual_gp', event.target.value)} placeholder="Clinician name"/></label>
            </div>
          </div>

          <div className="registration-section">
            <h3>Contact details</h3>
            <div className="records-form-grid embedded">
              <label className="span-two">Address<textarea value={form.address} onChange={(event) => set('address', event.target.value)}/></label>
              <label>Telephone<input value={form.phone} onChange={(event) => set('phone', event.target.value)}/></label>
              <label>Mobile<input value={form.mobile} onChange={(event) => set('mobile', event.target.value)}/></label>
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}
          <div className="registration-actions">
            <button type="button" className="secondary-button" onClick={() => navigate('/patients')}>Cancel</button>
            <button className="primary-button" disabled={saving}><Save size={15}/>{saving ? 'Registering…' : 'Register patient'}</button>
          </div>
        </form>
      </Panel>
    </div>
  )
}
