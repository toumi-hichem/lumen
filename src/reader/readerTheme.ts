import { readerCssVars } from '@/theme/cssVars'
import type { Theme, FontDefinition } from '@/theme/tokens'
import type { ReadingPreferences } from '@/store/settingsStore'
import type { ReaderTheme } from './types'

/** Derive the reader-surface theme passed to a BookEngine.applyTheme(). */
export function buildReaderTheme(
  theme: Theme,
  font: FontDefinition,
  reading: ReadingPreferences,
): ReaderTheme {
  return {
    vars: readerCssVars(theme),
    pageBackground: theme.tokens.reader.pageBackground,
    pageText: theme.tokens.reader.pageText,
    pageLink: theme.tokens.reader.pageLink,
    readalongBackground: theme.tokens.reader.readalongBackground,
    fontFamily: font.stack,
    fontSizePercent: Math.round(reading.fontScale * 100),
    lineHeight: reading.lineHeight,
    margin: reading.margin,
    justify: reading.justify,
    letterSpacing: reading.letterSpacing,
    hideImages: reading.hideImages,
    softWrap: reading.softWrap,
    bionic: { enabled: reading.bionicReading, strength: reading.bionicStrength },
  }
}
