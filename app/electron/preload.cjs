const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('recordsWebDesktop', {
  isDesktop: true,
  platform: process.platform,
  electronVersion: process.versions.electron,
  getAppInfo: () => ipcRenderer.invoke('recordsweb:get-app-info'),
  getDeviceInfo: () => ipcRenderer.invoke('recordsweb:get-device-info'),
  setWindowMode: (mode) => ipcRenderer.invoke('recordsweb:set-window-mode', mode),
  setNativeTheme: (theme) => ipcRenderer.invoke('recordsweb:set-native-theme', theme),
  startUpdate: (payload) => ipcRenderer.invoke('recordsweb:start-update', payload),
  installUpdate: () => ipcRenderer.invoke('recordsweb:install-update'),
  renderPdfBase64: (payload) => ipcRenderer.invoke('recordsweb:render-pdf-base64', payload),
  savePdf: (payload) => ipcRenderer.invoke('recordsweb:save-pdf', payload),
  printHtml: (payload) => ipcRenderer.invoke('recordsweb:print-html', payload),
  flashWindow: (shouldFlash = true) => ipcRenderer.invoke('recordsweb:flash-window', Boolean(shouldFlash)),
  quit: () => ipcRenderer.invoke('recordsweb:quit'),
  onUpdateState: (listener) => {
    const handler = (_event, state) => listener(state)
    ipcRenderer.on('recordsweb:update-state', handler)
    return () => ipcRenderer.removeListener('recordsweb:update-state', handler)
  },
})
