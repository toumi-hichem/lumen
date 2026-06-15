# Lumen — cross-platform ebook reader

A cross-platform ebook reader built with **Vite + React + TypeScript** and
**Capacitor**. The same codebase runs as a web app (PWA-capable), an Android
app, and an iOS app.

## Features

- **Library** — import EPUB and text/Markdown files, stored locally in IndexedDB.
- **Reader** — paginated EPUB rendering (epub.js) with chapter navigation.
- **Bookmarks** — save and jump to positions (EPUB CFI based).
- **Highlights** — select text and highlight in five colors; persisted and
  re-applied on reopen.
- **Text to speech** — read-aloud with a pluggable engine layer. Ships with the
  always-available system voice and an **on-device Supertonic** neural engine
  (onnxruntime-web, WebGPU with WebAssembly fallback).
- **Modular themes & fonts** — token-based theming designed for extension from
  day one. Swap or add themes and fonts without touching components.

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

## Enabling Supertonic (on-device TTS)

Supertonic runs fully on-device via ONNX. The model assets are large (~100 MB)
and are not committed. Fetch them into `public/supertonic`:

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
