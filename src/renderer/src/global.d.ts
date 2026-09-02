import type { OutfitId } from '../../shared/types'
import type { LLMSettingsSave, LLMSettingsView } from '../../shared/chat'
import type { RequestId } from '../../shared/requestId'
import type { VoiceId, VoiceStateMessage } from '../../shared/voice'

declare global {
  interface Window {
    api: {
      onModelSwitch: (callback: (id: OutfitId) => void) => () => void
      reportStatus: (status: string) => void
      onStatus: (callback: (status: string) => void) => () => void
      playAction: (action: string) => void
      onActionPlay: (callback: (action: string) => void) => () => void
      reportModel: (id: OutfitId) => void
      requestModelSwitch: (id: OutfitId) => void
      reportModelBounds: (bounds: { x: number; y: number; width: number; height: number }) => void
      reportDragging: (dragging: boolean) => void
      reportMenuOpen: (open: boolean) => void
      sendChatMessage: (requestId: RequestId, text: string) => void
      clearChat: (requestId: RequestId) => void
      onChatStart: (callback: (event: { requestId: RequestId }) => void) => () => void
      onChatDelta: (callback: (event: { requestId: RequestId; delta: string }) => void) => () => void
      onChatComplete: (callback: (event: { requestId: RequestId; message: string }) => void) => () => void
      onChatError: (callback: (event: { requestId: RequestId; message: string }) => void) => () => void
      onChatClear: (callback: (event: { requestId: RequestId }) => void) => () => void
      onVoicePlay: (callback: (payload: {
        requestId: RequestId
        playbackId: string
        audio: Uint8Array
      }) => void) => () => void
      onVoiceStop: (callback: (payload: {
        requestId: RequestId
        playbackId: string
      }) => void) => () => void
      reportVoiceEnded: (requestId: RequestId, playbackId: string) => void
      reportVoiceError: (requestId: RequestId, playbackId: string, message: string) => void
      getVoiceState: (requestId: RequestId) => Promise<VoiceStateMessage | null>
      setVoiceEnabled: (requestId: RequestId, enabled: boolean) => void
      setVoiceId: (requestId: RequestId, voiceId: VoiceId) => void
      onVoiceState: (callback: (message: VoiceStateMessage) => void) => () => void
      getConfig: () => Promise<LLMSettingsView | null>
      saveConfig: (settings: LLMSettingsSave) => Promise<LLMSettingsView | null>
    }
  }
}

export {}
