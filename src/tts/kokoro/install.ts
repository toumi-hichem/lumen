/**
 * Platform-routing facade for installing the Kokoro voice. Mirrors
 * ../supertonic/install.ts.
 */
import {
  clearKokoro,
  downloadKokoro,
  isKokoroDownloaded,
  type DownloadProgress,
} from './assets'
import { hasNativeKokoro, KokoroNative } from './nativeBridge'

export type { DownloadProgress } from './assets'

export async function isKokoroInstalled(): Promise<boolean> {
  if (hasNativeKokoro()) {
    try {
      const { ready } = await KokoroNative.isModelReady()
      return ready
    } catch {
      return false
    }
  }
  return isKokoroDownloaded()
}

export async function installKokoro(
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  if (hasNativeKokoro()) {
    const handle = onProgress
      ? await KokoroNative.addListener('downloadProgress', onProgress)
      : null
    try {
      await KokoroNative.downloadModels()
    } finally {
      if (handle) void handle.remove()
    }
    return
  }
  await downloadKokoro(onProgress)
}

export async function removeKokoro(): Promise<void> {
  if (hasNativeKokoro()) {
    await KokoroNative.removeModels()
    return
  }
  await clearKokoro()
}
