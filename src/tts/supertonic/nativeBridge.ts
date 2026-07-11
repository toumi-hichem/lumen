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

/**
 * Detected CPU layout and the inference strategy the native side derived
 * from it. Read-only for the web layer: the device tunes itself, this is
 * surfaced for the settings UI and debugging.
 */
export interface NativeCpuTopology {
  totalCores: number
  /** Core clusters grouped by max frequency, fastest first (0 = unknown). */
  clusters: { cores: number; maxFreqKhz: number }[]
  /** ORT intra-op threads the runtime will use. */
  threads: number
  /** Denoising steps synthesis starts at (RTF adaptation moves it live). */
  initialSteps: number
  source: 'sysfs' | 'override' | 'fallback'
  /** Human-readable one-liner, e.g. "sysfs 2x2600MHz+6x2000MHz". */
  summary: string
}

export interface SupertonicNativePlugin {
  isAvailable(): Promise<{ available: boolean }>
  isModelReady(): Promise<{ ready: boolean }>
  getCpuTopology(): Promise<NativeCpuTopology>
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
  addListener(
    eventName: 'modelState',
    listener: (data: { state: 'loading' | 'ready'; elapsedMs?: number }) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'synthesizing',
    listener: (data: { index: number }) => void,
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
