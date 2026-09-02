import type { OutfitId } from '../../shared/types'
import type { LLMSettingsSave, LLMSettingsView } from '../../shared/chat'
import type { RequestId } from '../../shared/requestId'

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
      getConfig: () => Promise<LLMSettingsView | null>
      saveConfig: (settings: LLMSettingsSave) => Promise<LLMSettingsView | null>
    }
  }
}

export {}
