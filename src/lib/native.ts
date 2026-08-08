import { platform } from './platform'

/**
 * Native platform integrations, all no-ops on web and guarded so a missing
 * plugin never breaks the app. Plugins are imported lazily.
 */

/** Match the OS status bar to the active theme (native only). */
export async function applyStatusBarTheme(
  mode: 'light' | 'dark',
  background: string,
): Promise<void> {
  if (!platform.isNative()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    // Style.Light = light content (for dark backgrounds), and vice versa.
    await StatusBar.setStyle({ style: mode === 'dark' ? Style.Light : Style.Dark })
    if (platform.name() === 'android') {
      await StatusBar.setBackgroundColor({ color: background })
    }
  } catch {
    // Plugin unavailable; ignore.
  }
}

/**
 * Keep the display awake through the native window flag, which also stops the
 * pre-sleep dimming the Wake Lock API leaves in place. Returns false when the
 * plugin isn't there, so the caller can fall back to the web API.
 */
export async function setNativeKeepAwake(enabled: boolean): Promise<boolean> {
  if (!platform.isNative()) return false
  try {
    const { Capacitor, registerPlugin } = await import('@capacitor/core')
    if (!Capacitor.isPluginAvailable('ScreenAwake')) return false
    const ScreenAwake = registerPlugin<{
      setKeepAwake(options: { enabled: boolean }): Promise<void>
    }>('ScreenAwake')
    await ScreenAwake.setKeepAwake({ enabled })
    return true
  } catch {
    return false
  }
}

interface WakeLockSentinelLike {
  release(): Promise<void>
}
interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> }
}

/**
 * Request a screen wake lock so the display stays on while reading. Uses the
 * standard Wake Lock API, which is available in modern browsers and the native
 * WebView. Returns a release function; safe to call when unsupported.
 */
export async function requestWakeLock(): Promise<() => void> {
  const nav = navigator as Navigator & WakeLockNavigator
  if (!nav.wakeLock) return () => {}
  try {
    const sentinel = await nav.wakeLock.request('screen')
    return () => void sentinel.release().catch(() => {})
  } catch {
    return () => {}
  }
}

/** Light haptic tick for page turns / selections (native only). */
export async function hapticTick(): Promise<void> {
  if (!platform.isNative()) return
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch {
    // Plugin unavailable; ignore.
  }
}
