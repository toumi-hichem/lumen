/**
 * Environment-agnostic Supertonic synthesis core. Runs identically inside the
 * dedicated TTS worker (the normal path, keeping inference off the main
 * thread) and inline on the main thread (fallback for WebViews that cannot
 * run module workers). Owns the ORT runtime config, session loading, warm-up
 * calibration, per-voice style cache and cancellation.
 */
import {
  isSynthesisCancelled,
  type OrtModule,
  type Style,
  type TextToSpeech,
} from './runtime'
import { loadTextToSpeech, loadVoiceStyle } from './loaders'
import { type AssetSource, createAssetSource } from './assets'

export interface SynthesizerOptions {
  /** Denoising steps: higher = better quality, slower. Supertonic default 8. */
  steps?: number
  /** Language code understood by Supertonic (e.g. 'en'). */
  lang?: string
  /** Base URL serving the matching onnxruntime-web .wasm binaries. */
  wasmPaths?: string
  /** Asset source override (tests). Defaults to the cache-first source. */
  source?: AssetSource
}

export interface SynthesizerInfo {
  /** Measured synth-time / audio-duration from warm-up (lower is faster). */
  rtf: number
  /** Effective denoising steps after the warm-up speed adaptation. */
  steps: number
  sampleRate: number
  /** WASM threads in use (1 unless the scope is cross-origin isolated). */
  threads: number
}

export interface SynthesisResult {
  samples: Float32Array
  sampleRate: number
}

export class SupertonicSynthesizer {
  private ort: OrtModule | null = null
  private tts: TextToSpeech | null = null
  private readonly styleCache = new Map<string, Style>()
  private steps = 8
  private lang = 'en'
  private rtf = 0
  private source: AssetSource | null = null
  /** Bumped by cancelPending(); in-flight syntheses poll it between steps. */
  private generation = 0

  async init(options: SynthesizerOptions = {}): Promise<SynthesizerInfo> {
    this.steps = options.steps ?? 8
    this.lang = options.lang ?? 'en'
    const source = options.source ?? createAssetSource()
    this.source = source

    // Import the WASM-ONLY build. The default 'onnxruntime-web' build is the
    // JSEP (WebGPU/WebNN) one, which dynamically imports
    // ort-wasm-simd-threaded.jsep.mjs, a file we don't host, so it 404s in
    // the WebView ("no available backend"). The '/wasm' build references the
    // plain ort-wasm-simd-threaded.{mjs,wasm} that the Vite plugin serves.
    const ort = (await import('onnxruntime-web/wasm')) as unknown as OrtModule
    const base = import.meta.env.BASE_URL || '/'
    ort.env.wasm.wasmPaths = options.wasmPaths ?? `${base}ort/`

    // Multi-threaded WASM needs SharedArrayBuffer, i.e. a cross-origin
    // isolated scope (workers inherit the document's isolation). Without it,
    // stay single-threaded so ORT never tries to spawn pthread workers, which
    // is exactly the config that poisoned the backend on the Android WebView.
    // ORT's own proxy worker stays off in all cases; off-main-thread execution
    // comes from hosting this whole synthesizer in a worker we control.
    const isolated =
      typeof crossOriginIsolated !== 'undefined' &&
      crossOriginIsolated &&
      typeof SharedArrayBuffer !== 'undefined'
    const cores =
      typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 1 : 1
    const threads = isolated ? Math.min(Math.max(cores - 1, 1), 4) : 1
    ort.env.wasm.numThreads = threads
    ort.env.wasm.proxy = false
    this.ort = ort

    // One-time diagnostic so on-device debugging (chrome://inspect) can see
    // the effective execution config.
    console.info(
      '[supertonic] synthesizer init',
      JSON.stringify({
        scope: typeof window === 'undefined' ? 'worker' : 'main',
        crossOriginIsolated:
          typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : 'n/a',
        threads,
        cores,
      }),
    )

    const { tts } = await loadTextToSpeech(ort, source, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    })
    this.tts = tts
    await this.warmUp()
    return {
      rtf: this.rtf,
      steps: this.steps,
      sampleRate: tts.sampleRate,
      threads,
    }
  }

  isReady(): boolean {
    return this.tts !== null
  }

  getInfo(): Pick<SynthesizerInfo, 'rtf' | 'steps'> {
    return { rtf: this.rtf, steps: this.steps }
  }

  /**
   * Interrupt the currently running synthesis at its next step boundary.
   * Later synthesize() calls run normally (a queued prefetch completing after
   * a stop is harmless: it lands in the engine cache and speeds up resume).
   */
  cancelPending(): void {
    this.generation += 1
  }

  async synthesize(
    text: string,
    voiceId: string,
    rate: number,
  ): Promise<SynthesisResult> {
    if (!this.tts) throw new Error('Synthesizer not initialized')
    const gen = this.generation
    const shouldCancel = () => this.generation !== gen
    const style = await this.getStyle(voiceId)
    const { wav, duration } = await this.tts.call(
      text,
      this.lang,
      style,
      this.steps,
      rate,
      shouldCancel,
    )
    const length = Math.min(
      wav.length,
      Math.floor(this.tts.sampleRate * duration[0]),
    )
    // slice (not subarray) so we never pin the full vocoder buffer in caches.
    return { samples: wav.slice(0, length), sampleRate: this.tts.sampleRate }
  }

  dispose(): void {
    this.cancelPending()
    this.styleCache.clear()
    this.tts = null
    this.ort = null
  }

  /**
   * Compile the wasm kernels (the first inference is otherwise many times
   * slower) and measure this device's realtime factor, dropping denoising
   * steps if it can't synthesize faster than playback. This is the "can the
   * device handle the model?" check: it adapts quality instead of stuttering.
   */
  private async warmUp(): Promise<void> {
    if (!this.tts) return
    try {
      const style = await this.getStyle('M1')
      // First call compiles kernels; discard its timing.
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
      // Slower than ~0.85x realtime means even prefetching can't fully hide
      // the lag, so trade some quality for speed.
      if (this.rtf >= 0.85 && this.steps > 4) this.steps = 4
    } catch (error) {
      // Warm-up is best-effort, but a cancel raced against init should not be
      // swallowed into a wrong rtf.
      if (isSynthesisCancelled(error)) throw error
    }
  }

  private async getStyle(voiceId: string): Promise<Style> {
    const cached = this.styleCache.get(voiceId)
    if (cached) return cached
    if (!this.ort || !this.source) throw new Error('Synthesizer not initialized')
    const style = await loadVoiceStyle(this.ort, this.source, voiceId)
    this.styleCache.set(voiceId, style)
    return style
  }
}
