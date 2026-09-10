import type { AppConfig, ChatMessage } from '../../shared/chat'
import {
  characterForModel,
  characterForVoice,
  profileForCharacter
} from '../../shared/characterProfiles'
import type { CharacterId, CharacterProfile } from '../../shared/characterProfiles'
import type { VoiceId } from '../../shared/voice'
import { ChatManager } from './chatManager'
import type { ChatEvent } from './chatManager'
import { ConversationManager } from './conversationManager'
import type { LLMProvider } from './llmProvider'

export interface ChatSessionControllerOptions {
  config: AppConfig
  applyCharacter: (config: AppConfig, characterId: CharacterId) => AppConfig
  persist: (config: AppConfig) => Promise<void>
  createProvider: (config: AppConfig, profile: CharacterProfile) => LLMProvider
  cancelVoice: () => void
  applyVoice: (voiceId: VoiceId) => void
  clearMemory: () => Promise<void>
  onChatEvent: (event: ChatEvent) => void
  onClear: (requestId: string) => void
  onCharacterChanged: (character: CharacterProfile) => void
  onError: (requestId: string, message: string) => void
}

export class ChatSessionUpdateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChatSessionUpdateError'
  }
}

interface ChatSession {
  chat: ChatManager
}

export class ChatSessionController {
  private config: AppConfig
  private session: ChatSession
  private generation = 0
  private disposed = false

  constructor(private readonly options: ChatSessionControllerOptions) {
    this.config = options.config
    this.session = this.createSession(this.config, this.generation)
  }

  get characterId(): CharacterId {
    return this.config.currentCharacter
  }

  async switchTo(characterId: CharacterId, requestId: string): Promise<boolean> {
    if (this.disposed) return false
    if (characterId === this.config.currentCharacter) return true

    const nextConfig = this.options.applyCharacter(this.config, characterId)
    return this.replaceSession(nextConfig, requestId, true)
  }

  async switchToVoice(voiceId: VoiceId, requestId: string): Promise<boolean> {
    return this.switchTo(characterForVoice(voiceId), requestId)
  }

  async switchToModel(modelId: string, requestId: string): Promise<boolean> {
    return this.switchTo(characterForModel(modelId), requestId)
  }

  async updateConfig(nextConfig: AppConfig, requestId: string): Promise<void> {
    if (this.disposed) throw new ChatSessionUpdateError('聊天会话已关闭')

    const config = {
      ...nextConfig,
      currentCharacter: this.config.currentCharacter,
      voice: {
        ...nextConfig.voice,
        selectedVoice: this.config.voice.selectedVoice
      }
    }
    const generation = ++this.generation
    this.session.chat.cancel()
    this.options.cancelVoice()

    let nextSession: ChatSession
    try {
      nextSession = this.createSession(config, generation)
    } catch (error) {
      throw new ChatSessionUpdateError(errorMessage(error))
    }

    try {
      await this.options.persist(config)
    } catch (error) {
      throw new ChatSessionUpdateError(errorMessage(error))
    }

    if (this.disposed || generation !== this.generation) return

    this.config = config
    this.session = nextSession
  }

  restore(messages: ChatMessage[]): void {
    if (this.disposed) return
    this.session.chat.restoreConversation(messages)
  }

  async send(requestId: string, text: string): Promise<void> {
    if (this.disposed) return
    await this.session.chat.sendUserMessage(requestId, text)
  }

  async clear(requestId: string): Promise<void> {
    if (this.disposed) return

    this.session.chat.cancel()
    this.session.chat.clear()
    try {
      await this.options.clearMemory()
    } catch (error) {
      this.options.onError(requestId, errorMessage(error))
      return
    }
    if (!this.disposed) this.options.onClear(requestId)
  }

  dispose(): void {
    if (this.disposed) return

    this.disposed = true
    this.generation += 1
    this.session.chat.cancel()
    this.options.cancelVoice()
  }

  private async replaceSession(
    nextConfig: AppConfig,
    requestId: string,
    characterChanged: boolean
  ): Promise<boolean> {
    const generation = ++this.generation
    this.session.chat.cancel()
    this.options.cancelVoice()

    let nextSession: ChatSession
    try {
      nextSession = this.createSession(nextConfig, generation)
    } catch (error) {
      if (generation === this.generation) {
        this.options.onError(requestId, errorMessage(error))
      }
      return false
    }

    try {
      await this.options.persist(nextConfig)
    } catch (error) {
      if (generation === this.generation) {
        this.options.onError(requestId, errorMessage(error))
      }
      return false
    }

    if (this.disposed || generation !== this.generation) return false

    this.config = nextConfig
    this.session = nextSession

    if (!characterChanged) return true

    this.options.applyVoice(nextConfig.voice.selectedVoice)
    try {
      await this.options.clearMemory()
    } catch (error) {
      this.options.onError(requestId, errorMessage(error))
      return false
    }

    if (this.disposed || generation !== this.generation) return false

    this.options.onClear(requestId)
    this.options.onCharacterChanged(profileForCharacter(nextConfig.currentCharacter))
    return true
  }

  private createSession(config: AppConfig, generation: number): ChatSession {
    const profile = profileForCharacter(config.currentCharacter)
    const conversation = new ConversationManager(config.llm.maxHistory, profile.systemPrompt)
    const provider = this.options.createProvider(config, profile)
    const chat = new ChatManager(conversation, provider, (event) => {
      if (!this.disposed && generation === this.generation) {
        this.options.onChatEvent(event)
      }
    })
    return { chat }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
