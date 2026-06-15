/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Lumen Reader',
        short_name: 'Lumen',
        description: 'Cross-platform ebook reader with on-device TTS',
        theme_color: '#16181d',
        background_color: '#16181d',
        display: 'standalone',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // Precache the app shell only. The large onnxruntime wasm and PDF
        // worker are fetched on demand rather than bloating the service worker.
        globPatterns: ['**/*.{js,css,html,svg}'],
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
    exclude: ['onnxruntime-web'],
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
