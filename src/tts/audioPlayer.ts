/**
 * Plays mono float32 PCM through the Web Audio API. Used by neural engines
 * (Supertonic) that produce raw samples rather than driving the system voice.
 * A single shared AudioContext is reused and resumed on demand (mobile
 * WebViews start contexts suspended until a user gesture).
 *
 * Playback is gapless: each buffer is scheduled to start exactly when the
 * previous one ends (`nextStartTime`), and play() resolves slightly BEFORE
 * the audio actually finishes. That early resolve gives the caller time to
 * fetch the next (prefetched) chunk and schedule it at `nextStartTime`, so
 * consecutive sentences join sample-accurately instead of leaving an
 * event-loop-sized gap between them.
 */

/** Margin when starting on an idle context, so the first start() isn't late. */
const SCHEDULE_LEAD_S = 0.005
/** How early play() resolves before its buffer truly ends. */
const RESOLVE_EARLY_S = 0.06

export class PcmAudioPlayer {
  private context: AudioContext | null = null
  private readonly active = new Set<AudioBufferSourceNode>()
  private nextStartTime = 0

  private ensureContext(): AudioContext {
    if (!this.context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      this.context = new Ctor()
    }
    return this.context
  }

  /**
   * Schedule samples for playback. Resolves ~RESOLVE_EARLY_S before the audio
   * ends (or immediately when stopped) so the caller can queue the next chunk
   * gaplessly.
   */
  async play(samples: Float32Array, sampleRate: number): Promise<void> {
    const context = this.ensureContext()
    if (context.state === 'suspended') await context.resume()

    const buffer = context.createBuffer(1, samples.length, sampleRate)
    buffer.getChannelData(0).set(samples)

    const now = context.currentTime
    const startAt = Math.max(now + SCHEDULE_LEAD_S, this.nextStartTime)
    this.nextStartTime = startAt + buffer.duration

    return new Promise<void>((resolve) => {
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      this.active.add(source)

      let done = false
      const finish = () => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve()
      }
      // onended is the backstop (fires on stop() and when timers are
      // throttled); the timer is the early resolve for gapless sequencing.
      source.onended = () => {
        this.active.delete(source)
        finish()
      }
      const earlyMs = Math.max(
        0,
        (startAt + buffer.duration - RESOLVE_EARLY_S - now) * 1000,
      )
      const timer = setTimeout(finish, earlyMs)
      source.start(startAt)
    })
  }

  stop(): void {
    for (const source of this.active) {
      try {
        source.stop()
      } catch {
        // Already stopped; ignore.
      }
    }
    this.active.clear()
    this.nextStartTime = 0
  }

  dispose(): void {
    this.stop()
    void this.context?.close()
    this.context = null
  }
}
