import { describe, expect, it } from 'vitest'
import {
  selectRecentChatHistory,
  type ChatHistoryEntry
} from '../../src/shared/chat'

const entries: ChatHistoryEntry[] = [
  { role: 'user', content: 'one', createdAt: 1 },
  { role: 'assistant', content: 'two', createdAt: 2 },
  { role: 'user', content: 'three', createdAt: 3 }
]

describe('selectRecentChatHistory', () => {
  it('returns the latest messages without mutating the input', () => {
    const result = selectRecentChatHistory(entries, 2)
    expect(result).toEqual(entries.slice(-2))
    expect(result).not.toBe(entries)
    expect(entries).toHaveLength(3)
  })

  it('returns all messages when the limit exceeds the list', () => {
    expect(selectRecentChatHistory(entries, 10)).toEqual(entries)
  })

  it('returns an empty list for invalid limits', () => {
    expect(selectRecentChatHistory(entries, 0)).toEqual([])
    expect(selectRecentChatHistory(entries, -1)).toEqual([])
    expect(selectRecentChatHistory(entries, Number.NaN)).toEqual([])
  })
})
