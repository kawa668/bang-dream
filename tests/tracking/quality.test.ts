import { describe, expect, it } from 'vitest'
import { QualityController } from '../../src/renderer/src/tracking/quality'

describe('QualityController', () => {
  it('downgrades after 30 low-fps frames', () => {
    const controller = new QualityController()
    for (let i = 0; i < 30; i += 1) controller.update(20)
    expect(controller.getLevel()).toBe('lite')
  })

  it('upgrades after 180 high-fps frames', () => {
    const controller = new QualityController()
    for (let i = 0; i < 30; i += 1) controller.update(20)
    for (let i = 0; i < 180; i += 1) controller.update(60)
    expect(controller.getLevel()).toBe('full')
  })
})
