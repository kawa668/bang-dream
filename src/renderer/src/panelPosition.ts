export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rect extends Point, Size {}

export interface PanelPlacement extends Rect {
  side: 'left' | 'right'
}

export interface PanelPlacementInput {
  click: Point
  modelBounds?: Rect
  viewport: Size
  panelSize?: Size
}

const VIEWPORT_MARGIN = 12
const MODEL_GAP = 12
const MAX_PANEL_WIDTH = 420
const MAX_PANEL_HEIGHT = 620
const MIN_PANEL_HEIGHT = 360
const VERTICAL_OFFSET = 80

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

export function fitPanelSize(viewport: Size): Size {
  const availableWidth = Math.max(0, viewport.width - VIEWPORT_MARGIN * 2)
  const availableHeight = Math.max(0, viewport.height - VIEWPORT_MARGIN * 2)
  const preferredHeight = Math.max(MIN_PANEL_HEIGHT, viewport.height * 0.82)
  return {
    width: Math.min(MAX_PANEL_WIDTH, availableWidth),
    height: Math.min(MAX_PANEL_HEIGHT, preferredHeight, availableHeight)
  }
}

export function calculatePanelPlacement(input: PanelPlacementInput): PanelPlacement {
  const panelSize = input.panelSize ?? fitPanelSize(input.viewport)
  const model = input.modelBounds
  const rightSpace = model
    ? input.viewport.width - (model.x + model.width)
    : input.viewport.width - input.click.x
  const leftSpace = model ? model.x : input.click.x
  const side = rightSpace >= leftSpace ? 'right' : 'left'
  const desiredX = model
    ? side === 'right'
      ? model.x + model.width + MODEL_GAP
      : model.x - MODEL_GAP - panelSize.width
    : side === 'right'
      ? input.click.x + MODEL_GAP
      : input.click.x - MODEL_GAP - panelSize.width

  return {
    side,
    x: clamp(
      desiredX,
      VIEWPORT_MARGIN,
      input.viewport.width - panelSize.width - VIEWPORT_MARGIN
    ),
    y: clamp(
      input.click.y - VERTICAL_OFFSET,
      VIEWPORT_MARGIN,
      input.viewport.height - panelSize.height - VIEWPORT_MARGIN
    ),
    width: panelSize.width,
    height: panelSize.height
  }
}
