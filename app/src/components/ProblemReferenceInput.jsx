import React, { useMemo, useState } from 'react'
import { AlertTriangle, Search } from 'lucide-react'
import { findProblemReferenceByName, searchGPProblems } from '../lib/gpProblemCatalogue'

export default function ProblemReferenceInput({ value, onChange, onSelect, placeholder = 'Start typing a problem…', autoFocus = false, disabled = false }) {
  const [focused, setFocused] = useState(false)
  const selected = useMemo(() => findProblemReferenceByName(value), [value])
  const results = useMemo(() => {
    const query = String(value || '').trim()
    if (!query || selected) return []
    return searchGPProblems(query, 10)
  }, [value, selected])

  function choose(entry) {
    onChange?.(entry.name)
    onSelect?.(entry)
    setFocused(false)
  }

  return (
    <div className="problem-reference-input">
      <div className="problem-reference-searchbox">
        <Search size={14} />
        <input
          type="text"
          value={value || ''}
          onChange={(event) => onChange?.(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          autoComplete="off"
        />
      </div>

      {focused && results.length > 0 && (
        <div className="problem-reference-results" role="listbox" aria-label="Problem suggestions">
          {results.map((entry) => (
            <button key={entry.id} type="button" className="problem-reference-result" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(entry)}>
              <span className="problem-reference-result-main">
                <strong>{entry.name}</strong>
                <small>{entry.description}</small>
              </span>
              <span className={`problem-reference-severity ${entry.severity === 'Severe' ? 'severe' : 'minor'}`}>{entry.severity}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className={`problem-reference-selected ${selected.severity === 'Severe' ? 'severe' : ''}`}>
          <div>
            <strong>{selected.name}</strong>
            <span>{selected.description}</span>
          </div>
          <em>{selected.severity}</em>
        </div>
      )}

      {selected?.severity === 'Severe' && (
        <div className="problem-reference-warning">
          <AlertTriangle size={15} />
          <span><strong>Important clinical problem.</strong> This reference classification does not replace clinical assessment. Review the patient presentation and follow the appropriate clinical pathway.</span>
        </div>
      )}
    </div>
  )
}
