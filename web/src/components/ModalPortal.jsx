import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE = [
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export default function ModalPortal({ children, onClose, closeOnBackdrop = true, ariaLabel = 'RecordsWeb dialog' }) {
  const backdropRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previousActive = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusFirstField = () => {
      const root = backdropRef.current
      if (!root) return
      const preferred = root.querySelector('[autofocus]') || root.querySelector(FOCUSABLE)
      if (preferred instanceof HTMLElement) {
        try { preferred.focus({ preventScroll: true }) } catch { preferred.focus() }
      }
    }

    const frame = window.requestAnimationFrame(focusFirstField)

    function handleKeyDown(event) {
      const root = backdropRef.current
      if (!root) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current?.()
        return
      }

      if (event.key !== 'Tab') return

      const focusable = Array.from(root.querySelectorAll(FOCUSABLE)).filter((element) => {
        if (!(element instanceof HTMLElement)) return false
        const style = window.getComputedStyle(element)
        return style.visibility !== 'hidden' && style.display !== 'none' && element.getClientRects().length > 0
      })

      if (!focusable.length) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown, true)
      document.body.style.overflow = previousOverflow
      if (previousActive instanceof HTMLElement && previousActive.isConnected) {
        window.requestAnimationFrame(() => {
          try { previousActive.focus({ preventScroll: true }) } catch { previousActive.focus() }
        })
      }
    }
  }, [])

  function handleBackdropPointerDown(event) {
    if (!closeOnBackdrop || event.target !== event.currentTarget) return
    onCloseRef.current?.()
  }

  return createPortal(
    <div
      ref={backdropRef}
      className="modal-backdrop"
      role="presentation"
      onPointerDown={handleBackdropPointerDown}
    >
      <div
        className="modal-portal-content"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
