import { describe, expect, it } from 'vitest'
import { isVoiceId, voiceIdForModel, VOICE_IDS } from '../../src/shared/voice'

describe('voiceIdForModel', () => {
  it('maps any 341_ model to white Sakiko', () => {
    expect(voiceIdForModel('341_casual')).toBe('白祥')
    expect(voiceIdForModel('341_live_2024')).toBe('白祥')
  })

  it('maps any 037_ model to Anon', () => {
    expect(voiceIdForModel('037_birthday_2024_ssr')).toBe('千早爱音')
  })

  it('maps remaining models to Mutsumi', () => {
    expect(voiceIdForModel('casual')).toBe('若叶睦')
    expect(voiceIdForModel('event')).toBe('若叶睦')
  })
})

describe('isVoiceId', () => {
  it('accepts only known voice ids', () => {
    expect(isVoiceId('白祥')).toBe(true)
    expect(isVoiceId('白祥!')).toBe(false)
    expect(isVoiceId(undefined)).toBe(false)
  })

  it('exposes a stable voice id list', () => {
    expect(VOICE_IDS).toEqual(['若叶睦', '千早爱音', '白祥', '黑祥', '墨提斯'])
  })
})
