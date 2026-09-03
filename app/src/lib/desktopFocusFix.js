const EDITABLE_SELECTOR = 'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]'

export function installDesktopFocusFix() {
  if (typeof document === 'undefined') return () => {}

  function recoverFocus(event) {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const editable = target.matches(EDITABLE_SELECTOR) ? target : target.closest(EDITABLE_SELECTOR)
    if (!(editable instanceof HTMLElement)) return

    // Electron/Chromium can occasionally leave the renderer without a focused
    // control after native window/dialog focus changes. Explicitly restoring
    // focus on direct user interaction keeps inputs and selects responsive.
    if (document.activeElement !== editable) {
      queueMicrotask(() => {
        if (!editable.isConnected) return
        try { editable.focus({ preventScroll: true }) } catch { editable.focus() }
      })
    }
  }

  document.addEventListener('pointerdown', recoverFocus, true)
  return () => document.removeEventListener('pointerdown', recoverFocus, true)
}
