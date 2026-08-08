import { describe, expect, it } from 'vitest'
import { MotionTrigger } from '../../src/renderer/src/tracking/motionTrigger'
import type { TrackingFrame } from '../../src/shared/tracking'

function handFrame(wristX: number, tipDistance: number): TrackingFrame {
  return {
    hands: [[
      { x: wristX, y: 0.5, z: 0 },
      { x: wristX, y: 0.5, z: 0 },
      { x: wristX, y: 0.5, z: 0 },
      { x: wristX, y: 0.5, z: 0 },
      { x: wristX + tipDistance, y: 0.5, z: 0 },
      { x: wristX, y: 0.5, z: 0 },
      { x: wristX, y: 0.5, z: 0 },
      { x: wristX, y: 0.5, z: 0 },
      { x: wristX, y: 0.5, z: 0 },
      { x: wristX, y: 0.5, z: 0 },
      { x: wristX, y: 0.5, z: 0 },
      { x: wristX, y: 0.5, z: 0 },
      { x: wristX + tipDistance, y: 0.5, z: 0 },
      { x: wristX, y: 0.5, z: 0 },
      { x: wristX, y: 0.5, z: 0 },
      { x: wristX, y: 0.5, z: 0 },
      { x: wristX, y: 0.5, z: 0 },
      { x: wristX, y: 0.5, z: 0 },
      { x: wristX, y: 0.5, z: 0 },
      { x: wristX, y: 0.5, z: 0 },
      { x: wristX + tipDistance, y: 0.5, z: 0 }
    ]]
  }
}

describe('MotionTrigger', () => {
  it('returns smile01 for an open hand', () => {
    const trigger = new MotionTrigger()
    expect(trigger.update(handFrame(0.5, 0.4))).toBe('smile01')
  })

  it('returns kime01 for a fist', () => {
    const trigger = new MotionTrigger()
    expect(trigger.update(handFrame(0.5, 0.05))).toBe('kime01')
  })

  it('returns null when no hands are tracked', () => {
    const trigger = new MotionTrigger()
    expect(trigger.update({})).toBeNull()
  })
})
