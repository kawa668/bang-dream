import type { ConversationManager } from './conversationManager'
import type { LLMProvider } from './llmProvider'

export type ChatEvent =
  | { type: 'start' }
  | { type: 'delta'; delta: string }
  | { type: 'complete'; message: string }
  | { type: 'error'; message: string }

export class ChatManager {
  constructor(
    private readonly conversation: ConversationManager,
    private readonly provider: LLMProvider,
    private readonly emit: (event: ChatEvent) => void
  ) {}

  async sendUserMessage(text: string): Promise<void> {
    const content = text.trim()
    if (!content) return

    this.conversation.append({ role: 'user', content })
    this.emit({ type: 'start' })

    let full = ''
    try {
      for await (const delta of this.provider.chat(this.conversation.payload())) {
        full += delta
        this.emit({ type: 'delta', delta })
      }
      if (!full.trim()) throw new Error('LLM 返回了空回复')

      this.conversation.append({ role: 'assistant', content: full })
      this.conversation.compact()
      this.emit({ type: 'complete', message: full })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.emit({ type: 'error', message })
    }
  }

  clear(): void {
    this.conversation.clear()
  }
}
