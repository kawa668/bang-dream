import * as PIXI from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display/cubism2'

declare global {
  interface Window { PIXI: typeof PIXI }
}

export class Live2DRenderer {
  private app: PIXI.Application
  private model: Live2DModel | null = null
  private readonly canvas: HTMLCanvasElement
  private dragging = false
  private dragPointerId = -1
  private dragOffsetX = 0
  private dragOffsetY = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    window.PIXI = PIXI
    this.app = new PIXI.Application({
      view: canvas,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1
    })
    this.canvas.style.touchAction = 'none'
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerUp)
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
    this.reportBounds()
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
      definitions?: Record<string, unknown>
      motionGroups?: Record<string, unknown>
    } | null
    const definitions = manager?.definitions ?? manager?.motionGroups
    if (!definitions || !(group in definitions)) return false
    this.model?.motion(group)
    return true
  }

  playRandomMotion(): string | null {
    const manager = this.model?.internalModel.motionManager as {
      definitions?: Record<string, unknown>
      motionGroups?: Record<string, unknown>
    } | null
    const definitions = manager?.definitions ?? manager?.motionGroups
    if (!definitions) return null
    const groups = Object.keys(definitions).filter((group) => group !== 'idle' && group !== 'tap_body')
    if (groups.length === 0) return null
    const group = groups[Math.floor(Math.random() * groups.length)]
    this.model?.motion(group)
    return group
  }

  getAvailableActions(): string[] {
    const manager = this.model?.internalModel.motionManager as {
      definitions?: Record<string, unknown>
      motionGroups?: Record<string, unknown>
    } | null
    const definitions = manager?.definitions ?? manager?.motionGroups
    return Object.keys(definitions ?? {})
      .filter((group) => group !== 'idle' && group !== 'tap_body')
      .sort()
  }

  hitTest(clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect()
    return this.isInsideModel({ x: clientX - rect.left, y: clientY - rect.top })
  }

  private toCanvasPoint(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  private isInsideModel(point: { x: number; y: number }): boolean {
    if (!this.model) return false
    const bounds = this.model.getBounds()
    return point.x >= bounds.x
      && point.x <= bounds.x + bounds.width
      && point.y >= bounds.y
      && point.y <= bounds.y + bounds.height
  }

  private reportBounds(): void {
    if (!this.model) return
    const bounds = this.model.getBounds()
    window.api.reportModelBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    })
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.model) return
    const point = this.toCanvasPoint(event)
    const inside = this.isInsideModel(point)
    if (!inside) return

    window.api.reportDragging(true)
    this.dragging = true
    this.dragPointerId = event.pointerId
    this.dragOffsetX = this.model.x - point.x
    this.dragOffsetY = this.model.y - point.y
    this.canvas.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  private onPointerMove = (event: PointerEvent): void => {
    const point = this.toCanvasPoint(event)
    if (this.dragging && event.pointerId === this.dragPointerId && this.model) {
      this.model.position.set(point.x + this.dragOffsetX, point.y + this.dragOffsetY)
      this.reportBounds()
    }
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.dragPointerId) return
    this.dragging = false
    this.dragPointerId = -1
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId)
    }
    window.api.reportDragging(false)
    this.reportBounds()
  }

  private resize(): void {
    const width = window.innerWidth
    const height = window.innerHeight
    this.app.renderer.resize(width, height)
    if (this.model) {
      const bounds = this.model.getBounds()
      const targetHeight = Math.min(height * 0.45, 700)
      const scale = Math.min(width / Math.max(bounds.width, 1), targetHeight / Math.max(bounds.height, 1))
      this.model.scale.set(scale)
      this.model.position.set(width / 2, height / 2)
      this.reportBounds()
    }
  }

  destroy(): void {
    this.model?.destroy()
    this.app.destroy(true)
  }
}
