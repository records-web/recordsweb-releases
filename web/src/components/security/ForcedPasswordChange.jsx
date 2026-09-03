import React, { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { changeOwnPassword } from '../../lib/supabase'
import { validateRecordsWebPassword } from '../../lib/passwordPolicy'

export default function ForcedPasswordChange({ session, onChanged }) {
  const username=session?.profile?.username||session?.user?.email||''
  const [form,setForm]=useState({current:'',next:'',confirm:''})
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function submit(e){e.preventDefault();setError('');const policy=validateRecordsWebPassword(form.next,username);if(policy)return setError(policy);if(form.next!==form.confirm)return setError('New passwords do not match.');setBusy(true);try{await changeOwnPassword({username,currentPassword:form.current,newPassword:form.next});onChanged()}catch(err){setError(err.message||'Unable to change password.');setBusy(false)}}
  return <div className="recordsweb-session-lock forced-password-change" role="dialog" aria-modal="true"><form className="session-lock-card" onSubmit={submit}><div className="session-lock-icon"><KeyRound size={28}/></div><h2>Password change required</h2><p>Management issued a temporary password. Create your own password before continuing.</p><label>Current / temporary password<input autoFocus type="password" value={form.current} onChange={e=>setForm({...form,current:e.target.value})}/></label><label>New password<input type="password" value={form.next} onChange={e=>setForm({...form,next:e.target.value})}/></label><label>Confirm new password<input type="password" value={form.confirm} onChange={e=>setForm({...form,confirm:e.target.value})}/></label><small>At least 10 characters with at least one letter and one number.</small>{error&&<div className="form-error">{error}</div>}<button className="primary-button" disabled={busy||!form.current||!form.next||!form.confirm}>{busy?'Updating…':'Change password & continue'}</button></form></div>
}
