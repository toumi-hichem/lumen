import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '@/store/libraryStore'
import { bookmarkRepository } from '@/storage/bookmarkRepository'
import { highlightRepository } from '@/storage/highlightRepository'
import { sessionRepository } from '@/storage/sessionRepository'
import { computeStats, type ReadingStats } from '@/services/readingStats'
import { Icon } from '@/ui/Icon'
import { icons } from '@/ui/icons'
import { homeSections, type HomeData, type HomeSection } from './home/sections'
import { t } from '@/i18n'
import type { Bookmark, Highlight } from '@/domain/models'

export function HomeScreen() {
  const navigate = useNavigate()
  const { books, load } = useLibraryStore()
  const [extra, setExtra] = useState<{
    bookmarks: Bookmark[]
    highlights: Highlight[]
    stats: ReadingStats | null
  }>({ bookmarks: [], highlights: [], stats: null })

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void Promise.all([
      bookmarkRepository.findAll(),
      highlightRepository.findAll(),
      sessionRepository.findAll(),
    ]).then(([bookmarks, highlights, sessions]) => {
      setExtra({ bookmarks, highlights, stats: computeStats(sessions) })
    })
  }, [])

  const data: HomeData = useMemo(
    () => ({
      books,
      bookmarks: extra.bookmarks,
      highlights: extra.highlights,
      stats: extra.stats,
      titleById: new Map(books.map((b) => [b.id, b.title])),
    }),
    [books, extra],
  )

  return (
    <div className="app">
      <header className="appbar">
        <h1>{t('app.name')}</h1>
        <button
          className="btn btn-icon"
          onClick={() => navigate('/settings')}
          aria-label="Settings"
        >
          <Icon path={icons.settings} size={20} />
        </button>
      </header>

      <main className="screen-body">
        {homeSections.map((section) => (
          <HomeSectionBlock key={section.id} section={section} data={data} />
        ))}
      </main>
    </div>
  )
}

function HomeSectionBlock({ section, data }: { section: HomeSection; data: HomeData }) {
  const navigate = useNavigate()
  if (section.isVisible && !section.isVisible(data)) return null
  const Preview = section.Preview
  return (
    <section className="home-section">
      <div className="home-section-head">
        <span className="home-section-titles">
          <span className="home-section-icon">
            <Icon path={icons[section.icon]} size={18} />
          </span>
          <h2 className="home-section-title">{section.title}</h2>
        </span>
        <button className="home-seeall" onClick={() => navigate(section.route)}>
          See all
          <Icon path={icons.chevronRight} size={14} />
        </button>
      </div>
      <Preview data={data} />
    </section>
  )
}
