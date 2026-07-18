/**
 * Supertonic on-device voice assets: manifest, persistent download, and a
 * cache-first asset source the engine reads through.
 *
 * Delivery is download-on-demand. Assets are fetched from a single base URL
 * (HuggingFace today; swap `SUPERTONIC_REMOTE_BASE` to your own CDN later) and
 * stored in the Cache Storage API, which persists across launches on both the
 * web (PWA) and inside the native Capacitor WebView. Until the assets are
 * present the reader falls back to the system voice automatically.
 */
import {
  downloadFileChunked,
  isFileComplete,
  readChunked,
} from './chunkedCache'

/** Files needed at runtime, relative to the Supertonic asset root. */
const ONNX_FILES = [
  'duration_predictor.onnx',
  'text_encoder.onnx',
  'vector_estimator.onnx',
  'vocoder.onnx',
  'tts.json',
  'unicode_indexer.json',
]
const VOICE_IDS = ['M1', 'M2', 'M3', 'M4', 'M5', 'F1', 'F2', 'F3', 'F4', 'F5']

export const SUPERTONIC_MANIFEST: readonly string[] = [
  ...ONNX_FILES.map((f) => `onnx/${f}`),
  ...VOICE_IDS.map((v) => `voice_styles/${v}.json`),
]

/** Approximate total download size, shown to the user before downloading. */
export const SUPERTONIC_SIZE_MB = 400

/**
 * Remote source. The HuggingFace repo serves `onnx/` and `voice_styles/` at the
 * repository root. Point this at your own server later (same layout) by
 * changing this one constant — the rest of the app is unaffected.
 *
 * Supertonic 3: same ONNX I/O contract as v1/v2, but fixes their documented
 * skip/repeat failures on short inputs. When changing generations, bump
 * CACHE_NAME too so stale weights are never mixed with current ones.
 */
export const SUPERTONIC_REMOTE_BASE =
  'https://huggingface.co/Supertone/supertonic-3/resolve/main'

/**
 * v4 stores each file as bounded chunks (see chunkedCache.ts). The v3 layout
 * held whole-file entries under different keys, so the two cannot be mixed.
 */
const CACHE_NAME = 'lumen-supertonic-v4'
/** Cache names from previous model generations/layouts, deleted on sight. */
const LEGACY_CACHE_NAMES = ['lumen-supertonic-v1', 'lumen-supertonic-v3']

/** Bundled fallback (dev: scripts/fetch-supertonic.sh drops assets here). */
const PUBLIC_BASE = `${import.meta.env.BASE_URL ?? '/'}supertonic`

/** Raised for storage problems so the UI can show a friendly, actionable message. */
export class SupertonicStorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SupertonicStorageError'
  }
}

export interface AssetSource {
  readBytes(relPath: string): Promise<Uint8Array>
  readJson<T>(relPath: string): Promise<T>
}

export function supertonicRemoteUrl(relPath: string): string {
  return `${SUPERTONIC_REMOTE_BASE}/${relPath}`
}

function cachesAvailable(): boolean {
  return typeof caches !== 'undefined'
}

async function readFromCache(relPath: string): Promise<Uint8Array | null> {
  if (!cachesAvailable()) return null
  const cache = await caches.open(CACHE_NAME)
  return readChunked(cache, relPath)
}

/**
 * Cache-first asset source: serves downloaded assets when present, otherwise
 * falls back to assets bundled under `public/supertonic`.
 */
export function createAssetSource(): AssetSource {
  const readBytes = async (relPath: string): Promise<Uint8Array> => {
    const cached = await readFromCache(relPath)
    if (cached) return cached
    const res = await fetch(`${PUBLIC_BASE}/${relPath}`)
    if (!res.ok) {
      throw new Error(`Supertonic asset not available: ${relPath} (${res.status})`)
    }
    return new Uint8Array(await res.arrayBuffer())
  }
  return {
    readBytes,
    async readJson<T>(relPath: string): Promise<T> {
      const bytes = await readBytes(relPath)
      return JSON.parse(new TextDecoder().decode(bytes)) as T
    },
  }
}

/** True only when every manifest asset is fully present in the persistent cache. */
export async function isSupertonicDownloaded(): Promise<boolean> {
  if (!cachesAvailable()) return false
  const cache = await caches.open(CACHE_NAME)
  for (const rel of SUPERTONIC_MANIFEST) {
    if (!(await isFileComplete(cache, rel))) return false
  }
  return true
}

/** Remove all downloaded Supertonic assets (current and legacy versions). */
export async function clearSupertonic(): Promise<void> {
  if (!cachesAvailable()) return
  await caches.delete(CACHE_NAME)
  await clearLegacyCaches()
}

/** Best-effort deletion of caches from previous model generations. */
async function clearLegacyCaches(): Promise<void> {
  for (const name of LEGACY_CACHE_NAMES) {
    try {
      await caches.delete(name)
    } catch {
      // Reclaiming old storage is opportunistic; never block on it.
    }
  }
}

/** Best-effort storage pre-check so we fail early with a clear message. */
async function assertQuota(neededBytes: number): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return
  try {
    const { quota, usage } = await navigator.storage.estimate()
    if (quota != null && usage != null) {
      const free = quota - usage
      // Need the assets plus headroom for the cache write.
      if (free < neededBytes + 30 * 1024 * 1024) {
        throw new SupertonicStorageError(
          `Not enough storage to install the offline voice (~${Math.round(neededBytes / 1024 / 1024)} MB needed). Free up space and try again.`,
        )
      }
    }
  } catch (e) {
    if (e instanceof SupertonicStorageError) throw e
    /* estimate unsupported — proceed and rely on the write-time guard */
  }
}

export interface DownloadProgress {
  done: number
  total: number
  /**
   * Which unit `done`/`total` are counted in. The web path reports bytes (the
   * files differ by two orders of magnitude, so a file count makes for a very
   * dishonest progress bar); the native Android plugin reports file counts.
   */
  unit?: 'bytes' | 'files'
}

/**
 * Ask the server how big each asset is, so progress is byte-accurate and the
 * quota check uses the real total rather than a hardcoded estimate.
 *
 * A size of null means the server did not advertise one. HuggingFace serves the
 * small JSON assets chunked, without `Content-Length`, so this is expected and
 * not an error — those files are simply fetched whole.
 */
async function fetchAssetSizes(): Promise<Map<string, number | null>> {
  const entries = await Promise.all(
    SUPERTONIC_MANIFEST.map(async (rel) => {
      try {
        const res = await fetch(supertonicRemoteUrl(rel), { method: 'HEAD' })
        if (!res.ok) throw new Error(`Failed to reach ${rel} (${res.status})`)
        const header = res.headers.get('content-length')
        const length = header == null ? NaN : Number(header)
        return [rel, Number.isFinite(length) && length > 0 ? length : null] as const
      } catch {
        // Treat an unreachable HEAD as an unknown size; the GET below is the
        // real test of availability and reports a better error.
        return [rel, null] as const
      }
    }),
  )
  return new Map(entries)
}

/**
 * Download every Supertonic asset into the persistent cache, reporting
 * byte-accurate progress.
 *
 * Each file is fetched as bounded Range chunks rather than as one large
 * response, which keeps peak memory at a single chunk instead of the whole
 * model — handing a 256 MB response to `Cache.put()` makes Chrome buffer it
 * entirely in memory and can OOM-kill the tab. Chunks already present are
 * skipped, so a retry after a dropped connection resumes rather than restarts.
 *
 * On a storage failure the partial download is cleared and a friendly error
 * thrown; on a network failure the partial download is deliberately *kept* so
 * the user can resume.
 */
export async function downloadSupertonic(
  onProgress?: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!cachesAvailable()) {
    throw new SupertonicStorageError(
      'Offline voice storage is not available in this environment.',
    )
  }

  const sizes = await fetchAssetSizes()
  // Files whose size the server withheld are all small JSON; they contribute to
  // the total as their bytes actually arrive, which keeps the bar monotonic
  // and ending at exactly 100%.
  let total = [...sizes.values()].reduce((sum: number, n) => sum + (n ?? 0), 0)
  await assertQuota(total)
  // Free the space held by weights from a previous model generation first.
  await clearLegacyCaches()

  const cache = await caches.open(CACHE_NAME)
  let done = 0
  onProgress?.({ done, total, unit: 'bytes' })

  for (const rel of SUPERTONIC_MANIFEST) {
    const knownSize = sizes.get(rel) ?? null
    try {
      await downloadFileChunked({
        store: cache,
        rel,
        url: supertonicRemoteUrl(rel),
        size: knownSize,
        signal,
        onBytes: (bytes) => {
          if (knownSize == null) total += bytes
          done += bytes
          onProgress?.({ done, total, unit: 'bytes' })
        },
      })
    } catch (e) {
      if (isQuotaExceeded(e)) {
        // Out of disk: a partial install is useless, so reclaim the space.
        await clearSupertonic()
        throw new SupertonicStorageError(
          `Ran out of storage while installing the offline voice (~${Math.round(total / 1024 / 1024)} MB needed). Free up space and try again.`,
        )
      }
      // Network or server error: keep what landed so a retry resumes.
      throw e
    }
  }
}

function isQuotaExceeded(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      // Safari reports the legacy numeric code.
      error.code === 22)
  )
}
