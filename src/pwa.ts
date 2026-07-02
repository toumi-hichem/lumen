import { Capacitor } from '@capacitor/core'
import { registerSW } from 'virtual:pwa-register'

// The service worker does two jobs: precache the app shell for offline use, and
// stamp COOP/COEP onto the document so the WebView becomes cross-origin
// isolated. Isolation is what exposes SharedArrayBuffer and lets
// onnxruntime-web run Supertonic TTS across multiple WASM threads.
//
// A service worker only controls a page after a navigation, so the very first
// load is never isolated. Once the SW is active and controlling this page, we
// reload once to pick up the isolation headers. The reload is guarded by a
// sessionStorage flag so a device whose WebView ignores SW-injected headers
// falls back cleanly to single-threaded TTS instead of reloading forever.
const RELOAD_GUARD_KEY = 'lumen.coi.reloaded'

function reloadOnceForIsolation(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  // The Android WebView has no SharedArrayBuffer at all (crbug 41436617), so
  // isolation buys nothing there; native TTS covers it. Skip the reload.
  if (Capacitor.isNativePlatform()) return
  // Already isolated, or the SW isn't controlling this page yet: nothing to do.
  if (self.crossOriginIsolated) return
  if (!navigator.serviceWorker.controller) return
  if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return
  sessionStorage.setItem(RELOAD_GUARD_KEY, '1')
  window.location.reload()
}

/** Register the service worker and gain cross-origin isolation when possible. */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  registerSW({
    immediate: true,
    onRegisteredSW() {
      // Subsequent loads: the SW already controls the page.
      reloadOnceForIsolation()
    },
  })
  // First load: the SW claims the page after activating, which fires
  // controllerchange; that is our cue to reload into the isolated context.
  navigator.serviceWorker.addEventListener('controllerchange', reloadOnceForIsolation)
}
