export function installEmbeddedMediaBehavior() {
  if (typeof document === 'undefined') return () => {}

  const imageTarget = (target) => target instanceof Element ? target.closest('img') : null

  const preventImageDrag = (event) => {
    if (!imageTarget(event.target)) return
    event.preventDefault()
  }

  const preventImageContextMenu = (event) => {
    if (!imageTarget(event.target)) return
    event.preventDefault()
  }

  const preventDesktopDrop = (event) => {
    // Electron otherwise behaves like a browser and may navigate to a dropped
    // file/image. RecordsWeb has no drag-and-drop import workflow, so drops are
    // ignored while normal file-picker controls continue to work.
    if (event.dataTransfer?.types?.includes('Files')) event.preventDefault()
  }

  document.addEventListener('dragstart', preventImageDrag, true)
  document.addEventListener('contextmenu', preventImageContextMenu, true)
  document.addEventListener('dragover', preventDesktopDrop, true)
  document.addEventListener('drop', preventDesktopDrop, true)

  return () => {
    document.removeEventListener('dragstart', preventImageDrag, true)
    document.removeEventListener('contextmenu', preventImageContextMenu, true)
    document.removeEventListener('dragover', preventDesktopDrop, true)
    document.removeEventListener('drop', preventDesktopDrop, true)
  }
}
