import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'

import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron'

const SHORTCUTS: Array<[string, string]> = [
  ['F1', 'casual'],
  ['F2', 'event'],
  ['F3', 'school_summer'],
  ['F4', 'school_winter']
]

let outputWindow: BrowserWindow | null = null
let controlWindow: BrowserWindow | null = null

function createOutputWindow(): BrowserWindow {
  outputWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) outputWindow.loadURL(devUrl)
  else outputWindow.loadFile(join(__dirname, '../renderer/index.html'))
  outputWindow.on('closed', () => { outputWindow = null })
  return outputWindow
}

function createControlWindow(): BrowserWindow {
  controlWindow = new BrowserWindow({
    width: 320,
    height: 420,
    title: '若叶睦控制台',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) controlWindow.loadURL(`${devUrl}/control.html`)
  else controlWindow.loadFile(join(__dirname, '../renderer/control.html'))
  controlWindow.on('closed', () => { controlWindow = null })
  return controlWindow
}

const writeErrorLog = (error: unknown): void => {
  appendFile(join(app.getPath('userData'), 'live2d-error.log'), `${new Date().toISOString()} ${error instanceof Error ? error.stack : String(error)}\n`).catch(() => {})
}

app.whenReady().then(() => {
  createOutputWindow()
  createControlWindow()

  ipcMain.on('status', (_event, status: string) => {
    controlWindow?.webContents.send('app:status', status)
  })

  ipcMain.on('action:play', (_event, action: string) => {
    outputWindow?.webContents.send('action:play', action)
  })

  ipcMain.on('model:changed', (_event, id: string) => {
    controlWindow?.webContents.send('model:switch', id)
  })

  for (const [accelerator, id] of SHORTCUTS) {
    const ok = globalShortcut.register(accelerator, () => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('model:switch', id)
      }
    })
    if (!ok) console.warn(`shortcut registration failed: ${accelerator}`)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOutputWindow()
      createControlWindow()
    }
  })
})

app.on('will-quit', () => globalShortcut.unregisterAll())

process.on('uncaughtException', (error) => {
  writeErrorLog(error)
  console.error('uncaughtException', error)
})

process.on('unhandledRejection', (error) => {
  writeErrorLog(error)
  console.error('unhandledRejection', error)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
