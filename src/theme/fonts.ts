import type { FontDefinition } from './tokens'

// Built-in reading fonts. `stack` values lean on system fonts so they work
// offline with zero download. Add a `url` to ship a webfont; ThemeProvider
// injects it lazily only when the font is selected.

export const systemSerif: FontDefinition = {
  id: 'system-serif',
  name: 'Serif',
  category: 'serif',
  stack: 'Georgia, "Times New Roman", "Noto Serif", serif',
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
  url: 'https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,600&display=swap',
}

export const openDyslexic: FontDefinition = {
  id: 'open-dyslexic',
  name: 'OpenDyslexic',
  category: 'dyslexic',
  stack: '"OpenDyslexic", "Comic Sans MS", sans-serif',
  url: 'https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/open-dyslexic-regular.css',
}

export const builtInFonts: readonly FontDefinition[] = [
  systemSerif,
  systemSans,
  literata,
  openDyslexic,
]
