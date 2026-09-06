import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import log from 'electron-log/main'
import { autoUpdater } from 'electron-updater'
import { initAppState } from '@main/state/appState'
import { registerIpcHandlers } from '@main/ipc/registerIpcHandlers'
import { registerRancherConfirmHandler } from '@main/rancherDesktop/confirm'
import { registerInstallerConfirmHandler } from '@main/checks/windows/installerCleanup/confirm'

log.initialize()
log.errorHandler.startCatching()

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(async () => {
  try {
    await initAppState()
  } catch (err) {
    log.error('initAppState failed', err)
  }
  registerIpcHandlers()
  registerRancherConfirmHandler()
  registerInstallerConfirmHandler()
  createWindow()

  if (app.isPackaged) {
    autoUpdater.logger = log
    autoUpdater.checkForUpdatesAndNotify().catch((err) => log.error('autoUpdater failed', err))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
