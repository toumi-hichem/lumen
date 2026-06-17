import { useEffect } from 'react'
import { requestWakeLock } from '@/lib/native'

/**
 * Hold a screen wake lock while `active`. Re-acquires the lock when the tab
 * becomes visible again, since the browser releases it on tab switch.
 */
export function useKeepAwake(active: boolean): void {
  useEffect(() => {
    if (!active) return
    let release = () => {}
    let cancelled = false

    const acquire = async () => {
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
    }
  }, [active])
}
