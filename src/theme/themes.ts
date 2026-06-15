import type { Theme } from './tokens'

// Built-in themes. To add a new theme, append a Theme object here (or call
// themeRegistry.register at runtime). The ThemeTokens contract guarantees it
// is complete. Highlight colors are tuned per-mode for legible contrast.

export const lightTheme: Theme = {
  id: 'light',
  name: 'Light',
  mode: 'light',
  tokens: {
    color: {
      background: '#f7f7f8',
      surface: '#ffffff',
      surfaceAlt: '#f0f1f3',
      text: '#1a1a1e',
      textMuted: '#6b7280',
      primary: '#2f6df6',
      onPrimary: '#ffffff',
      border: '#e3e5e9',
      accent: '#2f6df6',
      danger: '#dc2626',
    },
    reader: {
      pageBackground: '#ffffff',
      pageText: '#1a1a1e',
      pageLink: '#2f6df6',
      selectionBackground: 'rgba(47,109,246,0.22)',
      selectionText: 'inherit',
    },
    highlight: {
      yellow: '#fde68a',
      green: '#bbf7d0',
      blue: '#bfdbfe',
      pink: '#fbcfe8',
      purple: '#ddd6fe',
    },
  },
}

export const sepiaTheme: Theme = {
  id: 'sepia',
  name: 'Sepia',
  mode: 'light',
  tokens: {
    color: {
      background: '#ece3d3',
      surface: '#f4ecdc',
      surfaceAlt: '#e3d8c2',
      text: '#3b3326',
      textMuted: '#7a6f59',
      primary: '#9a6b3f',
      onPrimary: '#fff8ee',
      border: '#d9cbb0',
      accent: '#9a6b3f',
      danger: '#b4452f',
    },
    reader: {
      pageBackground: '#f4ecdc',
      pageText: '#3b3326',
      pageLink: '#8a5a2f',
      selectionBackground: 'rgba(154,107,63,0.25)',
      selectionText: 'inherit',
    },
    highlight: {
      yellow: '#e8c87a',
      green: '#a9c79a',
      blue: '#a6bcd0',
      pink: '#d9a9b4',
      purple: '#c0a9d0',
    },
  },
}

export const darkTheme: Theme = {
  id: 'dark',
  name: 'Dark',
  mode: 'dark',
  tokens: {
    color: {
      background: '#16181d',
      surface: '#1e2128',
      surfaceAlt: '#262a33',
      text: '#e6e8ec',
      textMuted: '#9aa1ad',
      primary: '#5b8cff',
      onPrimary: '#0b1020',
      border: '#2f343d',
      accent: '#5b8cff',
      danger: '#f87171',
    },
    reader: {
      pageBackground: '#1b1d22',
      pageText: '#d7dae0',
      pageLink: '#7aa2ff',
      selectionBackground: 'rgba(91,140,255,0.3)',
      selectionText: 'inherit',
    },
    highlight: {
      yellow: '#7a6a2a',
      green: '#2f5d3a',
      blue: '#2c4a7a',
      pink: '#6e3552',
      purple: '#4a3a72',
    },
  },
}

export const nightTheme: Theme = {
  id: 'night',
  name: 'Night (OLED)',
  mode: 'dark',
  tokens: {
    color: {
      background: '#000000',
      surface: '#0a0a0c',
      surfaceAlt: '#141417',
      text: '#cfd2d8',
      textMuted: '#7e838d',
      primary: '#6a93ff',
      onPrimary: '#000000',
      border: '#1d1e22',
      accent: '#6a93ff',
      danger: '#ef5350',
    },
    reader: {
      pageBackground: '#000000',
      pageText: '#b9bcc4',
      pageLink: '#7aa2ff',
      selectionBackground: 'rgba(106,147,255,0.32)',
      selectionText: 'inherit',
    },
    highlight: {
      yellow: '#6b5d24',
      green: '#274e31',
      blue: '#243f6b',
      pink: '#5e2c46',
      purple: '#3f3163',
    },
  },
}

export const builtInThemes: readonly Theme[] = [
  lightTheme,
  sepiaTheme,
  darkTheme,
  nightTheme,
]
