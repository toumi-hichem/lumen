import { getDb } from './db'
import type { Repository } from './repository'
import type { Highlight } from '@/domain/models'

export const highlightRepository: Repository<Highlight> & {
  findByBook(bookId: string): Promise<Highlight[]>
} = {
  async findAll(): Promise<Highlight[]> {
    const db = await getDb()
    return db.getAll('highlights')
  },

  async findById(id: string): Promise<Highlight | null> {
    const db = await getDb()
    return (await db.get('highlights', id)) ?? null
  },

  async save(highlight: Highlight): Promise<Highlight> {
    const db = await getDb()
    await db.put('highlights', highlight)
    return highlight
  },

  async delete(id: string): Promise<void> {
    const db = await getDb()
    await db.delete('highlights', id)
  },

  async findByBook(bookId: string): Promise<Highlight[]> {
    const db = await getDb()
    const items = await db.getAllFromIndex('highlights', 'by-bookId', bookId)
    return items.sort((a, b) => a.createdAt - b.createdAt)
  },
}
