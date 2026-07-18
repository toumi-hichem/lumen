import type { Theme } from './tokens'

// The built-in reader themes. Each is a complete Theme satisfying the
// ThemeTokens contract: reading-page contrast meets WCAG AA, highlight fills
// stay legible per mode (pastel in light, deep in dark), and
// selection/read-along are semi-transparent (read-along stronger).
//
// Themes are organized into light/dark families: every family ships exactly
// one light and one dark variant so the mode toggle can flip between them
// without losing the user's chosen look. Add a theme by appending here or via
// themeRegistry.register at runtime.

export const daylightTheme: Theme = {
  id: 'daylight',
  name: 'Daylight',
  mode: 'light',
  family: 'lumen',
  familyName: 'Lumen',
  tokens: {
    color: {
      background: '#F7F8FA',
      surface: '#FFFFFF',
      surfaceAlt: '#EEF0F3',
      text: '#1B1F24',
      textMuted: '#5C636E',
      primary: '#2563EB',
      onPrimary: '#FFFFFF',
      border: '#E1E4E9',
      accent: '#2563EB',
      danger: '#DC2626',
    },
    reader: {
      pageBackground: '#FFFFFF',
      pageText: '#20242B',
      pageLink: '#2563EB',
      selectionBackground: 'rgba(37,99,235,0.18)',
      selectionText: 'inherit',
      readalongBackground: 'rgba(37,99,235,0.28)',
    },
    highlight: {
      yellow: '#FFE9A8',
      green: '#C7EBC1',
      blue: '#BFDBFE',
      pink: '#F9C9DA',
      purple: '#DDD2F5',
    },
  },
}

export const midnightTheme: Theme = {
  id: 'midnight',
  name: 'Midnight',
  mode: 'dark',
  family: 'lumen',
  familyName: 'Lumen',
  tokens: {
    color: {
      background: '#14181F',
      surface: '#1B212B',
      surfaceAlt: '#232B37',
      text: '#E4E8EE',
      textMuted: '#9AA4B2',
      primary: '#6BA4F5',
      onPrimary: '#0B0E13',
      border: '#2C3542',
      accent: '#6BA4F5',
      danger: '#F2837F',
    },
    reader: {
      pageBackground: '#181D25',
      pageText: '#DDE3EB',
      pageLink: '#7FB0F7',
      selectionBackground: 'rgba(107,164,245,0.22)',
      selectionText: 'inherit',
      readalongBackground: 'rgba(107,164,245,0.30)',
    },
    highlight: {
      yellow: '#6E5A1E',
      green: '#2F5A39',
      blue: '#234E78',
      pink: '#6E3550',
      purple: '#4A3A78',
    },
  },
}

export const sepiaTheme: Theme = {
  id: 'sepia',
  name: 'Sepia',
  mode: 'light',
  family: 'sepia',
  familyName: 'Sepia',
  tokens: {
    color: {
      background: '#EFE6D6',
      surface: '#F5EEDF',
      surfaceAlt: '#E6DAC4',
      text: '#463A2C',
      textMuted: '#7A6A53',
      primary: '#9A5B2E',
      onPrimary: '#FFF7EC',
      border: '#D9CBB1',
      accent: '#9A5B2E',
      danger: '#B23A2E',
    },
    reader: {
      pageBackground: '#F4EBDA',
      pageText: '#43382B',
      pageLink: '#8A4F26',
      selectionBackground: 'rgba(154,91,46,0.18)',
      selectionText: 'inherit',
      readalongBackground: 'rgba(154,91,46,0.26)',
    },
    highlight: {
      yellow: '#F1DA97',
      green: '#CBD49A',
      blue: '#AEC6CE',
      pink: '#E6B79C',
      purple: '#C9B2CF',
    },
  },
}

/** Warm candle-lit dark counterpart to Sepia. */
export const emberTheme: Theme = {
  id: 'ember',
  name: 'Ember',
  mode: 'dark',
  family: 'sepia',
  familyName: 'Sepia',
  tokens: {
    color: {
      background: '#211A13',
      surface: '#2A2218',
      surfaceAlt: '#342A1E',
      text: '#EBDFC9',
      textMuted: '#B3A183',
      primary: '#D89A5B',
      onPrimary: '#241C12',
      border: '#3E3222',
      accent: '#D89A5B',
      danger: '#E58A75',
    },
    reader: {
      pageBackground: '#251E15',
      pageText: '#E6DAC2',
      pageLink: '#E0A96B',
      selectionBackground: 'rgba(216,154,91,0.22)',
      selectionText: 'inherit',
      readalongBackground: 'rgba(216,154,91,0.32)',
    },
    highlight: {
      yellow: '#6E5A1E',
      green: '#4A5230',
      blue: '#3A4A58',
      pink: '#6E3E44',
      purple: '#55405E',
    },
  },
}

export const solarizedTheme: Theme = {
  id: 'solarized',
  name: 'Solarized',
  mode: 'light',
  family: 'solarized',
  familyName: 'Solarized',
  tokens: {
    color: {
      background: '#FDF6E3',
      surface: '#FFFBF0',
      surfaceAlt: '#EEE8D5',
      text: '#586E75',
      textMuted: '#657B83',
      primary: '#268BD2',
      onPrimary: '#FDF6E3',
      border: '#E3DCC4',
      accent: '#268BD2',
      danger: '#DC322F',
    },
    reader: {
      pageBackground: '#FDF6E3',
      pageText: '#586E75',
      pageLink: '#268BD2',
      selectionBackground: 'rgba(38,139,210,0.16)',
      selectionText: 'inherit',
      readalongBackground: 'rgba(38,139,210,0.24)',
    },
    highlight: {
      yellow: '#E9D8A6',
      green: '#C9D9A0',
      blue: '#AFD3E8',
      pink: '#F0C5C0',
      purple: '#D6C4E0',
    },
  },
}

/** The classic Solarized dark palette (base03 background). */
export const solarizedDarkTheme: Theme = {
  id: 'solarized-dark',
  name: 'Solarized Dark',
  mode: 'dark',
  family: 'solarized',
  familyName: 'Solarized',
  tokens: {
    color: {
      background: '#002B36',
      surface: '#073642',
      surfaceAlt: '#0E4756',
      text: '#A7B8B8',
      textMuted: '#7F969B',
      primary: '#4CA6DE',
      onPrimary: '#002B36',
      border: '#10424F',
      accent: '#4CA6DE',
      danger: '#E35D5B',
    },
    reader: {
      pageBackground: '#002B36',
      pageText: '#9FB1B1',
      pageLink: '#4DA3DD',
      selectionBackground: 'rgba(38,139,210,0.25)',
      selectionText: 'inherit',
      readalongBackground: 'rgba(38,139,210,0.35)',
    },
    highlight: {
      yellow: '#604F0A',
      green: '#3A5A20',
      blue: '#1E4A6E',
      pink: '#6E2E4A',
      purple: '#4A3A78',
    },
  },
}

/** Nord "Snow Storm" light counterpart to Nord. */
export const frostTheme: Theme = {
  id: 'frost',
  name: 'Frost',
  mode: 'light',
  family: 'nord',
  familyName: 'Nord',
  tokens: {
    color: {
      background: '#E5E9F0',
      surface: '#F2F4F8',
      surfaceAlt: '#D8DEE9',
      text: '#2E3440',
      textMuted: '#556075',
      primary: '#5E81AC',
      onPrimary: '#ECEFF4',
      border: '#CDD5E1',
      accent: '#5E81AC',
      danger: '#BF616A',
    },
    reader: {
      pageBackground: '#ECEFF4',
      pageText: '#2E3440',
      pageLink: '#5E81AC',
      selectionBackground: 'rgba(94,129,172,0.18)',
      selectionText: 'inherit',
      readalongBackground: 'rgba(94,129,172,0.28)',
    },
    highlight: {
      yellow: '#EFD9A8',
      green: '#C5D6A8',
      blue: '#B8CFE0',
      pink: '#E6B6BC',
      purple: '#D2BAD3',
    },
  },
}

export const nordTheme: Theme = {
  id: 'nord',
  name: 'Nord',
  mode: 'dark',
  family: 'nord',
  familyName: 'Nord',
  tokens: {
    color: {
      background: '#2E3440',
      surface: '#343B49',
      surfaceAlt: '#3B4252',
      text: '#ECEFF4',
      textMuted: '#9CA8BC',
      primary: '#88C0D0',
      onPrimary: '#2E3440',
      border: '#434C5E',
      accent: '#88C0D0',
      danger: '#BF616A',
    },
    reader: {
      pageBackground: '#2E3440',
      pageText: '#E5E9F0',
      pageLink: '#88C0D0',
      selectionBackground: 'rgba(136,192,208,0.20)',
      selectionText: 'inherit',
      readalongBackground: 'rgba(136,192,208,0.30)',
    },
    highlight: {
      yellow: '#6E5C2E',
      green: '#4A5D3A',
      blue: '#3A506B',
      pink: '#6E4452',
      purple: '#574A63',
    },
  },
}

/** Light botanical-green counterpart to Forest. */
export const meadowTheme: Theme = {
  id: 'meadow',
  name: 'Meadow',
  mode: 'light',
  family: 'forest',
  familyName: 'Forest',
  tokens: {
    color: {
      background: '#F1F5EC',
      surface: '#FAFCF7',
      surfaceAlt: '#E4ECDC',
      text: '#24301F',
      textMuted: '#5F7156',
      primary: '#3E7B3F',
      onPrimary: '#F4FAF0',
      border: '#D6E0CC',
      accent: '#3E7B3F',
      danger: '#C2492F',
    },
    reader: {
      pageBackground: '#F7FAF2',
      pageText: '#273424',
      pageLink: '#35703A',
      selectionBackground: 'rgba(62,123,63,0.16)',
      selectionText: 'inherit',
      readalongBackground: 'rgba(62,123,63,0.26)',
    },
    highlight: {
      yellow: '#EFE2A0',
      green: '#C3E4B4',
      blue: '#B9D8D2',
      pink: '#EFC5C5',
      purple: '#D6C9E6',
    },
  },
}

export const forestTheme: Theme = {
  id: 'forest',
  name: 'Forest',
  mode: 'dark',
  family: 'forest',
  familyName: 'Forest',
  tokens: {
    color: {
      background: '#121A14',
      surface: '#18231A',
      surfaceAlt: '#1F2D21',
      text: '#E2ECE0',
      textMuted: '#94A892',
      primary: '#7CC47F',
      onPrimary: '#0B130C',
      border: '#283A29',
      accent: '#7CC47F',
      danger: '#E08A7A',
    },
    reader: {
      pageBackground: '#142017',
      pageText: '#DCE7DA',
      pageLink: '#8FD08F',
      selectionBackground: 'rgba(124,196,127,0.20)',
      selectionText: 'inherit',
      readalongBackground: 'rgba(124,196,127,0.30)',
    },
    highlight: {
      yellow: '#6A5E22',
      green: '#2E5A33',
      blue: '#2A5560',
      pink: '#6A3A48',
      purple: '#4A3D66',
    },
  },
}

/** Soft lavender light counterpart to Dusk. */
export const lilacTheme: Theme = {
  id: 'lilac',
  name: 'Lilac',
  mode: 'light',
  family: 'dusk',
  familyName: 'Dusk',
  tokens: {
    color: {
      background: '#F3F0FA',
      surface: '#FBFAFE',
      surfaceAlt: '#E9E3F5',
      text: '#2A2438',
      textMuted: '#6A6284',
      primary: '#7C5CD6',
      onPrimary: '#F7F4FE',
      border: '#DDD5EE',
      accent: '#7C5CD6',
      danger: '#C74A6B',
    },
    reader: {
      pageBackground: '#F8F5FD',
      pageText: '#2C2540',
      pageLink: '#6F4FC9',
      selectionBackground: 'rgba(124,92,214,0.16)',
      selectionText: 'inherit',
      readalongBackground: 'rgba(124,92,214,0.26)',
    },
    highlight: {
      yellow: '#F0E1A4',
      green: '#CBE3C0',
      blue: '#C4D6F2',
      pink: '#F2C6DA',
      purple: '#DACBF4',
    },
  },
}

export const duskTheme: Theme = {
  id: 'dusk',
  name: 'Dusk',
  mode: 'dark',
  family: 'dusk',
  familyName: 'Dusk',
  tokens: {
    color: {
      background: '#181527',
      surface: '#1F1B33',
      surfaceAlt: '#28223F',
      text: '#E8E3F4',
      textMuted: '#A096C0',
      primary: '#B49CFF',
      onPrimary: '#14101F',
      border: '#322A4C',
      accent: '#B49CFF',
      danger: '#F08AA0',
    },
    reader: {
      pageBackground: '#1B1730',
      pageText: '#E2DCF2',
      pageLink: '#C2AEFF',
      selectionBackground: 'rgba(180,156,255,0.22)',
      selectionText: 'inherit',
      readalongBackground: 'rgba(180,156,255,0.32)',
    },
    highlight: {
      yellow: '#6A5A2A',
      green: '#3A5A45',
      blue: '#354A78',
      pink: '#6E3A5C',
      purple: '#4E3A82',
    },
  },
}

export const eInkTheme: Theme = {
  id: 'e-ink',
  name: 'E-Ink',
  mode: 'light',
  family: 'mono',
  familyName: 'Mono',
  tokens: {
    color: {
      background: '#EDEDEA',
      surface: '#F4F4F1',
      surfaceAlt: '#E2E2DE',
      text: '#1A1A1A',
      textMuted: '#5E5E5A',
      primary: '#1A1A1A',
      onPrimary: '#F4F4F1',
      border: '#CFCFC9',
      accent: '#1A1A1A',
      danger: '#5A2A22',
    },
    reader: {
      pageBackground: '#E9E9E5',
      pageText: '#161616',
      pageLink: '#2A2A2A',
      selectionBackground: 'rgba(0,0,0,0.12)',
      selectionText: 'inherit',
      readalongBackground: 'rgba(0,0,0,0.18)',
    },
    highlight: {
      yellow: '#D8D8D2',
      green: '#C4C4BE',
      blue: '#B0B0AA',
      pink: '#9C9C96',
      purple: '#888882',
    },
  },
}

export const carbonTheme: Theme = {
  id: 'carbon',
  name: 'Carbon',
  mode: 'dark',
  family: 'mono',
  familyName: 'Mono',
  tokens: {
    color: {
      background: '#000000',
      surface: '#0B0B0D',
      surfaceAlt: '#141417',
      text: '#EDEDED',
      textMuted: '#8C8C92',
      primary: '#8AB4F8',
      onPrimary: '#000000',
      border: '#1F1F23',
      accent: '#8AB4F8',
      danger: '#F28B82',
    },
    reader: {
      pageBackground: '#000000',
      pageText: '#DADADA',
      pageLink: '#8AB4F8',
      selectionBackground: 'rgba(138,180,248,0.22)',
      selectionText: 'inherit',
      readalongBackground: 'rgba(138,180,248,0.32)',
    },
    highlight: {
      yellow: '#5C4A12',
      green: '#1E4A2A',
      blue: '#163A63',
      pink: '#5C2540',
      purple: '#3C2A66',
    },
  },
}

export const highContrastTheme: Theme = {
  id: 'contrast',
  name: 'High Contrast',
  mode: 'light',
  family: 'contrast',
  familyName: 'Contrast',
  tokens: {
    color: {
      background: '#FFFFFF',
      surface: '#FFFFFF',
      surfaceAlt: '#F0F0F0',
      text: '#000000',
      textMuted: '#3A3A3A',
      primary: '#0033CC',
      onPrimary: '#FFFFFF',
      border: '#1A1A1A',
      accent: '#0033CC',
      danger: '#B00000',
    },
    reader: {
      pageBackground: '#FFFFFF',
      pageText: '#000000',
      pageLink: '#0033CC',
      selectionBackground: 'rgba(0,51,204,0.22)',
      selectionText: 'inherit',
      readalongBackground: 'rgba(0,51,204,0.34)',
    },
    highlight: {
      yellow: '#FFE600',
      green: '#7CE0A0',
      blue: '#9CC8FF',
      pink: '#FFAFCB',
      purple: '#CDB4FF',
    },
  },
}

/** Maximum-contrast dark counterpart: pure black, white text, vivid accent. */
export const highContrastDarkTheme: Theme = {
  id: 'contrast-dark',
  name: 'High Contrast Dark',
  mode: 'dark',
  family: 'contrast',
  familyName: 'Contrast',
  tokens: {
    color: {
      background: '#000000',
      surface: '#000000',
      surfaceAlt: '#161616',
      text: '#FFFFFF',
      textMuted: '#C8C8C8',
      primary: '#66A3FF',
      onPrimary: '#000000',
      border: '#E6E6E6',
      accent: '#66A3FF',
      danger: '#FF7066',
    },
    reader: {
      pageBackground: '#000000',
      pageText: '#FFFFFF',
      pageLink: '#7DB0FF',
      selectionBackground: 'rgba(102,163,255,0.30)',
      selectionText: 'inherit',
      readalongBackground: 'rgba(102,163,255,0.42)',
    },
    highlight: {
      yellow: '#806A00',
      green: '#1E6B36',
      blue: '#14539E',
      pink: '#8A2E5C',
      purple: '#5A3AA6',
    },
  },
}

// Ordered by family, light variant first — pickers rely on this grouping.
export const builtInThemes: readonly Theme[] = [
  daylightTheme,
  midnightTheme,
  sepiaTheme,
  emberTheme,
  solarizedTheme,
  solarizedDarkTheme,
  frostTheme,
  nordTheme,
  meadowTheme,
  forestTheme,
  lilacTheme,
  duskTheme,
  eInkTheme,
  carbonTheme,
  highContrastTheme,
  highContrastDarkTheme,
]

// Back-compat aliases used by the ThemeProvider fallback and tests.
export const lightTheme = daylightTheme
export const darkTheme = midnightTheme
export const nightTheme = carbonTheme
