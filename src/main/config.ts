import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AppConfig, LLMSettingsSave, LLMSettingsView } from '../shared/chat'
import { isVoiceId } from '../shared/voice'
import type { VoiceConfig, VoiceId } from '../shared/voice'

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
    startupTimeoutMs: 300000
  }
}

function cloneDefaults(): AppConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AppConfig
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
      : DEFAULT_CONFIG.voice.startupTimeoutMs
  }
}

function mergeDefaults(value: Partial<AppConfig> | undefined): AppConfig {
  return {
    llm: { ...cloneDefaults().llm, ...value?.llm },
    voice: normalizeVoice(value?.voice)
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
    return {
      baseUrl: config.llm.baseUrl,
      model: config.llm.model,
      systemPrompt: config.llm.systemPrompt,
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
        model: save.model.trim() || cloneDefaults().llm.model,
        systemPrompt: save.systemPrompt.trim() || cloneDefaults().llm.systemPrompt,
        temperature: save.temperature,
        timeoutMs: save.timeoutMs,
        maxHistory: save.maxHistory
      }
    }
  }

  applyVoiceConfig(
    config: AppConfig,
    changes: { enabled?: boolean; selectedVoice?: VoiceId }
  ): AppConfig {
    const selectedVoice = changes.selectedVoice ?? config.voice.selectedVoice
    return {
      ...config,
      voice: {
        ...config.voice,
        enabled: typeof changes.enabled === 'boolean'
          ? changes.enabled
          : config.voice.enabled,
        selectedVoice: isVoiceId(selectedVoice) ? selectedVoice : config.voice.selectedVoice
      }
    }
  }
}
