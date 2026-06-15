import { getDb } from './db'
import type { ReadingSession } from '@/domain/models'

export const sessionRepository = {
  async add(session: ReadingSession): Promise<void> {
    const db = await getDb()
    await db.put('sessions', session)
  },

  async findAll(): Promise<ReadingSession[]> {
    const db = await getDb()
    return db.getAll('sessions')
  },

  async findByBook(bookId: string): Promise<ReadingSession[]> {
    const db = await getDb()
    return db.getAllFromIndex('sessions', 'by-bookId', bookId)
  },
}
