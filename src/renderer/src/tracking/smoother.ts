export class ParamSmoother {
  private previous = new Map<string, number>()

  constructor(private readonly alpha = 0.35) {}

  update(next: Record<string, number>): Record<string, number> {
    const result: Record<string, number> = {}
    for (const [key, value] of Object.entries(next)) {
      const previousValue = this.previous.get(key)
      const smoothed = previousValue === undefined ? value : previousValue + this.alpha * (value - previousValue)
      this.previous.set(key, smoothed)
      result[key] = smoothed
    }
    return result
  }

  reset(): void {
    this.previous.clear()
  }
}
