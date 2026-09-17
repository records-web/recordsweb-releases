import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { supabase, supabaseConfigured } from '../../lib/supabase'
import { recordPatientAccess, requestBreakGlass } from '../../lib/securityService'

export default function PatientSecurityGate({ section = 'summary', children }) {
  const { patientId } = useParams()
  const [state, setState] = useState({ loading: true, classification: 'normal', allowed: true, error: '' })
  const grantKey = useMemo(() => patientId ? `recordsweb-break-glass:${patientId}` : '', [patientId])

  useEffect(() => {
    let live = true
    async function load() {
      if (!patientId) return setState({ loading:false, classification:'normal', allowed:true, error:'' })
      try {
        let classification = 'normal'
        if (supabaseConfigured && supabase) {
          const { data, error } = await supabase.from('patients').select('security_classification').eq('id', patientId).maybeSingle()
          if (error) throw error
          classification = data?.security_classification || 'normal'
        }
        const protectedRecord = ['restricted','highly_restricted'].includes(classification)
        const grantedUntil = Number(sessionStorage.getItem(grantKey) || 0)
        if (live) setState({ loading:false, classification, allowed: !protectedRecord || grantedUntil > Date.now(), error:'' })
        if (!protectedRecord || grantedUntil > Date.now()) recordPatientAccess({ patientId, section, accessType:'view' }).catch(()=>{})
      } catch (error) { if (live) setState({loading:false,classification:'normal',allowed:false,error:error?.message || 'Unable to validate record access.'}) }
    }
    load()
    return () => { live = false }
  }, [patientId, section, grantKey])

  async function unlock() {
    const reason = window.prompt('Reason for emergency access to this restricted record:')
    if (!reason || reason.trim().length < 3) return
    try {
      await requestBreakGlass({ patientId, reason: reason.trim() })
      sessionStorage.setItem(grantKey, String(Date.now() + 30 * 60 * 1000))
      await recordPatientAccess({ patientId, section, accessType:'break_glass', reason: reason.trim() }).catch(()=>{})
      setState((current) => ({ ...current, allowed:true, error:'' }))
    } catch (error) { setState((current)=>({...current,error:error?.message || 'Emergency access could not be granted.'})) }
  }

  if (state.loading) return <div className="patient-security-gate"><ShieldAlert size={22}/><strong>Checking record access…</strong></div>
  if (!state.allowed) return <div className="patient-security-gate blocked"><AlertTriangle size={30}/><h2>{state.classification === 'highly_restricted' ? 'Highly restricted record' : 'Restricted record'}</h2><p>This patient record requires an emergency-access reason. Access is audited and reviewed.</p>{state.error && <div className="form-error">{state.error}</div>}<button className="primary-button" onClick={unlock}>Request emergency access</button></div>
  return children
}
