import { describe, expect, it } from 'vitest'
import {
  loadControlTab,
  parseControlTab,
  saveControlTab,
  type ControlTab
} from '../../src/renderer/src/panelTabs'

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) }
  }
}

describe('panelTabs', () => {
  it('accepts each supported tab', () => {
    for (const tab of ['chat', 'voice', 'ai', 'character'] as const) {
      expect(parseControlTab(tab)).toBe(tab)
    }
  })

  it('falls back to chat for invalid values', () => {
    expect(parseControlTab('unknown')).toBe('chat')
    expect(parseControlTab(null)).toBe('chat')
  })

  it('loads a persisted tab', () => {
    expect(loadControlTab(createStorage({ 'control-panel.active-tab': 'voice' }))).toBe('voice')
  })

  it('falls back when storage throws', () => {
    expect(loadControlTab({
      getItem() { throw new Error('blocked') },
      setItem() {}
    })).toBe('chat')
  })

  it('saves the selected tab', () => {
    const storage = createStorage()
    saveControlTab(storage, 'ai')
    expect(storage.getItem('control-panel.active-tab')).toBe('ai')
  })
})
