/**
 * Typed facade over the VolumeKeys Capacitor plugin (Android). While capture is
 * on, the native activity swallows volume presses and forwards them here so the
 * reader can use them for navigation; capture off means the keys behave
 * normally, so it must only be enabled while a book is actually being read.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type VolumeKeyDirection = 'up' | 'down'

export interface VolumeKeyEvent {
  direction: VolumeKeyDirection
  /** True for auto-repeat presses while the button is held down. */
  repeat: boolean
}

export interface VolumeKeysPlugin {
  setCapture(options: { enabled: boolean }): Promise<void>
  addListener(
    eventName: 'volumeKey',
    listener: (event: VolumeKeyEvent) => void,
  ): Promise<PluginListenerHandle>
  removeAllListeners(): Promise<void>
}

export const VolumeKeys = registerPlugin<VolumeKeysPlugin>('VolumeKeys')

/** True when volume keys can be borrowed on this platform. */
export function hasVolumeKeys(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('VolumeKeys')
}
