import type { OutfitId } from '../../shared/types'
import type { LLMSettingsSave, LLMSettingsView } from '../../shared/chat'

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
      sendChatMessage: (text: string) => void
      clearChat: () => void
      onChatStart: (callback: () => void) => () => void
      onChatDelta: (callback: (delta: string) => void) => () => void
      onChatComplete: (callback: (message: string) => void) => () => void
      onChatError: (callback: (message: string) => void) => () => void
      onChatClear: (callback: () => void) => () => void
      getConfig: () => Promise<LLMSettingsView | null>
      saveConfig: (settings: LLMSettingsSave) => Promise<LLMSettingsView | null>
    }
  }
}

export {}
