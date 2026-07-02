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
    await Promise.all([
      db.clear('books'),
      db.clear('files'),
      db.clear('progress'),
      db.clear('bookmarks'),
      db.clear('highlights'),
      db.clear('sessions'),
      db.clear('bookSettings'),
    ])
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

  it('cascades delete to every related store', async () => {
    const db = await getDb()
    await bookRepository.save(makeBook('x', 1))
    await bookRepository.save(makeBook('keep', 2))

    await db.put('files', { key: 'file_x', blob: new Blob(['book']) })
    await db.put('progress', {
      bookId: 'x',
      location: { cfi: 'epubcfi(/6/2)', progress: 0.5 },
      updatedAt: 1,
    })
    await db.put('bookmarks', {
      id: 'bm1',
      bookId: 'x',
      cfi: 'epubcfi(/6/2)',
      label: 'Chapter 1',
      createdAt: 1,
    })
    await db.put('highlights', {
      id: 'hl1',
      bookId: 'x',
      cfiRange: 'epubcfi(/6/2,/1:0,/1:5)',
      text: 'hello',
      color: 'yellow',
      createdAt: 1,
    })
    await db.put('sessions', {
      id: 'sess1',
      bookId: 'x',
      startedAt: 1,
      endedAt: 20_001,
      durationMs: 20_000,
    })
    await db.put('bookSettings', { bookId: 'x', ttsRate: 1.2 })
    // Rows for another book must survive the cascade.
    await db.put('sessions', {
      id: 'sess2',
      bookId: 'keep',
      startedAt: 1,
      endedAt: 20_001,
      durationMs: 20_000,
    })
    await db.put('bookSettings', { bookId: 'keep', ttsRate: 0.8 })

    await bookRepository.delete('x')

    expect(await db.get('books', 'x')).toBeUndefined()
    expect(await db.get('files', 'file_x')).toBeUndefined()
    expect(await db.get('progress', 'x')).toBeUndefined()
    expect(await db.get('bookmarks', 'bm1')).toBeUndefined()
    expect(await db.get('highlights', 'hl1')).toBeUndefined()
    expect(await db.get('sessions', 'sess1')).toBeUndefined()
    expect(await db.get('bookSettings', 'x')).toBeUndefined()

    expect(await db.get('books', 'keep')).toBeDefined()
    expect(await db.get('sessions', 'sess2')).toBeDefined()
    expect(await db.get('bookSettings', 'keep')).toBeDefined()
  })

  it('returns null for a missing book', async () => {
    expect(await bookRepository.findById('missing')).toBeNull()
  })
})
