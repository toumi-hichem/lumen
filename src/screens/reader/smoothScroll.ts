/**
 * A scroller that moves the reader by a distance with a short ramp up and a
 * ramp down, so the eye can follow the text instead of losing its place in a
 * jump. Distance is integrated from a velocity that accelerates toward a
 * ceiling and brakes into the target, which also makes repeat presses smooth:
 * a new request extends the trip without restarting the motion.
 */

export interface SmoothScroller {
  /** Queue a distance in pixels; positive scrolls down. */
  scrollBy(distance: number): void
  /** Stop where it is and drop any queued distance. */
  cancel(): void
  /** True while a scroll is in flight. */
  isScrolling(): boolean
}

export interface SmoothScrollOptions {
  /** Ramp rate in px/s², applied to both the ramp up and the braking. */
  accel?: number
  /** Speed ceiling in px/s. Low enough to stay readable. */
  maxSpeed?: number
  /**
   * How much distance may pile up from held or repeated presses, as a multiple
   * of the requested distance. Keeps a held button from queueing a long ride.
   */
  maxPendingRatio?: number
  now?: () => number
  schedule?: (cb: (time: number) => void) => number
  cancelScheduled?: (handle: number) => void
}

const DEFAULT_ACCEL = 5000
const DEFAULT_MAX_SPEED = 1400
const DEFAULT_MAX_PENDING_RATIO = 3
/** Below this the trip is over; sub-pixel remainders are not worth a frame. */
const EPSILON = 0.5
/** Clamp long frame gaps (backgrounded tab) so nothing lurches on return. */
const MAX_FRAME_SECONDS = 0.05

export function createSmoothScroller(
  scrollBy: (px: number) => void,
  options: SmoothScrollOptions = {},
): SmoothScroller {
  const accel = options.accel ?? DEFAULT_ACCEL
  const maxSpeed = options.maxSpeed ?? DEFAULT_MAX_SPEED
  const maxPendingRatio = options.maxPendingRatio ?? DEFAULT_MAX_PENDING_RATIO
  const now = options.now ?? (() => performance.now())
  const schedule = options.schedule ?? ((cb) => requestAnimationFrame(cb))
  const cancelScheduled = options.cancelScheduled ?? ((h) => cancelAnimationFrame(h))

  let remaining = 0
  let speed = 0
  let handle: number | null = null
  let last = 0

  const stop = () => {
    if (handle !== null) cancelScheduled(handle)
    handle = null
    remaining = 0
    speed = 0
  }

  const step = (time: number) => {
    handle = null
    const dt = Math.min(MAX_FRAME_SECONDS, Math.max(0, (time - last) / 1000))
    last = time
    const direction = Math.sign(remaining)
    const distance = Math.abs(remaining)
    // Fastest speed that can still brake to a stop within `distance`.
    const brakingSpeed = Math.sqrt(2 * accel * distance)
    const targetSpeed = Math.min(maxSpeed, brakingSpeed)
    speed =
      speed < targetSpeed
        ? Math.min(targetSpeed, speed + accel * dt)
        : Math.max(targetSpeed, speed - accel * dt)
    const move = Math.min(distance, speed * dt)
    remaining -= direction * move
    if (move > 0) scrollBy(direction * move)
    if (Math.abs(remaining) < EPSILON) {
      stop()
      return
    }
    handle = schedule(step)
  }

  return {
    scrollBy(distance: number) {
      if (!distance) return
      if (remaining !== 0 && Math.sign(distance) !== Math.sign(remaining)) {
        // Reversing: abandon the rest of the old trip rather than subtracting
        // from it, and start the new direction from a standstill.
        remaining = distance
        speed = 0
      } else {
        const cap = Math.abs(distance) * maxPendingRatio
        remaining = Math.sign(distance) * Math.min(Math.abs(remaining + distance), cap)
      }
      if (handle === null) {
        last = now()
        handle = schedule(step)
      }
    },
    cancel: stop,
    isScrolling: () => handle !== null,
  }
}
