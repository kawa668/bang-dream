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
  },
  playAction: (action: string): void => {
    ipcRenderer.send('action:play', action)
  },
  onActionPlay: (callback: (action: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: string): void => callback(action)
    ipcRenderer.on('action:play', listener)
    return () => ipcRenderer.removeListener('action:play', listener)
  },
  reportModel: (id: OutfitId): void => {
    ipcRenderer.send('model:changed', id)
  },
  requestModelSwitch: (id: OutfitId): void => {
    ipcRenderer.send('model:switch-request', id)
  },
  setDragMode: (enabled: boolean): void => {
    ipcRenderer.send('drag-mode', enabled)
  }
}

contextBridge.exposeInMainWorld('api', api)
