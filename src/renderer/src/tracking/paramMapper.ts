import type { LandmarkPoint, TrackingFrame } from '../../../shared/tracking'

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const distance = (a: LandmarkPoint, b: LandmarkPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

export function mapTrackingToParams(frame: TrackingFrame): Record<string, number> {
  const params: Record<string, number> = {}

  if (frame.face) {
    const { landmarks, blendshapes } = frame.face
    const leftEye = landmarks[33]
    const rightEye = landmarks[263]
    const nose = landmarks[1]
    const chin = landmarks[152]

    params['PARAM_ANGLE_Y'] = clamp((nose.x - 0.5) * 60, -30, 30)
    params['PARAM_ANGLE_X'] = clamp((leftEye.y - rightEye.y) * 120, -30, 30)
    params['PARAM_ANGLE_Z'] = clamp((leftEye.x - rightEye.x) * 120, -15, 15)
    params['PARAM_BODY_ANGLE_X'] = params['PARAM_ANGLE_X'] * 0.4
    params['PARAM_BODY_ANGLE_Y'] = params['PARAM_ANGLE_Y'] * 0.4
    params['PARAM_BODY_ANGLE_Z'] = params['PARAM_ANGLE_Z'] * 0.4

    params['PARAM_EYE_L_OPEN'] = 1 - clamp(blendshapes['eyeBlinkLeft'] ?? 0, 0, 1)
    params['PARAM_EYE_R_OPEN'] = 1 - clamp(blendshapes['eyeBlinkRight'] ?? 0, 0, 1)
    params['PARAM_BROW_L_FORM'] = clamp(blendshapes['browDownLeft'] ?? 0, 0, 1) * 30
    params['PARAM_BROW_R_FORM'] = clamp(blendshapes['browDownRight'] ?? 0, 0, 1) * 30
    params['PARAM_MOUTH_OPEN_Y'] = clamp(blendshapes['jawOpen'] ?? 0, 0, 1) * 40
    params['PARAM_MOUTH_FORM_Y'] = clamp(blendshapes['mouthSmileLeft'] ?? 0, 0, 1) * 20

    const faceHeight = distance(leftEye, chin)
    params['PARAM_POSITION_Y'] = clamp(((nose.y - 0.5) / Math.max(faceHeight, 0.01)) * 0.5, -0.5, 0.5)
  }

  if (frame.hands && frame.hands.length > 0) {
    frame.hands.forEach((hand, index) => {
      const side = index === 0 ? 'L' : 'R'
      const wrist = hand[0]
      const middleTip = hand[12]
      const thumbTip = hand[4]
      const pinkyTip = hand[20]
      const open = clamp((distance(middleTip, wrist) + distance(thumbTip, wrist) + distance(pinkyTip, wrist)) / 3 * 2, 0, 1)
      const raise = clamp((0.5 - wrist.y) * 2, -1, 1)

      params[`PARAM_ARM_${side}_01_001`] = clamp(raise * 30, -30, 30)
      params[`PARAM_HAND_${side}_01_001`] = open
      params[`PARAM_HAND_${side}_02_001`] = open
      params[`PARAM_HAND_${side}_03_001`] = open
      params[`PARAM_HAND_${side}_04_001`] = open
      params[`PARAM_HAND_${side}_05_001`] = open
    })
  }

  return params
}
