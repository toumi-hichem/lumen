/**
 * Minimal i18n scaffold. UI strings live in locale dictionaries keyed by a
 * stable id; `t()` resolves against the active locale and falls back to
 * English. Adding a language is a new dictionary with the same keys; extracting
 * the remaining hardcoded strings into `en` is mechanical follow-up work.
 */
const en = {
  'app.name': 'Lumen',
  'nav.settings': 'Settings',
  'nav.stats': 'Stats',
  'nav.highlights': 'Highlights',
  'library.add': 'Add book',
  'library.importing': 'Importing…',
  'library.empty.title': 'Your library is empty',
  'library.empty.body': 'Add an EPUB, MOBI, PDF or text file to start reading.',
  'library.continue': 'Continue reading',
  'library.all': 'All books',
} as const

export type TranslationKey = keyof typeof en

type Locale = Record<TranslationKey, string>

const locales: Record<string, Locale> = { en }

let current = 'en'

export function setLocale(code: string): void {
  if (locales[code]) current = code
}

export function availableLocales(): string[] {
  return Object.keys(locales)
}

/** Register or extend a locale dictionary at runtime. */
export function registerLocale(code: string, dictionary: Locale): void {
  locales[code] = dictionary
}

export function t(key: TranslationKey): string {
  return locales[current]?.[key] ?? en[key]
}
