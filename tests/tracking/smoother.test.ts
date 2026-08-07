import { describe, expect, it } from 'vitest'
import { ParamSmoother } from '../../src/renderer/src/tracking/smoother'

describe('ParamSmoother', () => {
  it('keeps first value and converges on later updates', () => {
    const smoother = new ParamSmoother(0.5)
    expect(smoother.update({ PARAM_ANGLE_X: 10 })).toEqual({ PARAM_ANGLE_X: 10 })
    expect(smoother.update({ PARAM_ANGLE_X: 20 }).PARAM_ANGLE_X).toBe(15)
    expect(smoother.update({ PARAM_ANGLE_X: 20 }).PARAM_ANGLE_X).toBe(17.5)
  })

  it('resets stored values', () => {
    const smoother = new ParamSmoother(0.5)
    smoother.update({ PARAM_ANGLE_X: 10 })
    smoother.reset()
    expect(smoother.update({ PARAM_ANGLE_X: 20 })).toEqual({ PARAM_ANGLE_X: 20 })
  })
})
