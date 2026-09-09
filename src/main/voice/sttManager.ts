import type {
  GptSoVITSProcess,
  SpeechToTextProvider,
  SttProcessLauncher
} from './interfaces'
import type { SttRuntimeState, SttStateMessage } from '../../shared/voice'

export interface STTManagerOptions {
  endpoint: string
  gptSovitsDir: string
  model: string
  precision: string
  timeoutMs: number
  scriptPath: string
  launcher: SttProcessLauncher
  provider: SpeechToTextProvider
  onState: (message: SttStateMessage) => void
  onResult: (requestId: string, text: string) => void
  pollIntervalMs?: number
}

export class STTManager {
  private readonly config: STTManagerOptions
  private readonly pollIntervalMs: number
  private runtimeState: SttRuntimeState = 'idle'
  private process: GptSoVITSProcess | null = null
  private managed = false
  private startPromise: Promise<void> | null = null
  private disposed = false

  constructor(options: STTManagerOptions) {
    this.config = options
    this.pollIntervalMs = options.pollIntervalMs ?? 2000
  }

  stateMessage(requestId?: string): SttStateMessage {
    return {
      requestId,
      state: { runtimeState: this.runtimeState }
    }
  }

  async transcribe(audio: Uint8Array, requestId: string): Promise<string> {
    if (this.disposed) return ''
    try {
      await this.ensureStarted(requestId)
      this.setRuntimeState('transcribing', requestId)
      const text = await this.config.provider.transcribe(audio, 'auto')
      this.setRuntimeState('idle', requestId)
      if (text.trim()) this.config.onResult(requestId, text.trim())
      return text.trim()
    } catch (error) {
      this.setRuntimeState('error', requestId, errorText(error))
      return ''
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    await this.startPromise?.catch(() => {})
    if (this.managed && this.process) {
      await this.config.provider.requestExit()
      this.process.kill()
    }
    this.process = null
    this.managed = false
  }

  private async ensureStarted(requestId?: string): Promise<void> {
    if (this.startPromise) return this.startPromise
    this.setRuntimeState('starting', requestId)
    this.startPromise = (async () => {
      if (await this.config.provider.probeReady()) {
        this.managed = false
        return
      }
      const port = new URL(this.config.endpoint).port || '9881'
      this.process = this.config.launcher.launch({
        gptSovitsDir: this.config.gptSovitsDir,
        port: Number(port),
        model: this.config.model,
        precision: this.config.precision,
        scriptPath: this.config.scriptPath
      })
      this.managed = true
      const deadline = Date.now() + this.config.timeoutMs
      while (Date.now() < deadline) {
        await this.sleep(this.pollIntervalMs)
        if (await this.config.provider.probeReady()) return
      }
      throw new Error('语音识别服务启动超时，请检查模型与运行环境')
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

  private setRuntimeState(
    state: SttRuntimeState,
    requestId?: string,
    message?: string
  ): void {
    this.runtimeState = state
    const payload = this.stateMessage(requestId)
    if (message) payload.state.message = message
    this.config.onState(payload)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
