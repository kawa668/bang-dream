import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AppConfig, LLMSettingsSave, LLMSettingsView, VoiceConfig } from '../shared/chat'
import { isVoiceId } from '../shared/voice'
import type { VoiceId } from '../shared/voice'
import { CHARACTER_PROFILES } from '../shared/characterProfiles'
import type { CharacterId } from '../shared/characterProfiles'

export interface SecretStore {
  isAvailable(): boolean
  encrypt(plain: string): string
  decrypt(encrypted: string): string
}

export const DEFAULT_CONFIG: AppConfig = {
  llm: {
    baseUrl: '',
    apiKeyEncrypted: '',
    model: 'deepseek v4flash',
    systemPrompt: '你是若叶睦，说话温柔克制，用中文简短回复。',
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
  currentCharacter: 'mutsumi',
  characters: { mutsumi: {}, anon: {}, sakiko: {} }
}

function cloneDefaults(): AppConfig {
  const base = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AppConfig
  base.characters = normalizeCharacters(base.characters)
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
    sttTimeoutMs: Number.isFinite(source.sttTimeoutMs)
      ? source.sttTimeoutMs!
      : DEFAULT_CONFIG.voice.sttTimeoutMs,
    gptSovitsDir: source.gptSovitsDir?.trim() || DEFAULT_CONFIG.voice.gptSovitsDir,
    trainingAudioDir: source.trainingAudioDir?.trim() || DEFAULT_CONFIG.voice.trainingAudioDir,
    startupTimeoutMs: Number.isFinite(source.startupTimeoutMs)
      ? source.startupTimeoutMs!
      : DEFAULT_CONFIG.voice.startupTimeoutMs,
    voiceConversationEnabled: typeof source.voiceConversationEnabled === 'boolean'
      ? source.voiceConversationEnabled
      : DEFAULT_CONFIG.voice.voiceConversationEnabled
  }
}

function normalizeCharacters(
  value?: Partial<Record<CharacterId, { systemPrompt?: string; model?: string }>>
): Record<CharacterId, { systemPrompt?: string; model?: string }> {
  return {
    mutsumi: value?.mutsumi ?? {},
    anon: value?.anon ?? {},
    sakiko: value?.sakiko ?? {}
  }
}

function mergeDefaults(value: Partial<AppConfig> | undefined): AppConfig {
  return {
    llm: { ...cloneDefaults().llm, ...value?.llm },
    voice: normalizeVoice(value?.voice),
    currentCharacter: isCharacterId(value?.currentCharacter)
      ? value.currentCharacter
      : DEFAULT_CONFIG.currentCharacter,
    characters: normalizeCharacters(value?.characters)
  }
}

export class ConfigService {
  constructor(
    private readonly filePath: string,
    private readonly secretStore: SecretStore
  ) {}

  async load(): Promise<AppConfig> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      return mergeDefaults(JSON.parse(raw) as Partial<AppConfig>)
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
    const profile = this.effectiveProfile(config, config.currentCharacter)
    return {
      baseUrl: config.llm.baseUrl,
      model: profile.model,
      systemPrompt: profile.systemPrompt,
      temperature: config.llm.temperature,
      timeoutMs: config.llm.timeoutMs,
      maxHistory: config.llm.maxHistory,
      hasApiKey: config.llm.apiKeyEncrypted.length > 0
    }
  }

  applySave(config: AppConfig, save: LLMSettingsSave): AppConfig {
    const withKey = this.setApiKey(config, save.apiKey)
    const role = config.currentCharacter
    const profile = CHARACTER_PROFILES[role]
    const systemPrompt = save.systemPrompt.trim() || profile.systemPrompt
    const model = save.model.trim() || profile.model
    return {
      ...withKey,
      currentCharacter: role,
      characters: {
        ...config.characters,
        [role]: { systemPrompt, model }
      },
      llm: {
        ...withKey.llm,
        baseUrl: save.baseUrl.trim(),
        model,
        systemPrompt,
        temperature: save.temperature,
        timeoutMs: save.timeoutMs,
        maxHistory: save.maxHistory
      }
    }
  }

  effectiveProfile(
    config: AppConfig,
    role: CharacterId
  ): { systemPrompt: string; model: string } {
    const profile = CHARACTER_PROFILES[role]
    const override = config.characters[role]
    return {
      systemPrompt: override?.systemPrompt?.trim() || profile.systemPrompt,
      model: override?.model?.trim() || profile.model
    }
  }

  applyCharacterDefaults(
    config: AppConfig,
    role: CharacterId,
    profile: { systemPrompt: string; model: string }
  ): AppConfig {
    const override = config.characters[role]
    const systemPrompt = override?.systemPrompt?.trim() || profile.systemPrompt
    const model = override?.model?.trim() || profile.model
    return {
      ...config,
      currentCharacter: role,
      llm: { ...config.llm, systemPrompt, model }
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

function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && value in CHARACTER_PROFILES
}
