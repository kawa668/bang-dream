import type { ConversationManager } from './conversationManager'
import { LLMRequestCancelledError, type LLMProvider } from './llmProvider'
import type { ChatMessage } from '../../shared/chat'

export type ChatEvent =
  | { type: 'start'; requestId: string }
  | { type: 'delta'; requestId: string; delta: string }
  | { type: 'complete'; requestId: string; message: string }
  | { type: 'error'; requestId: string; message: string }

export class ChatManager {
  private busy = false
  private activeController: AbortController | null = null

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
    const controller = new AbortController()
    this.activeController = controller
    let full = ''
    try {
      this.conversation.append({ role: 'user', content })
      this.emit({ type: 'start', requestId })
      for await (const delta of this.provider.chat(
        this.conversation.payload(),
        controller.signal
      )) {
        full += delta
        this.emit({ type: 'delta', requestId, delta })
      }
      if (!full.trim()) throw new Error('LLM 返回了空回复')

      this.conversation.append({ role: 'assistant', content: full })
      this.conversation.compact()
      this.emit({ type: 'complete', requestId, message: full })
    } catch (error) {
      if (error instanceof LLMRequestCancelledError) return
      const message = error instanceof Error ? error.message : String(error)
      this.emit({ type: 'error', requestId, message })
    } finally {
      if (this.activeController === controller) this.activeController = null
      this.busy = false
    }
  }

  cancel(): void {
    this.activeController?.abort()
  }

  clear(): void {
    this.conversation.clear()
  }

  restoreConversation(messages: ChatMessage[]): void {
    this.conversation.restore(messages)
  }
}
