import { describe, expect, it } from 'vitest'
import { TTSManager } from '../../src/main/voice/ttsManager'
import { buildVoiceCatalog } from '../../src/main/voice/voiceCatalog'
import type { GptSoVITSProcess, TextToSpeechProvider, VoiceProcessLauncher, VoiceProfile } from '../../src/main/voice/interfaces'
import type { VoiceConfig } from '../../src/shared/chat'
import type { VoiceStateMessage } from '../../src/shared/voice'

const voiceConfig: VoiceConfig = {
  enabled: false,
  selectedVoice: '若叶睦',
  ttsEndpoint: 'http://127.0.0.1:9880',
  sttEndpoint: 'http://127.0.0.1:9881',
  whisperModel: 'large-v3-turbo',
  sttPrecision: 'auto',
  sttTimeoutMs: 600000,
  gptSovitsDir: 'D:/gpt',
  trainingAudioDir: 'D:/audio',
  startupTimeoutMs: 2000,
  voiceConversationEnabled: false
}

const catalog = buildVoiceCatalog({
  gptSovitsDir: voiceConfig.gptSovitsDir,
  trainingAudioDir: voiceConfig.trainingAudioDir
})

class FakeProvider implements TextToSpeechProvider {
  probeResults: boolean[] = []
  probeCalls = 0
  loadCalls: VoiceProfile[] = []
  synthCalls = 0
  exitCalls = 0
  synthError: Error | null = null

  async probeReady(): Promise<boolean> {
    this.probeCalls += 1
    return this.probeResults.shift() ?? true
  }

  async loadVoice(profile: VoiceProfile): Promise<void> {
    this.loadCalls.push(profile)
  }

  async synthesize(): Promise<Uint8Array> {
    this.synthCalls += 1
    if (this.synthError) throw this.synthError
    return new Uint8Array([1, 2, 3])
  }

  async requestExit(): Promise<void> {
    this.exitCalls += 1
  }
}

class FakeLauncher implements VoiceProcessLauncher {
  launchCalls = 0
  processes: FakeProcess[] = []

  launch(): GptSoVITSProcess {
    this.launchCalls += 1
    const process = new FakeProcess()
    this.processes.push(process)
    return process
  }
}

class FakeProcess {
  killed = false

  kill(): void {
    this.killed = true
  }
}

function createManager(
  provider: FakeProvider,
  launcher: FakeLauncher,
  config = voiceConfig,
  stopPlayback = () => {}
) {
  const states: VoiceStateMessage[] = []
  const persisted: Array<{
    enabled?: boolean
    selectedVoice?: string
    voiceConversationEnabled?: boolean
  }> = []
  const played: string[] = []
  const manager = new TTSManager({
    voiceConfig: config,
    catalog,
    provider,
    launcher,
    persist: (changes) => persisted.push(changes),
    onState: (message) => states.push(message),
    play: async (requestId) => {
      played.push(requestId)
    },
    stopPlayback,
    pollIntervalMs: 1
  })
  return { manager, states, persisted, played }
}

describe('TTSManager', () => {
  it('does not start or synthesize while voice is disabled', async () => {
    const provider = new FakeProvider()
    const launcher = new FakeLauncher()
    const { manager, played } = createManager(provider, launcher)

    await manager.speak('你好', 'req-1')

    expect(provider.probeCalls).toBe(0)
    expect(provider.synthCalls).toBe(0)
    expect(launcher.launchCalls).toBe(0)
    expect(played).toEqual([])
  })

  it('lazily starts GPT-SoVITS and plays audio after enabling', async () => {
    const provider = new FakeProvider()
    provider.probeResults = [false, true]
    const launcher = new FakeLauncher()
    const { manager, played } = createManager(provider, launcher)

    await manager.setEnabled(true)
    await manager.speak('你好', 'req-1')

    expect(launcher.launchCalls).toBe(1)
    expect(provider.synthCalls).toBe(1)
    expect(played).toEqual(['req-1'])
  })

  it('switches to white Sakiko voice when a 341 model is selected', async () => {
    const provider = new FakeProvider()
    const launcher = new FakeLauncher()
    const { manager, persisted } = createManager(provider, launcher)

    manager.setModel('341_casual')

    expect(persisted.at(-1)).toEqual({
      enabled: false,
      selectedVoice: '白祥'
    })
    expect(manager.stateMessage().state.selectedVoice).toBe('白祥')
  })

  it('tracks a model without changing the selected voice or persisting', () => {
    const provider = new FakeProvider()
    const launcher = new FakeLauncher()
    const { manager, persisted, states } = createManager(provider, launcher)

    manager.trackModel('037_casual-2023')

    expect(manager.stateMessage().state.modelId).toBe('037_casual-2023')
    expect(manager.stateMessage().state.selectedVoice).toBe('若叶睦')
    expect(states.at(-1)?.state.modelId).toBe('037_casual-2023')
    expect(persisted).toEqual([])
  })

  it('kills the managed process when voice is disabled', async () => {
    const provider = new FakeProvider()
    provider.probeResults = [false, true]
    const launcher = new FakeLauncher()
    const { manager } = createManager(provider, launcher)

    await manager.setEnabled(true)
    await manager.setEnabled(false)

    expect(provider.exitCalls).toBe(1)
    expect(launcher.processes[0]?.killed).toBe(true)
  })

  it('keeps synth failures inside the voice layer', async () => {
    const provider = new FakeProvider()
    provider.synthError = new Error('tts down')
    const launcher = new FakeLauncher()
    const { manager, states } = createManager(provider, launcher)

    await manager.setEnabled(true)
    await expect(manager.speak('你好', 'req-1')).resolves.toBeUndefined()

    const last = states.at(-1)
    expect(last?.state.runtimeState).toBe('error')
    expect(last?.state.message).toContain('tts down')
  })

  it('exposes and persists voiceConversationEnabled', async () => {
    const provider = new FakeProvider()
    const launcher = new FakeLauncher()
    const { manager, persisted } = createManager(provider, launcher)

    expect(manager.stateMessage().state.voiceConversationEnabled).toBe(false)
    manager.setVoiceConversation(true, 'req-dialog')

    expect(manager.stateMessage().state.voiceConversationEnabled).toBe(true)
    expect(persisted.at(-1)).toMatchObject({ voiceConversationEnabled: true })
  })

  it('cancels playback without entering the error state', () => {
    const provider = new FakeProvider()
    const launcher = new FakeLauncher()
    let stopCalls = 0
    const { manager, states } = createManager(provider, launcher, voiceConfig, () => {
      stopCalls += 1
    })

    manager.cancelSpeech()

    expect(stopCalls).toBe(1)
    expect(states.at(-1)?.state.runtimeState).toBe('off')
  })
})
