/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Serve the onnxruntime-web wasm binary from the app itself (at `/ort/`) rather
 * than a CDN. Supertonic is an on-device, fully-offline voice; fetching its
 * runtime from jsdelivr breaks offline use and fails inside the native WebView.
 * With the default `ort.bundle` build only the .wasm is external, so this one
 * file is all we need to host locally.
 */
function onnxruntimeWasm(): Plugin {
  // The .wasm is the binary; the .mjs is its loader/worker glue. The bundle
  // build usually inlines the loader, but host it too so a worker fetch can
  // never hit a missing file.
  const files = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']
  const dist = dirname(createRequire(import.meta.url).resolve('onnxruntime-web'))
  const mime = (f: string) =>
    f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'
  return {
    name: 'onnxruntime-wasm-local',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = files.find((f) => req.url?.startsWith(`/ort/${f}`))
        if (!file) return next()
        res.setHeader('Content-Type', mime(file))
        res.end(readFileSync(join(dist, file)))
      })
    },
    generateBundle() {
      for (const file of files) {
        this.emitFile({
          type: 'asset',
          fileName: `ort/${file}`,
          source: readFileSync(join(dist, file)),
        })
      }
    },
  }
}

/**
 * foliate-js (pinned commit) schedules async callbacks in paginator.js that
 * dereference `this.#view` without a null check; rapid navigation or theme
 * changes can land those callbacks after the view is torn down, throwing
 * "Cannot read properties of null (reading 'document')". Null-guard the two
 * offending callbacks at serve/build time until it's fixed upstream.
 */
function foliatePaginatorNullGuard(): Plugin {
  return {
    name: 'foliate-paginator-null-guard',
    transform(code, id) {
      if (!id.includes('foliate-js/paginator.js')) return
      return code
        .replace(
          /requestAnimationFrame\(\(\)\s*=>\s*this\.#background\.style\.background = getBackground\(this\.#view\.document\)\)/,
          'requestAnimationFrame(() => { if (this.#view?.document) this.#background.style.background = getBackground(this.#view.document) })',
        )
        .replace(
          /\.then\(\(\) => this\.#view\.expand\(\)\)/,
          '.then(() => this.#view?.expand())',
        )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    onnxruntimeWasm(),
    foliatePaginatorNullGuard(),
    VitePWA({
      // injectManifest (not generateSW) so our own service worker can add the
      // COOP/COEP/CORP headers that make the WebView cross-origin isolated,
      // which is what lets onnxruntime-web run multi-threaded. The SW still
      // precaches the app shell for offline use. See src/sw.ts.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      // Register manually in src/pwa.ts so we can reload once to gain
      // cross-origin isolation after the SW takes control.
      injectRegister: null,
      manifest: {
        name: 'Lumen Reader',
        short_name: 'Lumen',
        description: 'Cross-platform ebook reader with on-device TTS',
        theme_color: '#F7F8FA',
        background_color: '#F7F8FA',
        display: 'standalone',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        // Precache the app shell and bundled fonts. The large onnxruntime wasm
        // and PDF worker are fetched on demand rather than bloating the SW.
        globPatterns: ['**/*.{js,css,html,svg,woff2,woff}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // onnxruntime-web ships large wasm/mjs assets; keep them as separate chunks
  // and don't try to pre-bundle them so the Supertonic engine can lazy-load.
  optimizeDeps: {
    // foliate-js lazily imports internal modules (vendor/zip.js, paginator);
    // esbuild prebundling breaks those dynamic paths, so leave it as-is.
    exclude: ['onnxruntime-web', 'onnxruntime-web/wasm', 'foliate-js'],
  },
  server: {
    host: true,
    // Vite blocks requests whose Host header isn't a loopback/IP address as a
    // DNS-rebinding guard. Allow the local `lumen.test` alias (mapped to
    // 127.0.0.1 in /etc/hosts) so it can be opened by name. `.test` is a
    // reserved TLD browsers never force to HTTPS. Loopback and LAN IP hosts
    // stay allowed regardless of this list.
    allowedHosts: ['lumen.test'],
  },
  build: {
    target: 'es2022',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/test/**', 'src/main.tsx'],
    },
  },
})
