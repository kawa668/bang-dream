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

export interface VoiceConfigReserved {
  ttsEndpoint: string
  gptSovitsDir: string
  defaultVoice: string
}

export interface AppConfig {
  llm: LLMConfig
  voice: VoiceConfigReserved
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
