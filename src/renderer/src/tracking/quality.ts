export type QualityLevel = 'full' | 'lite' | 'face-only' | 'minimal'

const ORDER: QualityLevel[] = ['full', 'lite', 'face-only', 'minimal']

export class QualityController {
  private level: QualityLevel = 'full'
  private lowFrames = 0
  private highFrames = 0

  update(fps: number): QualityLevel {
    if (fps < 24) {
      this.lowFrames += 1
      this.highFrames = 0
      if (this.lowFrames >= 30) {
        this.lowFrames = 0
        const index = ORDER.indexOf(this.level)
        if (index < ORDER.length - 1) this.level = ORDER[index + 1]
      }
    } else {
      this.highFrames += 1
      this.lowFrames = 0
      if (this.highFrames >= 180) {
        this.highFrames = 0
        const index = ORDER.indexOf(this.level)
        if (index > 0) this.level = ORDER[index - 1]
      }
    }
    return this.level
  }

  getLevel(): QualityLevel {
    return this.level
  }
}
