import type { OutfitId } from '../../shared/types'

declare global {
  interface Window {
    api: {
      onModelSwitch: (callback: (id: OutfitId) => void) => () => void
      reportStatus: (status: string) => void
      onStatus: (callback: (status: string) => void) => () => void
      playAction: (action: string) => void
      onActionPlay: (callback: (action: string) => void) => () => void
    }
  }
}

export {}
