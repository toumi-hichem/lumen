import { Capacitor } from '@capacitor/core'

/**
 * Thin capability layer so the same codebase runs on web, Android and iOS.
 * Native-only features must be guarded by these checks, never assumed.
 */
export const platform = {
  /** 'web' | 'android' | 'ios' */
  name: (): string => Capacitor.getPlatform(),
  isNative: (): boolean => Capacitor.isNativePlatform(),
  isWeb: (): boolean => Capacitor.getPlatform() === 'web',
  /** True when WebGPU is available (preferred Supertonic backend). */
  hasWebGPU: (): boolean =>
    typeof navigator !== 'undefined' && 'gpu' in navigator,
  /** True when the Web Speech synthesis API exists (fallback TTS engine). */
  hasSpeechSynthesis: (): boolean =>
    typeof window !== 'undefined' && 'speechSynthesis' in window,
}
