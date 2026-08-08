import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Brain,
  DatabaseBackup,
  Palette,
  PanelBottom,
  Type,
  Volume2,
} from 'lucide-react'
import { useTheme } from '@/theme/ThemeProvider'
import { useSettingsStore } from '@/store/settingsStore'
import { engineHint, listTtsEngines } from '@/tts/registry'
import {
  downloadBlob,
  exportBackup,
  importBackup,
} from '@/services/backup'
import { getErrorMessage } from '@/lib/result'
import { Select, type SelectOption } from '@/ui/Select'
import { VoicePickerDialog } from '@/ui/VoicePickerDialog'
import { useVoicePreview, useVoices } from '@/ui/voiceHooks'
import { Toggle } from '@/ui/Toggle'
import { Slider } from '@/ui/Slider'
import { Icon } from '@/ui/Icon'
import { icons } from '@/ui/icons'
import { AssetEngineDownload } from './settings/AssetEngineDownload'
import { SUPERTONIC_SIZE_MB } from '@/tts/supertonic/assets'
import {
  installSupertonic,
  isSupertonicInstalled,
  removeSupertonic,
} from '@/tts/supertonic/install'
import { hasNativeSupertonic, SupertonicNative } from '@/tts/supertonic/nativeBridge'
import { KOKORO_SIZE_MB } from '@/tts/kokoro/assets'
import { installKokoro, isKokoroInstalled, removeKokoro } from '@/tts/kokoro/install'
import { hasNativeKokoro, KokoroNative } from '@/tts/kokoro/nativeBridge'
import { SettingSection } from './settings/SettingSection'
import { ThemePicker } from './settings/ThemePicker'
import { ALL_ACTION_META } from './reader/ReaderActionBar'

export function SettingsScreen() {
  const navigate = useNavigate()
  const { font, fonts } = useTheme()
  const reading = useSettingsStore((s) => s.reading)
  const tts = useSettingsStore((s) => s.tts)
  const setReading = useSettingsStore((s) => s.setReading)
  const setTts = useSettingsStore((s) => s.setTts)

  const engines = listTtsEngines()
  const voices = useVoices(tts.engineId)
  const voicePreview = useVoicePreview(tts.engineId)
  const backupInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string>()

  // Which asset-backed engines have their downloads in place. Probing storage is
  // async, so it is resolved here and re-run whenever an install/removal lands.
  const [readyEngineIds, setReadyEngineIds] = useState<ReadonlySet<string>>(new Set())
  const [assetsRevision, setAssetsRevision] = useState(0)

  useEffect(() => {
    let active = true
    const probes = engines
      .filter((e) => e.assetsReady)
      .map(async (e) => ((await e.assetsReady?.()) ? e.id : null))
    void Promise.all(probes).then((ids) => {
      if (active) setReadyEngineIds(new Set(ids.filter((id) => id !== null)))
    })
    return () => {
      active = false
    }
    // `engines` is rebuilt every render; the registry itself is static, so the
    // revision counter is what should actually re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsRevision])

  const engineOptions: SelectOption[] = engines.map((e) => ({
    value: e.id,
    label: e.name,
    hint: engineHint(e, readyEngineIds.has(e.id)),
    disabled: !e.available,
  }))

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

      <main className="screen-body settings-body">
        <SettingSection
          icon={<Palette size={18} />}
          title="Appearance"
          hint="Theme, color mode and screen comfort."
        >
          <ThemePicker />
          <Slider
            label="Brightness"
            min={0.4}
            max={1}
            step={0.05}
            value={reading.brightness}
            onChange={(brightness) => setReading({ brightness })}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <Slider
            label="Warmth"
            min={0}
            max={1}
            step={0.05}
            value={reading.warmth}
            onChange={(warmth) => setReading({ warmth })}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
        </SettingSection>

        <SettingSection
          icon={<Type size={18} />}
          title="Typography"
          hint="How the text on the page looks."
        >
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
          <Slider
            label="Font size"
            min={0.8}
            max={1.8}
            step={0.05}
            value={reading.fontScale}
            onChange={(fontScale) => setReading({ fontScale })}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <Slider
            label="Line height"
            min={1.2}
            max={2.2}
            step={0.05}
            value={reading.lineHeight}
            onChange={(lineHeight) => setReading({ lineHeight })}
            formatValue={(v) => v.toFixed(2)}
          />
          <Slider
            label="Margin"
            min={0}
            max={72}
            step={4}
            value={reading.margin}
            onChange={(margin) => setReading({ margin })}
            formatValue={(v) => `${v}px`}
          />
          <Slider
            label="Letter spacing"
            min={0}
            max={0.2}
            step={0.01}
            value={reading.letterSpacing}
            onChange={(letterSpacing) => setReading({ letterSpacing })}
            formatValue={(v) => `${v.toFixed(2)}em`}
          />
          <div className="setting-row">
            <span>Justify text</span>
            <Toggle
              ariaLabel="Justify text"
              checked={reading.justify}
              onChange={(justify) => setReading({ justify })}
            />
          </div>
        </SettingSection>

        <SettingSection
          icon={<BookOpen size={18} />}
          title="Page & navigation"
          hint="How you move through a book."
        >
          <div className="setting-row">
            <span>Reading mode</span>
            <div className="font-options">
              <button
                className={`chip ${reading.flow === 'paginated' ? 'active' : ''}`}
                onClick={() => setReading({ flow: 'paginated' })}
              >
                Page by page
              </button>
              <button
                className={`chip ${reading.flow === 'scrolled' ? 'active' : ''}`}
                onClick={() => setReading({ flow: 'scrolled' })}
              >
                Continuous scroll
              </button>
            </div>
          </div>
          <div className="setting-row">
            <span>Large tap zones</span>
            <Toggle
              ariaLabel="Large tap zones"
              checked={reading.largeTapZones}
              onChange={(largeTapZones) => setReading({ largeTapZones })}
            />
          </div>
          <div className="setting-row">
            <span>
              Keep screen on while reading
              <br />
              <small className="muted">
                The display won't dim or sleep while a book is open.
              </small>
            </span>
            <Toggle
              ariaLabel="Keep screen on while reading"
              checked={reading.keepAwake}
              onChange={(keepAwake) => setReading({ keepAwake })}
            />
          </div>
          <Slider
            label="Auto-scroll speed"
            min={10}
            max={120}
            step={5}
            value={reading.autoScrollSpeed}
            onChange={(autoScrollSpeed) => setReading({ autoScrollSpeed })}
            formatValue={(v) => `${v} px/s`}
          />
        </SettingSection>

        <SettingSection
          icon={<Brain size={18} />}
          title="Focus & accessibility"
          hint="Reading aids for concentration and comfort."
        >
          <div className="setting-row">
            <span>
              Bionic reading
              <br />
              <small className="muted">
                Bolds the start of each word to guide focus (text and MOBI books).
              </small>
            </span>
            <Toggle
              ariaLabel="Bionic reading"
              checked={reading.bionicReading}
              onChange={(bionicReading) => setReading({ bionicReading })}
            />
          </div>
          {reading.bionicReading && (
            <Slider
              label="Fixation strength"
              min={0.3}
              max={0.7}
              step={0.05}
              value={reading.bionicStrength}
              onChange={(bionicStrength) => setReading({ bionicStrength })}
              formatValue={(v) => `${Math.round(v * 100)}%`}
            />
          )}
          <div className="setting-row">
            <span>Hide inline images</span>
            <Toggle
              ariaLabel="Hide inline images"
              checked={reading.hideImages}
              onChange={(hideImages) => setReading({ hideImages })}
            />
          </div>
          <div className="setting-row">
            <span>
              Soft wrap
              <br />
              <small className="muted">Wraps long lines instead of overflowing horizontally.</small>
            </span>
            <Toggle
              ariaLabel="Soft wrap"
              checked={reading.softWrap}
              onChange={(softWrap) => setReading({ softWrap })}
            />
          </div>
        </SettingSection>

        <SettingSection
          icon={<Volume2 size={18} />}
          title="Listening"
          hint="Text-to-speech engine and narration."
        >
          <div className="setting-row">
            <span>Engine</span>
            <Select
              ariaLabel="Speech engine"
              value={tts.engineId}
              onChange={(engineId) => setTts({ engineId, engineChosen: true })}
              options={engineOptions}
            />
          </div>
          <div className="setting-row">
            <span>Voice</span>
            <VoicePickerDialog
              voices={voices}
              value={tts.voiceId}
              onChange={(voiceId) => setTts({ voiceId })}
              preview={voicePreview}
            />
          </div>
          <Slider
            label="Speed"
            min={0.5}
            max={2}
            step={0.05}
            value={tts.rate}
            onChange={(rate) => setTts({ rate })}
            formatValue={(v) => `${v.toFixed(2)}×`}
          />
          <Slider
            label="Pitch"
            min={0}
            max={2}
            step={0.05}
            value={tts.pitch}
            onChange={(pitch) => setTts({ pitch })}
            formatValue={(v) => v.toFixed(2)}
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
          <AssetEngineDownload
            engineId="supertonic"
            label="Supertonic"
            sizeMb={SUPERTONIC_SIZE_MB}
            isInstalled={isSupertonicInstalled}
            install={installSupertonic}
            remove={removeSupertonic}
            hasNative={hasNativeSupertonic}
            getCpuTopology={() => SupertonicNative.getCpuTopology()}
            fallbackEngineId="web-speech"
            onInstallChange={() => setAssetsRevision((n) => n + 1)}
          />
          <AssetEngineDownload
            engineId="kokoro"
            label="Kokoro"
            sizeMb={KOKORO_SIZE_MB}
            isInstalled={isKokoroInstalled}
            install={installKokoro}
            remove={removeKokoro}
            hasNative={hasNativeKokoro}
            getCpuTopology={() => KokoroNative.getCpuTopology()}
            fallbackEngineId="web-speech"
            onInstallChange={() => setAssetsRevision((n) => n + 1)}
          />
        </SettingSection>

        <SettingSection
          icon={<PanelBottom size={18} />}
          title="Reader toolbar"
          hint="Choose which actions appear in the reader footer."
        >
          {ALL_ACTION_META.map((action) => {
            const checked = reading.footerActionIds.includes(action.id)
            const toggle = () => {
              const order = ALL_ACTION_META.map((a) => a.id)
              const next = checked
                ? reading.footerActionIds.filter((id) => id !== action.id)
                : [...reading.footerActionIds, action.id].sort(
                    (a, b) => order.indexOf(a) - order.indexOf(b),
                  )
              setReading({ footerActionIds: next })
            }
            return (
              <div key={action.id} className="setting-row">
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{action.icon}</span>
                  {action.label}
                </span>
                <Toggle ariaLabel={action.label} checked={checked} onChange={toggle} />
              </div>
            )
          })}
        </SettingSection>

        <SettingSection
          icon={<DatabaseBackup size={18} />}
          title="Data & backup"
          hint="Backups include books, progress, bookmarks, highlights and shelves."
        >
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
        </SettingSection>
      </main>
    </div>
  )
}
