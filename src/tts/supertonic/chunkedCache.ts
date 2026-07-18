/**
 * Chunked, resumable storage for the large Supertonic model files.
 *
 * Handing a whole 256 MB network `Response` to `Cache.put()` looks like
 * streaming, but Chrome buffers the entire body in memory before committing it
 * to disk — measured at ~3.6 GB peak RSS for `vector_estimator.onnx`, enough to
 * exhaust swap and get the renderer OOM-killed on an 8 GB machine.
 *
 * Downloading in bounded Range slices and storing each slice under its own
 * cache key keeps peak memory at one chunk, and has the happy side effect of
 * making every slice independently retryable and the whole download resumable
 * across interruptions.
 */

/**
 * 8 MB: small enough that a buffered chunk is irrelevant next to the model
 * itself, large enough that the biggest file is ~32 requests rather than
 * hundreds.
 */
export const CHUNK_SIZE = 8 * 1024 * 1024

const MAX_ATTEMPTS = 4
const DEFAULT_RETRY_DELAY_MS = 500

/**
 * The slice of Cache Storage this module needs. The DOM `Cache` type satisfies
 * it structurally, so a real cache can be passed straight through.
 */
export interface ChunkStore {
  match(key: string): Promise<Response | undefined>
  put(key: string, response: Response): Promise<void>
  delete(key: string): Promise<boolean>
}

/** Written only once every chunk is stored, so a partial file is never "complete". */
interface FileMeta {
  size: number
  chunks: number
}

export function chunkKey(rel: string, index: number): string {
  return `/__supertonic__/${rel}/chunk/${index}`
}

export function metaKey(rel: string): string {
  return `/__supertonic__/${rel}/meta`
}

export interface ByteRange {
  start: number
  end: number
}

/** Inclusive byte ranges covering `[0, size)`, each at most `chunkSize` long. */
export function chunkRanges(size: number, chunkSize = CHUNK_SIZE): ByteRange[] {
  const ranges: ByteRange[] = []
  for (let start = 0; start < size; start += chunkSize) {
    ranges.push({ start, end: Math.min(start + chunkSize, size) - 1 })
  }
  return ranges
}

/** Total entity length from a `Content-Range: bytes a-b/total` header. */
export function parseContentRangeTotal(header: string | null): number | null {
  if (!header) return null
  const match = /\/\s*(\d+)\s*$/.exec(header)
  return match ? Number(match[1]) : null
}

async function readMeta(store: ChunkStore, rel: string): Promise<FileMeta | null> {
  const res = await store.match(metaKey(rel))
  if (!res) return null
  try {
    return (await res.json()) as FileMeta
  } catch {
    return null
  }
}

/** True only when the completion marker and every chunk it names are present. */
export async function isFileComplete(store: ChunkStore, rel: string): Promise<boolean> {
  const meta = await readMeta(store, rel)
  if (!meta) return false
  for (let i = 0; i < meta.chunks; i++) {
    if (!(await store.match(chunkKey(rel, i)))) return false
  }
  return true
}

/**
 * Reassemble a stored file, or null if it is absent or incomplete.
 *
 * The full buffer is unavoidable here — onnxruntime wants the model as one
 * contiguous ArrayBuffer — but chunks are copied in and released one at a time,
 * so the peak is the file itself plus a chunk rather than a multiple of it.
 */
export async function readChunked(
  store: ChunkStore,
  rel: string,
): Promise<Uint8Array | null> {
  const meta = await readMeta(store, rel)
  if (!meta) return null

  const out = new Uint8Array(meta.size)
  let offset = 0
  for (let i = 0; i < meta.chunks; i++) {
    const res = await store.match(chunkKey(rel, i))
    if (!res) return null
    const chunk = new Uint8Array(await res.arrayBuffer())
    if (offset + chunk.length > out.length) return null
    out.set(chunk, offset)
    offset += chunk.length
  }
  return offset === meta.size ? out : null
}

/** Drop every chunk of a file plus its completion marker. */
export async function removeFileChunks(store: ChunkStore, rel: string): Promise<void> {
  const meta = await readMeta(store, rel)
  const count = meta?.chunks ?? 0
  for (let i = 0; i < count; i++) await store.delete(chunkKey(rel, i))
  await store.delete(metaKey(rel))
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

async function withRetry<T>(
  operation: () => Promise<T>,
  describe: () => string,
  retryDelayMs: number,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    signal?.throwIfAborted()
    try {
      return await operation()
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
      if (attempt < MAX_ATTEMPTS - 1 && retryDelayMs > 0) {
        // Back off so a flaky connection gets a chance to recover.
        await delay(retryDelayMs * 2 ** attempt)
      }
    }
  }
  const reason = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`${describe()} failed after ${MAX_ATTEMPTS} attempts: ${reason}`)
}

export interface ChunkedDownloadOptions {
  store: ChunkStore
  /** Manifest-relative path, e.g. `onnx/vocoder.onnx`. */
  rel: string
  url: string
  /**
   * Total size in bytes when the server advertised one. Null/undefined when it
   * did not — HuggingFace serves the small JSON assets chunked, with no
   * `Content-Length` on either HEAD or GET — in which case the file is fetched
   * whole in a single request. Only worth chunking what we can measure, and
   * the unmeasurable ones here are all well under a megabyte.
   */
  size?: number | null
  chunkSize?: number
  /** Called with the byte count of each chunk as it lands (including resumed ones). */
  onBytes?: (bytes: number) => void
  fetchImpl?: typeof fetch
  retryDelayMs?: number
  signal?: AbortSignal
}

/**
 * Download one file into the store as bounded chunks, skipping any chunk that
 * is already present so an interrupted download resumes where it left off.
 */
export async function downloadFileChunked(
  options: ChunkedDownloadOptions,
): Promise<void> {
  const {
    store,
    rel,
    url,
    size,
    chunkSize = CHUNK_SIZE,
    onBytes,
    fetchImpl = fetch,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    signal,
  } = options

  // Already there from an earlier run: report its bytes so the caller's
  // progress total still adds up, and skip the network entirely.
  const existingMeta = await readMeta(store, rel)
  if (existingMeta && (await isFileComplete(store, rel))) {
    onBytes?.(existingMeta.size)
    return
  }

  const hasKnownSize = size != null && size > 0
  // `null` means "whole file in one request" — either the file fits in a single
  // chunk, or the server never told us how big it is.
  const ranges: (ByteRange | null)[] = hasKnownSize
    ? chunkRanges(size, chunkSize)
    : [null]
  const useRangeHeaders = hasKnownSize && ranges.length > 1

  let received = 0

  for (const [index, range] of ranges.entries()) {
    signal?.throwIfAborted()
    const key = chunkKey(rel, index)

    const existing = await store.match(key)
    if (existing) {
      const length = range ? range.end - range.start + 1 : 0
      received += length
      onBytes?.(length)
      continue
    }

    const servedWholeFile = await withRetry(
      async () => {
        const res = await fetchImpl(url, {
          signal,
          ...(useRangeHeaders && range
            ? { headers: { Range: `bytes=${range.start}-${range.end}` } }
            : {}),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        // A 200 to a ranged request means the server ignored Range and sent the
        // whole entity; store it as the single chunk it actually is.
        const ignoredRange = useRangeHeaders && res.status === 200
        const body = new Uint8Array(await res.arrayBuffer())
        await store.put(key, new Response(body as BodyInit))
        received += body.length
        onBytes?.(body.length)
        return ignoredRange
      },
      () => `Downloading ${rel} (part ${index + 1}/${ranges.length})`,
      retryDelayMs,
      signal,
    )

    if (servedWholeFile) {
      await writeMeta(store, rel, { size: received, chunks: 1 })
      return
    }
  }

  await writeMeta(store, rel, {
    size: hasKnownSize ? size : received,
    chunks: ranges.length,
  })
}

async function writeMeta(
  store: ChunkStore,
  rel: string,
  meta: FileMeta,
): Promise<void> {
  await store.put(metaKey(rel), new Response(JSON.stringify(meta)))
}
