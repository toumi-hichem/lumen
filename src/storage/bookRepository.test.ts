import { beforeEach, describe, expect, it } from 'vitest'
import { bookRepository } from './bookRepository'
import { getDb } from './db'
import type { Book } from '@/domain/models'

function makeBook(id: string, addedAt: number): Book {
  return {
    id,
    title: `Book ${id}`,
    author: 'Tester',
    format: 'epub',
    fileKey: `file_${id}`,
    fileSize: 1024,
    addedAt,
  }
}

describe('bookRepository', () => {
  beforeEach(async () => {
    const db = await getDb()
    await db.clear('books')
  })

  it('saves and retrieves a book by id', async () => {
    const book = makeBook('a', 1)
    await bookRepository.save(book)
    expect(await bookRepository.findById('a')).toEqual(book)
  })

  it('lists books newest-first by addedAt', async () => {
    await bookRepository.save(makeBook('old', 1))
    await bookRepository.save(makeBook('new', 2))
    const all = await bookRepository.findAll()
    expect(all.map((b) => b.id)).toEqual(['new', 'old'])
  })

  it('deletes a book', async () => {
    await bookRepository.save(makeBook('x', 1))
    await bookRepository.delete('x')
    expect(await bookRepository.findById('x')).toBeNull()
  })

  it('returns null for a missing book', async () => {
    expect(await bookRepository.findById('missing')).toBeNull()
  })
})
