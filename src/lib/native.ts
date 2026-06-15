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
