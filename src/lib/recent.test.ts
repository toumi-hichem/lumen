import { describe, expect, it } from 'vitest'
import { mostRecent } from './recent'

interface Item {
  id: string
  at: number
}

const items: Item[] = [
  { id: 'a', at: 30 },
  { id: 'b', at: 10 },
  { id: 'c', at: 50 },
  { id: 'd', at: 20 },
]

describe('mostRecent', () => {
  it('returns the newest items first', () => {
    expect(mostRecent(items, (i) => i.at, 2).map((i) => i.id)).toEqual(['c', 'a'])
  })

  it('caps at the requested count', () => {
    expect(mostRecent(items, (i) => i.at, 3)).toHaveLength(3)
  })

  it('returns everything when count exceeds length', () => {
    expect(mostRecent(items, (i) => i.at, 99)).toHaveLength(4)
  })

  it('does not mutate the input', () => {
    const copy = [...items]
    mostRecent(items, (i) => i.at, 2)
    expect(items).toEqual(copy)
  })

  it('handles an empty list', () => {
    expect(mostRecent([], () => 0, 5)).toEqual([])
  })
})
