import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { Capacitor } from '@capacitor/core'
import type { SpeakOptions, TtsEngine, TtsVoice } from './types'
import { TtsNotAvailableError } from './types'

/**
 * TTS engine backed by the device's native speech synthesis via the Capacitor
 * TextToSpeech plugin. Works on Android and iOS; throws on plain web where the
 * native layer is absent.
 */
export class NativeTtsEngine implements TtsEngine {
  readonly id = 'native-tts'
  readonly name = 'Device Voice'
  readonly requiresAssets = false

  private ready = false
  private voices: Array<{ name: string; lang: string; voiceURI: string }> = []
  private stopCalled = false

  async init(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      throw new TtsNotAvailableError(this.id, 'native platform required')
    }
    try {
      const result = await TextToSpeech.getSupportedVoices()
      this.voices = result.voices ?? []
      this.ready = true
    } catch {
      throw new TtsNotAvailableError(this.id, 'failed to initialize')
    }
  }

  isReady(): boolean {
    return this.ready
  }

  async listVoices(): Promise<TtsVoice[]> {
    if (!this.voices.length && Capacitor.isNativePlatform()) {
      try {
        const result = await TextToSpeech.getSupportedVoices()
        this.voices = result.voices ?? []
      } catch {
        return []
      }
    }
    return this.voices.map((v, i) => ({
      id: String(i),
      name: v.name,
      lang: v.lang,
    }))
  }

  speak(text: string, options: SpeakOptions): Promise<void> {
    this.stopCalled = false
    const voiceIndex =
      options.voiceId !== undefined ? parseInt(options.voiceId, 10) : undefined
    return TextToSpeech.speak({
      text,
      rate: options.rate,
      pitch: options.pitch,
      volume: 1.0,
      ...(voiceIndex !== undefined && !isNaN(voiceIndex) ? { voice: voiceIndex } : {}),
    }).catch((err: unknown) => {
      // When stop() interrupts speech the plugin may reject — treat that as clean.
      if (this.stopCalled) return
      throw err
    })
  }

  stop(): void {
    this.stopCalled = true
    void TextToSpeech.stop()
  }

  dispose(): void {
    this.stop()
    this.ready = false
  }
}
