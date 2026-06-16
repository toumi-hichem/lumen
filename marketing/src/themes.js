// The ten Lumen reader themes — the same token values shipped in the app's
// src/theme/themes.ts. Used by the marketing theme gallery and copy buttons.
export const themes = [
  { id: 'daylight', name: 'Daylight', mode: 'light', desc: 'A clean, neutral light. The default daytime read.',
    tokens: { color: { background: '#F7F8FA', surface: '#FFFFFF', surfaceAlt: '#EEF0F3', text: '#1B1F24', textMuted: '#5C636E', primary: '#2563EB', onPrimary: '#FFFFFF', border: '#E1E4E9', accent: '#2563EB', danger: '#DC2626' },
      reader: { pageBackground: '#FFFFFF', pageText: '#20242B', pageLink: '#2563EB', selectionBackground: 'rgba(37,99,235,0.18)', selectionText: 'inherit', readalongBackground: 'rgba(37,99,235,0.28)' },
      highlight: { yellow: '#FFE9A8', green: '#C7EBC1', blue: '#BFDBFE', pink: '#F9C9DA', purple: '#DDD2F5' } } },
  { id: 'sepia', name: 'Sepia', mode: 'light', desc: 'Warm paper and brown ink. Easy on tired eyes.',
    tokens: { color: { background: '#EFE6D6', surface: '#F5EEDF', surfaceAlt: '#E6DAC4', text: '#463A2C', textMuted: '#7A6A53', primary: '#9A5B2E', onPrimary: '#FFF7EC', border: '#D9CBB1', accent: '#9A5B2E', danger: '#B23A2E' },
      reader: { pageBackground: '#F4EBDA', pageText: '#43382B', pageLink: '#8A4F26', selectionBackground: 'rgba(154,91,46,0.18)', selectionText: 'inherit', readalongBackground: 'rgba(154,91,46,0.26)' },
      highlight: { yellow: '#F1DA97', green: '#CBD49A', blue: '#AEC6CE', pink: '#E6B79C', purple: '#C9B2CF' } } },
  { id: 'midnight', name: 'Midnight', mode: 'dark', desc: 'A true dark with cool blue ink. Night reading without glare.',
    tokens: { color: { background: '#14181F', surface: '#1B212B', surfaceAlt: '#232B37', text: '#E4E8EE', textMuted: '#9AA4B2', primary: '#6BA4F5', onPrimary: '#0B0E13', border: '#2C3542', accent: '#6BA4F5', danger: '#F2837F' },
      reader: { pageBackground: '#181D25', pageText: '#DDE3EB', pageLink: '#7FB0F7', selectionBackground: 'rgba(107,164,245,0.22)', selectionText: 'inherit', readalongBackground: 'rgba(107,164,245,0.30)' },
      highlight: { yellow: '#6E5A1E', green: '#2F5A39', blue: '#234E78', pink: '#6E3550', purple: '#4A3A78' } } },
  { id: 'carbon', name: 'Carbon', mode: 'dark', desc: 'Pure-black OLED. Saves battery, vanishes in the dark.',
    tokens: { color: { background: '#000000', surface: '#0B0B0D', surfaceAlt: '#141417', text: '#EDEDED', textMuted: '#8C8C92', primary: '#8AB4F8', onPrimary: '#000000', border: '#1F1F23', accent: '#8AB4F8', danger: '#F28B82' },
      reader: { pageBackground: '#000000', pageText: '#DADADA', pageLink: '#8AB4F8', selectionBackground: 'rgba(138,180,248,0.22)', selectionText: 'inherit', readalongBackground: 'rgba(138,180,248,0.32)' },
      highlight: { yellow: '#5C4A12', green: '#1E4A2A', blue: '#163A63', pink: '#5C2540', purple: '#3C2A66' } } },
  { id: 'solarized', name: 'Solarized', mode: 'light', desc: 'The classic low-contrast palette. Calm, balanced, scientific.',
    tokens: { color: { background: '#FDF6E3', surface: '#FFFBF0', surfaceAlt: '#EEE8D5', text: '#586E75', textMuted: '#657B83', primary: '#268BD2', onPrimary: '#FDF6E3', border: '#E3DCC4', accent: '#268BD2', danger: '#DC322F' },
      reader: { pageBackground: '#FDF6E3', pageText: '#586E75', pageLink: '#268BD2', selectionBackground: 'rgba(38,139,210,0.16)', selectionText: 'inherit', readalongBackground: 'rgba(38,139,210,0.24)' },
      highlight: { yellow: '#E9D8A6', green: '#C9D9A0', blue: '#AFD3E8', pink: '#F0C5C0', purple: '#D6C4E0' } } },
  { id: 'nord', name: 'Nord', mode: 'dark', desc: 'Cool arctic slate with frost accents. Quiet and contemporary.',
    tokens: { color: { background: '#2E3440', surface: '#343B49', surfaceAlt: '#3B4252', text: '#ECEFF4', textMuted: '#9CA8BC', primary: '#88C0D0', onPrimary: '#2E3440', border: '#434C5E', accent: '#88C0D0', danger: '#BF616A' },
      reader: { pageBackground: '#2E3440', pageText: '#E5E9F0', pageLink: '#88C0D0', selectionBackground: 'rgba(136,192,208,0.20)', selectionText: 'inherit', readalongBackground: 'rgba(136,192,208,0.30)' },
      highlight: { yellow: '#6E5C2E', green: '#4A5D3A', blue: '#3A506B', pink: '#6E4452', purple: '#574A63' } } },
  { id: 'contrast', name: 'High Contrast', mode: 'light', desc: 'Maximum legibility. Pure black on white for low vision.',
    tokens: { color: { background: '#FFFFFF', surface: '#FFFFFF', surfaceAlt: '#F0F0F0', text: '#000000', textMuted: '#3A3A3A', primary: '#0033CC', onPrimary: '#FFFFFF', border: '#1A1A1A', accent: '#0033CC', danger: '#B00000' },
      reader: { pageBackground: '#FFFFFF', pageText: '#000000', pageLink: '#0033CC', selectionBackground: 'rgba(0,51,204,0.22)', selectionText: 'inherit', readalongBackground: 'rgba(0,51,204,0.34)' },
      highlight: { yellow: '#FFE600', green: '#7CE0A0', blue: '#9CC8FF', pink: '#FFAFCB', purple: '#CDB4FF' } } },
  { id: 'forest', name: 'Forest', mode: 'dark', desc: 'Deep evergreen dark. Restful, organic, late-evening reading.',
    tokens: { color: { background: '#121A14', surface: '#18231A', surfaceAlt: '#1F2D21', text: '#E2ECE0', textMuted: '#94A892', primary: '#7CC47F', onPrimary: '#0B130C', border: '#283A29', accent: '#7CC47F', danger: '#E08A7A' },
      reader: { pageBackground: '#142017', pageText: '#DCE7DA', pageLink: '#8FD08F', selectionBackground: 'rgba(124,196,127,0.20)', selectionText: 'inherit', readalongBackground: 'rgba(124,196,127,0.30)' },
      highlight: { yellow: '#6A5E22', green: '#2E5A33', blue: '#2A5560', pink: '#6A3A48', purple: '#4A3D66' } } },
  { id: 'dusk', name: 'Dusk', mode: 'dark', desc: 'Twilight purple with lilac ink. Moody and immersive.',
    tokens: { color: { background: '#181527', surface: '#1F1B33', surfaceAlt: '#28223F', text: '#E8E3F4', textMuted: '#A096C0', primary: '#B49CFF', onPrimary: '#14101F', border: '#322A4C', accent: '#B49CFF', danger: '#F08AA0' },
      reader: { pageBackground: '#1B1730', pageText: '#E2DCF2', pageLink: '#C2AEFF', selectionBackground: 'rgba(180,156,255,0.22)', selectionText: 'inherit', readalongBackground: 'rgba(180,156,255,0.32)' },
      highlight: { yellow: '#6A5A2A', green: '#3A5A45', blue: '#354A78', pink: '#6E3A5C', purple: '#4E3A82' } } },
  { id: 'e-ink', name: 'E-Ink', mode: 'light', desc: 'Grayscale paper, no chroma. Mimics an electronic-paper display.',
    tokens: { color: { background: '#EDEDEA', surface: '#F4F4F1', surfaceAlt: '#E2E2DE', text: '#1A1A1A', textMuted: '#5E5E5A', primary: '#1A1A1A', onPrimary: '#F4F4F1', border: '#CFCFC9', accent: '#1A1A1A', danger: '#5A2A22' },
      reader: { pageBackground: '#E9E9E5', pageText: '#161616', pageLink: '#2A2A2A', selectionBackground: 'rgba(0,0,0,0.12)', selectionText: 'inherit', readalongBackground: 'rgba(0,0,0,0.18)' },
      highlight: { yellow: '#D8D8D2', green: '#C4C4BE', blue: '#B0B0AA', pink: '#9C9C96', purple: '#888882' } } },
]

export function themeToTs(t) {
  const q = (s) => `'${s}'`
  const c = t.tokens.color, r = t.tokens.reader, h = t.tokens.highlight
  return [
    '{',
    `  id: ${q(t.id)},`,
    `  name: ${q(t.name)},`,
    `  mode: ${q(t.mode)},`,
    '  tokens: {',
    '    color: {',
    `      background: ${q(c.background)}, surface: ${q(c.surface)}, surfaceAlt: ${q(c.surfaceAlt)},`,
    `      text: ${q(c.text)}, textMuted: ${q(c.textMuted)},`,
    `      primary: ${q(c.primary)}, onPrimary: ${q(c.onPrimary)},`,
    `      border: ${q(c.border)}, accent: ${q(c.accent)}, danger: ${q(c.danger)}`,
    '    },',
    '    reader: {',
    `      pageBackground: ${q(r.pageBackground)}, pageText: ${q(r.pageText)}, pageLink: ${q(r.pageLink)},`,
    `      selectionBackground: ${q(r.selectionBackground)}, selectionText: ${q(r.selectionText)},`,
    `      readalongBackground: ${q(r.readalongBackground)}`,
    '    },',
    '    highlight: {',
    `      yellow: ${q(h.yellow)}, green: ${q(h.green)}, blue: ${q(h.blue)}, pink: ${q(h.pink)}, purple: ${q(h.purple)}`,
    '    },',
    '  },',
    '}',
  ].join('\n')
}

export function allThemesTs() {
  const body = themes
    .map((t) => themeToTs(t).split('\n').map((l) => '  ' + l).join('\n'))
    .join(',\n')
  return `import type { Theme } from './theme'\n\nexport const themes: Theme[] = [\n${body},\n]\n`
}
