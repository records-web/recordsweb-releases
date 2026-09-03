import React from 'react'
import { AlertTriangle } from 'lucide-react'

export default function PatientRecordUpdateBanner({ event, onRefresh }) {
  if (!event) return null

  const username = event.actor_username || 'Another staff member'
  const role = event.actor_role || 'Staff member'

  return (
    <div className="patient-record-update-banner" role="status" aria-live="polite">
      <AlertTriangle size={15} aria-hidden="true" />
      <span>
        <strong>({username} - {role})</strong> has updated this patient&apos;s record, some information may be incorrect. To obtain the latest information click{' '}
        <button type="button" onClick={onRefresh}>HERE</button> to refresh this page.
      </span>
    </div>
  )
}
