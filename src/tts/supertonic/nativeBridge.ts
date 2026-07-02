/**
 * Typed facade over the SupertonicNative Capacitor plugin (Android). The
 * plugin owns model files (downloaded to the app's private storage, not the
 * WebView cache) and full-queue playback in a foreground media service, so
 * read-aloud keeps running with the screen off and inference uses native
 * multithreaded onnxruntime-android instead of single-threaded WASM (the
 * Android WebView has no SharedArrayBuffer, so WASM can never be threaded
 * there).
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export interface NativeDownloadProgress {
  done: number
  total: number
}

export interface SupertonicNativePlugin {
  isAvailable(): Promise<{ available: boolean }>
  isModelReady(): Promise<{ ready: boolean }>
  downloadModels(): Promise<void>
  removeModels(): Promise<void>
  speak(options: {
    chunks: string[]
    voiceId?: string
    rate?: number
    steps?: number
    startIndex?: number
    lang?: string
    title?: string
  }): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  stopPlayback(): Promise<void>
  addListener(
    eventName: 'chunk',
    listener: (data: { index: number }) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'state',
    listener: (data: { playing: boolean }) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'complete',
    listener: () => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'error',
    listener: (data: { message: string }) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'downloadProgress',
    listener: (data: NativeDownloadProgress) => void,
  ): Promise<PluginListenerHandle>
  removeAllListeners(): Promise<void>
}

export const SupertonicNative =
  registerPlugin<SupertonicNativePlugin>('SupertonicNative')

/** True when the native Supertonic pipeline can be used on this platform. */
export function hasNativeSupertonic(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable('SupertonicNative')
  )
}
