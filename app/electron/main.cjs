const { app, BrowserWindow, Menu, shell, ipcMain, nativeTheme, dialog } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const APP_NAME = 'RecordsWeb'
const APP_ID = 'uk.recordsweb.desktop'
const bundledIcon = path.join(__dirname, '..', 'build', 'icon.ico')
const updateTestMode = !app.isPackaged && process.env.RECORDSWEB_TEST_UPDATE === '1'

let mainWindow = null
let expectedUpdateVersion = null
let simulatedUpdateTimer = null
let lastAppBounds = null
let currentWindowMode = null

const LOGIN_CONTENT_SIZE = { width: 560, height: 438 }
const UPDATE_CONTENT_SIZE = { width: 760, height: 710 }
const APP_DEFAULT_SIZE = { width: 1540, height: 960 }
const APP_MIN_SIZE = { width: 1180, height: 720 }

function sendUpdateState(state) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('recordsweb:update-state', state)
}

function normaliseUpdateError(error) {
  const message = String(error?.message || error || 'Unknown updater error')
  return message.replace(/\s+/g, ' ').trim()
}

function validGitHubPart(value) {
  return /^[A-Za-z0-9_.-]+$/.test(String(value || '').trim())
}

function clearSimulatedUpdate() {
  if (simulatedUpdateTimer) clearInterval(simulatedUpdateTimer)
  simulatedUpdateTimer = null
}

function startSimulatedUpdate() {
  clearSimulatedUpdate()
  let percent = 0
  const total = 118 * 1024 * 1024

  sendUpdateState({
    status: 'available',
    version: expectedUpdateVersion || '9.9.9',
    expectedVersion: expectedUpdateVersion,
    simulated: true,
  })

  simulatedUpdateTimer = setInterval(() => {
    percent = Math.min(100, percent + 4)
    sendUpdateState({
      status: 'downloading',
      percent,
      transferred: Math.round(total * (percent / 100)),
      total,
      bytesPerSecond: 5 * 1024 * 1024,
      expectedVersion: expectedUpdateVersion,
      simulated: true,
    })

    if (percent >= 100) {
      clearSimulatedUpdate()
      sendUpdateState({
        status: 'downloaded',
        percent: 100,
        version: expectedUpdateVersion || '9.9.9',
        expectedVersion: expectedUpdateVersion,
        simulated: true,
      })
    }
  }, 90)
}

function configureUpdaterEvents() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false

  autoUpdater.on('checking-for-update', () => {
    sendUpdateState({ status: 'checking', expectedVersion: expectedUpdateVersion })
  })

  autoUpdater.on('update-available', (info) => {
    sendUpdateState({
      status: 'available',
      version: info?.version || expectedUpdateVersion,
      expectedVersion: expectedUpdateVersion,
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    sendUpdateState({
      status: 'not-available',
      version: info?.version || app.getVersion(),
      expectedVersion: expectedUpdateVersion,
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateState({
      status: 'downloading',
      percent: Number(progress?.percent || 0),
      transferred: Number(progress?.transferred || 0),
      total: Number(progress?.total || 0),
      bytesPerSecond: Number(progress?.bytesPerSecond || 0),
      expectedVersion: expectedUpdateVersion,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateState({
      status: 'downloaded',
      percent: 100,
      version: info?.version || expectedUpdateVersion,
      expectedVersion: expectedUpdateVersion,
    })
  })

  autoUpdater.on('error', (error) => {
    sendUpdateState({
      status: 'error',
      error: normaliseUpdateError(error),
      expectedVersion: expectedUpdateVersion,
    })
  })
}

function clampToWorkArea(width, height, win) {
  const display = require('electron').screen.getDisplayMatching(win.getBounds())
  const work = display.workArea
  return {
    width: Math.min(Math.max(width, 420), work.width),
    height: Math.min(Math.max(height, 320), work.height),
  }
}

function focusRenderer(win) {
  if (!win || win.isDestroyed()) return

  try {
    if (!win.isVisible()) win.show()
    win.focus()
    win.webContents.focus()
  } catch {}

  // Chromium can briefly lose keyboard focus while a Windows BrowserWindow is
  // unmaximised/resized. Re-assert focus after the native resize has settled.
  setImmediate(() => {
    if (!win || win.isDestroyed()) return
    try {
      win.focus()
      win.webContents.focus()
    } catch {}
  })
}

function setWindowMode(win, mode) {
  if (!win || win.isDestroyed()) return { ok: false }

  if (mode === currentWindowMode) {
    focusRenderer(win)
    return { ok: true, mode }
  }

  if (mode === 'login' || mode === 'update') {
    if (!win.isMaximized() && win.isResizable()) lastAppBounds = win.getBounds()
    if (win.isFullScreen()) win.setFullScreen(false)
    if (win.isMaximized()) win.unmaximize()

    const contentSize = mode === 'update' ? UPDATE_CONTENT_SIZE : LOGIN_CONTENT_SIZE

    // Temporarily allow programmatic resizing, then lock the compact RecordsWeb window.
    win.setResizable(true)
    win.setMinimumSize(0, 0)
    win.setMaximumSize(0, 0)
    win.setContentSize(contentSize.width, contentSize.height, false)
    win.setResizable(false)
    win.setMaximizable(false)
    win.setMinimizable(false)
    win.center()
    currentWindowMode = mode
    focusRenderer(win)
    return { ok: true, mode }
  }

  if (mode === 'app') {
    win.setMaximumSize(0, 0)
    win.setMinimumSize(APP_MIN_SIZE.width, APP_MIN_SIZE.height)
    win.setResizable(true)
    win.setMaximizable(true)
    win.setMinimizable(true)

    if (lastAppBounds && lastAppBounds.width >= APP_MIN_SIZE.width && lastAppBounds.height >= APP_MIN_SIZE.height) {
      const size = clampToWorkArea(lastAppBounds.width, lastAppBounds.height, win)
      win.setBounds({ ...lastAppBounds, ...size })
    } else {
      const size = clampToWorkArea(APP_DEFAULT_SIZE.width, APP_DEFAULT_SIZE.height, win)
      win.setSize(size.width, size.height)
      win.center()
    }

    // The clinical workspace is intended to use the available desktop area.
    win.maximize()
    currentWindowMode = 'app'
    focusRenderer(win)
    return { ok: true, mode: 'app' }
  }

  return { ok: false, message: 'Unknown RecordsWeb window mode.' }
}


async function renderHtmlToPdf(html) {
  const pdfWindow = new BrowserWindow({
    show: false,
    width: 1120,
    height: 760,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  try {
    const source = `data:text/html;charset=utf-8,${encodeURIComponent(String(html || ''))}`
    await pdfWindow.loadURL(source)
    await new Promise((resolve) => setTimeout(resolve, 80))
    return await pdfWindow.webContents.printToPDF({
      printBackground: true,
      landscape: true,
      pageSize: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: true,
    })
  } finally {
    if (!pdfWindow.isDestroyed()) pdfWindow.destroy()
  }
}

async function printHtml(html) {
  const printWindow = new BrowserWindow({
    show: false,
    width: 1120,
    height: 760,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  try {
    const source = `data:text/html;charset=utf-8,${encodeURIComponent(String(html || ''))}`
    await printWindow.loadURL(source)
    await new Promise((resolve) => setTimeout(resolve, 100))
    return await new Promise((resolve, reject) => {
      printWindow.webContents.print({
        silent: false,
        printBackground: true,
        landscape: true,
        pageSize: 'A4',
        margins: { marginType: 'none' },
      }, (success, failureReason) => {
        if (!success && failureReason && !/cancel/i.test(failureReason)) reject(new Error(failureReason))
        else resolve({ ok: Boolean(success), cancelled: !success })
      })
    })
  } finally {
    // Give the native print dialog enough time to detach from the hidden window.
    setTimeout(() => {
      if (!printWindow.isDestroyed()) printWindow.destroy()
    }, 1200)
  }
}

function registerDesktopIpc() {
  ipcMain.handle('recordsweb:get-app-info', () => ({
    name: APP_NAME,
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    platform: process.platform,
    updateTestMode,
  }))

  ipcMain.handle('recordsweb:get-device-info', () => ({
    hostname: os.hostname(),
    platform: process.platform,
    release: os.release(),
  }))

  ipcMain.handle('recordsweb:set-window-mode', (event, mode) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow
    return setWindowMode(win, String(mode || '').trim())
  })

  ipcMain.handle('recordsweb:set-native-theme', (_event, theme) => {
    const source = String(theme || '').trim().toLowerCase()
    nativeTheme.themeSource = source === 'dark' ? 'dark' : source === 'system' ? 'system' : 'light'
    return { ok: true, theme: nativeTheme.themeSource }
  })

  ipcMain.handle('recordsweb:start-update', async (_event, payload = {}) => {
    expectedUpdateVersion = String(payload.expectedVersion || '').trim() || null

    if (updateTestMode) {
      startSimulatedUpdate()
      return { ok: true, simulated: true, version: expectedUpdateVersion }
    }

    if (!app.isPackaged) {
      return {
        ok: false,
        development: true,
        message: 'Automatic application updates are disabled for unpackaged development builds.',
      }
    }

    const owner = String(payload.owner || '').trim()
    const repo = String(payload.repo || '').trim()
    const channel = String(payload.channel || 'latest').trim() || 'latest'

    if (!validGitHubPart(owner) || !validGitHubPart(repo)) {
      throw new Error('The RecordsWeb GitHub update repository is not configured correctly.')
    }

    autoUpdater.setFeedURL({
      provider: 'github',
      owner,
      repo,
      channel,
      private: false,
    })

    sendUpdateState({ status: 'checking', expectedVersion: expectedUpdateVersion })

    try {
      const result = await autoUpdater.checkForUpdates()
      return {
        ok: true,
        version: result?.updateInfo?.version || null,
      }
    } catch (error) {
      const message = normaliseUpdateError(error)
      sendUpdateState({ status: 'error', error: message, expectedVersion: expectedUpdateVersion })
      throw new Error(message)
    }
  })

  ipcMain.handle('recordsweb:install-update', () => {
    if (updateTestMode) {
      setTimeout(() => sendUpdateState({ status: 'test-complete', simulated: true }), 1200)
      return { ok: true, simulated: true }
    }
    if (!app.isPackaged) return { ok: false, development: true }
    setImmediate(() => autoUpdater.quitAndInstall(true, true))
    return { ok: true }
  })


  ipcMain.handle('recordsweb:render-pdf-base64', async (_event, payload = {}) => {
    const pdf = await renderHtmlToPdf(payload.html)
    return { ok: true, base64: pdf.toString('base64'), bytes: pdf.length }
  })

  ipcMain.handle('recordsweb:save-pdf', async (event, payload = {}) => {
    const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow
    const pdf = await renderHtmlToPdf(payload.html)
    const safeName = String(payload.defaultFilename || 'RecordsWeb-document.pdf').replace(/[<>:\"/\\|?*]+/g, '-').replace(/\.pdf$/i, '') + '.pdf'
    const result = await dialog.showSaveDialog(owner, {
      title: 'Save RecordsWeb PDF',
      defaultPath: safeName,
      filters: [{ name: 'PDF document', extensions: ['pdf'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })
    if (result.canceled || !result.filePath) return { ok: false, cancelled: true }
    await fs.promises.writeFile(result.filePath, pdf)
    return { ok: true, filePath: result.filePath, bytes: pdf.length }
  })

  ipcMain.handle('recordsweb:print-html', async (_event, payload = {}) => {
    return printHtml(payload.html)
  })

  ipcMain.handle('recordsweb:flash-window', (event, shouldFlash = true) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow
    if (!win || win.isDestroyed()) return { ok: false }
    win.flashFrame(Boolean(shouldFlash))
    return { ok: true }
  })

  ipcMain.handle('recordsweb:quit', () => {
    app.quit()
    return { ok: true }
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 920,
    height: 760,
    minWidth: 560,
    minHeight: 438,
    show: false,
    title: APP_NAME,
    backgroundColor: '#f4f8fc',
    autoHideMenuBar: true,
    ...(fs.existsSync(bundledIcon) ? { icon: bundledIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
    },
  })

  mainWindow = win

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
    win.webContents.focus()
  })

  win.on('focus', () => {
    if (!win.isDestroyed()) win.webContents.focus()
  })
  win.on('restore', () => focusRenderer(win))
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  // Keep RecordsWeb feeling like a desktop application rather than a browser.
  // In packaged builds, block browser refresh/devtools shortcuts that could
  // discard unsaved form work or expose Chromium tooling accidentally.
  win.webContents.on('before-input-event', (event, input) => {
    if (!app.isPackaged) return
    const key = String(input.key || '').toLowerCase()
    const commandOrControl = Boolean(input.control || input.meta)
    const devToolsShortcut = key === 'f12' || (commandOrControl && input.shift && (key === 'i' || key === 'j'))
    const refreshShortcut = key === 'f5' || (commandOrControl && key === 'r')
    if (devToolsShortcut || refreshShortcut) event.preventDefault()
  })

  // RecordsWeb does not use embedded <webview> content.
  win.webContents.on('will-attach-webview', (event) => event.preventDefault())

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL()
    if (url !== current && /^https?:\/\//i.test(url) && !url.startsWith('http://127.0.0.1:5173')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.setName(APP_NAME)
app.setAppUserModelId(APP_ID)

configureUpdaterEvents()
registerDesktopIpc()

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  clearSimulatedUpdate()
  if (process.platform !== 'darwin') app.quit()
})
