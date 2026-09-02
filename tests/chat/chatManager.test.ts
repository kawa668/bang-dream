import { describe, expect, it } from 'vitest'
import { ChatManager } from '../../src/main/chat/chatManager'
import { ConversationManager } from '../../src/main/chat/conversationManager'
import type { LLMProvider } from '../../src/main/chat/llmProvider'
import type { ChatMessage } from '../../src/shared/chat'

function fakeProvider(handler: () => AsyncIterable<string>): LLMProvider {
  return {
    chat(_messages: ChatMessage[]): AsyncIterable<string> {
      return handler()
    }
  }
}

describe('ChatManager', () => {
  it('appends user and assistant messages on success', async () => {
    const conversation = new ConversationManager(10, 'sys')
    const events: unknown[] = []
    const provider = fakeProvider(async function* () {
      yield '你'
      yield '好'
    })
    const chat = new ChatManager(conversation, provider, (event) => events.push(event))

    await chat.sendUserMessage('req-1', ' 在吗 ')

    expect(events).toEqual([
      { type: 'start', requestId: 'req-1' },
      { type: 'delta', requestId: 'req-1', delta: '你' },
      { type: 'delta', requestId: 'req-1', delta: '好' },
      { type: 'complete', requestId: 'req-1', message: '你好' }
    ])
    expect(conversation.payload().map((message) => message.content)).toEqual([
      'sys',
      '在吗',
      '你好'
    ])
  })

  it('does not write an assistant message when the provider fails', async () => {
    const conversation = new ConversationManager(10, 'sys')
    const events: Array<{ type: string; requestId: string; message?: string }> = []
    const provider = fakeProvider(async function* () {
      throw new Error('relay down')
    })
    const chat = new ChatManager(conversation, provider, (event) => events.push(event))

    await chat.sendUserMessage('req-1', 'hi')

    expect(events).toEqual([
      { type: 'start', requestId: 'req-1' },
      { type: 'error', requestId: 'req-1', message: 'relay down' }
    ])
    expect(conversation.payload().map((message) => message.content)).toEqual(['sys', 'hi'])
  })

  it('ignores blank messages', async () => {
    const conversation = new ConversationManager(10, 'sys')
    const events: string[] = []
    const provider = fakeProvider(async function* () {
      yield 'x'
    })
    const chat = new ChatManager(conversation, provider, (event) => events.push(event.type))

    await chat.sendUserMessage('req-1', '   ')

    expect(events).toEqual([])
    expect(conversation.size).toBe(0)
  })

  it('ignores a second message while the first is still streaming', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const conversation = new ConversationManager(10, 'sys')
    const events: Array<{ type: string; requestId: string; delta?: string; message?: string }> = []
    const provider = fakeProvider(async function* () {
      await gate
      yield 'ok'
    })
    const chat = new ChatManager(conversation, provider, (event) => events.push(event))

    const first = chat.sendUserMessage('req-1', 'first')
    const second = chat.sendUserMessage('req-2', 'second')
    release()
    await first
    await second

    expect(events).toEqual([
      { type: 'start', requestId: 'req-1' },
      { type: 'error', requestId: 'req-2', message: '上一条消息还在回复中，请稍候' },
      { type: 'delta', requestId: 'req-1', delta: 'ok' },
      { type: 'complete', requestId: 'req-1', message: 'ok' }
    ])
    expect(conversation.payload().map((message) => message.content)).toEqual([
      'sys',
      'first',
      'ok'
    ])
  })
})
