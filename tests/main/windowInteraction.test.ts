import { describe, expect, it } from 'vitest'
import { shouldInterceptCursor } from '../../src/main/windowInteraction'

const windowBounds = { x: 100, y: 50, width: 1000, height: 800 }
const modelBounds = { x: 300, y: 200, width: 200, height: 400 }
const panelBounds = { x: 520, y: 100, width: 420, height: 620 }

describe('shouldInterceptCursor', () => {
  it('intercepts the model area', () => {
    expect(shouldInterceptCursor({
      cursor: { x: 450, y: 300 },
      windowBounds,
      modelBounds,
      panelBounds: null,
      dragging: false
    })).toBe(true)
  })

  it('intercepts the panel area', () => {
    expect(shouldInterceptCursor({
      cursor: { x: 650, y: 200 },
      windowBounds,
      modelBounds,
      panelBounds,
      dragging: false
    })).toBe(true)
  })

  it('passes through outside both areas', () => {
    expect(shouldInterceptCursor({
      cursor: { x: 1050, y: 750 },
      windowBounds,
      modelBounds,
      panelBounds,
      dragging: false
    })).toBe(false)
  })

  it('intercepts everywhere while dragging', () => {
    expect(shouldInterceptCursor({
      cursor: { x: 1050, y: 750 },
      windowBounds,
      modelBounds,
      panelBounds,
      dragging: true
    })).toBe(true)
  })
})
