import React, { useState } from 'react'
import { LockKeyhole, LogOut } from 'lucide-react'
import { verifyCurrentPassword } from '../../lib/supabase'

export default function SessionLockOverlay({ session, onUnlock, onSignOut }) {
  const profile=session?.profile||{}
  const username=profile.username||session?.user?.email||''
  const [password,setPassword]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  async function unlock(e){e.preventDefault();setBusy(true);setError('');try{await verifyCurrentPassword(username,password);onUnlock()}catch(err){setError(err.message||'Unable to unlock.');setPassword('')}finally{setBusy(false)}}
  return <div className="recordsweb-session-lock" role="dialog" aria-modal="true" aria-label="RecordsWeb locked">
    <form className="session-lock-card" onSubmit={unlock}>
      <div className="session-lock-icon"><LockKeyhole size={28}/></div>
      <h2>RecordsWeb Locked</h2>
      <strong>{profile.display_name||username}</strong><span>{profile.role||'Staff member'}</span>
      <label>Password<input autoFocus type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></label>
      {error&&<div className="form-error">{error}</div>}
      <div className="session-lock-actions"><button className="primary-button" disabled={busy||!password}>{busy?'Unlocking…':'Unlock'}</button><button type="button" className="secondary-button" onClick={onSignOut}><LogOut size={14}/> Sign out</button></div>
    </form>
  </div>
}
