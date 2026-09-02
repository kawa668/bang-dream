import type { ChatMessage } from '../../shared/chat'

export interface LLMProviderOptions {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  timeoutMs: number
}

export interface LLMProvider {
  chat(messages: ChatMessage[]): AsyncIterable<string>
}

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(private readonly options: LLMProviderOptions) {}

  async *chat(messages: ChatMessage[]): AsyncIterable<string> {
    const url = `${this.options.baseUrl.replace(/\/+$/, '')}/chat/completions`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.apiKey}`
        },
        body: JSON.stringify({
          model: this.options.model,
          messages,
          stream: true,
          temperature: this.options.temperature
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`LLM HTTP ${response.status}: ${body.slice(0, 200)}`)
      }

      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('text/event-stream')) {
        const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
        const content = json.choices?.[0]?.message?.content
        if (content) yield content
        return
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('LLM response has no body')

      const decoder = new TextDecoder()
      let buffer = ''
      let finished = false

      while (!finished) {
        const result = await reader.read()
        if (result.done) break
        buffer += decoder.decode(result.value, { stream: true })

        let newlineIndex = buffer.indexOf('\n')
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)

          if (line.startsWith('data:')) {
            const data = line.slice(5).trim()
            if (data === '[DONE]') {
              finished = true
              break
            }
            try {
              const parsed = JSON.parse(data) as {
                choices?: Array<{
                  delta?: { content?: string }
                  message?: { content?: string }
                }>
              }
              const content = parsed.choices?.[0]?.delta?.content
                ?? parsed.choices?.[0]?.message?.content
              if (typeof content === 'string' && content.length > 0) yield content
            } catch {
              // 忽略 keep-alive 或格式不完整的数据行
            }
          }

          newlineIndex = buffer.indexOf('\n')
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`LLM request timed out after ${this.options.timeoutMs}ms`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}
