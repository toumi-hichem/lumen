export interface TtsVoice {
  id: string
  name: string
  lang?: string
  gender?: 'male' | 'female'
}

export interface SpeakOptions {
  /** Rate multiplier, 1 = normal. */
  rate: number
  /** Pitch multiplier, 1 = normal (ignored by engines without pitch control). */
  pitch: number
  voiceId?: string
  /** Shown in a native playback notification, if the engine has one. */
  title?: string
  /** Notification cover art (a data: URL); ignored by engines without one. */
  coverUrl?: string
}

/**
 * A pluggable text-to-speech engine. Implementations: WebSpeechEngine (built
 * into every browser/WebView, the safe default) and SupertonicEngine
 * (on-device neural TTS via onnxruntime-web). New engines (cloud, native
 * platform TTS, other neural models) implement this interface and register in
 * the registry — nothing else in the app changes.
 */
export interface TtsEngine {
  readonly id: string
  readonly name: string
  /** True if the engine needs model/voice assets downloaded before use. */
  readonly requiresAssets: boolean

  /** Load voices / models. Safe to call more than once. */
  init(): Promise<void>
  isReady(): boolean
  listVoices(): Promise<TtsVoice[]>

  /**
   * Speak a single text chunk. Resolves when playback finishes naturally.
   * Calling stop() must cause an in-flight speak() to resolve promptly so the
   * orchestrating controller can exit its loop cleanly.
   */
  speak(text: string, options: SpeakOptions): Promise<void>

  /** Cancel current and queued speech. */
  stop(): void

  /**
   * Optional: pre-synthesize a chunk so the next speak() of the same text is
   * instant. Lets the controller render the next sentence while the current one
   * plays, hiding synthesis latency. Engines that synthesize and play in one
   * step (system/native voices) omit it. Best-effort; errors are swallowed.
   */
  prefetch?(text: string, options: SpeakOptions): void

  /**
   * Optional: engines that own full-queue playback (a native service that
   * keeps synthesizing and playing while the WebView is suspended, e.g. with
   * the screen off). When present the controller hands over the whole chunk
   * list and mirrors progress from `events` instead of driving chunk by
   * chunk from JS. Resolves once the queue has been accepted and started;
   * completion is signalled via `events.onComplete`.
   */
  playQueue?(
    chunks: string[],
    options: SpeakOptions,
    startIndex: number,
    events: TtsQueueEvents,
  ): Promise<void>
  /** Pause queue playback (only with playQueue). */
  pauseQueue?(): Promise<void> | void
  /** Resume queue playback (only with playQueue). */
  resumeQueue?(): Promise<void> | void

  /** Release resources (audio context, ORT session). */
  dispose(): void

  /**
   * Optional: set by the controller to receive progress notices (model
   * loading/ready with timing, per-chunk synthesis start). Engines without
   * observable phases never call it.
   */
  onNotice?: (notice: TtsEngineNotice) => void
}

/** Progress signals surfaced to the UI ("is the TTS doing anything?"). */
export type TtsEngineNotice =
  | { type: 'model-loading' }
  | { type: 'model-ready'; elapsedMs: number }
  | { type: 'synthesizing'; index: number }
  /** Chapter skip requested from a native control (notification, headset,
   *  Android Auto) that the engine can't act on itself. */
  | { type: 'skip'; direction: 'next' | 'prev' }

/** Progress callbacks for engines that own full-queue playback natively. */
export interface TtsQueueEvents {
  onChunk: (index: number) => void
  onComplete: () => void
  onError: (message: string) => void
  /**
   * Playback was paused/resumed by something other than the controller's own
   * pauseQueue()/resumeQueue() — a tap on the native notification, a headset
   * button, or the OS reclaiming audio focus. Lets the controller reconcile
   * its status instead of drifting out of sync with what's actually playing.
   */
  onExternalStateChange?: (playing: boolean) => void
}

export interface TtsEngineDescriptor {
  id: string
  name: string
  requiresAssets: boolean
  /** True only if the runtime can actually use it (e.g. WebGPU/WASM present). */
  available: boolean
  /**
   * Resolves true when the engine's downloadable assets are present. Absent for
   * engines that need none. `requiresAssets` says the engine *can* need a
   * download; this says whether that download has happened.
   */
  assetsReady?: () => Promise<boolean>
}

export class TtsNotAvailableError extends Error {
  constructor(engineId: string, reason: string) {
    super(`Voice reading is not supported on this device (${engineId}: ${reason})`)
    this.name = 'TtsNotAvailableError'
  }
}
