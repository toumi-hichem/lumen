import type { SelectionRect } from '@/reader/types'

export interface Viewport {
  width: number
  height: number
}

export interface MenuSize {
  width: number
  height: number
}

export interface MenuPosition {
  top: number
  left: number
  placement: 'above' | 'below'
}

const GAP = 10
const EDGE = 12

/**
 * Position a floating menu against a selection rect, clamped to the viewport.
 * Prefers placing the menu above the selection; flips below when there isn't
 * room. Horizontally centers on the selection and clamps to the screen edges so
 * the menu never bleeds off-screen (a frequent source of mobile overflow).
 *
 * Pure and deterministic — unit tested.
 */
export function positionSelectionMenu(
  rect: SelectionRect,
  menu: MenuSize,
  viewport: Viewport,
): MenuPosition {
  const roomAbove = rect.top
  const roomBelow = viewport.height - rect.bottom
  const placement: 'above' | 'below' =
    roomAbove >= menu.height + GAP || roomAbove >= roomBelow ? 'above' : 'below'

  let top =
    placement === 'above' ? rect.top - menu.height - GAP : rect.bottom + GAP
  top = clamp(top, EDGE, Math.max(EDGE, viewport.height - menu.height - EDGE))

  const center = rect.left + rect.width / 2
  let left = center - menu.width / 2
  left = clamp(left, EDGE, Math.max(EDGE, viewport.width - menu.width - EDGE))

  return { top, left, placement }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
