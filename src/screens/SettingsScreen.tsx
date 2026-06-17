import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '@/theme/ThemeProvider'
import { useSettingsStore } from '@/store/settingsStore'
import { createTtsEngine, listTtsEngines } from '@/tts/registry'
import type { TtsVoice } from '@/tts/types'
import {
  downloadBlob,
  exportBackup,
  importBackup,
} from '@/services/backup'
import { getErrorMessage } from '@/lib/result'
import { Select, type SelectOption } from '@/ui/Select'
import { Toggle } from '@/ui/Toggle'
import { Icon } from '@/ui/Icon'
import { icons } from '@/ui/icons'

export function SettingsScreen() {
  const navigate = useNavigate()
  const { theme, font, themes, fonts } = useTheme()
  const reading = useSettingsStore((s) => s.reading)
  const tts = useSettingsStore((s) => s.tts)
  const setReading = useSettingsStore((s) => s.setReading)
  const setTts = useSettingsStore((s) => s.setTts)

  const engines = listTtsEngines()
  const voices = useVoices(tts.engineId)
  const backupInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string>()

  const engineOptions: SelectOption[] = engines.map((e) => ({
    value: e.id,
    label: e.name,
    hint: !e.available ? 'unavailable' : e.requiresAssets ? 'needs assets' : undefined,
    disabled: !e.available,
  }))
  const voiceOptions: SelectOption[] = [
    { value: '', label: 'Default' },
    ...voices.map((v) => ({
      value: v.id,
      label: v.lang ? `${v.name} (${v.lang})` : v.name,
    })),
  ]

  const doExport = async () => {
    setBusy('Exporting…')
    try {
      downloadBlob(`lumen-backup-${Date.now()}.zip`, await exportBackup())
    } finally {
      setBusy(undefined)
    }
  }

  const doImport = async (file: File) => {
    setBusy('Restoring…')
    try {
      const result = await importBackup(await file.arrayBuffer())
      alert(`Restored ${result.books} books and ${result.highlights} highlights.`)
    } catch (e) {
      alert(getErrorMessage(e))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <div className="app">
      <header className="appbar">
        <button className="btn btn-icon" onClick={() => navigate(-1)} aria-label="Back">
          <Icon path={icons.back} size={18} />
        </button>
        <h1>Settings</h1>
      </header>

      <main className="screen-body">
        <section className="settings-section">
          <h2>Theme</h2>
          <div className="theme-grid">
            {themes.map((t) => (
              <button
                key={t.id}
                className={`theme-chip ${t.id === theme.id ? 'active' : ''}`}
                onClick={() => setReading({ themeId: t.id })}
                aria-pressed={t.id === theme.id}
              >
                <span
                  className="preview"
                  style={{
                    background: t.tokens.reader.pageBackground,
                    color: t.tokens.reader.pageText,
                  }}
                >
                  <span className="preview-aa">Aa</span>
                </span>
                <span className="theme-chip-name">
                  {t.name}
                  <span className="theme-chip-mode">{t.mode}</span>
                </span>
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
          <Slider
            label={`Brightness — ${Math.round(reading.brightness * 100)}%`}
            min={0.4}
            max={1}
            step={0.05}
            value={reading.brightness}
            onChange={(brightness) => setReading({ brightness })}
          />
          <Slider
            label={`Warmth — ${Math.round(reading.warmth * 100)}%`}
            min={0}
            max={1}
            step={0.05}
            value={reading.warmth}
            onChange={(warmth) => setReading({ warmth })}
          />
        </section>

        <section className="settings-section">
          <h2>Layout</h2>
          <div className="setting-row">
            <span>Page mode</span>
            <div className="font-options">
              <button
                className={`chip ${reading.flow === 'paginated' ? 'active' : ''}`}
                onClick={() => setReading({ flow: 'paginated' })}
              >
                Paginated
              </button>
              <button
                className={`chip ${reading.flow === 'scrolled' ? 'active' : ''}`}
                onClick={() => setReading({ flow: 'scrolled' })}
              >
                Scrolled
              </button>
            </div>
          </div>
          <div className="setting-row">
            <span>Justify text</span>
            <Toggle
              ariaLabel="Justify text"
              checked={reading.justify}
              onChange={(justify) => setReading({ justify })}
            />
          </div>
          <div className="setting-row">
            <span>Large tap zones</span>
            <Toggle
              ariaLabel="Large tap zones"
              checked={reading.largeTapZones}
              onChange={(largeTapZones) => setReading({ largeTapZones })}
            />
          </div>
        </section>

        <section className="settings-section">
          <h2>Speech (Text to Speech)</h2>
          <div className="setting-row">
            <span>Engine</span>
            <Select
              ariaLabel="Speech engine"
              value={tts.engineId}
              onChange={(engineId) => setTts({ engineId, voiceId: '' })}
              options={engineOptions}
            />
          </div>
          <div className="setting-row">
            <span>Voice</span>
            <Select
              ariaLabel="Voice"
              value={tts.voiceId}
              onChange={(voiceId) => setTts({ voiceId })}
              options={voiceOptions}
            />
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
          <div className="setting-row">
            <span>Read by</span>
            <div className="font-options">
              <button
                className={`chip ${tts.granularity === 'sentence' ? 'active' : ''}`}
                onClick={() => setTts({ granularity: 'sentence' })}
              >
                Sentence
              </button>
              <button
                className={`chip ${tts.granularity === 'paragraph' ? 'active' : ''}`}
                onClick={() => setTts({ granularity: 'paragraph' })}
              >
                Paragraph
              </button>
            </div>
          </div>
          <div className="setting-row">
            <span>Continue to next chapter</span>
            <Toggle
              ariaLabel="Continue to next chapter"
              checked={tts.autoAdvance}
              onChange={(autoAdvance) => setTts({ autoAdvance })}
            />
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            Supertonic runs fully on-device. Drop its model assets into
            <code> public/supertonic</code> (see scripts/fetch-supertonic.sh) to
            enable it; until then the system voice is used.
          </p>
        </section>

        <section className="settings-section">
          <h2>Data & backup</h2>
          <div className="setting-row">
            <span>Export library</span>
            <button className="btn" onClick={() => void doExport()} disabled={!!busy}>
              {busy === 'Exporting…' ? busy : 'Export .zip'}
            </button>
          </div>
          <div className="setting-row">
            <span>Restore from backup</span>
            <button
              className="btn"
              onClick={() => backupInput.current?.click()}
              disabled={!!busy}
            >
              {busy === 'Restoring…' ? busy : 'Import .zip'}
            </button>
            <input
              ref={backupInput}
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={(e) => {
                if (e.target.files?.[0]) void doImport(e.target.files[0])
                e.target.value = ''
              }}
            />
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            Backups include books, progress, bookmarks, highlights and shelves.
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
