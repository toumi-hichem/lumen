/// <reference lib="webworker" />
import { precacheAndRoute, matchPrecache } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

// vite-plugin-pwa (injectManifest) replaces self.__WB_MANIFEST with the list of
// precached app-shell + font assets at build time.
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

/**
 * Stamp the headers that make the document cross-origin isolated. With
 * crossOriginIsolated === true the WebView exposes SharedArrayBuffer, which
 * lets onnxruntime-web run its WASM kernels across multiple worker threads
 * (Supertonic TTS) instead of janking the UI on a single thread.
 *
 * All app subresources are same-origin (fonts are bundled, the ORT runtime and
 * wasm are served from /ort/), and same-origin resources satisfy COEP
 * require-corp without a CORP header, so only the top-level document needs
 * these headers.
 */
function withIsolationHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

// Own navigation requests so the document always carries the isolation headers,
// online and offline. Registered before precacheAndRoute so this wins over the
// precache route for the navigation; asset requests fall through to workbox.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    (async () => {
      try {
        return withIsolationHeaders(await fetch(event.request))
      } catch {
        // Offline: serve the precached shell (the app is a single HashRouter
        // document), still isolated.
        const cached = await matchPrecache('index.html')
        if (cached) return withIsolationHeaders(cached)
        throw new Error('offline and no cached document available')
      }
    })(),
  )
})

// Precache the app shell + bundled fonts. directoryIndex is disabled so the
// precache route never claims the "/" navigation (that is handled above with
// the isolation headers); it still serves every hashed asset URL directly.
precacheAndRoute(self.__WB_MANIFEST, { directoryIndex: '' })

// Take over as soon as possible so the isolation headers apply on the next
// navigation (see the one-time reload in main.tsx).
self.addEventListener('install', () => {
  void self.skipWaiting()
})
clientsClaim()
