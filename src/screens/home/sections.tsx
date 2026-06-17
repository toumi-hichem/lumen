import type { ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Book, Bookmark, Highlight } from '@/domain/models'
import type { ReadingStats } from '@/services/readingStats'
import type { IconName } from '@/ui/icons'
import { mostRecent } from '@/lib/recent'

/** Everything the Home previews need, loaded once by the Home screen. */
export interface HomeData {
  books: Book[]
  bookmarks: Bookmark[]
  highlights: Highlight[]
  stats: ReadingStats | null
  titleById: Map<string, string>
}

export interface HomeSection {
  id: string
  title: string
  /** Destination for the section's "See all" link. */
  route: string
  icon: IconName
  /** Hide the whole section when this returns false (e.g. nothing to continue). */
  isVisible?: (data: HomeData) => boolean
  /** Renders a content preview tailored to the section type. */
  Preview: ComponentType<{ data: HomeData }>
}

const PREVIEW_COUNT = 3
const COVER_COUNT = 8

/**
 * Declarative Home sections. Each renders a real preview of its content rather
 * than a bare navigation tile. Adding a section is still one entry — give it a
 * route, icon and a Preview component.
 */
export const homeSections: HomeSection[] = [
  {
    id: 'continue',
    title: 'Continue reading',
    route: '/library',
    icon: 'play',
    isVisible: (d) => d.books.some((b) => b.lastOpenedAt),
    Preview: ContinuePreview,
  },
  {
    id: 'library',
    title: 'Library',
    route: '/library',
    icon: 'library',
    Preview: LibraryPreview,
  },
  {
    id: 'bookmarks',
    title: 'Bookmarks',
    route: '/bookmarks',
    icon: 'bookmark',
    Preview: BookmarksPreview,
  },
  {
    id: 'highlights',
    title: 'Highlights',
    route: '/highlights',
    icon: 'highlight',
    Preview: HighlightsPreview,
  },
  {
    id: 'stats',
    title: 'Reading stats',
    route: '/stats',
    icon: 'stats',
    Preview: StatsPreview,
  },
]

function ContinuePreview({ data }: { data: HomeData }) {
  const navigate = useNavigate()
  const recent = mostRecent(
    data.books.filter((b) => b.lastOpenedAt),
    (b) => b.lastOpenedAt ?? 0,
    COVER_COUNT,
  )
  return (
    <div className="book-row">
      {recent.map((b) => (
        <CoverButton key={b.id} book={b} onClick={() => navigate(`/read/${b.id}`)} withTitle />
      ))}
    </div>
  )
}

function LibraryPreview({ data }: { data: HomeData }) {
  const navigate = useNavigate()
  if (data.books.length === 0) {
    return <EmptyHint text="No books yet — add one to start reading." />
  }
  const recent = mostRecent(data.books, (b) => b.addedAt, COVER_COUNT)
  return (
    <div className="book-row">
      {recent.map((b) => (
        <CoverButton key={b.id} book={b} onClick={() => navigate(`/read/${b.id}`)} />
      ))}
    </div>
  )
}

function BookmarksPreview({ data }: { data: HomeData }) {
  const navigate = useNavigate()
  if (data.bookmarks.length === 0) return <EmptyHint text="No bookmarks yet." />
  const recent = mostRecent(data.bookmarks, (b) => b.createdAt, PREVIEW_COUNT)
  return (
    <div className="home-snippets">
      {recent.map((bm) => (
        <button
          key={bm.id}
          className="home-snippet"
          onClick={() => navigate(`/read/${bm.bookId}`)}
        >
          <span className="home-snippet-title">{bm.label || 'Bookmark'}</span>
          {bm.excerpt && <span className="home-snippet-text muted">{bm.excerpt}</span>}
          <small className="muted">{data.titleById.get(bm.bookId) ?? 'Unknown'}</small>
        </button>
      ))}
    </div>
  )
}

function HighlightsPreview({ data }: { data: HomeData }) {
  const navigate = useNavigate()
  if (data.highlights.length === 0) return <EmptyHint text="No highlights yet." />
  const recent = mostRecent(data.highlights, (h) => h.createdAt, PREVIEW_COUNT)
  return (
    <div className="home-snippets">
      {recent.map((h) => (
        <button
          key={h.id}
          className="home-snippet"
          onClick={() => navigate(`/read/${h.bookId}`)}
        >
          <span className="home-snippet-text">
            <span className="hl-chip" style={{ background: `var(--hl-${h.color})` }} />
            {h.text}
          </span>
          <small className="muted">{data.titleById.get(h.bookId) ?? 'Unknown'}</small>
        </button>
      ))}
    </div>
  )
}

function StatsPreview({ data }: { data: HomeData }) {
  const navigate = useNavigate()
  const s = data.stats
  if (!s) return <EmptyHint text="No reading time logged yet." />
  const max = Math.max(1, ...s.last7Days.map((d) => d.minutes))
  return (
    <button className="home-stats" onClick={() => navigate('/stats')}>
      <div className="home-stats-figures">
        <Figure value={formatMinutes(s.totalMinutes)} label="Total" />
        <Figure value={String(s.currentStreak)} label="Day streak" />
        <Figure value={String(s.sessionCount)} label="Sessions" />
      </div>
      <div className="home-spark" aria-hidden="true">
        {s.last7Days.map((d) => (
          <span key={d.date} style={{ height: `${(d.minutes / max) * 100}%` }} />
        ))}
      </div>
    </button>
  )
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <span className="home-figure">
      <b>{value}</b>
      <small className="muted">{label}</small>
    </span>
  )
}

function CoverButton({
  book,
  onClick,
  withTitle,
}: {
  book: Book
  onClick: () => void
  withTitle?: boolean
}) {
  return (
    <button className="continue-card" onClick={onClick} aria-label={`Open ${book.title}`}>
      {book.coverUrl ? (
        <img className="book-cover" src={book.coverUrl} alt="" />
      ) : (
        <div className="book-cover book-cover-fallback" style={coverGradient(book.title)}>
          {book.title}
        </div>
      )}
      {withTitle && <span className="continue-title">{book.title}</span>}
    </button>
  )
}

function EmptyHint({ text }: { text: string }) {
  return <p className="home-empty muted">{text}</p>
}

function formatMinutes(total: number): string {
  if (total < 60) return `${total}m`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/** Deterministic cover gradient from the title, used when no cover art. */
function coverGradient(title: string): React.CSSProperties {
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) % 360
  return {
    background: `linear-gradient(135deg, hsl(${hash} 50% 45%), hsl(${(hash + 40) % 360} 55% 35%))`,
    color: '#fff',
  }
}
