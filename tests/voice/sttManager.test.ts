import { describe, expect, it } from 'vitest'
import { STTManager } from '../../src/main/voice/sttManager'
import type {
  GptSoVITSProcess,
  SpeechToTextProvider,
  SttProcessLauncher
} from '../../src/main/voice/interfaces'
import type { SttStateMessage } from '../../src/shared/voice'

class FakeProvider implements SpeechToTextProvider {
  probeResults: boolean[] = []
  probeCalls = 0
  transcribeCalls: Array<{ audio: Uint8Array; language?: string }> = []
  exitCalls = 0
  transcribeError: Error | null = null

  async probeReady(): Promise<boolean> {
    this.probeCalls += 1
    return this.probeResults.shift() ?? true
  }

  async transcribe(audio: Uint8Array, language?: string): Promise<string> {
    this.transcribeCalls.push({ audio, language })
    if (this.transcribeError) throw this.transcribeError
    return '识别文本'
  }

  async requestExit(): Promise<void> {
    this.exitCalls += 1
  }
}

class FakeLauncher implements SttProcessLauncher {
  launchCalls = 0
  processes: FakeProcess[] = []
  onLaunch: ((process: FakeProcess) => void) | null = null

  launch(): GptSoVITSProcess {
    this.launchCalls += 1
    const process = new FakeProcess()
    this.processes.push(process)
    this.onLaunch?.(process)
    return process
  }
}

class FakeProcess {
  killed = false
  exited = false
  stderr = ''

  kill(): void {
    this.killed = true
  }

  hasExited(): boolean {
    return this.exited
  }

  errorOutput(): string {
    return this.stderr
  }
}

function createManager(provider: FakeProvider, launcher: FakeLauncher, timeoutMs = 2000) {
  const states: SttStateMessage[] = []
  const results: Array<{ requestId: string; text: string }> = []
  const manager = new STTManager({
    endpoint: 'http://127.0.0.1:9881',
    gptSovitsDir: 'D:/gpt',
    model: 'large-v3-turbo',
    precision: 'auto',
    timeoutMs,
    scriptPath: 'D:/app/scripts/asr_api.py',
    launcher,
    provider,
    onState: (message) => states.push(message),
    onResult: (requestId, text) => results.push({ requestId, text }),
    pollIntervalMs: 1
  })
  return { manager, states, results }
}

describe('STTManager', () => {
  it('lazily launches the service and transcribes audio', async () => {
    const provider = new FakeProvider()
    provider.probeResults = [false, true]
    const launcher = new FakeLauncher()
    const { manager, results } = createManager(provider, launcher)

    const text = await manager.transcribe(new Uint8Array([1, 2, 3]), 'req-1')

    expect(launcher.launchCalls).toBe(1)
    expect(text).toBe('识别文本')
    expect(results[0]).toEqual({ requestId: 'req-1', text: '识别文本' })
    expect(provider.transcribeCalls[0]?.language).toBe('auto')
  })

  it('skips launching when the service is already ready', async () => {
    const provider = new FakeProvider()
    const launcher = new FakeLauncher()
    const { manager } = createManager(provider, launcher)

    await manager.transcribe(new Uint8Array([9]), 'req-2')

    expect(launcher.launchCalls).toBe(0)
  })

  it('keeps transcription failures inside the stt layer', async () => {
    const provider = new FakeProvider()
    provider.transcribeError = new Error('stt down')
    const launcher = new FakeLauncher()
    const { manager, states } = createManager(provider, launcher)

    await expect(manager.transcribe(new Uint8Array([1]), 'req-3')).resolves.toBe('')

    const last = states.at(-1)
    expect(last?.state.runtimeState).toBe('error')
    expect(last?.state.message).toContain('stt down')
  })

  it('reports a process startup error without waiting for the timeout', async () => {
    const provider = new FakeProvider()
    provider.probeResults = [false]
    const launcher = new FakeLauncher()
    launcher.onLaunch = (process) => {
      process.exited = true
      process.stderr = "RuntimeError: Unable to open file 'model.bin'"
    }
    const { manager, states } = createManager(provider, launcher, 50)

    await manager.transcribe(new Uint8Array([1]), 'req-error')

    const last = states.at(-1)
    expect(last?.state.runtimeState).toBe('error')
    expect(last?.state.message).toBe(
      "语音识别服务启动失败：RuntimeError: Unable to open file 'model.bin'"
    )
    expect(provider.probeCalls).toBe(1)
  })

  it('dispose kills the managed process', async () => {
    const provider = new FakeProvider()
    provider.probeResults = [false, true]
    const launcher = new FakeLauncher()
    const { manager } = createManager(provider, launcher)

    await manager.transcribe(new Uint8Array([1]), 'req-4')
    await manager.dispose()

    expect(provider.exitCalls).toBe(1)
    expect(launcher.processes[0]?.killed).toBe(true)
  })
})
