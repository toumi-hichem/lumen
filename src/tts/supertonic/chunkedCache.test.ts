// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  CHUNK_SIZE,
  chunkKey,
  chunkRanges,
  downloadFileChunked,
  isFileComplete,
  metaKey,
  parseContentRangeTotal,
  readChunked,
  removeFileChunks,
  type ChunkStore,
} from './chunkedCache'

/** In-memory stand-in for Cache Storage. */
class FakeStore implements ChunkStore {
  readonly entries = new Map<string, Uint8Array>()

  async match(key: string): Promise<Response | undefined> {
    const value = this.entries.get(key)
    return value ? new Response(value as BodyInit) : undefined
  }

  async put(key: string, response: Response): Promise<void> {
    this.entries.set(key, new Uint8Array(await response.arrayBuffer()))
  }

  async delete(key: string): Promise<boolean> {
    return this.entries.delete(key)
  }
}

function bytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = i % 251
  return out
}

interface FetchOptions {
  supportsRange?: boolean
  failFirst?: number
}

function makeFetch(data: Uint8Array, options: FetchOptions = {}) {
  const { supportsRange = true, failFirst = 0 } = options
  let remainingFailures = failFirst
  const impl = async (
    _url: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    if (remainingFailures > 0) {
      remainingFailures -= 1
      throw new TypeError('network error')
    }
    const headers = (init?.headers ?? {}) as Record<string, string>
    const range = headers.Range
    if (range && supportsRange) {
      const match = /bytes=(\d+)-(\d+)/.exec(range)
      if (!match) throw new Error('bad range')
      const start = Number(match[1])
      const end = Math.min(Number(match[2]), data.length - 1)
      return new Response(data.slice(start, end + 1) as BodyInit, {
        status: 206,
        headers: { 'content-range': `bytes ${start}-${end}/${data.length}` },
      })
    }
    return new Response(data as BodyInit, { status: 200 })
  }
  return vi.fn(impl)
}

describe('chunkRanges', () => {
  it('covers the whole file with inclusive, non-overlapping ranges', () => {
    expect(chunkRanges(10, 4)).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
      { start: 8, end: 9 },
    ])
  })

  it('emits a single range when the file fits in one chunk', () => {
    expect(chunkRanges(3, 8)).toEqual([{ start: 0, end: 2 }])
  })

  it('does not emit a trailing empty range on an exact multiple', () => {
    expect(chunkRanges(8, 4)).toHaveLength(2)
  })

  it('emits nothing for an empty file', () => {
    expect(chunkRanges(0, 4)).toEqual([])
  })

  it('defaults to CHUNK_SIZE, which stays well under the buffering cliff', () => {
    expect(chunkRanges(CHUNK_SIZE + 1)).toHaveLength(2)
    expect(CHUNK_SIZE).toBeLessThanOrEqual(16 * 1024 * 1024)
  })
})

describe('parseContentRangeTotal', () => {
  it('reads the total entity length', () => {
    expect(parseContentRangeTotal('bytes 0-1048575/256534781')).toBe(256534781)
  })

  it('returns null for a missing or unsatisfiable header', () => {
    expect(parseContentRangeTotal(null)).toBeNull()
    expect(parseContentRangeTotal('bytes */1234')).toBe(1234)
    expect(parseContentRangeTotal('garbage')).toBeNull()
  })
})

describe('downloadFileChunked', () => {
  it('stores a large file as several chunks and reads it back byte-exact', async () => {
    const data = bytes(1000)
    const store = new FakeStore()
    await downloadFileChunked({
      store,
      rel: 'onnx/big.onnx',
      url: 'https://example.test/big.onnx',
      size: data.length,
      chunkSize: 256,
      fetchImpl: makeFetch(data),
    })

    expect(await isFileComplete(store, 'onnx/big.onnx')).toBe(true)
    expect(store.entries.has(chunkKey('onnx/big.onnx', 3))).toBe(true)
    expect(await readChunked(store, 'onnx/big.onnx')).toEqual(data)
  })

  it('never buffers more than one chunk per request', async () => {
    const data = bytes(1000)
    const fetchImpl = makeFetch(data)
    await downloadFileChunked({
      store: new FakeStore(),
      rel: 'a',
      url: 'u',
      size: data.length,
      chunkSize: 256,
      fetchImpl,
    })
    for (const call of fetchImpl.mock.calls) {
      const headers = (call[1]?.headers ?? {}) as Record<string, string>
      const [, start, end] = /bytes=(\d+)-(\d+)/.exec(headers.Range) ?? []
      expect(Number(end) - Number(start) + 1).toBeLessThanOrEqual(256)
    }
  })

  it('reports byte progress as chunks land', async () => {
    const data = bytes(1000)
    const seen: number[] = []
    await downloadFileChunked({
      store: new FakeStore(),
      rel: 'a',
      url: 'u',
      size: data.length,
      chunkSize: 256,
      fetchImpl: makeFetch(data),
      onBytes: (n) => seen.push(n),
    })
    expect(seen).toEqual([256, 256, 256, 232])
    expect(seen.reduce((a, b) => a + b, 0)).toBe(1000)
  })

  it('retries a failed chunk instead of restarting the file', async () => {
    const data = bytes(1000)
    const fetchImpl = makeFetch(data, { failFirst: 2 })
    await downloadFileChunked({
      store: new FakeStore(),
      rel: 'a',
      url: 'u',
      size: data.length,
      chunkSize: 256,
      fetchImpl,
      retryDelayMs: 0,
    })
    // 4 chunks + 2 retried failures, not a full restart.
    expect(fetchImpl).toHaveBeenCalledTimes(6)
  })

  it('gives up with a useful error once retries are exhausted', async () => {
    const fetchImpl = makeFetch(bytes(1000), { failFirst: 99 })
    await expect(
      downloadFileChunked({
        store: new FakeStore(),
        rel: 'onnx/big.onnx',
        url: 'u',
        size: 1000,
        chunkSize: 256,
        fetchImpl,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/onnx\/big\.onnx/)
  })

  it('resumes, re-fetching only the chunks that are missing', async () => {
    const data = bytes(1000)
    const store = new FakeStore()
    const first = makeFetch(data, { failFirst: 0 })
    await downloadFileChunked({
      store, rel: 'a', url: 'u', size: data.length, chunkSize: 256, fetchImpl: first,
    })

    // Drop one chunk and the completion marker, as an interrupted run would.
    store.entries.delete(chunkKey('a', 2))
    store.entries.delete(metaKey('a'))
    expect(await isFileComplete(store, 'a')).toBe(false)

    const second = makeFetch(data)
    const resumed: number[] = []
    await downloadFileChunked({
      store, rel: 'a', url: 'u', size: data.length, chunkSize: 256,
      fetchImpl: second, onBytes: (n) => resumed.push(n),
    })

    expect(second).toHaveBeenCalledTimes(1)
    expect(await readChunked(store, 'a')).toEqual(data)
    // Already-present chunks still count toward progress so the bar is honest.
    expect(resumed.reduce((a, b) => a + b, 0)).toBe(1000)
  })

  it('falls back to a whole-body store when the server ignores Range', async () => {
    const data = bytes(1000)
    const store = new FakeStore()
    await downloadFileChunked({
      store, rel: 'a', url: 'u', size: data.length, chunkSize: 256,
      fetchImpl: makeFetch(data, { supportsRange: false }),
    })
    expect(await readChunked(store, 'a')).toEqual(data)
  })

  // HuggingFace serves the small JSON assets chunked, with no Content-Length
  // on either HEAD or GET, so size is genuinely unknowable up front.
  it('fetches the whole file when the server withholds a size', async () => {
    const data = bytes(700)
    const store = new FakeStore()
    const fetchImpl = makeFetch(data)
    const seen: number[] = []
    await downloadFileChunked({
      store, rel: 'voice_styles/F3.json', url: 'u', size: null,
      chunkSize: 256, fetchImpl, onBytes: (n) => seen.push(n),
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const headers = (fetchImpl.mock.calls[0][1]?.headers ?? {}) as Record<string, string>
    expect(headers.Range).toBeUndefined()
    // Progress reports the real byte count, discovered from the body.
    expect(seen).toEqual([700])
    expect(await readChunked(store, 'voice_styles/F3.json')).toEqual(data)
    expect(await isFileComplete(store, 'voice_styles/F3.json')).toBe(true)
  })

  it('reports stored bytes and skips the network for an already-complete file', async () => {
    const data = bytes(1000)
    const store = new FakeStore()
    await downloadFileChunked({
      store, rel: 'a', url: 'u', size: data.length, chunkSize: 256,
      fetchImpl: makeFetch(data),
    })

    const again = makeFetch(data)
    const seen: number[] = []
    await downloadFileChunked({
      store, rel: 'a', url: 'u', size: data.length, chunkSize: 256,
      fetchImpl: again, onBytes: (n) => seen.push(n),
    })
    expect(again).not.toHaveBeenCalled()
    expect(seen).toEqual([1000])
  })

  it('skips the Range header entirely for files that fit in one chunk', async () => {
    const data = bytes(100)
    const fetchImpl = makeFetch(data)
    await downloadFileChunked({
      store: new FakeStore(), rel: 'onnx/tts.json', url: 'u',
      size: data.length, chunkSize: 256, fetchImpl,
    })
    const headers = (fetchImpl.mock.calls[0][1]?.headers ?? {}) as Record<string, string>
    expect(headers.Range).toBeUndefined()
  })
})

describe('readChunked', () => {
  it('returns null when the file was never fully downloaded', async () => {
    const store = new FakeStore()
    expect(await readChunked(store, 'missing')).toBeNull()
    expect(await isFileComplete(store, 'missing')).toBe(false)
  })

  it('returns null when a chunk is missing despite a completion marker', async () => {
    const data = bytes(1000)
    const store = new FakeStore()
    await downloadFileChunked({
      store, rel: 'a', url: 'u', size: data.length, chunkSize: 256,
      fetchImpl: makeFetch(data),
    })
    store.entries.delete(chunkKey('a', 1))
    expect(await readChunked(store, 'a')).toBeNull()
  })
})

describe('removeFileChunks', () => {
  it('clears every chunk and the completion marker', async () => {
    const data = bytes(1000)
    const store = new FakeStore()
    await downloadFileChunked({
      store, rel: 'a', url: 'u', size: data.length, chunkSize: 256,
      fetchImpl: makeFetch(data),
    })
    await removeFileChunks(store, 'a')
    expect(store.entries.size).toBe(0)
    expect(await isFileComplete(store, 'a')).toBe(false)
  })
})
