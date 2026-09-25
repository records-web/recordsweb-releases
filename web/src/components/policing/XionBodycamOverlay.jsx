import React, { useEffect, useState } from 'react'

function formatStamp(date) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  return formatter.format(date).replace(',', '').toUpperCase()
}

export default function XionBodycamOverlay({ session }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const officer = session?.officer_name || 'RECORDSWEB OFFICER'
  const callsign = session?.callsign || session?.camera_label || 'BWC'
  const organisation = session?.organisation_name || 'RECORDSWEB POLICING'

  return (
    <div className="xion-bodycam-overlay" aria-hidden="true">
      <div className="xion-bodycam-panel">
        <div className="xion-bodycam-rec"><span className="xion-bodycam-dot">●</span><strong>REC</strong><span>BODYCAM</span></div>
        <div className="xion-bodycam-officer">{officer} [{callsign}]</div>
        <div className="xion-bodycam-agency">{organisation}</div>
        <div className="xion-bodycam-time">{formatStamp(now)}</div>
      </div>
    </div>
  )
}
