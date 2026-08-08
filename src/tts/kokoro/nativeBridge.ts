/**
 * Typed facade over the KokoroNative Capacitor plugin (Android). Mirrors
 * ../supertonic/nativeBridge.ts — same plugin method surface, same
 * foreground-service ownership of models and full-queue playback — just
 * pointed at a separate native plugin and model store so the two on-device
 * engines can be installed independently.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export interface NativeDownloadProgress {
  done: number
  total: number
}

/**
 * Detected CPU layout and the inference strategy the native side derived
 * from it. Read-only for the web layer, surfaced for the settings UI and
 * debugging. Same shape as Supertonic's (both wrap the same generic
 * CpuTopology.java), Kokoro just has no denoising-steps quality knob so
 * `initialSteps` doesn't apply here.
 */
export interface NativeCpuTopology {
  totalCores: number
  clusters: { cores: number; maxFreqKhz: number }[]
  threads: number
  source: 'sysfs' | 'override' | 'fallback'
  summary: string
}

export interface KokoroNativePlugin {
  isAvailable(): Promise<{ available: boolean }>
  isModelReady(): Promise<{ ready: boolean }>
  getCpuTopology(): Promise<NativeCpuTopology>
  downloadModels(): Promise<void>
  removeModels(): Promise<void>
  speak(options: {
    chunks: string[]
    voiceId?: string
    rate?: number
    startIndex?: number
    title?: string
    /** Notification large-icon art, a data: URL. */
    cover?: string
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
  addListener(
    eventName: 'skip',
    listener: (data: { direction: 'next' | 'prev' }) => void,
  ): Promise<PluginListenerHandle>
  removeAllListeners(): Promise<void>
}

export const KokoroNative = registerPlugin<KokoroNativePlugin>('KokoroNative')

/** True when the native Kokoro pipeline can be used on this platform. */
export function hasNativeKokoro(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('KokoroNative')
}
