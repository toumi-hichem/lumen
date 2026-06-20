import { getErrorMessage } from '@/lib/result'
import { createTtsEngine, fallbackEngineId } from './registry'
import type { SpeakOptions, TtsEngine } from './types'

export type TtsStatus = 'idle' | 'loading' | 'playing' | 'paused'

export interface TtsControllerEvents {
  onStatus?: (status: TtsStatus) => void
  /** Index of the chunk currently being spoken (for highlight sync). */
  onChunk?: (index: number) => void
  onError?: (message: string) => void
  /**
   * Engine actually in use after any fallback (may differ from requested).
   * `info` is present only when the requested engine failed and we fell back,
   * carrying the original failure reason so the UI can explain it.
   */
  onEngineResolved?: (
    engineId: string,
    info?: { requested: string; reason: string },
  ) => void
  /** Fired only when all chunks finished naturally (not on stop/pause). */
  onComplete?: () => void
}

/**
 * Orchestrates read-aloud over a list of text chunks using a pluggable engine.
 * Owns sequencing, pause/resume/stop and per-chunk progress so engines stay
 * simple (speak one chunk, stop). If the requested engine fails to initialize
 * (e.g. Supertonic assets missing), it transparently falls back to the default.
 */
export class TtsController {
  private engine: TtsEngine | null = null
  private engineId = ''
  private chunks: string[] = []
  private index = 0
  private status: TtsStatus = 'idle'
  private options: SpeakOptions = { rate: 1, pitch: 1 }
  private initPromise: Promise<string> | null = null
  private initForId = ''

  constructor(private readonly events: TtsControllerEvents = {}) {}

  getStatus(): TtsStatus {
    return this.status
  }

  getCurrentIndex(): number {
    return this.index
  }

  /** Load (and if needed, fall back) the engine identified by `id`. */
  async useEngine(id: string): Promise<string> {
    if (this.engineId === id && this.engine?.isReady()) return id
    // Deduplicate concurrent calls for the same engine (e.g. the eager-init
    // effect and a play() call racing each other).
    if (this.initPromise && this.initForId === id) return this.initPromise
    this.engine?.dispose()
    this.engine = null
    this.initForId = id
    this.setStatus('loading')
    this.initPromise = this.initEngineWithFallback(id)
      .then(({ id: resolved, reason }) => {
        this.engineId = resolved
        this.setStatus('idle')
        this.events.onEngineResolved?.(
          resolved,
          resolved !== id && reason ? { requested: id, reason } : undefined,
        )
        return resolved
      })
      .catch((err: unknown) => {
        this.setStatus('idle')
        throw err
      })
      .finally(() => { this.initPromise = null })
    return this.initPromise
  }

  /** Begin reading the supplied chunks from `startIndex`. */
  async play(
    chunks: string[],
    options: SpeakOptions,
    startIndex = 0,
  ): Promise<void> {
    if (!this.engine?.isReady()) {
      try {
        await this.useEngine(this.engineId || fallbackEngineId())
      } catch {
        return // onError already reported via events
      }
    }
    this.chunks = chunks
    this.index = Math.max(0, Math.min(startIndex, chunks.length - 1))
    this.options = options
    if (!chunks.length) return
    await this.run()
  }

  pause(): void {
    if (this.status !== 'playing') return
    this.setStatus('paused')
    this.engine?.stop()
  }

  async resume(): Promise<void> {
    if (this.status !== 'paused') return
    await this.run()
  }

  stop(): void {
    this.engine?.stop()
    this.index = 0
    this.setStatus('idle')
  }

  setOptions(options: SpeakOptions): void {
    this.options = options
  }

  dispose(): void {
    this.engine?.dispose()
    this.engine = null
  }

  // --- internals ---

  private async run(): Promise<void> {
    if (!this.engine) return
    this.setStatus('playing')
    while (this.index < this.chunks.length) {
      // A pause/stop flips status; bail out of the loop if so.
      if (this.status !== 'playing') return
      this.events.onChunk?.(this.index)
      // Start the current chunk first (this synchronously queues its synthesis),
      // then prefetch the next so neural engines render it during playback and
      // there's no gap between sentences. Order matters: queue current before
      // next so the current sentence is never delayed behind a prefetch.
      const speaking = this.engine.speak(this.chunks[this.index], this.options)
      const nextChunk = this.chunks[this.index + 1]
      if (nextChunk) this.engine.prefetch?.(nextChunk, this.options)
      try {
        await speaking
      } catch (error) {
        this.events.onError?.(getErrorMessage(error))
        this.setStatus('idle')
        return
      }
      if (this.status !== 'playing') return
      this.index += 1
    }
    this.index = 0
    this.setStatus('idle')
    this.events.onComplete?.()
  }

  private async initEngineWithFallback(
    id: string,
  ): Promise<{ id: string; reason?: string }> {
    try {
      const engine = createTtsEngine(id)
      await engine.init()
      this.engine = engine
      return { id: engine.id }
    } catch (primary) {
      const fallbackId = fallbackEngineId()
      const reason = getErrorMessage(primary)
      if (id === fallbackId) {
        this.events.onError?.(reason)
        throw primary
      }
      // Preferred engine unavailable — try the platform fallback, but keep the
      // reason so the UI can tell the user why their choice didn't load.
      try {
        const fallback = createTtsEngine(fallbackId)
        await fallback.init()
        this.engine = fallback
        return { id: fallback.id, reason }
      } catch (fallbackError) {
        this.events.onError?.(getErrorMessage(fallbackError))
        throw fallbackError
      }
    }
  }

  private setStatus(status: TtsStatus): void {
    this.status = status
    this.events.onStatus?.(status)
  }
}
