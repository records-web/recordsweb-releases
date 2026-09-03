import React from 'react'
import { AlertTriangle } from 'lucide-react'

export default function MaintenanceSessionCountdown({ seconds, message, onSignOut }) {
  return (
    <div className="maintenance-session-overlay" role="dialog" aria-modal="true" aria-labelledby="maintenance-session-title">
      <div className="maintenance-session-modal">
        <header><AlertTriangle size={18}/><div><strong id="maintenance-session-title">System maintenance has started</strong><span>Save any work now.</span></div></header>
        <div className="maintenance-session-body">
          <p>{message}</p>
          <div className="maintenance-session-countdown"><span>RecordsWeb will close your clinical session in</span><strong>{seconds}s</strong></div>
        </div>
        <footer><button type="button" className="primary-button" onClick={onSignOut}>Sign out now</button></footer>
      </div>
    </div>
  )
}
