import type { OutfitId } from './types'

export type VoiceId = '若叶睦' | '千早爱音' | '白祥' | '黑祥' | '墨提斯'

export const VOICE_OPTIONS: Array<{ id: VoiceId; displayName: string }> = [
  { id: '若叶睦', displayName: '若叶睦' },
  { id: '千早爱音', displayName: '千早爱音' },
  { id: '白祥', displayName: '白祥' },
  { id: '黑祥', displayName: '黑祥' },
  { id: '墨提斯', displayName: '墨提斯' }
]

export const VOICE_IDS: VoiceId[] = VOICE_OPTIONS.map((option) => option.id)

export function isVoiceId(value: unknown): value is VoiceId {
  return typeof value === 'string' && (VOICE_IDS as string[]).includes(value)
}

export function voiceIdForModel(modelId: OutfitId): VoiceId {
  if (modelId.startsWith('341_')) return '白祥'
  if (modelId.startsWith('037_')) return '千早爱音'
  return '若叶睦'
}

export type VoiceRuntimeState =
  | 'off'
  | 'idle'
  | 'starting'
  | 'loading-voice'
  | 'synthesizing'
  | 'playing'
  | 'stopping'
  | 'error'

export interface VoiceStateView {
  enabled: boolean
  selectedVoice: VoiceId
  modelId: string | null
  runtimeState: VoiceRuntimeState
  message?: string
}

export interface VoiceStateMessage {
  requestId?: string
  state: VoiceStateView
}
