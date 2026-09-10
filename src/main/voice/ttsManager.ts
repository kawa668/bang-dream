import type { OutfitId } from '../../shared/types'
import type { VoiceConfig } from '../../shared/chat'
import type { VoiceId, VoiceRuntimeState, VoiceStateMessage } from '../../shared/voice'
import { isVoiceId, voiceIdForModel } from '../../shared/voice'
import type { GptSoVITSProcess, TextToSpeechProvider, VoiceProcessLauncher, VoiceProfile } from './interfaces'

export interface TTSManagerOptions {
  voiceConfig: VoiceConfig
  catalog: Record<VoiceId, VoiceProfile>
  provider: TextToSpeechProvider
  launcher: VoiceProcessLauncher
  persist: (changes: {
    enabled?: boolean
    selectedVoice?: VoiceId
    voiceConversationEnabled?: boolean
  }) => void
  onState: (message: VoiceStateMessage) => void
  play: (requestId: string, audio: Uint8Array) => Promise<void>
  stopPlayback: () => void
  pollIntervalMs?: number
}

export class TTSManager {
  private readonly config: VoiceConfig
  private readonly catalog: Record<VoiceId, VoiceProfile>
  private readonly provider: TextToSpeechProvider
  private readonly launcher: VoiceProcessLauncher
  private readonly persist: TTSManagerOptions['persist']
  private readonly onState: TTSManagerOptions['onState']
  private readonly play: TTSManagerOptions['play']
  private readonly stopPlayback: TTSManagerOptions['stopPlayback']
  private readonly pollIntervalMs: number

  private enabled: boolean
  private selectedVoice: VoiceId
  private voiceConversationEnabled: boolean
  private modelId: OutfitId | null = null
  private runtimeState: VoiceRuntimeState
  private process: GptSoVITSProcess | null = null
  private managed = false
  private startPromise: Promise<void> | null = null
  private loadedVoice: VoiceId | null = null
  private voiceLoadPromise: Promise<void> | null = null
  private speechTail: Promise<void> = Promise.resolve()
  private speechGeneration = 0
  private disposed = false

  constructor(options: TTSManagerOptions) {
    this.config = options.voiceConfig
    this.catalog = options.catalog
    this.provider = options.provider
    this.launcher = options.launcher
    this.persist = options.persist
    this.onState = options.onState
    this.play = options.play
    this.stopPlayback = options.stopPlayback
    this.pollIntervalMs = options.pollIntervalMs ?? 2000
    this.enabled = options.voiceConfig.enabled
    this.selectedVoice = options.voiceConfig.selectedVoice
    this.voiceConversationEnabled = options.voiceConfig.voiceConversationEnabled
    this.runtimeState = this.enabled ? 'idle' : 'off'
  }

  stateMessage(requestId?: string): VoiceStateMessage {
    return {
      requestId,
      state: {
        enabled: this.enabled,
        selectedVoice: this.selectedVoice,
        modelId: this.modelId,
        runtimeState: this.runtimeState,
        voiceConversationEnabled: this.voiceConversationEnabled
      }
    }
  }

  setVoiceConversation(enabled: boolean, requestId?: string): void {
    if (this.voiceConversationEnabled === enabled) return
    this.voiceConversationEnabled = enabled
    this.persist({
      enabled: this.enabled,
      selectedVoice: this.selectedVoice,
      voiceConversationEnabled: enabled
    })
    this.emitState()
  }

  setModel(modelId: OutfitId): void {
    this.modelId = modelId
    const next = voiceIdForModel(modelId)
    if (this.selectedVoice !== next) {
      this.setVoice(next)
    } else {
      this.emitState()
    }
  }

  trackModel(modelId: OutfitId): void {
    this.modelId = modelId
    this.emitState()
  }

  setVoice(voiceId: VoiceId, requestId?: string): void {
    if (!isVoiceId(voiceId) || this.selectedVoice === voiceId) return
    this.selectedVoice = voiceId
    this.persist({ enabled: this.enabled, selectedVoice: voiceId })
    this.setRuntimeState(this.enabled ? 'idle' : 'off', requestId)
    if (this.process || this.startPromise) {
      void this.ensureVoiceLoaded(voiceId, requestId)
    }
  }

  async setEnabled(enabled: boolean, requestId?: string): Promise<void> {
    if (enabled === this.enabled) return
    this.enabled = enabled
    this.persist({ enabled, selectedVoice: this.selectedVoice })

    if (enabled) {
      try {
        await this.ensureStarted(requestId)
        await this.ensureVoiceLoaded(this.selectedVoice, requestId)
        this.setRuntimeState('idle', requestId)
      } catch (error) {
        this.setRuntimeState('error', requestId, errorText(error))
      }
    } else {
      this.setRuntimeState('stopping', requestId)
      await this.stopService()
      this.setRuntimeState('off', requestId)
    }
  }

  speak(text: string, requestId: string): Promise<void> {
    const generation = this.speechGeneration
    const task = this.speechTail.then(async () => {
      if (!this.enabled || this.disposed || generation !== this.speechGeneration) return
      await this.ensureStarted(requestId)
      if (generation !== this.speechGeneration) return
      await this.ensureVoiceLoaded(this.selectedVoice, requestId)
      if (generation !== this.speechGeneration) return
      const profile = this.catalog[this.selectedVoice]
      this.setRuntimeState('synthesizing', requestId)
      const audio = await this.provider.synthesize(profile, text)
      if (generation !== this.speechGeneration) return
      this.setRuntimeState('playing', requestId)
      await this.play(requestId, audio)
      if (generation !== this.speechGeneration) return
      this.setRuntimeState('idle', requestId)
    })
    const wrapped = task.catch((error) => {
      if (!this.disposed && generation === this.speechGeneration) {
        this.setRuntimeState('error', requestId, errorText(error))
      }
    })
    this.speechTail = wrapped
    return wrapped
  }

  cancelSpeech(): void {
    this.speechGeneration += 1
    this.speechTail = Promise.resolve()
    this.stopPlayback()
    this.setRuntimeState(this.enabled ? 'idle' : 'off')
  }

  async dispose(): Promise<void> {
    this.disposed = true
    await this.startPromise?.catch(() => {})
    await this.stopService()
  }

  private async ensureStarted(requestId?: string): Promise<void> {
    if (this.startPromise) return this.startPromise
    this.setRuntimeState('starting', requestId)
    this.startPromise = (async () => {
      if (await this.provider.probeReady()) {
        this.managed = false
        return
      }
      const port = new URL(this.config.ttsEndpoint).port || '9880'
      this.process = this.launcher.launch({
        gptSovitsDir: this.config.gptSovitsDir,
        port: Number(port)
      })
      this.managed = true
      const deadline = Date.now() + this.config.startupTimeoutMs
      while (Date.now() < deadline) {
        await this.sleep(this.pollIntervalMs)
        if (await this.provider.probeReady()) return
      }
      throw new Error('GPT-SoVITS 启动超时，请检查路径和运行环境')
    })().catch((error) => {
      if (this.process) {
        this.process.kill()
        this.process = null
      }
      this.managed = false
      throw error
    }).finally(() => {
      this.startPromise = null
    })
    return this.startPromise
  }

  private ensureVoiceLoaded(voiceId: VoiceId, requestId?: string): Promise<void> {
    if (this.loadedVoice === voiceId) return Promise.resolve()
    const previous = this.voiceLoadPromise ?? Promise.resolve()
    const task = previous.then(async () => {
      if (this.loadedVoice === voiceId) return
      this.setRuntimeState('loading-voice', requestId)
      await this.provider.loadVoice(this.catalog[voiceId])
      this.loadedVoice = voiceId
    })
    this.voiceLoadPromise = task.catch(() => {})
    return task
  }

  private async stopService(): Promise<void> {
    if (this.managed && this.process) {
      await this.provider.requestExit()
      this.process.kill()
    }
    this.process = null
    this.managed = false
    this.loadedVoice = null
  }

  private setRuntimeState(
    state: VoiceRuntimeState,
    requestId?: string,
    message?: string
  ): void {
    this.runtimeState = state
    const payload = this.stateMessage(requestId)
    if (message) payload.state.message = message
    this.onState(payload)
  }

  private emitState(): void {
    this.onState(this.stateMessage())
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
