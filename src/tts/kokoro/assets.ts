/**
 * Kokoro on-device voice assets: manifest, persistent download, and a
 * cache-first asset source the engine reads through. Mirrors
 * ../supertonic/assets.ts, adapted for a manifest whose files live at two
 * different origins (the ONNX model + voice packs on HuggingFace, the
 * English G2P dictionaries on GitHub) instead of one shared base URL.
 *
 * Delivery is download-on-demand, same as Supertonic: fetched once and
 * stored in the Cache Storage API, which persists across launches on both
 * the web (PWA) and inside the native Capacitor WebView. Until the assets
 * are present the reader falls back to another engine automatically.
 */
import {
  downloadFileChunked,
  isFileComplete,
  readChunked,
} from '../supertonic/chunkedCache'
import { PRESET_VOICES } from './presetVoices'

/**
 * fp16 weights: comparable download size to Supertonic, and a published
 * benchmark found 8-bit dynamic quantization *slower* than fp16 in WASM, so
 * there is no clear speed reason to reach for a smaller quantization here.
 */
const MODEL_FILE = 'model_fp16.onnx'

const HF_BASE = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main'
/** Pinned to a specific commit: the lexicons are static linguistic data, not
 *  a moving target, and pinning keeps a resumed download and the installed
 *  version marker consistent with each other. */
const MISAKI_BASE =
  'https://raw.githubusercontent.com/hexgrad/misaki/fba1236595f2d2bf21d414ba6e57d25256afada3/misaki/data'

interface ManifestEntry {
  /** Path this asset is stored/read under, relative to the Kokoro asset root. */
  rel: string
  url: string
}

/** Relative path of the ONNX model within the asset root, for loaders.ts. */
export const KOKORO_MODEL_REL = `onnx/${MODEL_FILE}`

const MODEL_ENTRIES: ManifestEntry[] = [{ rel: KOKORO_MODEL_REL, url: `${HF_BASE}/${KOKORO_MODEL_REL}` }]
const VOICE_ENTRIES: ManifestEntry[] = PRESET_VOICES.map((v) => ({
  rel: `voices/${v.id}.bin`,
  url: `${HF_BASE}/voices/${v.id}.bin`,
}))
const LEXICON_ENTRIES: ManifestEntry[] = [
  { rel: 'lexicon/us_gold.json', url: `${MISAKI_BASE}/us_gold.json` },
  { rel: 'lexicon/us_silver.json', url: `${MISAKI_BASE}/us_silver.json` },
]

const MANIFEST: readonly ManifestEntry[] = [
  ...MODEL_ENTRIES,
  ...VOICE_ENTRIES,
  ...LEXICON_ENTRIES,
]

export const KOKORO_MANIFEST: readonly string[] = MANIFEST.map((e) => e.rel)

/** Approximate total download size, shown to the user before downloading. */
export const KOKORO_SIZE_MB = 175

const CACHE_NAME = 'lumen-kokoro-v1'

/** Bundled fallback (dev: scripts/fetch-kokoro.sh drops assets here). */
const PUBLIC_BASE = `${import.meta.env.BASE_URL ?? '/'}kokoro`

/** Raised for storage problems so the UI can show a friendly, actionable message. */
export class KokoroStorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KokoroStorageError'
  }
}

export interface AssetSource {
  readBytes(relPath: string): Promise<Uint8Array>
  readJson<T>(relPath: string): Promise<T>
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
 * falls back to assets bundled under `public/kokoro`.
 */
export function createAssetSource(): AssetSource {
  const readBytes = async (relPath: string): Promise<Uint8Array> => {
    const cached = await readFromCache(relPath)
    if (cached) return cached
    const res = await fetch(`${PUBLIC_BASE}/${relPath}`)
    if (!res.ok) {
      throw new Error(`Kokoro asset not available: ${relPath} (${res.status})`)
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
export async function isKokoroDownloaded(): Promise<boolean> {
  if (!cachesAvailable()) return false
  const cache = await caches.open(CACHE_NAME)
  for (const rel of KOKORO_MANIFEST) {
    if (!(await isFileComplete(cache, rel))) return false
  }
  return true
}

/** Remove all downloaded Kokoro assets. */
export async function clearKokoro(): Promise<void> {
  if (!cachesAvailable()) return
  await caches.delete(CACHE_NAME)
}

/** Best-effort storage pre-check so we fail early with a clear message. */
async function assertQuota(neededBytes: number): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return
  try {
    const { quota, usage } = await navigator.storage.estimate()
    if (quota != null && usage != null) {
      const free = quota - usage
      if (free < neededBytes + 30 * 1024 * 1024) {
        throw new KokoroStorageError(
          `Not enough storage to install the offline voice (~${Math.round(neededBytes / 1024 / 1024)} MB needed). Free up space and try again.`,
        )
      }
    }
  } catch (e) {
    if (e instanceof KokoroStorageError) throw e
    /* estimate unsupported — proceed and rely on the write-time guard */
  }
}

export interface DownloadProgress {
  done: number
  total: number
  unit?: 'bytes' | 'files'
}

/** Ask the server how big each asset is, for byte-accurate progress and quota checks. */
async function fetchAssetSizes(): Promise<Map<string, number | null>> {
  const entries = await Promise.all(
    MANIFEST.map(async ({ rel, url }) => {
      try {
        const res = await fetch(url, { method: 'HEAD' })
        if (!res.ok) throw new Error(`Failed to reach ${rel} (${res.status})`)
        const header = res.headers.get('content-length')
        const length = header == null ? NaN : Number(header)
        return [rel, Number.isFinite(length) && length > 0 ? length : null] as const
      } catch {
        return [rel, null] as const
      }
    }),
  )
  return new Map(entries)
}

/**
 * Download every Kokoro asset into the persistent cache, reporting
 * byte-accurate progress. See ../supertonic/assets.ts for why this goes
 * through chunked Range requests rather than one large fetch per file.
 */
export async function downloadKokoro(
  onProgress?: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!cachesAvailable()) {
    throw new KokoroStorageError(
      'Offline voice storage is not available in this environment.',
    )
  }

  const sizes = await fetchAssetSizes()
  let total = [...sizes.values()].reduce((sum: number, n) => sum + (n ?? 0), 0)
  await assertQuota(total)

  const cache = await caches.open(CACHE_NAME)
  let done = 0
  onProgress?.({ done, total, unit: 'bytes' })

  for (const { rel, url } of MANIFEST) {
    const knownSize = sizes.get(rel) ?? null
    try {
      await downloadFileChunked({
        store: cache,
        rel,
        url,
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
        await clearKokoro()
        throw new KokoroStorageError(
          `Ran out of storage while installing the offline voice (~${Math.round(total / 1024 / 1024)} MB needed). Free up space and try again.`,
        )
      }
      throw e
    }
  }
}

function isQuotaExceeded(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.code === 22)
  )
}
