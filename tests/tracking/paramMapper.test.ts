import { describe, expect, it } from 'vitest'
import { mapTrackingToParams } from '../../src/renderer/src/tracking/paramMapper'
import type { TrackingFrame } from '../../src/shared/tracking'

describe('mapTrackingToParams', () => {
  it('maps face blendshapes to eye and mouth params', () => {
    const frame: TrackingFrame = {
      face: {
        landmarks: Array.from({ length: 478 }, (_, index) => ({
          x: 0.5,
          y: index === 33 ? 0.45 : index === 263 ? 0.55 : 0.5,
          z: 0
        })),
        blendshapes: { eyeBlinkLeft: 1, eyeBlinkRight: 0, jawOpen: 0.5 }
      }
    }

    const params = mapTrackingToParams(frame)

    expect(params['PARAM_EYE_L_OPEN']).toBe(0)
    expect(params['PARAM_EYE_R_OPEN']).toBe(1)
    expect(params['PARAM_MOUTH_OPEN_Y']).toBe(20)
  })

  it('maps torso landmarks to body angle params', () => {
    const body = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0 }))
    body[11] = { x: 0.4, y: 0.35, z: 0 }
    body[12] = { x: 0.6, y: 0.45, z: 0 }
    body[23] = { x: 0.45, y: 0.7, z: 0 }
    body[24] = { x: 0.55, y: 0.7, z: 0 }

    const params = mapTrackingToParams({ body })

    expect(params['PARAM_BODY_ANGLE_Y']).toBe(0)
    expect(params['PARAM_BODY_ANGLE_Z']).toBeGreaterThan(0)
    expect(params['PARAM_UPPER_BODY']).toBeCloseTo(-0.2, 5)
  })
})
