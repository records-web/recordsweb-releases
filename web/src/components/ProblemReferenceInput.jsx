import React, { useMemo, useState } from 'react'
import { AlertTriangle, Search } from 'lucide-react'
import { findProblemReferenceByName, listGPProblems, searchGPProblems } from '../lib/gpProblemCatalogue'

const missingDescription = (value) => String(value || '').startsWith('No description supplied in the uploaded GP conditions/presentations reference.')

function referenceMeta(entry) {
  if (entry?.sourcePage) return `GP reference #${entry.sourceNumber} · page ${entry.sourcePage}`
  return 'RecordsWeb problem catalogue'
}

export default function ProblemReferenceInput({ value, onChange, onSelect, placeholder = 'Start typing a problem…', autoFocus = false, disabled = false }) {
  const [focused, setFocused] = useState(false)
  const selected = useMemo(() => findProblemReferenceByName(value), [value])
  const results = useMemo(() => {
    if (!focused) return []
    const query = String(value || '').trim()
    if (!query) return listGPProblems()
    return searchGPProblems(query, 60)
  }, [value, focused])

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
          role="combobox"
          aria-expanded={focused}
          aria-autocomplete="list"
        />
      </div>

      {focused && (
        <div className="problem-reference-results" role="listbox" aria-label="Problem catalogue">
          <div className="problem-reference-results-header">
            <strong>{String(value || '').trim() ? 'Matching problems' : 'Select a problem'}</strong>
            <span>{results.length}{String(value || '').trim() ? ' shown' : ' available'}</span>
          </div>
          {results.length > 0 ? results.map((entry) => (
            <button key={entry.id} type="button" className="problem-reference-result" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(entry)}>
              <span className="problem-reference-result-main">
                <strong>{entry.name}</strong>
                <small>{missingDescription(entry.description) ? referenceMeta(entry) : `${entry.description}${entry.sourcePage ? ` · ${referenceMeta(entry)}` : ''}`}</small>
              </span>
              <span className={`problem-reference-severity ${entry.severity === 'Severe' ? 'severe' : entry.severity === 'Unclassified' ? 'unclassified' : 'minor'}`}>{entry.severity === 'Unclassified' ? 'Reference' : entry.severity}</span>
            </button>
          )) : (
            <div className="problem-reference-no-results">No catalogue match. You can still enter a free-text problem.</div>
          )}
        </div>
      )}

      {selected && (
        <div className={`problem-reference-selected ${selected.severity === 'Severe' ? 'severe' : selected.severity === 'Unclassified' ? 'unclassified' : ''}`}>
          <div>
            <strong>{selected.name}</strong>
            <span>{missingDescription(selected.description) ? referenceMeta(selected) : selected.description}</span>
          </div>
          <em>{selected.severity === 'Unclassified' ? 'Reference' : selected.severity}</em>
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
