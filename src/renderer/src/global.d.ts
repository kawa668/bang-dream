import type { OutfitId } from '../../shared/types'

declare global {
  interface Window {
    api: {
      onModelSwitch: (callback: (id: OutfitId) => void) => () => void
    }
  }
}

export {}