import type { FontDefinition } from './tokens'

// Built-in reading fonts. Spectral (a refined literary serif) is the default,
// matching the Lumen design identity. The brand UI/headings use Spectral +
// Hanken Grotesk, loaded globally in index.html; these registry entries cover
// the reader content surface and lazily inject any webfont when selected.

export const spectral: FontDefinition = {
  id: 'spectral',
  name: 'Spectral',
  category: 'serif',
  stack: 'Spectral, Georgia, "Times New Roman", serif',
}

export const systemSerif: FontDefinition = {
  id: 'system-serif',
  name: 'Serif',
  category: 'serif',
  stack: 'Georgia, "Times New Roman", "Noto Serif", serif',
}

export const hankenGrotesk: FontDefinition = {
  id: 'hanken',
  name: 'Hanken Grotesk',
  category: 'sans',
  stack: '"Hanken Grotesk", system-ui, -apple-system, sans-serif',
}

export const systemSans: FontDefinition = {
  id: 'system-sans',
  name: 'Sans',
  category: 'sans',
  stack:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", sans-serif',
}

export const literata: FontDefinition = {
  id: 'literata',
  name: 'Literata',
  category: 'serif',
  stack: 'Literata, Georgia, serif',
  // Bundled and same-origin (see uiFonts.ts rationale); lazily code-split so it
  // only downloads when a reader selects it.
  load: () =>
    Promise.all([
      import('@fontsource/literata/latin-400.css'),
      import('@fontsource/literata/latin-400-italic.css'),
      import('@fontsource/literata/latin-600.css'),
    ]),
}

export const openDyslexic: FontDefinition = {
  id: 'open-dyslexic',
  name: 'OpenDyslexic',
  category: 'dyslexic',
  stack: '"OpenDyslexic", "Comic Sans MS", sans-serif',
  load: () => import('@fontsource/opendyslexic/latin-400.css'),
}

export const builtInFonts: readonly FontDefinition[] = [
  spectral,
  systemSerif,
  hankenGrotesk,
  systemSans,
  literata,
  openDyslexic,
]
