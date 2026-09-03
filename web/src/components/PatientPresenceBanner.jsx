import React from 'react'
import { UsersRound } from 'lucide-react'
export default function PatientPresenceBanner({ peers=[] }) {
  if(!peers.length)return null
  const names=peers.slice(0,3).map(p=>`${p.display_name}${p.role?` (${p.role})`:''}`)
  return <div className="patient-presence-banner"><UsersRound size={15}/><span><strong>{names.join(', ')}</strong>{peers.length===1?' has':' have'} this patient record open{peers.length>3?` and ${peers.length-3} more`:''}.</span></div>
}
