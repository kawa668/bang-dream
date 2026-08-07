import { contextBridge, ipcRenderer } from 'electron'
import type { OutfitId } from '../shared/types'

const api = {
  onModelSwitch: (callback: (id: OutfitId) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, id: OutfitId): void => callback(id)
    ipcRenderer.on('model:switch', listener)
    return () => ipcRenderer.removeListener('model:switch', listener)
  },
  reportStatus: (status: string): void => {
    ipcRenderer.send('status', status)
  },
  onStatus: (callback: (status: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: string): void => callback(status)
    ipcRenderer.on('app:status', listener)
    return () => ipcRenderer.removeListener('app:status', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)