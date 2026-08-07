import { contextBridge, ipcRenderer } from 'electron'
import type { OutfitId } from '../shared/types'

const api = {
  onModelSwitch: (callback: (id: OutfitId) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, id: OutfitId): void => callback(id)
    ipcRenderer.on('model:switch', listener)
    return () => ipcRenderer.removeListener('model:switch', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)