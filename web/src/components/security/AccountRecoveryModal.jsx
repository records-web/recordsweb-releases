import React, { useState } from 'react'
import { KeyRound, UserRound, X } from 'lucide-react'
import ModalPortal from '../ModalPortal'
import { recoverPassword, usernameReminder } from '../../lib/recoverySecurity'
import { validateRecordsWebPassword } from '../../lib/passwordPolicy'

export default function AccountRecoveryModal({ mode, onClose }) {
  const reminder = mode === 'username'
  const [form, setForm] = useState({ first_name:'', last_name:'', username:'', code:'', password:'', confirm:'' })
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [result,setResult]=useState('')
  const set=(key,value)=>setForm((current)=>({...current,[key]:value}))
  const codeChange=(e)=>set('code',e.target.value.replace(/\D/g,'').slice(0,6))

  async function submit(e){
    e.preventDefault(); setError(''); setResult('')
    if (!/^\d{6}$/.test(form.code)) return setError('Enter your 6-digit recovery code.')
    if (!reminder) {
      const policy=validateRecordsWebPassword(form.password,form.username)
      if(policy) return setError(policy)
      if(form.password!==form.confirm) return setError('New passwords do not match.')
    }
    setBusy(true)
    try{
      if(reminder){
        const username=await usernameReminder({firstName:form.first_name,lastName:form.last_name,recoveryCode:form.code})
        setResult(`Your RecordsWeb username is ${username}`)
      }else{
        await recoverPassword({username:form.username,recoveryCode:form.code,newPassword:form.password})
        setResult('Password reset complete. You can now sign in with your new password.')
      }
    }catch(err){setError(err.message||'Unable to recover the account.')}finally{setBusy(false)}
  }

  return <ModalPortal onClose={onClose} ariaLabel={reminder?'Username reminder':'Reset password'}>
    <div className="records-modal login-recovery-modal">
      <header><div><strong>{reminder?'Username reminder':'Reset password'}</strong><span>RecordsWeb account recovery</span></div><button onClick={onClose}><X size={18}/></button></header>
      <div className="modal-patient-strip">Grove Way Health Centre</div>
      <form className="login-recovery-form" onSubmit={submit}>
        {reminder ? <>
          <label>First name<input autoFocus value={form.first_name} onChange={e=>set('first_name',e.target.value)} required/></label>
          <label>Last name<input value={form.last_name} onChange={e=>set('last_name',e.target.value)} required/></label>
        </> : <label>RecordsWeb username<input autoFocus value={form.username} onChange={e=>set('username',e.target.value)} placeholder="first.last@GW.HC" required/></label>}
        <label>6-digit recovery code<div className="security-inline-icon-input"><KeyRound size={14}/><input type="password" inputMode="numeric" autoComplete="off" maxLength="6" value={form.code} onChange={codeChange} placeholder="••••••" required/></div></label>
        {!reminder&&<><label>New password<input type="password" autoComplete="new-password" value={form.password} onChange={e=>set('password',e.target.value)} required/></label><label>Confirm new password<input type="password" autoComplete="new-password" value={form.confirm} onChange={e=>set('confirm',e.target.value)} required/></label><small>Use at least 10 characters with at least one letter and one number.</small></>}
        <div className="recovery-help"><UserRound size={14}/><span>If you have not created a recovery code, contact Management. Placeholder @GW.HC usernames do not require a real email mailbox.</span></div>
        {error&&<div className="form-error">{error}</div>}
        {result&&<div className="form-success">{result}</div>}
      </form>
      <footer><button className="secondary-button" onClick={onClose}>Close</button><button className="primary-button" onClick={submit} disabled={busy||Boolean(result)}>{busy?'Checking…':reminder?'Find username':'Reset password'}</button></footer>
    </div>
  </ModalPortal>
}
