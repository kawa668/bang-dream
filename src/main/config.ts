import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  AppConfig,
  LLMConfig,
  LLMSettingsSave,
  LLMSettingsView,
  VoiceConfig
} from '../shared/chat'
import { isVoiceId } from '../shared/voice'
import type { VoiceId } from '../shared/voice'
import {
  DEFAULT_VOICE_FOR_CHARACTER,
  characterForVoice,
  profileForCharacter
} from '../shared/characterProfiles'
import type { CharacterId } from '../shared/characterProfiles'

const LEGACY_MODEL_IDS: Record<string, string> = {
  'deepseek v4flash': 'deepseek-v4-flash'
}

type LegacyConfig = Partial<AppConfig> & {
  currentCharacter?: string
  llm?: Partial<LLMConfig> & { systemPrompt?: string }
  characters?: Record<string, { model?: string; systemPrompt?: string }>
}

export interface SecretStore {
  isAvailable(): boolean
  encrypt(plain: string): string
  decrypt(encrypted: string): string
}

export const DEFAULT_CONFIG: AppConfig = {
  llm: {
    baseUrl: '',
    apiKeyEncrypted: '',
    sessionId: '',
    model: 'deepseek-v4-flash',
    temperature: 0.8,
    timeoutMs: 30000,
    maxHistory: 20
  },
  voice: {
    enabled: false,
    selectedVoice: '若叶睦',
    ttsEndpoint: 'http://127.0.0.1:9880',
    sttEndpoint: 'http://127.0.0.1:9881',
    whisperModel: 'large-v3-turbo',
    sttPrecision: 'auto',
    sttTimeoutMs: 600000,
    gptSovitsDir: 'D:\\GPT-SOVITS\\GPT-SoVITS-v2pro-20250604-nvidia50\\GPT-SoVITS-v2pro-20250604-nvidia50',
    trainingAudioDir: 'D:\\AGENT\\live\\训练音频',
    startupTimeoutMs: 300000,
    voiceConversationEnabled: false
  },
  currentCharacter: 'mutsumi'
}

function cloneDefaults(): AppConfig {
  const base = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AppConfig
  base.llm.sessionId = createSessionId()
  return base
}

function normalizeVoice(
  value?: Partial<VoiceConfig> & { defaultVoice?: unknown }
): VoiceConfig {
  const source = value ?? {}
  const selected = source.selectedVoice ?? source.defaultVoice ?? DEFAULT_CONFIG.voice.selectedVoice
  return {
    enabled: typeof source.enabled === 'boolean'
      ? source.enabled
      : DEFAULT_CONFIG.voice.enabled,
    selectedVoice: isVoiceId(selected) ? selected : DEFAULT_CONFIG.voice.selectedVoice,
    ttsEndpoint: source.ttsEndpoint?.trim() || DEFAULT_CONFIG.voice.ttsEndpoint,
    sttEndpoint: source.sttEndpoint?.trim() || DEFAULT_CONFIG.voice.sttEndpoint,
    whisperModel: source.whisperModel?.trim() || DEFAULT_CONFIG.voice.whisperModel,
    sttPrecision: source.sttPrecision?.trim() || DEFAULT_CONFIG.voice.sttPrecision,
    sttTimeoutMs: normalizeNumber(source.sttTimeoutMs, DEFAULT_CONFIG.voice.sttTimeoutMs),
    gptSovitsDir: source.gptSovitsDir?.trim() || DEFAULT_CONFIG.voice.gptSovitsDir,
    trainingAudioDir: source.trainingAudioDir?.trim() || DEFAULT_CONFIG.voice.trainingAudioDir,
    startupTimeoutMs: normalizeNumber(
      source.startupTimeoutMs,
      DEFAULT_CONFIG.voice.startupTimeoutMs
    ),
    voiceConversationEnabled: typeof source.voiceConversationEnabled === 'boolean'
      ? source.voiceConversationEnabled
      : DEFAULT_CONFIG.voice.voiceConversationEnabled
  }
}

function mergeDefaults(value: LegacyConfig | undefined): AppConfig {
  const defaults = cloneDefaults()
  const voice = normalizeVoice(value?.voice)
  const currentCharacter = characterForVoice(voice.selectedVoice)
  const legacyCurrent = value?.currentCharacter
  const promotedModel = legacyCurrent
    ? value?.characters?.[legacyCurrent]?.model
    : undefined
  const model = normalizeModelId(promotedModel ?? value?.llm?.model) ?? defaults.llm.model

  return {
    llm: {
      baseUrl: typeof value?.llm?.baseUrl === 'string'
        ? value.llm.baseUrl
        : defaults.llm.baseUrl,
      apiKeyEncrypted: typeof value?.llm?.apiKeyEncrypted === 'string'
        ? value.llm.apiKeyEncrypted
        : defaults.llm.apiKeyEncrypted,
      sessionId: normalizeSessionId(value?.llm?.sessionId) ?? createSessionId(),
      model,
      temperature: normalizeNumber(value?.llm?.temperature, defaults.llm.temperature),
      timeoutMs: normalizeNumber(value?.llm?.timeoutMs, defaults.llm.timeoutMs),
      maxHistory: normalizeNumber(value?.llm?.maxHistory, defaults.llm.maxHistory)
    },
    voice,
    currentCharacter
  }
}

function needsMigration(value: LegacyConfig): boolean {
  const voice = normalizeVoice(value.voice)
  const currentCharacter = characterForVoice(voice.selectedVoice)
  return Object.prototype.hasOwnProperty.call(value, 'characters')
    || Object.prototype.hasOwnProperty.call(value.llm ?? {}, 'systemPrompt')
    || Object.prototype.hasOwnProperty.call(value.voice ?? {}, 'defaultVoice')
    || normalizeSessionId(value.llm?.sessionId) === undefined
    || (typeof value.llm?.model === 'string'
      && normalizeModelId(value.llm.model) !== value.llm.model)
    || value.currentCharacter !== currentCharacter
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeModelId(model?: string): string | undefined {
  const trimmed = model?.trim()
  if (!trimmed) return undefined
  return LEGACY_MODEL_IDS[trimmed] ?? trimmed
}

function normalizeSessionId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const sessionId = value.trim()
  return sessionId || undefined
}

function createSessionId(): string {
  return `ses_${randomUUID()}`
}

export class ConfigService {
  constructor(
    private readonly filePath: string,
    private readonly secretStore: SecretStore
  ) {}

  async load(): Promise<AppConfig> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const value = JSON.parse(raw) as LegacyConfig
      const config = mergeDefaults(value)
      if (needsMigration(value)) await this.save(config)
      return config
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return cloneDefaults()
      throw error
    }
  }

  async save(config: AppConfig): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(config, null, 2), 'utf8')
  }

  setApiKey(config: AppConfig, plainKey: string): AppConfig {
    const trimmed = plainKey.trim()
    if (!trimmed) return config
    if (!this.secretStore.isAvailable()) {
      throw new Error('系统安全存储不可用，无法保存 API Key')
    }
    return {
      ...config,
      llm: {
        ...config.llm,
        apiKeyEncrypted: this.secretStore.encrypt(trimmed)
      }
    }
  }

  getApiKey(config: AppConfig): string {
    return config.llm.apiKeyEncrypted
      ? this.secretStore.decrypt(config.llm.apiKeyEncrypted)
      : ''
  }

  toView(config: AppConfig): LLMSettingsView {
    const profile = profileForCharacter(config.currentCharacter)
    return {
      baseUrl: config.llm.baseUrl,
      model: config.llm.model,
      characterId: profile.id,
      characterName: profile.name,
      temperature: config.llm.temperature,
      timeoutMs: config.llm.timeoutMs,
      maxHistory: config.llm.maxHistory,
      hasApiKey: config.llm.apiKeyEncrypted.length > 0
    }
  }

  applySave(config: AppConfig, save: LLMSettingsSave): AppConfig {
    const withKey = this.setApiKey(config, save.apiKey)
    return {
      ...withKey,
      llm: {
        ...withKey.llm,
        baseUrl: save.baseUrl.trim(),
        model: save.model.trim() || withKey.llm.model,
        temperature: save.temperature,
        timeoutMs: save.timeoutMs,
        maxHistory: save.maxHistory
      }
    }
  }

  applyCharacter(config: AppConfig, characterId: CharacterId): AppConfig {
    return {
      ...config,
      currentCharacter: characterId,
      voice: {
        ...config.voice,
        selectedVoice: DEFAULT_VOICE_FOR_CHARACTER[characterId]
      }
    }
  }

  applyVoiceConfig(
    config: AppConfig,
    changes: {
      enabled?: boolean
      selectedVoice?: VoiceId
      voiceConversationEnabled?: boolean
    }
  ): AppConfig {
    const selectedVoice = changes.selectedVoice ?? config.voice.selectedVoice
    return {
      ...config,
      voice: {
        ...config.voice,
        enabled: typeof changes.enabled === 'boolean'
          ? changes.enabled
          : config.voice.enabled,
        selectedVoice: isVoiceId(selectedVoice) ? selectedVoice : config.voice.selectedVoice,
        voiceConversationEnabled: typeof changes.voiceConversationEnabled === 'boolean'
          ? changes.voiceConversationEnabled
          : config.voice.voiceConversationEnabled
      }
    }
  }
}
