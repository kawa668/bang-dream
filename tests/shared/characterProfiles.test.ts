import { describe, expect, it } from 'vitest'
import {
  characterForModel,
  profileForModel
} from '../../src/shared/characterProfiles'

describe('characterProfiles', () => {
  it('maps model prefixes to characters', () => {
    expect(characterForModel('341_casual')).toBe('sakiko')
    expect(characterForModel('037_casual-2023')).toBe('anon')
    expect(characterForModel('casual')).toBe('mutsumi')
  })

  it('returns the profile defaults per character', () => {
    expect(profileForModel('341_casual').name).toBe('丰川祥子')
    expect(profileForModel('037_casual-2023').defaultVoice).toBe('千早爱音')
    expect(profileForModel('casual').defaultVoice).toBe('若叶睦')
  })

  it('uses the supported default model id', () => {
    expect(profileForModel('casual').model).toBe('deepseek-v4-flash')
    expect(profileForModel('341_casual').model).toBe('deepseek-v4-flash')
  })
})
