import { describe, expect, it } from 'vitest'
import { detectEmotion, pickExpressionAction } from '../../src/shared/emotion'

describe('detectEmotion', () => {
  it('detects happy and sad keywords', () => {
    expect(detectEmotion('好耶！太开心了')).toBe('happy')
    expect(detectEmotion('对不起，我很难过')).toBe('sad')
  })

  it('detects excited and thinking keywords', () => {
    expect(detectEmotion('哇，太激动了！！')).toBe('excited')
    expect(detectEmotion('嗯，让我想想')).toBe('thinking')
  })

  it('defaults to neutral', () => {
    expect(detectEmotion('今天天气不错')).toBe('neutral')
  })

  it('picks a matching expression action by emotion', () => {
    expect(pickExpressionAction(['smile01', 'sad01'], 'happy')).toBe('smile01')
    expect(pickExpressionAction(['angry01', 'cry02'], 'sad')).toBe('cry02')
    expect(pickExpressionAction(['thinking01'], 'thinking')).toBe('thinking01')
  })

  it('returns null for neutral or no match', () => {
    expect(pickExpressionAction(['smile01'], 'neutral')).toBeNull()
    expect(pickExpressionAction(['kime01'], 'excited')).toBeNull()
  })
})
