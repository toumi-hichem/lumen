import { Moon, MonitorSmartphone, Sun } from 'lucide-react'
import { useSettingsStore } from '@/store/settingsStore'
import { useTheme } from '@/theme/ThemeProvider'
import type { ThemeFamily, ThemeMode } from '@/theme/tokens'

/**
 * Theme picker organized as light/dark families: a mode control (light, dark
 * or follow-system) plus one card per family showing both variants. Picking a
 * family keeps the current mode; flipping the mode keeps the family.
 */
export function ThemePicker() {
  const { theme, families } = useTheme()
  const reading = useSettingsStore((s) => s.reading)
  const setReading = useSettingsStore((s) => s.setReading)

  const setMode = (mode: ThemeMode) => {
    const family = families.find((f) => f.id === theme.family)
    setReading({
      themeId: family ? family[mode].id : theme.id,
      followSystemTheme: false,
    })
  }

  const pickFamily = (family: ThemeFamily) => {
    setReading({ themeId: family[theme.mode].id })
  }

  const activeMode: 'light' | 'dark' | 'auto' = reading.followSystemTheme
    ? 'auto'
    : theme.mode

  return (
    <>
      <div className="mode-segment" role="radiogroup" aria-label="Color mode">
        <button
          role="radio"
          aria-checked={activeMode === 'light'}
          className={activeMode === 'light' ? 'active' : ''}
          onClick={() => setMode('light')}
        >
          <Sun size={15} /> Light
        </button>
        <button
          role="radio"
          aria-checked={activeMode === 'dark'}
          className={activeMode === 'dark' ? 'active' : ''}
          onClick={() => setMode('dark')}
        >
          <Moon size={15} /> Dark
        </button>
        <button
          role="radio"
          aria-checked={activeMode === 'auto'}
          className={activeMode === 'auto' ? 'active' : ''}
          onClick={() => setReading({ followSystemTheme: true })}
        >
          <MonitorSmartphone size={15} /> Auto
        </button>
      </div>

      <div className="family-grid">
        {families.map((family) => {
          const active = family.id === theme.family
          const variant = family[theme.mode]
          return (
            <button
              key={family.id}
              className={`family-chip ${active ? 'active' : ''}`}
              onClick={() => pickFamily(family)}
              aria-pressed={active}
            >
              <span className="family-preview">
                <span
                  className="half"
                  style={{
                    background: family.light.tokens.reader.pageBackground,
                    color: family.light.tokens.reader.pageText,
                  }}
                >
                  Aa
                </span>
                <span
                  className="half"
                  style={{
                    background: family.dark.tokens.reader.pageBackground,
                    color: family.dark.tokens.reader.pageText,
                  }}
                >
                  Aa
                </span>
              </span>
              <span className="family-name">
                {family.name}
                <span className="family-variant">{variant.name}</span>
              </span>
            </button>
          )
        })}
      </div>
      <p className="muted settings-hint">
        Each look has a light and dark side — the mode above picks which one you
        see. Auto follows your device.
      </p>
    </>
  )
}
