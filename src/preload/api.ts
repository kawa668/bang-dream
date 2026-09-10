import { contextBridge, ipcRenderer } from 'electron'
import type { OutfitId } from '../shared/types'
import type { LLMSettingsSave, LLMSettingsView } from '../shared/chat'
import type { CharacterId } from '../shared/characterProfiles'
import type { RequestId } from '../shared/requestId'
import type { SttStateMessage, VoiceId, VoiceStateMessage } from '../shared/voice'

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
  sendChatMessage: (requestId: RequestId, text: string): void => {
    ipcRenderer.send('chat:send', { requestId, text })
  },
  clearChat: (requestId: RequestId): void => {
    ipcRenderer.send('chat:clear', { requestId })
  },
  onChatStart: (callback: (event: { requestId: RequestId }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { requestId: RequestId }): void => callback(payload)
    ipcRenderer.on('chat:start', listener)
    return () => ipcRenderer.removeListener('chat:start', listener)
  },
  onChatDelta: (callback: (event: { requestId: RequestId; delta: string }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { requestId: RequestId; delta: string }): void => callback(payload)
    ipcRenderer.on('chat:delta', listener)
    return () => ipcRenderer.removeListener('chat:delta', listener)
  },
  onChatComplete: (callback: (event: { requestId: RequestId; message: string; emotion?: string }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { requestId: RequestId; message: string; emotion?: string }): void => callback(payload)
    ipcRenderer.on('chat:complete', listener)
    return () => ipcRenderer.removeListener('chat:complete', listener)
  },
  onChatError: (callback: (event: { requestId: RequestId; message: string }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { requestId: RequestId; message: string }): void => callback(payload)
    ipcRenderer.on('chat:error', listener)
    return () => ipcRenderer.removeListener('chat:error', listener)
  },
  onChatClear: (callback: (event: { requestId: RequestId }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { requestId: RequestId }): void => callback(payload)
    ipcRenderer.on('chat:clear', listener)
    return () => ipcRenderer.removeListener('chat:clear', listener)
  },
  onCharacterChanged: (callback: (character: { id: CharacterId; name: string }) => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      character: { id: CharacterId; name: string }
    ): void => callback(character)
    ipcRenderer.on('character:changed', listener)
    return () => ipcRenderer.removeListener('character:changed', listener)
  },
  onVoicePlay: (callback: (payload: {
    requestId: RequestId
    playbackId: string
    audio: Uint8Array
  }) => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { requestId: RequestId; playbackId: string; audio: Uint8Array }
    ): void => callback(payload)
    ipcRenderer.on('voice:play', listener)
    return () => ipcRenderer.removeListener('voice:play', listener)
  },
  onVoiceStop: (callback: (payload: {
    requestId: RequestId
    playbackId: string
  }) => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { requestId: RequestId; playbackId: string }
    ): void => callback(payload)
    ipcRenderer.on('voice:stop', listener)
    return () => ipcRenderer.removeListener('voice:stop', listener)
  },
  reportVoiceEnded: (requestId: RequestId, playbackId: string): void => {
    ipcRenderer.send('voice:playback-ended', { requestId, playbackId })
  },
  reportVoiceError: (requestId: RequestId, playbackId: string, message: string): void => {
    ipcRenderer.send('voice:playback-error', { requestId, playbackId, message })
  },
  getVoiceState: (requestId: RequestId): Promise<VoiceStateMessage | null> => (
    ipcRenderer.invoke('voice:get', requestId)
  ),
  setVoiceEnabled: (requestId: RequestId, enabled: boolean): void => {
    ipcRenderer.send('voice:set-enabled', { requestId, enabled })
  },
  setVoiceId: (requestId: RequestId, voiceId: VoiceId): void => {
    ipcRenderer.send('voice:set-voice', { requestId, voiceId })
  },
  setVoiceConversation: (requestId: RequestId, enabled: boolean): void => {
    ipcRenderer.send('voice:set-conversation', { requestId, enabled })
  },
  onVoiceState: (callback: (message: VoiceStateMessage) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: VoiceStateMessage): void => callback(message)
    ipcRenderer.on('voice:state', listener)
    return () => ipcRenderer.removeListener('voice:state', listener)
  },
  getConfig: (): Promise<LLMSettingsView | null> => ipcRenderer.invoke('config:get'),
  saveConfig: (settings: LLMSettingsSave): Promise<LLMSettingsView | null> => (
    ipcRenderer.invoke('config:save', settings)
  ),
  transcribeAudio: (requestId: RequestId, audio: Uint8Array): void => {
    ipcRenderer.send('stt:transcribe', { requestId, audio })
  },
  getSttState: (requestId: RequestId): Promise<SttStateMessage | null> => (
    ipcRenderer.invoke('stt:get', requestId)
  ),
  onSttResult: (callback: (payload: { requestId: RequestId; text: string }) => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { requestId: RequestId; text: string }
    ): void => callback(payload)
    ipcRenderer.on('stt:result', listener)
    return () => ipcRenderer.removeListener('stt:result', listener)
  },
  onSttState: (callback: (message: SttStateMessage) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: SttStateMessage): void => callback(message)
    ipcRenderer.on('stt:state', listener)
    return () => ipcRenderer.removeListener('stt:state', listener)
  },
  onAiExpression: (callback: (payload: { emotion: string }) => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { emotion: string }
    ): void => callback(payload)
    ipcRenderer.on('ai:expression', listener)
    return () => ipcRenderer.removeListener('ai:expression', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
