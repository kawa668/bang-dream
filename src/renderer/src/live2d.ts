import * as PIXI from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display/cubism2'

declare global {
  interface Window { PIXI: typeof PIXI }
}

export class Live2DRenderer {
  private app: PIXI.Application
  private model: Live2DModel | null = null

  constructor(canvas: HTMLCanvasElement) {
    window.PIXI = PIXI
    this.app = new PIXI.Application({
      view: canvas,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1
    })
    window.addEventListener('resize', () => this.resize())
    this.resize()
  }

  async load(modelJsonUrl: string): Promise<void> {
    const model = await Live2DModel.from(modelJsonUrl, { autoInteract: false })
    model.anchor.set(0.5, 0.5)
    if (this.model) this.model.destroy()
    this.model = model
    this.app.stage.addChild(model)
    this.resize()
  }

  setParams(params: Record<string, number>): void {
    const core = this.model?.internalModel.coreModel as { setParamFloat?: (id: string, value: number) => void } | null
    if (!core?.setParamFloat) return
    for (const [id, value] of Object.entries(params)) {
      core.setParamFloat(id, value)
    }
  }

  playMotion(group: string): boolean {
    const manager = this.model?.internalModel.motionManager as {
      groups?: Record<string, unknown>
    } | null
    if (!manager?.groups || !(group in manager.groups)) return false
    this.model?.motion(group)
    return true
  }

  private resize(): void {
    const width = window.innerWidth
    const height = window.innerHeight
    this.app.renderer.resize(width, height)
    if (this.model) {
      const bounds = this.model.getBounds()
      const scale = Math.min(width / Math.max(bounds.width, 1), height / Math.max(bounds.height, 1)) * 0.9
      this.model.scale.set(scale)
      this.model.position.set(width / 2, height / 2)
    }
  }

  destroy(): void {
    this.model?.destroy()
    this.app.destroy(true)
  }
}
