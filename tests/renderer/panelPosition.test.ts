import { describe, expect, it } from 'vitest'
import {
  calculatePanelPlacement,
  fitPanelSize
} from '../../src/renderer/src/panelPosition'

describe('panelPosition', () => {
  it('fits the default panel size inside a normal viewport', () => {
    expect(fitPanelSize({ width: 1200, height: 800 })).toEqual({
      width: 420,
      height: 620
    })
  })

  it('shrinks the panel inside a small viewport', () => {
    expect(fitPanelSize({ width: 400, height: 300 })).toEqual({
      width: 376,
      height: 276
    })
  })

  it('chooses the right side when the model is on the left', () => {
    expect(calculatePanelPlacement({
      click: { x: 360, y: 300 },
      modelBounds: { x: 220, y: 140, width: 180, height: 360 },
      viewport: { width: 1200, height: 800 }
    })).toEqual({
      x: 412,
      y: 168,
      width: 420,
      height: 620,
      side: 'right'
    })
  })

  it('chooses the left side when the model is on the right', () => {
    expect(calculatePanelPlacement({
      click: { x: 830, y: 300 },
      modelBounds: { x: 780, y: 140, width: 220, height: 360 },
      viewport: { width: 1200, height: 800 }
    })).toEqual({
      x: 348,
      y: 168,
      width: 420,
      height: 620,
      side: 'left'
    })
  })

  it('clamps the panel to viewport edges', () => {
    expect(calculatePanelPlacement({
      click: { x: 5, y: 790 },
      modelBounds: { x: 0, y: 300, width: 80, height: 300 },
      viewport: { width: 600, height: 420 }
    })).toEqual({
      x: 92,
      y: 48,
      width: 420,
      height: 360,
      side: 'right'
    })
  })

  it('falls back to the click point when model bounds are unavailable', () => {
    expect(calculatePanelPlacement({
      click: { x: 600, y: 300 },
      viewport: { width: 1200, height: 800 }
    })).toEqual({
      x: 612,
      y: 168,
      width: 420,
      height: 620,
      side: 'right'
    })
  })
})
