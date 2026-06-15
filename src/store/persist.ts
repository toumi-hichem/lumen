import { Preferences } from '@capacitor/preferences'
import { getErrorMessage } from '@/lib/result'

/**
 * Key/value persistence backed by @capacitor/preferences. On web this uses
 * localStorage under the hood, on native it uses the platform store — same API
 * everywhere, so settings survive restarts on all targets.
 */
export async function loadJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const { value } = await Preferences.get({ key })
    if (!value) return fallback
    return JSON.parse(value) as T
  } catch (error) {
    console.warn(`Failed to load "${key}": ${getErrorMessage(error)}`)
    return fallback
  }
}

export async function saveJson<T>(key: string, value: T): Promise<void> {
  try {
    await Preferences.set({ key, value: JSON.stringify(value) })
  } catch (error) {
    console.warn(`Failed to save "${key}": ${getErrorMessage(error)}`)
  }
}
