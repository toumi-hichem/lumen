/**
 * Platform-routing facade for installing the Supertonic voice. On Android the
 * native plugin downloads models into app-private storage (where the
 * foreground TTS service reads them); on the web they go into Cache Storage
 * for the WASM engine. Callers (Settings, startup engine pick) never need to
 * know which one is in play.
 */
import {
  clearSupertonic,
  downloadSupertonic,
  isSupertonicDownloaded,
  type DownloadProgress,
} from './assets'
import { hasNativeSupertonic, SupertonicNative } from './nativeBridge'

export type { DownloadProgress } from './assets'

export async function isSupertonicInstalled(): Promise<boolean> {
  if (hasNativeSupertonic()) {
    try {
      const { ready } = await SupertonicNative.isModelReady()
      return ready
    } catch {
      return false
    }
  }
  return isSupertonicDownloaded()
}

export async function installSupertonic(
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  if (hasNativeSupertonic()) {
    const handle = onProgress
      ? await SupertonicNative.addListener('downloadProgress', onProgress)
      : null
    try {
      await SupertonicNative.downloadModels()
    } finally {
      if (handle) void handle.remove()
    }
    return
  }
  await downloadSupertonic(onProgress)
}

export async function removeSupertonic(): Promise<void> {
  if (hasNativeSupertonic()) {
    await SupertonicNative.removeModels()
    return
  }
  await clearSupertonic()
}
