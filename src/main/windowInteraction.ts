export interface Point {
  x: number
  y: number
}

export interface Rect extends Point {
  width: number
  height: number
}

export interface WindowInteractionInput {
  cursor: Point
  windowBounds: Rect
  modelBounds: Rect | null
  panelBounds: Rect | null
  dragging: boolean
}

function isInsideWindowPoint(point: Point, origin: Point, bounds: Rect): boolean {
  const left = origin.x + bounds.x
  const top = origin.y + bounds.y
  return point.x >= left
    && point.x <= left + bounds.width
    && point.y >= top
    && point.y <= top + bounds.height
}

export function shouldInterceptCursor(input: WindowInteractionInput): boolean {
  if (input.dragging) return true
  if (
    input.modelBounds
    && isInsideWindowPoint(input.cursor, input.windowBounds, input.modelBounds)
  ) {
    return true
  }
  return Boolean(
    input.panelBounds
    && isInsideWindowPoint(input.cursor, input.windowBounds, input.panelBounds)
  )
}
