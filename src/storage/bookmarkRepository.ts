import { getDb } from './db'
import type { Repository } from './repository'
import type { Bookmark } from '@/domain/models'

export const bookmarkRepository: Repository<Bookmark> & {
  findByBook(bookId: string): Promise<Bookmark[]>
} = {
  async findAll(): Promise<Bookmark[]> {
    const db = await getDb()
    return db.getAll('bookmarks')
  },

  async findById(id: string): Promise<Bookmark | null> {
    const db = await getDb()
    return (await db.get('bookmarks', id)) ?? null
  },

  async save(bookmark: Bookmark): Promise<Bookmark> {
    const db = await getDb()
    await db.put('bookmarks', bookmark)
    return bookmark
  },

  async delete(id: string): Promise<void> {
    const db = await getDb()
    await db.delete('bookmarks', id)
  },

  async findByBook(bookId: string): Promise<Bookmark[]> {
    const db = await getDb()
    const items = await db.getAllFromIndex('bookmarks', 'by-bookId', bookId)
    return items.sort((a, b) => a.createdAt - b.createdAt)
  },
}
