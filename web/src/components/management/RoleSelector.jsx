import React from 'react'
import { getDefaultStaffRole, getStaffRoles } from '../../lib/staffOptions'

export default function RoleSelector({ roles, primaryRole, systemMode = 'general_practice', onChange }) {
  const availableRoles = getStaffRoles(systemMode)
  const defaultRole = getDefaultStaffRole(systemMode)
  const selected = Array.isArray(roles) && roles.length ? roles.filter((role) => availableRoles.includes(role)) : [defaultRole]
  const safeSelected = selected.length ? selected : [defaultRole]
  const safePrimary = safeSelected.includes(primaryRole) ? primaryRole : safeSelected[0]

  function toggle(role) {
    const hasRole = safeSelected.includes(role)
    let nextRoles
    if (hasRole) {
      if (safeSelected.length === 1) return
      nextRoles = safeSelected.filter((item) => item !== role)
    } else {
      nextRoles = [...safeSelected, role]
    }

    const nextPrimary = nextRoles.includes(safePrimary) ? safePrimary : nextRoles[0]
    onChange(nextRoles, nextPrimary)
  }

  return (
    <div className="staff-role-editor span-two">
      <div className="staff-role-editor-header">
        <div>
          <strong>Staff roles</strong>
          <span>{systemMode === 'hospital' ? 'Select the hospital role or roles this member of staff performs.' : 'Select every role this member of staff performs.'}</span>
        </div>
        <label>
          <span>Primary role</span>
          <select value={safePrimary} onChange={(event) => onChange(safeSelected, event.target.value)}>
            {safeSelected.map((role) => <option key={role}>{role}</option>)}
          </select>
        </label>
      </div>
      <div className="staff-role-grid">
        {availableRoles.map((role) => (
          <label className="staff-role-option" key={role}>
            <input type="checkbox" checked={safeSelected.includes(role)} onChange={() => toggle(role)} />
            <span>{role}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
