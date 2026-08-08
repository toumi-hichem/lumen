import { useEffect, useRef } from 'react'
import {
  VolumeKeys,
  hasVolumeKeys,
  type VolumeKeyEvent,
} from '@/lib/volumeKeys'

interface UseVolumeKeysOptions {
  /**
   * Borrow the volume buttons only while this is true. Whenever it is false the
   * keys are left alone and still change the system volume.
   */
  enabled: boolean
  onPress: (event: VolumeKeyEvent) => void
}

/**
 * Subscribe to native volume presses while `enabled`. The handler is held in a
 * ref so a changing closure never re-registers the listener (which would drop
 * presses mid-scroll).
 */
export function useVolumeKeys({ enabled, onPress }: UseVolumeKeysOptions): void {
  const handlerRef = useRef(onPress)
  useEffect(() => {
    handlerRef.current = onPress
  })

  useEffect(() => {
    if (!enabled || !hasVolumeKeys()) return
    let cancelled = false
    let handle: { remove: () => Promise<void> } | null = null

    void (async () => {
      try {
        const listener = await VolumeKeys.addListener('volumeKey', (event) =>
          handlerRef.current(event),
        )
        if (cancelled) {
          void listener.remove()
          return
        }
        handle = listener
        await VolumeKeys.setCapture({ enabled: true })
      } catch {
        // Plugin unavailable; the keys keep their normal behaviour.
      }
    })()

    return () => {
      cancelled = true
      void VolumeKeys.setCapture({ enabled: false }).catch(() => {})
      void handle?.remove().catch(() => {})
    }
  }, [enabled])
}
