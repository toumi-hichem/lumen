import { useEffect } from 'react'

interface UseAutoScrollOptions {
  active: boolean
  /** Pixels per second. */
  speed: number
  /** Scroll the content by a pixel delta (engine-provided). */
  scrollBy: (px: number) => void
}

/**
 * Continuously scroll the reader at a steady pace while `active`. Drives a
 * requestAnimationFrame loop and accumulates fractional pixels so slow speeds
 * still advance smoothly. Pauses automatically when the tab is hidden.
 */
export function useAutoScroll({ active, speed, scrollBy }: UseAutoScrollOptions): void {
  useEffect(() => {
    if (!active || speed <= 0) return
    let raf = 0
    let last = 0

    const step = (now: number) => {
      if (last === 0) last = now
      const dt = (now - last) / 1000
      last = now
      if (document.visibilityState === 'visible') scrollBy(speed * dt)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [active, speed, scrollBy])
}
