import { join } from 'node:path'

import { app, BrowserWindow, globalShortcut } from 'electron'

const SHORTCUTS: Array<[string, string]> = [
  ['F1', 'casual'],
  ['F2', 'event'],
  ['F3', 'school_summer'],
  ['F4', 'school_winter']
]

let outputWindow: BrowserWindow | null = null

function createMainWindow(): BrowserWindow {
  outputWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    hasShadow: false,
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

app.whenReady().then(() => {
  createMainWindow()

  for (const [accelerator, id] of SHORTCUTS) {
    const ok = globalShortcut.register(accelerator, () => {
      outputWindow?.webContents.send('model:switch', id)
    })
    if (!ok) console.warn(`shortcut registration failed: ${accelerator}`)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('will-quit', () => globalShortcut.unregisterAll())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})