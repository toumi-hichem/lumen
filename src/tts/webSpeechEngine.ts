import { platform } from '@/lib/platform'
import {
  type SpeakOptions,
  type TtsEngine,
  type TtsVoice,
  TtsNotAvailableError,
} from './types'

/**
 * Default TTS engine using the Web Speech API (speechSynthesis). Available in
 * every modern browser and WebView with zero downloads, so it is the reliable
 * fallback while Supertonic assets load — or when the device cannot run them.
 */
export class WebSpeechEngine implements TtsEngine {
  readonly id = 'web-speech'
  readonly name = 'System Voice'
  readonly requiresAssets = false

  private voices: SpeechSynthesisVoice[] = []
  private ready = false

  async init(): Promise<void> {
    if (!platform.hasSpeechSynthesis()) {
      throw new TtsNotAvailableError(this.id, 'speechSynthesis not supported')
    }
    this.voices = await loadVoices()
    this.ready = true
  }

  isReady(): boolean {
    return this.ready
  }

  async listVoices(): Promise<TtsVoice[]> {
    if (!this.voices.length) this.voices = await loadVoices()
    return this.voices.map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang }))
  }

  speak(text: string, options: SpeakOptions): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!platform.hasSpeechSynthesis()) return resolve()

      // Cancel any stale utterance before queuing a new one. Some Android
      // WebViews silently stall speech synthesis without this.
      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = clamp(options.rate, 0.1, 10)
      utterance.pitch = clamp(options.pitch, 0, 2)
      const voice = this.voices.find((v) => v.voiceURI === options.voiceId)
      if (voice) utterance.voice = voice

      let resolved = false
      const done = () => { if (!resolved) { resolved = true; resolve() } }

      // Safety net: some WebViews never fire onend/onerror. Estimate duration
      // from character count and resolve after 2× the estimate (min 8 s).
      const estimatedMs = (text.length / Math.max(0.5, utterance.rate)) * 60
      const fallback = setTimeout(done, Math.max(8000, estimatedMs * 2))

      utterance.onend = () => { clearTimeout(fallback); done() }
      utterance.onerror = () => { clearTimeout(fallback); done() }
      window.speechSynthesis.speak(utterance)
    })
  }

  stop(): void {
    if (platform.hasSpeechSynthesis()) window.speechSynthesis.cancel()
  }

  dispose(): void {
    this.stop()
    this.ready = false
  }
}

/** Voices load asynchronously in some browsers; wait for the event once. */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const existing = window.speechSynthesis.getVoices()
    if (existing.length) return resolve(existing)
    const handler = () => {
      resolve(window.speechSynthesis.getVoices())
      window.speechSynthesis.removeEventListener('voiceschanged', handler)
    }
    window.speechSynthesis.addEventListener('voiceschanged', handler)
    // Fallback in case the event never fires.
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1000)
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
