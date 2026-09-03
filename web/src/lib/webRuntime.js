export const APP_VERSION = '3.1.9'
export const APP_RUNTIME_LABEL = 'Web Clinical System'

export function getWebDeviceContext() {
  const nav = globalThis.navigator
  const browser = nav?.userAgentData?.brands?.map((item) => item.brand).join(', ') || nav?.userAgent || 'Web browser'
  return {
    appVersion: APP_VERSION,
    deviceName: 'RecordsWeb web browser',
    platform: [nav?.platform, browser].filter(Boolean).join(' · ') || 'Web browser',
  }
}

export function setUrgentTabState(active) {
  if (typeof document === 'undefined') return
  const normal = 'RecordsWeb'
  document.title = active ? '(!) RecordsWeb — Urgent Message' : normal
}
