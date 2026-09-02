import type { ConversationManager } from './conversationManager'
import type { LLMProvider } from './llmProvider'

export type ChatEvent =
  | { type: 'start'; requestId: string }
  | { type: 'delta'; requestId: string; delta: string }
  | { type: 'complete'; requestId: string; message: string }
  | { type: 'error'; requestId: string; message: string }

export class ChatManager {
  private busy = false

  constructor(
    private readonly conversation: ConversationManager,
    private readonly provider: LLMProvider,
    private readonly emit: (event: ChatEvent) => void
  ) {}

  async sendUserMessage(requestId: string, text: string): Promise<void> {
    const content = text.trim()
    if (!content) return

    if (this.busy) {
      this.emit({ type: 'error', requestId, message: '上一条消息还在回复中，请稍候' })
      return
    }

    this.busy = true
    let full = ''
    try {
      this.conversation.append({ role: 'user', content })
      this.emit({ type: 'start', requestId })
      for await (const delta of this.provider.chat(this.conversation.payload())) {
        full += delta
        this.emit({ type: 'delta', requestId, delta })
      }
      if (!full.trim()) throw new Error('LLM 返回了空回复')

      this.conversation.append({ role: 'assistant', content: full })
      this.conversation.compact()
      this.emit({ type: 'complete', requestId, message: full })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.emit({ type: 'error', requestId, message })
    } finally {
      this.busy = false
    }
  }

  clear(): void {
    this.conversation.clear()
  }
}
