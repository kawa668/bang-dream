import type { VoiceId } from './voice'

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface LLMConfig {
  baseUrl: string
  apiKeyEncrypted: string
  model: string
  systemPrompt: string
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
}

export interface AppConfig {
  llm: LLMConfig
  voice: VoiceConfig
}

export interface LLMSettingsView {
  baseUrl: string
  model: string
  systemPrompt: string
  temperature: number
  timeoutMs: number
  maxHistory: number
  hasApiKey: boolean
}

export interface LLMSettingsSave {
  baseUrl: string
  apiKey: string
  model: string
  systemPrompt: string
  temperature: number
  timeoutMs: number
  maxHistory: number
}
