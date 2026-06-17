import { describe, expect, it } from 'vitest'
import { positionSelectionMenu } from './selectionMenu'
import type { SelectionRect } from '@/reader/types'

const rectAt = (top: number, left: number, width = 100, height = 20): SelectionRect => ({
  top,
  bottom: top + height,
  left,
  right: left + width,
  width,
  height,
})

const viewport = { width: 400, height: 800 }
const menu = { width: 200, height: 120 }

describe('positionSelectionMenu', () => {
  it('places the menu above the selection when there is room', () => {
    const pos = positionSelectionMenu(rectAt(400, 150), menu, viewport)
    expect(pos.placement).toBe('above')
    expect(pos.top).toBe(400 - 120 - 10)
  })

  it('flips below when there is no room above', () => {
    const pos = positionSelectionMenu(rectAt(10, 150), menu, viewport)
    expect(pos.placement).toBe('below')
    expect(pos.top).toBe(30 + 10)
  })

  it('centers horizontally on the selection', () => {
    const pos = positionSelectionMenu(rectAt(400, 150), menu, viewport)
    // selection center = 150 + 50 = 200; menu left = 200 - 100 = 100
    expect(pos.left).toBe(100)
  })

  it('clamps to the left edge', () => {
    const pos = positionSelectionMenu(rectAt(400, 0, 20), menu, viewport)
    expect(pos.left).toBe(12)
  })

  it('clamps to the right edge', () => {
    const pos = positionSelectionMenu(rectAt(400, 380, 20), menu, viewport)
    // viewport.width - menu.width - EDGE = 400 - 200 - 12 = 188
    expect(pos.left).toBe(188)
  })

  it('never positions the menu off the top of the screen', () => {
    const tallMenu = { width: 200, height: 700 }
    const pos = positionSelectionMenu(rectAt(20, 150), tallMenu, viewport)
    expect(pos.top).toBeGreaterThanOrEqual(12)
  })
})
