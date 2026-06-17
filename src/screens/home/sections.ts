import type { IconName } from '@/ui/icons'

/** Live counts used to render each hub section's one-line preview. */
export interface HomeContext {
  bookCount: number
  bookmarkCount: number
  highlightCount: number
  streak: number
}

export interface HomeSection {
  id: string
  title: string
  route: string
  icon: IconName
  /** Short status line shown under the title. */
  preview: (ctx: HomeContext) => string
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

/**
 * Declarative hub sections. Adding a destination to the Home screen is a single
 * entry here — give it a route, an icon and a preview line. Each route already
 * (or will) resolve to its own full page in App.tsx.
 */
export const homeSections: HomeSection[] = [
  {
    id: 'library',
    title: 'Library',
    route: '/library',
    icon: 'library',
    preview: (c) => (c.bookCount ? plural(c.bookCount, 'book') : 'Add your first book'),
  },
  {
    id: 'stats',
    title: 'Reading stats',
    route: '/stats',
    icon: 'stats',
    preview: (c) => (c.streak > 0 ? `${c.streak}-day streak` : 'Track your reading'),
  },
  {
    id: 'bookmarks',
    title: 'Bookmarks',
    route: '/bookmarks',
    icon: 'bookmark',
    preview: (c) => (c.bookmarkCount ? plural(c.bookmarkCount, 'bookmark') : 'None yet'),
  },
  {
    id: 'highlights',
    title: 'Highlights',
    route: '/highlights',
    icon: 'highlight',
    preview: (c) =>
      c.highlightCount ? plural(c.highlightCount, 'highlight') : 'None yet',
  },
  {
    id: 'settings',
    title: 'Settings',
    route: '/settings',
    icon: 'settings',
    preview: () => 'Themes, fonts, speech',
  },
]
