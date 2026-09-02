import { contextBridge, ipcRenderer } from 'electron'
import type { OutfitId } from '../shared/types'
import type { LLMSettingsSave, LLMSettingsView } from '../shared/chat'

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
  reportModelBounds: (bounds: { x: number; y: number; width: number; height: number }): void => {
    ipcRenderer.send('model:bounds', bounds)
  },
  reportDragging: (dragging: boolean): void => {
    ipcRenderer.send('drag-state', dragging)
  },
  reportMenuOpen: (open: boolean): void => {
    ipcRenderer.send('menu-state', open)
  },
  sendChatMessage: (text: string): void => {
    ipcRenderer.send('chat:send', text)
  },
  clearChat: (): void => {
    ipcRenderer.send('chat:clear')
  },
  onChatStart: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('chat:start', listener)
    return () => ipcRenderer.removeListener('chat:start', listener)
  },
  onChatDelta: (callback: (delta: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, delta: string): void => callback(delta)
    ipcRenderer.on('chat:delta', listener)
    return () => ipcRenderer.removeListener('chat:delta', listener)
  },
  onChatComplete: (callback: (message: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string): void => callback(message)
    ipcRenderer.on('chat:complete', listener)
    return () => ipcRenderer.removeListener('chat:complete', listener)
  },
  onChatError: (callback: (message: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string): void => callback(message)
    ipcRenderer.on('chat:error', listener)
    return () => ipcRenderer.removeListener('chat:error', listener)
  },
  onChatClear: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('chat:clear', listener)
    return () => ipcRenderer.removeListener('chat:clear', listener)
  },
  getConfig: (): Promise<LLMSettingsView | null> => ipcRenderer.invoke('config:get'),
  saveConfig: (settings: LLMSettingsSave): Promise<LLMSettingsView | null> => (
    ipcRenderer.invoke('config:save', settings)
  )
}

contextBridge.exposeInMainWorld('api', api)
