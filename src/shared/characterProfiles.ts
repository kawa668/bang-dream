import type { VoiceId } from './voice'
import { getCharacter } from './modelCategories'

export type CharacterId = 'mutsumi' | 'anon' | 'sakiko'

export interface CharacterProfile {
  id: CharacterId
  name: string
  systemPrompt: string
  model: string
  defaultVoice: VoiceId
}

export const CHARACTER_PROFILES: Record<CharacterId, CharacterProfile> = {
  mutsumi: {
    id: 'mutsumi',
    name: '若叶睦',
    systemPrompt: '你是若叶睦，说话温柔克制，用中文简短回复。',
    model: 'deepseek v4flash',
    defaultVoice: '若叶睦'
  },
  anon: {
    id: 'anon',
    name: '千早爱音',
    systemPrompt: '你是千早爱音，活泼开朗，用中文回复。',
    model: 'deepseek v4flash',
    defaultVoice: '千早爱音'
  },
  sakiko: {
    id: 'sakiko',
    name: '丰川祥子',
    systemPrompt: '你是丰川祥子，优雅端庄，用中文回复。',
    model: 'deepseek v4flash',
    defaultVoice: '白祥'
  }
}

export function characterForModel(modelId: string): CharacterId {
  const character = getCharacter(modelId)
  if (character === '丰川祥子') return 'sakiko'
  if (character === '千早爱音') return 'anon'
  return 'mutsumi'
}

export function profileForModel(modelId: string): CharacterProfile {
  return CHARACTER_PROFILES[characterForModel(modelId)]
}

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && value in CHARACTER_PROFILES
}
