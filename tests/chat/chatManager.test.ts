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
    const events: Array<{ type: string; delta?: string; message?: string }> = []
    const provider = fakeProvider(async function* () {
      yield '你'
      yield '好'
    })
    const chat = new ChatManager(conversation, provider, (event) => events.push(event))

    await chat.sendUserMessage(' 在吗 ')

    expect(events.map((event) => event.type)).toEqual(['start', 'delta', 'delta', 'complete'])
    expect(conversation.payload().map((message) => message.content)).toEqual([
      'sys',
      '在吗',
      '你好'
    ])
  })

  it('does not write an assistant message when the provider fails', async () => {
    const conversation = new ConversationManager(10, 'sys')
    const events: string[] = []
    const provider = fakeProvider(async function* () {
      throw new Error('relay down')
    })
    const chat = new ChatManager(conversation, provider, (event) => events.push(event.type))

    await chat.sendUserMessage('hi')

    expect(events).toEqual(['start', 'error'])
    expect(conversation.payload().map((message) => message.content)).toEqual(['sys', 'hi'])
  })

  it('ignores blank messages', async () => {
    const conversation = new ConversationManager(10, 'sys')
    const events: string[] = []
    const provider = fakeProvider(async function* () {
      yield 'x'
    })
    const chat = new ChatManager(conversation, provider, (event) => events.push(event.type))

    await chat.sendUserMessage('   ')

    expect(events).toEqual([])
    expect(conversation.size).toBe(0)
  })

  it('ignores a second message while the first is still streaming', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const conversation = new ConversationManager(10, 'sys')
    const events: string[] = []
    const provider = fakeProvider(async function* () {
      await gate
      yield 'ok'
    })
    const chat = new ChatManager(conversation, provider, (event) => events.push(event.type))

    const first = chat.sendUserMessage('first')
    const second = chat.sendUserMessage('second')
    release()
    await first
    await second

    expect(events).toEqual(['start', 'error', 'delta', 'complete'])
    expect(conversation.payload().map((message) => message.content)).toEqual([
      'sys',
      'first',
      'ok'
    ])
  })
})
