import type { VoiceId } from './voice'
import type { CharacterId } from './characterProfiles'

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface LLMConfig {
  baseUrl: string
  apiKeyEncrypted: string
  sessionId: string
  model: string
  temperature: number
  timeoutMs: number
  maxHistory: number
}

export interface VoiceConfig {
  enabled: boolean
  selectedVoice: VoiceId
  ttsEndpoint: string
  sttEndpoint: string
  whisperModel: string
  sttPrecision: string
  sttTimeoutMs: number
  gptSovitsDir: string
  trainingAudioDir: string
  startupTimeoutMs: number
  voiceConversationEnabled: boolean
}

export interface AppConfig {
  llm: LLMConfig
  voice: VoiceConfig
  currentCharacter: CharacterId
}

export interface LLMSettingsView {
  baseUrl: string
  model: string
  characterId: CharacterId
  characterName: string
  temperature: number
  timeoutMs: number
  maxHistory: number
  hasApiKey: boolean
}

export interface LLMSettingsSave {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  timeoutMs: number
  maxHistory: number
}

export interface ChatHistoryEntry {
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export function selectRecentChatHistory(
  entries: ChatHistoryEntry[],
  maxHistory: number
): ChatHistoryEntry[] {
  const limit = Number.isFinite(maxHistory)
    ? Math.max(0, Math.floor(maxHistory))
    : 0
  return limit === 0 ? [] : entries.slice(-limit)
}
