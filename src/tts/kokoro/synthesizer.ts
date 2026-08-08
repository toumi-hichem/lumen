/**
 * Environment-agnostic Kokoro synthesis core. Runs identically inside the
 * dedicated TTS worker (the normal path) and inline on the main thread
 * (fallback for WebViews that cannot run module workers). Mirrors
 * ../supertonic/synthesizer.ts; the main difference is Kokoro has no
 * denoising-steps quality knob to adapt, so warm-up here only measures RTF
 * for diagnostics.
 */
import { isSynthesisCancelled, KokoroModel, type OrtModule } from './runtime'
import { loadKokoroSession, loadLexicons, loadVoiceBank } from './loaders'
import { type AssetSource, createAssetSource } from './assets'
import { DEFAULT_PRESET_ID } from './presetVoices'

export interface SynthesizerOptions {
  /** Asset source override (tests only). Defaults to the cache-first source. */
  source?: AssetSource
}

export interface SynthesizerInfo {
  /** Measured synth-time / audio-duration from warm-up (lower is faster). */
  rtf: number
  sampleRate: number
  /** WASM threads in use (1 unless the scope is cross-origin isolated). */
  threads: number
}

export interface SynthesisResult {
  samples: Float32Array
  sampleRate: number
}

export class KokoroSynthesizer {
  private model: KokoroModel | null = null
  private readonly bankCache = new Map<string, Float32Array>()
  private rtf = 0
  private source: AssetSource | null = null
  /** Bumped by cancelPending(); in-flight syntheses poll it between steps. */
  private generation = 0

  async init(options: SynthesizerOptions = {}): Promise<SynthesizerInfo> {
    const source = options.source ?? createAssetSource()
    this.source = source

    // Same WASM-only build and single-threaded-unless-isolated policy as
    // Supertonic's synthesizer — see ../supertonic/synthesizer.ts for why.
    const ort = (await import('onnxruntime-web/wasm')) as unknown as OrtModule
    const base = import.meta.env.BASE_URL || '/'
    ort.env.wasm.wasmPaths = `${base}ort/`

    const isolated =
      typeof crossOriginIsolated !== 'undefined' &&
      crossOriginIsolated &&
      typeof SharedArrayBuffer !== 'undefined'
    const cores =
      typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 1 : 1
    const threads = isolated ? Math.min(Math.max(cores - 1, 1), 4) : 1
    ort.env.wasm.numThreads = threads
    ort.env.wasm.proxy = false

    const [session, lexicons] = await Promise.all([
      loadKokoroSession(ort, source, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      }),
      loadLexicons(source),
    ])
    this.model = new KokoroModel(ort, session, lexicons)
    await this.warmUp()
    return { rtf: this.rtf, sampleRate: this.model.sampleRate, threads }
  }

  isReady(): boolean {
    return this.model !== null
  }

  getRealtimeFactor(): number {
    return this.rtf
  }

  /** Interrupt the currently running synthesis at its next cancellation checkpoint. */
  cancelPending(): void {
    this.generation += 1
  }

  async synthesize(
    text: string,
    voiceId: string,
    rate: number,
  ): Promise<SynthesisResult> {
    if (!this.model) throw new Error('Synthesizer not initialized')
    const gen = this.generation
    const shouldCancel = () => this.generation !== gen
    const bank = await this.getVoiceBank(voiceId)
    const { wav } = await this.model.call(text, bank, rate, shouldCancel)
    return { samples: wav, sampleRate: this.model.sampleRate }
  }

  dispose(): void {
    this.cancelPending()
    this.bankCache.clear()
    this.model = null
  }

  /**
   * Compile the wasm kernels (the first inference is otherwise many times
   * slower) and measure this device's realtime factor. Kokoro has no
   * steps/quality knob, so unlike Supertonic this is diagnostic only — the
   * measurement is still useful for future tuning (e.g. picking a smaller
   * quantization on slow devices).
   */
  private async warmUp(): Promise<void> {
    if (!this.model) return
    try {
      const bank = await this.getVoiceBank(DEFAULT_PRESET_ID)
      // First call compiles kernels; discard its timing.
      await this.model.call('Hello.', bank, 1)
      const t0 = performance.now()
      const { wav, duration } = await this.model.call(
        'Hello there, this is a test.',
        bank,
        1,
      )
      const ms = performance.now() - t0
      const audioSec = duration || wav.length / this.model.sampleRate
      this.rtf = audioSec > 0 ? ms / 1000 / audioSec : 0
    } catch (error) {
      if (isSynthesisCancelled(error)) throw error
    }
  }

  private async getVoiceBank(voiceId: string): Promise<Float32Array> {
    const cached = this.bankCache.get(voiceId)
    if (cached) return cached
    if (!this.source) throw new Error('Synthesizer not initialized')
    const bank = await loadVoiceBank(this.source, voiceId)
    this.bankCache.set(voiceId, bank)
    return bank
  }
}
