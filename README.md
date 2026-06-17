# Lumen — cross-platform ebook reader

A cross-platform ebook reader built with **Vite + React + TypeScript** and
**Capacitor**. The same codebase runs as a web app (PWA-capable), an Android
app, and an iOS app.

## Features

- **Library** — import EPUB, MOBI/AZW3, PDF and text/Markdown, stored locally
  in IndexedDB. Collections/shelves, tags, reading status, search, sort/filter
  and a "Continue reading" row.
- **Reader** — paginated or scrolled layout, chapter navigation, tap/drag the
  progress bar to jump to any percentage, in-book full-text search, brightness
  and warmth controls, justify toggle.
- **Bookmarks & highlights** — five colors, notes on highlights, an all-books
  highlights view with color filtering and Markdown/JSON export.
- **Text to speech** — pluggable engine layer with the always-available system
  voice and an **on-device Supertonic** neural engine (onnxruntime-web, WebGPU
  with WebAssembly fallback). Supertonic installs on demand from Settings
  (~100 MB, cached for offline use) and becomes the default once present.
  Read-along sentence highlighting with auto-scroll, tap/select "read from
  here", continuous narration across chapters, sentence/paragraph granularity,
  sleep timer, lock-screen controls, per-book voice memory.
- **Focus & ADHD aids** — bionic reading (bold word prefixes), adjustable letter
  spacing, and hide-images to cut clutter.
- **Reading comfort** — keep the screen awake while reading, steady auto-scroll
  for long-form text, and a distraction-free mode (tap the page center).
- **Mobile-first navigation** — a Home hub with sections that each open their
  own page (Library, Stats, Bookmarks, Highlights, Settings); custom themed
  controls throughout (no native dropdowns).
- **Reading stats** — time, day streak, sessions and a last-7-days chart.
- **Backup & sync** — export/import the whole library (books, annotations,
  progress, shelves) as a single .zip, behind a swappable sync-provider interface.
- **Modular themes & fonts** — token-based theming designed for extension from
  day one. Swap or add themes and fonts without touching components.
- **PWA + native** — installable offline web app; status-bar theming and
  haptics on native via Capacitor.

## Architecture

The app is organized into small, focused modules with clear seams so each
subsystem can evolve (or be swapped) independently.

```
src/
  domain/        # Shared models: Book, Bookmark, Highlight, ReadingProgress
  theme/         # Token contract, themes, fonts, registry, ThemeProvider
  storage/       # IndexedDB (idb) + repository pattern per entity
  reader/        # BookEngine interface + EPUB and text engines + registry
  tts/           # TtsEngine interface, registry, controller, engines
    supertonic/  # Ported Supertonic ONNX runtime + loaders
  store/         # Zustand stores (library, settings) + persistence
  services/      # importBook (file -> metadata -> persisted Book)
  screens/       # Library, Reader, Settings (+ reader sub-components/hooks)
  ui/            # Shared stylesheet
```

### Extensibility seams

- **Themes/fonts** — `theme/themeRegistry.ts` accepts new themes and fonts at
  runtime. Every theme must satisfy the `ThemeTokens` contract, and all UI reads
  CSS variables, so a theme change is a single write to `:root`.
- **Book formats** — `reader/engineRegistry.ts` maps a format to a `BookEngine`.
  EPUB and text are implemented; MOBI/AZW3/PDF are detected and reserved. Add a
  format by registering a factory — the reader UI and TTS are format-agnostic.
- **TTS engines** — `tts/registry.ts` maps an id to a `TtsEngine`. The
  `TtsController` orchestrates sequencing, pause/resume and automatic fallback,
  so adding a cloud or native engine is one registry entry.

## Development

```bash
npm install
npm run dev          # web dev server
npm run test         # unit tests (vitest)
npm run typecheck    # tsc project check
npm run build        # production build to dist/
```

## Running on devices

```bash
npm run build
npx cap sync                 # copy web build into native projects
npx cap open android         # open in Android Studio
# iOS (requires macOS + Xcode + CocoaPods):
npx cap add ios && npx cap open ios
```

The web build in `dist/` is also directly deployable as a standard web app.

## Marketing site

A standalone landing site lives in `marketing/` (its own Vite project, deployed
separately from the app). It implements the Lumen design identity and a live
10-theme gallery. See `marketing/README.md`.

## Enabling Supertonic (on-device TTS)

Supertonic runs fully on-device via ONNX. The model assets are large (~100 MB)
and are not committed.

**End users** install them in-app: open **Settings → Speech** and tap
**Download (~100 MB)**. The assets download from HuggingFace into the Cache
Storage API (persisted on web and inside the native WebView), Supertonic becomes
the default voice, and the reader works offline thereafter. The download reports
progress and fails gracefully if storage runs out. To serve the assets from your
own CDN later, change `SUPERTONIC_REMOTE_BASE` in
`src/tts/supertonic/assets.ts` — nothing else changes.

**For development or to bundle the assets**, fetch them into `public/supertonic`
(the engine also reads from there as a fallback):

```bash
./scripts/fetch-supertonic.sh
```

Expected layout:

```
public/supertonic/
  onnx/{duration_predictor,text_encoder,vector_estimator,vocoder}.onnx
  onnx/{tts.json,unicode_indexer.json}
  voice_styles/{M1..M5,F1..F5}.json
```

Then select **Supertonic (on-device)** in Settings → Speech. Until the assets
are present (or on devices that cannot run them), the reader transparently falls
back to the system voice.

The Supertonic runtime in `src/tts/supertonic/runtime.ts` is ported from the
official Supertonic web example (MIT-licensed):
<https://github.com/supertone-inc/supertonic>.
