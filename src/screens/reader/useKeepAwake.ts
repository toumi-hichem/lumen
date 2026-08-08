import { useEffect } from 'react'
import { requestWakeLock, setNativeKeepAwake } from '@/lib/native'

/**
 * Keep the display awake while `active`. Prefers the native window flag, which
 * also prevents the screen from dimming; falls back to the web wake lock (and
 * re-acquires it on tab switch, since the browser drops it when hidden).
 */
export function useKeepAwake(active: boolean): void {
  useEffect(() => {
    if (!active) return
    let release = () => {}
    let cancelled = false
    let native = false

    const acquire = async () => {
      if (native) return
      native = await setNativeKeepAwake(true)
      if (native) {
        // The effect was torn down while the call was in flight.
        if (cancelled) void setNativeKeepAwake(false)
        return
      }
      const r = await requestWakeLock()
      if (cancelled) r()
      else release = r
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      release()
      if (native) void setNativeKeepAwake(false)
    }
  }, [active])
}
