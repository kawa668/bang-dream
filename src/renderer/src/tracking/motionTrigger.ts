import type { LandmarkPoint, TrackingFrame } from '../../../shared/tracking'

const distance = (a: LandmarkPoint, b: LandmarkPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

export class MotionTrigger {
  private lastWaveX = new Map<number, number>()
  private waveDelta = new Map<number, number>()
  private waveChanges = new Map<number, number>()

  update(frame: TrackingFrame): string | null {
    if (!frame.hands?.length) return null
    const hand = frame.hands[0]
    if (hand.length < 21) return null

    const wrist = hand[0]
    const middleTip = hand[12]
    const thumbTip = hand[4]
    const pinkyTip = hand[20]
    const openScore = (distance(middleTip, wrist) + distance(thumbTip, wrist) + distance(pinkyTip, wrist)) / 3 * 2

    const prevX = this.lastWaveX.get(0)
    this.lastWaveX.set(0, wrist.x)
    if (prevX !== undefined) {
      const delta = wrist.x - prevX
      const prevDelta = this.waveDelta.get(0) ?? 0
      if ((prevDelta > 0 && delta < 0) || (prevDelta < 0 && delta > 0)) {
        const changes = (this.waveChanges.get(0) ?? 0) + 1
        this.waveChanges.set(0, changes)
        if (changes >= 2) {
          this.waveChanges.set(0, 0)
          return 'bye01'
        }
      }
      if (delta !== 0) this.waveDelta.set(0, delta)
    }

    if (openScore > 0.55) return 'smile01'
    if (openScore < 0.3) return 'kime01'
    return null
  }
}
