import React from 'react'
import { STAFF_ROLES } from '../../lib/staffOptions'

export default function RoleSelector({ roles, primaryRole, onChange }) {
  const selected = Array.isArray(roles) && roles.length ? roles : ['Patient Coordinator']

  function toggle(role) {
    const hasRole = selected.includes(role)
    let nextRoles
    if (hasRole) {
      if (selected.length === 1) return
      nextRoles = selected.filter((item) => item !== role)
    } else {
      nextRoles = [...selected, role]
    }

    const nextPrimary = nextRoles.includes(primaryRole) ? primaryRole : nextRoles[0]
    onChange(nextRoles, nextPrimary)
  }

  return (
    <div className="staff-role-editor span-two">
      <div className="staff-role-editor-header">
        <div>
          <strong>Staff roles</strong>
          <span>Select every role this member of staff performs.</span>
        </div>
        <label>
          <span>Primary role</span>
          <select value={primaryRole} onChange={(event) => onChange(selected, event.target.value)}>
            {selected.map((role) => <option key={role}>{role}</option>)}
          </select>
        </label>
      </div>
      <div className="staff-role-grid">
        {STAFF_ROLES.map((role) => (
          <label className="staff-role-option" key={role}>
            <input type="checkbox" checked={selected.includes(role)} onChange={() => toggle(role)} />
            <span>{role}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
