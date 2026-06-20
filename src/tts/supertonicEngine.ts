import { getErrorMessage } from '@/lib/result'
import { PcmAudioPlayer } from './audioPlayer'
import {
  type SpeakOptions,
  type TtsEngine,
  type TtsVoice,
  TtsNotAvailableError,
} from './types'
import type { OrtModule, Style, TextToSpeech } from './supertonic/runtime'
import { loadTextToSpeech, loadVoiceStyle } from './supertonic/loaders'
import { type AssetSource, createAssetSource } from './supertonic/assets'

export interface SupertonicConfigOptions {
  /**
   * Asset source for the ONNX models and voice styles. Defaults to a
   * cache-first source (downloaded assets, falling back to bundled
   * `public/supertonic`). Provide a custom source to load from elsewhere.
   */
  source?: AssetSource
  /** Denoising steps: higher = better quality, slower. Supertonic default 8. */
  steps?: number
  /** BCP-47-ish language code understood by Supertonic (e.g. 'en'). */
  lang?: string
  /** CDN serving the matching onnxruntime-web .wasm binaries. */
  wasmPaths?: string
}

const PRESET_VOICES: TtsVoice[] = [
  ...['M1', 'M2', 'M3', 'M4', 'M5'].map((id) => ({
    id,
    name: `Male ${id.slice(1)}`,
    gender: 'male' as const,
  })),
  ...['F1', 'F2', 'F3', 'F4', 'F5'].map((id) => ({
    id,
    name: `Female ${id.slice(1)}`,
    gender: 'female' as const,
  })),
]
const PRESET_IDS = new Set(PRESET_VOICES.map((v) => v.id))

/**
 * On-device neural TTS using Supertonic via onnxruntime-web. Heavy assets are
 * loaded lazily on init(); if they are missing or the runtime can't start, init
 * throws and the TTS controller falls back to the Web Speech engine.
 */
export class SupertonicEngine implements TtsEngine {
  readonly id = 'supertonic'
  readonly name = 'Supertonic (on-device)'
  readonly requiresAssets = true

  private readonly player = new PcmAudioPlayer()
  private readonly styleCache = new Map<string, Style>()
  private ort: OrtModule | null = null
  private tts: TextToSpeech | null = null
  private ready = false
  private cancelled = false

  // Pre-synthesized audio so the next sentence is ready before the current ends
  // (the controller prefetches via prefetch()). ORT sessions can't run two
  // inferences at once, so all synthesis is serialized through `synthQueue`.
  private readonly cache = new Map<string, Float32Array>()
  private readonly pending = new Map<string, Promise<Float32Array>>()
  private synthQueue: Promise<unknown> = Promise.resolve()
  /** Measured synth-time / audio-duration from warm-up (lower is faster). */
  private rtf = 0

  private readonly source: AssetSource
  private steps: number
  private readonly lang: string
  private readonly wasmPaths: string | undefined

  constructor(options: SupertonicConfigOptions = {}) {
    this.source = options.source ?? createAssetSource()
    this.steps = options.steps ?? 8
    this.lang = options.lang ?? 'en'
    // Default to the locally-hosted runtime (see below). An explicit override
    // still wins (used by tests).
    this.wasmPaths = options.wasmPaths
  }

  async init(): Promise<void> {
    if (this.ready) return
    try {
      // Import the WASM-ONLY build. The default 'onnxruntime-web' build is the
      // JSEP (WebGPU/WebNN) one, which dynamically imports
      // ort-wasm-simd-threaded.jsep.mjs — a file we don't host, so it 404s in
      // the WebView ("no available backend"). The '/wasm' build references the
      // plain ort-wasm-simd-threaded.{mjs,wasm} that the Vite plugin serves.
      const ort = (await import('onnxruntime-web/wasm')) as unknown as OrtModule
      // Load the wasm runtime from the app itself (served at /ort/ by the
      // onnxruntimeWasm Vite plugin). Supertonic is an on-device, fully-offline
      // voice; fetching its runtime from a CDN broke offline use and failed
      // inside the native WebView.
      const base = import.meta.env.BASE_URL || '/'
      ort.env.wasm.wasmPaths = this.wasmPaths ?? `${base}ort/`
      // Run onnxruntime inline on the calling thread: single thread, no proxy.
      // This Android WebView fails to spawn ORT's worker (threaded OR proxy)
      // with "[wasm] [object Event]", and once the wasm backend fails to init
      // it stays poisoned, so any worker-based config takes the whole engine
      // down rather than degrading. Inline is the only config proven to work
      // here. Off-main-thread execution is pursued separately (a dedicated
      // worker we control), gated on confirming this WebView can run workers.
      const isolated =
        typeof SharedArrayBuffer !== 'undefined' &&
        (typeof crossOriginIsolated === 'undefined' || crossOriginIsolated)
      const cores =
        typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 1 : 1
      ort.env.wasm.numThreads = 1
      ort.env.wasm.proxy = false
      this.ort = ort

      // One-time diagnostic so on-device debugging (chrome://inspect) can see
      // whether the document actually became cross-origin isolated.
      console.info(
        '[supertonic] init',
        JSON.stringify({
          crossOriginIsolated:
            typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : 'n/a',
          sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
          isolated,
          cores,
          numThreads: ort.env.wasm.numThreads,
          proxy: ort.env.wasm.proxy,
        }),
      )

      const { tts } = await loadTextToSpeech(ort, this.source, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      })
      this.tts = tts
      await this.warmUp()
      this.ready = true
    } catch (error) {
      throw new TtsNotAvailableError(this.id, getErrorMessage(error))
    }
  }

  /**
   * Compile the wasm kernels (the first inference is otherwise many times
   * slower) and measure this device's realtime factor, dropping denoising steps
   * if it can't synthesize faster than playback. This is the "can the device
   * handle the model?" check — it adapts quality instead of stuttering.
   */
  private async warmUp(): Promise<void> {
    if (!this.tts) return
    try {
      const style = await this.getStyle('M1')
      // First call compiles kernels — discard its timing.
      await this.tts.call('Hello.', this.lang, style, this.steps, 1)
      const t0 = performance.now()
      const { wav, duration } = await this.tts.call(
        'Hello there, this is a test.',
        this.lang,
        style,
        this.steps,
        1,
      )
      const ms = performance.now() - t0
      const audioSec = duration[0] || wav.length / this.tts.sampleRate
      this.rtf = audioSec > 0 ? ms / 1000 / audioSec : 0
      // Slower than ~0.85x realtime means even prefetching can't fully hide the
      // lag, so trade some quality for speed.
      if (this.rtf >= 0.85 && this.steps > 4) this.steps = 4
    } catch {
      // Warm-up is best-effort.
    }
  }

  /** Measured realtime factor (synth time / audio length); 0 until warmed. */
  getRealtimeFactor(): number {
    return this.rtf
  }

  isReady(): boolean {
    return this.ready
  }

  async listVoices(): Promise<TtsVoice[]> {
    return PRESET_VOICES
  }

  async speak(text: string, options: SpeakOptions): Promise<void> {
    if (!this.tts) throw new TtsNotAvailableError(this.id, 'not initialized')
    this.cancelled = false
    const samples = await this.synthesize(text, options)
    if (this.cancelled) return
    await this.player.play(samples, this.tts.sampleRate)
  }

  prefetch(text: string, options: SpeakOptions): void {
    if (!this.tts) return
    // Fire-and-forget: warm the cache for the next sentence while this one plays.
    void this.synthesize(text, options).catch(() => undefined)
  }

  stop(): void {
    this.cancelled = true
    this.player.stop()
  }

  dispose(): void {
    this.stop()
    this.player.dispose()
    this.styleCache.clear()
    this.cache.clear()
    this.pending.clear()
    this.tts = null
    this.ready = false
  }

  /** Synthesize (or return cached) PCM for a chunk, serialized through the
   *  queue so ORT never runs two inferences concurrently. */
  private synthesize(text: string, options: SpeakOptions): Promise<Float32Array> {
    const voiceId =
      options.voiceId && PRESET_IDS.has(options.voiceId) ? options.voiceId : 'M1'
    const key = `${voiceId}|${options.rate}|${this.steps}|${text}`
    const cached = this.cache.get(key)
    if (cached) return Promise.resolve(cached)
    const inflight = this.pending.get(key)
    if (inflight) return inflight

    const job = this.enqueue(async () => {
      if (!this.tts) throw new TtsNotAvailableError(this.id, 'not initialized')
      const style = await this.getStyle(voiceId)
      const { wav, duration } = await this.tts.call(
        text,
        this.lang,
        style,
        this.steps,
        options.rate,
      )
      const length = Math.floor(this.tts.sampleRate * duration[0])
      const samples = Float32Array.from(wav.slice(0, length))
      this.store(key, samples)
      return samples
    })
    this.pending.set(key, job)
    void job.finally(() => this.pending.delete(key))
    return job
  }

  /** Serialize work so only one ORT inference runs at a time. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.synthQueue.then(fn, fn)
    this.synthQueue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  /** Cache a synthesized chunk, capping memory by evicting the oldest. */
  private store(key: string, samples: Float32Array): void {
    this.cache.set(key, samples)
    while (this.cache.size > 6) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) break
      this.cache.delete(oldest)
    }
  }

  private async getStyle(voiceId: string): Promise<Style> {
    const cached = this.styleCache.get(voiceId)
    if (cached) return cached
    if (!this.ort) throw new TtsNotAvailableError(this.id, 'not initialized')
    const style = await loadVoiceStyle(this.ort, this.source, voiceId)
    this.styleCache.set(voiceId, style)
    return style
  }
}
