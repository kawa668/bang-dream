import type { OutfitId } from './types'
import { getCharacter } from './modelCategories'

const CHARACTER_ICON: Record<string, string> = {
  若叶睦: '/icons/mutsumi.png',
  千早爱音: '/icons/anon.png',
  丰川祥子: '/icons/sakiko.png'
}

export function iconForCharacter(character: string): string {
  return CHARACTER_ICON[character] ?? '/icons/mutsumi.png'
}

export function iconForModel(id: OutfitId): string {
  return iconForCharacter(getCharacter(id))
}
