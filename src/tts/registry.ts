import { Capacitor } from '@capacitor/core'
import { platform } from '@/lib/platform'
import { WebSpeechEngine } from './webSpeechEngine'
import { SupertonicEngine } from './supertonicEngine'
import { SupertonicNativeEngine } from './supertonicNativeEngine'
import { NativeTtsEngine } from './nativeTtsEngine'
import { hasNativeSupertonic } from './supertonic/nativeBridge'
import type { TtsEngine, TtsEngineDescriptor } from './types'

type EngineFactory = () => TtsEngine

interface RegisteredEngine {
  id: string
  name: string
  requiresAssets: boolean
  factory: EngineFactory
  /** Runtime availability check (feature detection). */
  available: () => boolean
}

/**
 * Registry of TTS engines. The Supertonic engine is the requested on-device
 * neural option; Web Speech is the always-available fallback. Adding a new
 * engine (cloud, native platform TTS, another model) is one entry here.
 */
const engines = new Map<string, RegisteredEngine>()

export function registerTtsEngine(entry: RegisteredEngine): void {
  engines.set(entry.id, entry)
}

registerTtsEngine({
  id: 'native-tts',
  name: 'Device Voice',
  requiresAssets: false,
  factory: () => new NativeTtsEngine(),
  available: () => Capacitor.isNativePlatform(),
})

registerTtsEngine({
  id: 'web-speech',
  name: 'System Voice',
  requiresAssets: false,
  factory: () => new WebSpeechEngine(),
  available: () => platform.hasSpeechSynthesis(),
})

registerTtsEngine({
  id: 'supertonic',
  name: 'Supertonic (on-device)',
  requiresAssets: true,
  // On Android the native pipeline is strictly better: multithreaded
  // onnxruntime-android (the WebView has no SharedArrayBuffer, so WASM stays
  // single-threaded there) and a foreground service that keeps read-aloud
  // playing with the screen off. On the web, the WASM engine runs in a
  // dedicated worker.
  factory: () =>
    hasNativeSupertonic() ? new SupertonicNativeEngine() : new SupertonicEngine(),
  available: () => hasNativeSupertonic() || typeof WebAssembly !== 'undefined',
})

export const DEFAULT_ENGINE_ID = 'web-speech'

/**
 * The best always-available engine to fall back to when the preferred one
 * fails. Inside the native WebView `web-speech` is usually absent, so the
 * device's own TTS is the correct fallback there; on the web it is web-speech.
 */
export function fallbackEngineId(): string {
  for (const id of ['native-tts', 'web-speech']) {
    const entry = engines.get(id)
    if (entry && !entry.requiresAssets && entry.available()) return id
  }
  return DEFAULT_ENGINE_ID
}

export function createTtsEngine(id: string): TtsEngine {
  const entry = engines.get(id) ?? engines.get(DEFAULT_ENGINE_ID)
  if (!entry) throw new Error('No TTS engine registered')
  return entry.factory()
}

export function listTtsEngines(): TtsEngineDescriptor[] {
  return [...engines.values()].map((e) => ({
    id: e.id,
    name: e.name,
    requiresAssets: e.requiresAssets,
    available: e.available(),
  }))
}
