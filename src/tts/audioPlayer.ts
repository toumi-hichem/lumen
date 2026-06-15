/**
 * Plays mono float32 PCM through the Web Audio API. Used by neural engines
 * (Supertonic) that produce raw samples rather than driving the system voice.
 * A single shared AudioContext is reused and resumed on demand (mobile
 * WebViews start contexts suspended until a user gesture).
 */
export class PcmAudioPlayer {
  private context: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null

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

  /** Play samples and resolve when playback ends (or when stopped). */
  async play(samples: Float32Array, sampleRate: number): Promise<void> {
    const context = this.ensureContext()
    if (context.state === 'suspended') await context.resume()

    const buffer = context.createBuffer(1, samples.length, sampleRate)
    buffer.getChannelData(0).set(samples)

    return new Promise<void>((resolve) => {
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      source.onended = () => {
        if (this.source === source) this.source = null
        resolve()
      }
      this.source = source
      source.start()
    })
  }

  stop(): void {
    if (this.source) {
      try {
        this.source.onended = null
        this.source.stop()
      } catch {
        // Already stopped; ignore.
      }
      this.source = null
    }
  }

  dispose(): void {
    this.stop()
    void this.context?.close()
    this.context = null
  }
}
