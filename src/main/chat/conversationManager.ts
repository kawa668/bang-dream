import type { ChatMessage } from '../../shared/chat'

export class ConversationManager {
  private messages: ChatMessage[] = []

  constructor(
    private readonly maxHistory: number,
    private readonly systemPrompt: string
  ) {}

  append(message: ChatMessage): void {
    this.messages.push(message)
  }

  payload(): ChatMessage[] {
    const recent = this.messages.slice(-this.maxHistory)
    return [{ role: 'system', content: this.systemPrompt }, ...recent]
  }

  compact(): void {
    const overflow = this.messages.length - this.maxHistory
    if (overflow > 0) this.messages.splice(0, overflow)
  }

  clear(): void {
    this.messages = []
  }

  get size(): number {
    return this.messages.length
  }
}
