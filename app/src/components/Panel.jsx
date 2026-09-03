import React from 'react'

export default function Panel({ title, count, actions, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        <div><strong>{title}</strong>{count !== undefined && <span className="panel-count">{count}</span>}</div>
        <div>{actions}</div>
      </header>
      <div className="panel-body">{children}</div>
    </section>
  )
}
