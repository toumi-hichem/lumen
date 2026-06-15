import { getDb } from './db'
import type { Repository } from './repository'
import type { Collection } from '@/domain/models'

export const collectionRepository: Repository<Collection> = {
  async findAll(): Promise<Collection[]> {
    const db = await getDb()
    const all = await db.getAll('collections')
    return all.sort((a, b) => a.createdAt - b.createdAt)
  },

  async findById(id: string): Promise<Collection | null> {
    const db = await getDb()
    return (await db.get('collections', id)) ?? null
  },

  async save(collection: Collection): Promise<Collection> {
    const db = await getDb()
    await db.put('collections', collection)
    return collection
  },

  async delete(id: string): Promise<void> {
    const db = await getDb()
    await db.delete('collections', id)
  },
}
