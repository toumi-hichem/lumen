import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '@/theme/ThemeProvider'
import { useSettingsStore } from '@/store/settingsStore'
import { createTtsEngine, listTtsEngines } from '@/tts/registry'
import type { TtsVoice } from '@/tts/types'

export function SettingsScreen() {
  const navigate = useNavigate()
  const { theme, font, themes, fonts } = useTheme()
  const reading = useSettingsStore((s) => s.reading)
  const tts = useSettingsStore((s) => s.tts)
  const setReading = useSettingsStore((s) => s.setReading)
  const setTts = useSettingsStore((s) => s.setTts)

  const engines = listTtsEngines()
  const voices = useVoices(tts.engineId)

  return (
    <div className="app">
      <header className="appbar">
        <button className="btn" onClick={() => navigate(-1)} aria-label="Back">
          ←
        </button>
        <h1>Settings</h1>
      </header>

      <main className="screen-body">
        <section className="settings-section">
          <h2>Theme</h2>
          <div className="theme-swatches">
            {themes.map((t) => (
              <button
                key={t.id}
                className={`theme-chip ${t.id === theme.id ? 'active' : ''}`}
                onClick={() => setReading({ themeId: t.id })}
              >
                <span
                  className="preview"
                  style={{
                    background: t.tokens.reader.pageBackground,
                    color: t.tokens.reader.pageText,
                  }}
                />
                {t.name}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h2>Font</h2>
          <div className="font-options">
            {fonts.map((f) => (
              <button
                key={f.id}
                className={`chip ${f.id === font.id ? 'active' : ''}`}
                style={{ fontFamily: f.stack }}
                onClick={() => setReading({ fontId: f.id })}
              >
                {f.name}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h2>Reading</h2>
          <Slider
            label={`Font size — ${Math.round(reading.fontScale * 100)}%`}
            min={0.8}
            max={1.8}
            step={0.05}
            value={reading.fontScale}
            onChange={(fontScale) => setReading({ fontScale })}
          />
          <Slider
            label={`Line height — ${reading.lineHeight.toFixed(2)}`}
            min={1.2}
            max={2.2}
            step={0.05}
            value={reading.lineHeight}
            onChange={(lineHeight) => setReading({ lineHeight })}
          />
          <Slider
            label={`Margin — ${reading.margin}px`}
            min={0}
            max={72}
            step={4}
            value={reading.margin}
            onChange={(margin) => setReading({ margin })}
          />
        </section>

        <section className="settings-section">
          <h2>Speech (Text to Speech)</h2>
          <div className="setting-row">
            <span>Engine</span>
            <select
              className="select"
              value={tts.engineId}
              onChange={(e) => setTts({ engineId: e.target.value, voiceId: '' })}
            >
              {engines.map((e) => (
                <option key={e.id} value={e.id} disabled={!e.available}>
                  {e.name}
                  {e.requiresAssets ? ' — needs assets' : ''}
                  {!e.available ? ' (unavailable)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="setting-row">
            <span>Voice</span>
            <select
              className="select"
              value={tts.voiceId}
              onChange={(e) => setTts({ voiceId: e.target.value })}
            >
              <option value="">Default</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.lang ? ` (${v.lang})` : ''}
                </option>
              ))}
            </select>
          </div>
          <Slider
            label={`Speed — ${tts.rate.toFixed(2)}×`}
            min={0.5}
            max={2}
            step={0.05}
            value={tts.rate}
            onChange={(rate) => setTts({ rate })}
          />
          <Slider
            label={`Pitch — ${tts.pitch.toFixed(2)}`}
            min={0}
            max={2}
            step={0.05}
            value={tts.pitch}
            onChange={(pitch) => setTts({ pitch })}
          />
          <p className="muted" style={{ fontSize: 12 }}>
            Supertonic runs fully on-device. Drop its model assets into
            <code> public/supertonic</code> (see scripts/fetch-supertonic.sh) to
            enable it; until then the system voice is used.
          </p>
        </section>
      </main>
    </div>
  )
}

interface SliderProps {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}

function Slider({ label, min, max, step, value, onChange }: SliderProps) {
  return (
    <div className="range-row">
      <label>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

/** Load the available voices for a given engine (safe for non-initialized). */
function useVoices(engineId: string): TtsVoice[] {
  const [voices, setVoices] = useState<TtsVoice[]>([])
  useEffect(() => {
    let active = true
    const engine = createTtsEngine(engineId)
    engine
      .listVoices()
      .then((v) => active && setVoices(v))
      .catch(() => active && setVoices([]))
    return () => {
      active = false
    }
  }, [engineId])
  return voices
}
