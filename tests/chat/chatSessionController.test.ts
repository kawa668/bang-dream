import { describe, expect, it } from 'vitest'
import { ChatSessionController } from '../../src/main/chat/chatSessionController'
import type {
  ChatSessionControllerOptions
} from '../../src/main/chat/chatSessionController'
import type { ChatEvent } from '../../src/main/chat/chatManager'
import type { LLMProvider } from '../../src/main/chat/llmProvider'
import {
  DEFAULT_VOICE_FOR_CHARACTER,
  profileForCharacter
} from '../../src/shared/characterProfiles'
import type { CharacterId } from '../../src/shared/characterProfiles'
import type { AppConfig, ChatMessage } from '../../src/shared/chat'
import type { VoiceId } from '../../src/shared/voice'

const defaultTestConfig: AppConfig = {
  llm: {
    baseUrl: 'https://relay.example.com',
    apiKeyEncrypted: '',
    sessionId: 'ses_test-session',
    model: 'deepseek-v4-flash',
    temperature: 0.8,
    timeoutMs: 5000,
    maxHistory: 10
  },
  voice: {
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
  },
  currentCharacter: 'mutsumi'
}

function immediateProvider(text: string): LLMProvider {
  return {
    async *chat() {
      yield text
    }
  }
}

function createController(
  overrides: Partial<ChatSessionControllerOptions> = {}
): ChatSessionController {
  return new ChatSessionController({
    config: defaultTestConfig,
    applyCharacter: (config, characterId) => ({
      ...config,
      currentCharacter: characterId,
      voice: {
        ...config.voice,
        selectedVoice: DEFAULT_VOICE_FOR_CHARACTER[characterId]
      }
    }),
    persist: async () => {},
    createProvider: () => immediateProvider('ok'),
    cancelVoice: () => {},
    applyVoice: () => {},
    clearMemory: async () => {},
    onChatEvent: () => {},
    onClear: () => {},
    onCharacterChanged: () => {},
    onError: () => {},
    ...overrides
  })
}

describe('ChatSessionController', () => {
  it('starts with the configured character', () => {
    const controller = createController()

    expect(controller.characterId).toBe('mutsumi')
  })

  it('cancels the old request and ignores its late events', async () => {
    let oldCancelled = false
    const oldProvider: LLMProvider = {
      async *chat(_messages, signal) {
        signal?.addEventListener('abort', () => {
          oldCancelled = true
        })
        await new Promise<void>((resolve) => setTimeout(resolve, 20))
        yield 'old persona'
      }
    }
    const events: ChatEvent[] = []
    const controller = createController({
      createProvider: (_config, character) => character.id === 'mutsumi'
        ? oldProvider
        : immediateProvider('new persona'),
      onChatEvent: (event) => events.push(event)
    })

    const pending = controller.send('req-old', 'hello')
    await controller.switchTo('anon', 'req-switch')
    await pending

    expect(oldCancelled).toBe(true)
    expect(events.some((event) => event.type === 'delta' && event.delta === 'old persona'))
      .toBe(false)
    expect(controller.characterId).toBe('anon')
  })

  it('does not expose the next session when persistence fails', async () => {
    const errors: string[] = []
    const controller = createController({
      persist: async () => {
        throw new Error('disk full')
      },
      onError: (_requestId, message) => errors.push(message)
    })

    await controller.switchTo('anon', 'req-switch')

    expect(controller.characterId).toBe('mutsumi')
    expect(errors).toEqual(['disk full'])
  })

  it('updates global LLM settings without changing the current character', async () => {
    const persisted: AppConfig[] = []
    let cancelVoiceCalls = 0
    let clearMemoryCalls = 0
    const controller = createController({
      persist: async (config) => {
        persisted.push(config)
      },
      cancelVoice: () => {
        cancelVoiceCalls += 1
      },
      clearMemory: async () => {
        clearMemoryCalls += 1
      }
    })
    const next = {
      ...defaultTestConfig,
      llm: { ...defaultTestConfig.llm, model: 'gpt-4o' }
    }

    await controller.updateConfig(next, 'req-config')

    expect(controller.characterId).toBe('mutsumi')
    expect(persisted.at(-1)?.llm.model).toBe('gpt-4o')
    expect(cancelVoiceCalls).toBe(1)
    expect(clearMemoryCalls).toBe(0)
  })

  it('switches voices through the configured character mapping', async () => {
    const appliedVoices: VoiceId[] = []
    const changedCharacters: CharacterId[] = []
    const controller = createController({
      applyVoice: (voiceId) => appliedVoices.push(voiceId),
      onCharacterChanged: (character) => changedCharacters.push(character.id)
    })

    await controller.switchToVoice('黑祥', 'req-switch')

    expect(controller.characterId).toBe('sakiko-black')
    expect(appliedVoices).toEqual(['黑祥'])
    expect(changedCharacters).toEqual(['sakiko-black'])
  })

  it('switches models through the configured character mapping', async () => {
    const controller = createController()

    await controller.switchToModel('341_casual-2023', 'req-switch')

    expect(controller.characterId).toBe('sakiko-white')
  })

  it('clears the conversation and persisted memory', async () => {
    const payloads: ChatMessage[][] = []
    const provider: LLMProvider = {
      async *chat(messages) {
        payloads.push(messages)
        yield 'ok'
      }
    }
    let clearMemoryCalls = 0
    const clearedRequestIds: string[] = []
    const controller = createController({
      createProvider: () => provider,
      clearMemory: async () => {
        clearMemoryCalls += 1
      },
      onClear: (requestId) => clearedRequestIds.push(requestId)
    })

    await controller.send('req-1', 'first')
    await controller.clear('req-clear')
    await controller.send('req-2', 'second')

    expect(payloads[1]).toEqual([
      { role: 'system', content: profileForCharacter('mutsumi').systemPrompt },
      { role: 'user', content: 'second' }
    ])
    expect(clearMemoryCalls).toBe(1)
    expect(clearedRequestIds).toEqual(['req-clear'])
  })

  it('cancels active work and ignores later operations after dispose', async () => {
    const events: ChatEvent[] = []
    let cancelVoiceCalls = 0
    const controller = createController({
      cancelVoice: () => {
        cancelVoiceCalls += 1
      },
      onChatEvent: (event) => events.push(event)
    })

    controller.dispose()
    await controller.send('req-after', 'hello')
    await controller.switchTo('anon', 'req-switch')

    expect(cancelVoiceCalls).toBe(1)
    expect(controller.characterId).toBe('mutsumi')
    expect(events).toEqual([])
  })
})
