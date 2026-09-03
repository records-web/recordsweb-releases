import React from 'react'
import { FilePlus2, Filter, Printer, Search, Settings, Stethoscope, BookOpen, ClipboardPlus, Pill, CalendarPlus } from 'lucide-react'

const icons = {
  add: FilePlus2,
  filter: Filter,
  print: Printer,
  search: Search,
  config: Settings,
  consult: Stethoscope,
  info: BookOpen,
  request: ClipboardPlus,
  medication: Pill,
  appointment: CalendarPlus,
}

export default function ClinicalToolbar({ actions = [] }) {
  return (
    <div className="clinical-toolbar">
      {actions.map((action, index) => {
        const Icon = icons[action.icon] || FilePlus2
        const disabled = action.disabled || !action.onClick
        return (
          <React.Fragment key={`${action.label}-${index}`}>
            {index > 0 && action.groupStart && <div className="toolbar-divider" />}
            <button
              type="button"
              className="toolbar-action"
              onClick={action.onClick}
              disabled={disabled}
              title={disabled && !action.disabled ? `${action.label} is not available in this view` : action.label}
            >
              <Icon size={22} />
              <span>{action.label}</span>
            </button>
          </React.Fragment>
        )
      })}
    </div>
  )
}
