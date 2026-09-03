import React from 'react'
import { X } from 'lucide-react'
import ModalPortal from '../ModalPortal'

export default function HomeContentModal({ title, subtitle, children, footer, error, onClose, className = '' }) {
  return (
    <ModalPortal onClose={onClose} ariaLabel={title}>
      <section className={`records-modal small-modal home-content-modal ${className}`}>
        <header>
          <div>
            <strong>{title}</strong>
            {subtitle && <span>{subtitle}</span>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={16}/></button>
        </header>
        <div className="records-form-grid one-col">
          {children}
        </div>
        {error && <div className="form-error modal-error">{error}</div>}
        <footer>{footer}</footer>
      </section>
    </ModalPortal>
  )
}
