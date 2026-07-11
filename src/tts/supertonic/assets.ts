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

const CACHE_NAME = 'lumen-supertonic-v3'
/** Cache names from previous model generations, deleted on sight. */
const LEGACY_CACHE_NAMES = ['lumen-supertonic-v1']

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

/** Stable, collision-free cache key for a relative asset path. */
function cacheKey(relPath: string): string {
  return `/__supertonic__/${relPath}`
}

function cachesAvailable(): boolean {
  return typeof caches !== 'undefined'
}

async function readFromCache(relPath: string): Promise<Uint8Array | null> {
  if (!cachesAvailable()) return null
  const cache = await caches.open(CACHE_NAME)
  const res = await cache.match(cacheKey(relPath))
  if (!res) return null
  return new Uint8Array(await res.arrayBuffer())
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

/** True only when every manifest asset is present in the persistent cache. */
export async function isSupertonicDownloaded(): Promise<boolean> {
  if (!cachesAvailable()) return false
  const cache = await caches.open(CACHE_NAME)
  for (const rel of SUPERTONIC_MANIFEST) {
    if (!(await cache.match(cacheKey(rel)))) return false
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
async function assertQuota(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return
  try {
    const { quota, usage } = await navigator.storage.estimate()
    if (quota != null && usage != null) {
      const free = quota - usage
      // Need the assets plus headroom for the cache write.
      if (free < (SUPERTONIC_SIZE_MB + 30) * 1024 * 1024) {
        throw new SupertonicStorageError(
          `Not enough storage to install the offline voice (~${SUPERTONIC_SIZE_MB} MB needed). Free up space and try again.`,
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
}

/**
 * Download every Supertonic asset into the persistent cache, reporting
 * per-file progress. Files are fetched sequentially to keep memory flat. On a
 * storage failure the partial download is cleared and a friendly error thrown.
 */
export async function downloadSupertonic(
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  if (!cachesAvailable()) {
    throw new SupertonicStorageError(
      'Offline voice storage is not available in this environment.',
    )
  }
  await assertQuota()
  // Free the space held by weights from a previous model generation first.
  await clearLegacyCaches()

  const cache = await caches.open(CACHE_NAME)
  const total = SUPERTONIC_MANIFEST.length
  let done = 0
  onProgress?.({ done, total })

  for (const rel of SUPERTONIC_MANIFEST) {
    const res = await fetch(supertonicRemoteUrl(rel))
    if (!res.ok) {
      throw new Error(`Failed to download ${rel} (${res.status})`)
    }
    try {
      await cache.put(cacheKey(rel), res)
    } catch {
      // Typically QuotaExceededError — clean up the partial install.
      await clearSupertonic()
      throw new SupertonicStorageError(
        `Ran out of storage while installing the offline voice (~${SUPERTONIC_SIZE_MB} MB needed). Free up space and try again.`,
      )
    }
    done += 1
    onProgress?.({ done, total })
  }
}
