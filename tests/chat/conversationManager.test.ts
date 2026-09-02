import { describe, expect, it } from 'vitest'
import { ConversationManager } from '../../src/main/chat/conversationManager'

describe('ConversationManager', () => {
  it('appends messages and prefixes system prompt in payload', () => {
    const manager = new ConversationManager(10, '你是若叶睦')
    manager.append({ role: 'user', content: '你好' })

    expect(manager.payload()).toEqual([
      { role: 'system', content: '你是若叶睦' },
      { role: 'user', content: '你好' }
    ])
  })

  it('caps payload to the most recent maxHistory messages', () => {
    const manager = new ConversationManager(2, 'sys')
    manager.append({ role: 'user', content: 'm1' })
    manager.append({ role: 'user', content: 'm2' })
    manager.append({ role: 'user', content: 'm3' })

    expect(manager.payload()).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'm2' },
      { role: 'user', content: 'm3' }
    ])
  })

  it('clear removes all non-system messages', () => {
    const manager = new ConversationManager(2, 'sys')
    manager.append({ role: 'user', content: 'hi' })
    manager.clear()

    expect(manager.size).toBe(0)
    expect(manager.payload()).toEqual([{ role: 'system', content: 'sys' }])
  })

  it('compact trims overflow from the front', () => {
    const manager = new ConversationManager(2, 'sys')
    manager.append({ role: 'user', content: 'm1' })
    manager.append({ role: 'assistant', content: 'a1' })
    manager.append({ role: 'user', content: 'm2' })
    manager.compact()

    expect(manager.size).toBe(2)
    expect(manager.payload().map((message) => message.content)).toEqual(['sys', 'a1', 'm2'])
  })
})
