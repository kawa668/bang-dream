import { describe, expect, it } from 'vitest'
import {
  CHARACTER_PROFILES,
  characterForModel,
  characterForVoice,
  profileForCharacter
} from '../../src/shared/characterProfiles'

describe('characterProfiles', () => {
  it('defines all five fixed character identities', () => {
    expect(Object.keys(CHARACTER_PROFILES)).toEqual([
      'mutsumi',
      'anon',
      'sakiko-white',
      'sakiko-black',
      'mortis'
    ])
  })

  it('maps voices and models to the correct character', () => {
    expect(characterForVoice('若叶睦')).toBe('mutsumi')
    expect(characterForVoice('千早爱音')).toBe('anon')
    expect(characterForVoice('白祥')).toBe('sakiko-white')
    expect(characterForVoice('黑祥')).toBe('sakiko-black')
    expect(characterForVoice('墨提斯')).toBe('mortis')
    expect(characterForModel('037_casual')).toBe('anon')
    expect(characterForModel('341_casual')).toBe('sakiko-white')
    expect(characterForModel('casual')).toBe('mutsumi')
  })

  it('returns the fixed profile for a character', () => {
    expect(profileForCharacter('sakiko-black')).toMatchObject({
      id: 'sakiko-black',
      name: '黑祥',
      defaultVoice: '黑祥'
    })
  })
})
