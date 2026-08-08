import type { PluginListenerHandle } from '@capacitor/core'
import { getErrorMessage } from '@/lib/result'
import {
  type SpeakOptions,
  type TtsEngine,
  type TtsEngineNotice,
  type TtsQueueEvents,
  type TtsVoice,
  TtsNotAvailableError,
} from './types'
import { hasNativeKokoro, KokoroNative } from './kokoro/nativeBridge'
import { PRESET_VOICES, presetVoiceId } from './kokoro/presetVoices'

/**
 * Kokoro through the native Android pipeline: inference and playback run in
 * a foreground media service (onnxruntime-android, AudioTrack,
 * MediaSession), the same shape as SupertonicNativeEngine. Implements
 * playQueue, so the TTS controller hands over the whole chunk list instead
 * of driving chunk by chunk from suspendable JS.
 */
export class KokoroNativeEngine implements TtsEngine {
  readonly id = 'kokoro'
  readonly name = 'Kokoro (on-device)'
  readonly requiresAssets = true

  private ready = false
  private listeners: PluginListenerHandle[] = []
  private queueEvents: TtsQueueEvents | null = null
  /** Settles the promise returned by a single-chunk speak(). */
  private pendingSpeak: (() => void) | null = null
  onNotice?: (notice: TtsEngineNotice) => void

  async init(): Promise<void> {
    if (this.ready) return
    if (!hasNativeKokoro()) {
      throw new TtsNotAvailableError(this.id, 'native plugin unavailable')
    }
    try {
      const { ready } = await KokoroNative.isModelReady()
      if (!ready) {
        throw new Error('Kokoro voice is not downloaded. Install it from Settings.')
      }
      await this.attachListeners()
      this.ready = true
    } catch (error) {
      throw new TtsNotAvailableError(this.id, getErrorMessage(error))
    }
  }

  isReady(): boolean {
    return this.ready
  }

  async listVoices(): Promise<TtsVoice[]> {
    return PRESET_VOICES
  }

  /**
   * Single-chunk speak, used by previews. Queue playback (the reader) goes
   * through playQueue. The plugin call only *starts* the playback service, so
   * the promise is held open until the service reports completion — see
   * SupertonicNativeEngine.speak for the same race-window rationale.
   */
  async speak(text: string, options: SpeakOptions): Promise<void> {
    this.settlePendingSpeak()
    let settle!: () => void
    const done = new Promise<void>((resolve) => {
      settle = resolve
    })
    this.pendingSpeak = settle
    try {
      await KokoroNative.speak({
        chunks: [text],
        voiceId: presetVoiceId(options.voiceId),
        rate: options.rate,
      })
    } catch (error) {
      if (this.pendingSpeak === settle) this.pendingSpeak = null
      settle()
      throw error
    }
    await done
  }

  async playQueue(
    chunks: string[],
    options: SpeakOptions,
    startIndex: number,
    events: TtsQueueEvents,
  ): Promise<void> {
    this.settlePendingSpeak()
    this.queueEvents = events
    await KokoroNative.speak({
      chunks,
      voiceId: presetVoiceId(options.voiceId),
      rate: options.rate,
      startIndex,
      title: options.title ?? 'Reading aloud',
      cover: options.coverUrl,
    })
  }

  pauseQueue(): Promise<void> {
    return KokoroNative.pause()
  }

  resumeQueue(): Promise<void> {
    return KokoroNative.resume()
  }

  stop(): void {
    void KokoroNative.stopPlayback()
    this.settlePendingSpeak()
  }

  dispose(): void {
    this.stop()
    this.queueEvents = null
    for (const handle of this.listeners) void handle.remove()
    this.listeners = []
    this.ready = false
  }

  private settlePendingSpeak(): void {
    const resolve = this.pendingSpeak
    this.pendingSpeak = null
    resolve?.()
  }

  private async attachListeners(): Promise<void> {
    this.listeners = await Promise.all([
      KokoroNative.addListener('chunk', ({ index }) => {
        this.queueEvents?.onChunk(index)
      }),
      KokoroNative.addListener('complete', () => {
        this.settlePendingSpeak()
        this.queueEvents?.onComplete()
      }),
      KokoroNative.addListener('error', ({ message }) => {
        this.settlePendingSpeak()
        this.queueEvents?.onError(message)
      }),
      KokoroNative.addListener('modelState', ({ state, elapsedMs }) => {
        this.onNotice?.(
          state === 'loading'
            ? { type: 'model-loading' }
            : { type: 'model-ready', elapsedMs: elapsedMs ?? 0 },
        )
      }),
      KokoroNative.addListener('synthesizing', ({ index }) => {
        this.onNotice?.({ type: 'synthesizing', index })
      }),
      KokoroNative.addListener('state', ({ playing }) => {
        this.queueEvents?.onExternalStateChange?.(playing)
      }),
      KokoroNative.addListener('skip', ({ direction }) => {
        this.onNotice?.({ type: 'skip', direction })
      }),
    ])
  }
}
