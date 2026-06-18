import { useState, useEffect, useRef } from 'react'
import {
  Moon, Sun, Headphones, Pause, Play, Square, Loader2,
  ChevronsDown, List, Bookmark, Search, Settings2,
  LayoutGrid, ChevronLeft, Clock,
} from 'lucide-react'
import type { TtsStatus } from '@/tts/controller'
import type { ThemeMode } from '@/theme/tokens'
import type { PanelTab } from './ReaderPanel'
import { useSettingsStore } from '@/store/settingsStore'
import { Select, type SelectOption } from '@/ui/Select'
import { Toggle } from '@/ui/Toggle'
import { Slider } from '@/ui/Slider'
import { createTtsEngine } from '@/tts/registry'
import type { TtsVoice } from '@/tts/types'

type FooterMode = 'default' | 'tts' | 'autoscroll' | 'footer-settings'

export interface ReaderActionBarProps {
  canAutoScroll: boolean
  autoScroll: boolean
  onToggleAutoScroll: () => void
  ttsStatus: TtsStatus
  ttsError?: string
  ttsSleepMinutes: number | null
  ttsSleepSecondsRemaining: number | null
  onTtsPlay: () => void
  onTtsPause: () => void
  onTtsResume: () => void
  onTtsStop: () => void
  onTtsSetSleep: (minutes: number | null) => void
  themeMode: ThemeMode
  onToggleTheme: () => void
  onOpenPanel: (tab: PanelTab) => void
  onOpenSettings: () => void
}

interface ActionDef {
  id: string
  icon: React.ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}

const SLEEP_OPTIONS: SelectOption[] = [
  { value: '0', label: 'No timer' },
  { value: '5', label: '5 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '1 hour' },
]

const ALL_ACTION_META: Array<{ id: string; label: string; icon: React.ReactNode }> = [
  { id: 'theme', label: 'Theme', icon: <Moon size={16} /> },
  { id: 'tts', label: 'Listen', icon: <Headphones size={16} /> },
  { id: 'autoscroll', label: 'Scroll', icon: <ChevronsDown size={16} /> },
  { id: 'toc', label: 'Contents', icon: <List size={16} /> },
  { id: 'bookmarks', label: 'Marks', icon: <Bookmark size={16} /> },
  { id: 'search', label: 'Search', icon: <Search size={16} /> },
  { id: 'settings', label: 'Reading', icon: <Settings2 size={16} /> },
  { id: 'footer-settings', label: 'Footer', icon: <LayoutGrid size={16} /> },
]

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function useVoices(engineId: string): TtsVoice[] {
  const [voices, setVoices] = useState<TtsVoice[]>([])
  useEffect(() => {
    let active = true
    const engine = createTtsEngine(engineId)
    void engine
      .listVoices()
      .then((v) => { if (active) setVoices(v) })
      .catch(() => { if (active) setVoices([]) })
    return () => { active = false }
  }, [engineId])
  return voices
}

export function ReaderActionBar(props: ReaderActionBarProps) {
  const [mode, setMode] = useState<FooterMode>('default')
  const reading = useSettingsStore((s) => s.reading)
  const setReading = useSettingsStore((s) => s.setReading)

  // Open TTS panel automatically when TTS transitions from idle to active
  // (e.g. triggered from a media session control or the action bar tap).
  const prevTtsStatusRef = useRef(props.ttsStatus)
  useEffect(() => {
    const prev = prevTtsStatusRef.current
    prevTtsStatusRef.current = props.ttsStatus
    if (prev === 'idle' && props.ttsStatus !== 'idle') {
      setMode('tts')
    }
  }, [props.ttsStatus])

  if (mode === 'tts') {
    return (
      <TtsPanel
        {...props}
        onBack={() => setMode('default')}
      />
    )
  }

  if (mode === 'autoscroll') {
    return (
      <AutoScrollPanel
        autoScroll={props.autoScroll}
        canAutoScroll={props.canAutoScroll}
        onToggle={props.onToggleAutoScroll}
        speed={reading.autoScrollSpeed}
        onSpeedChange={(autoScrollSpeed) => setReading({ autoScrollSpeed })}
        onBack={() => setMode('default')}
      />
    )
  }

  if (mode === 'footer-settings') {
    return (
      <FooterSettingsPanel
        actionIds={reading.footerActionIds}
        onChange={(footerActionIds) => setReading({ footerActionIds })}
        onBack={() => setMode('default')}
      />
    )
  }

  const ttsActive = props.ttsStatus !== 'idle'

  const actionMap: Record<string, ActionDef> = {
    theme: {
      id: 'theme',
      icon: props.themeMode === 'dark' ? <Sun size={20} /> : <Moon size={20} />,
      label: props.themeMode === 'dark' ? 'Light' : 'Dark',
      onClick: props.onToggleTheme,
    },
    tts: {
      id: 'tts',
      icon: props.ttsStatus === 'loading'
        ? <Loader2 size={20} className="spin" />
        : props.ttsStatus === 'playing'
        ? <Pause size={20} />
        : <Headphones size={20} />,
      label: ttsActive
        ? props.ttsStatus === 'playing' ? 'Listening'
        : props.ttsStatus === 'loading' ? 'Loading…'
        : 'Paused'
        : 'Listen',
      active: ttsActive,
      onClick: () => {
        setMode('tts')
        if (props.ttsStatus === 'idle') props.onTtsPlay()
      },
    },
    autoscroll: {
      id: 'autoscroll',
      icon: <ChevronsDown size={20} />,
      label: 'Scroll',
      active: props.autoScroll,
      disabled: !props.canAutoScroll,
      onClick: () => setMode('autoscroll'),
    },
    toc: {
      id: 'toc',
      icon: <List size={20} />,
      label: 'Contents',
      onClick: () => props.onOpenPanel('toc'),
    },
    bookmarks: {
      id: 'bookmarks',
      icon: <Bookmark size={20} />,
      label: 'Marks',
      onClick: () => props.onOpenPanel('bookmarks'),
    },
    search: {
      id: 'search',
      icon: <Search size={20} />,
      label: 'Search',
      onClick: () => props.onOpenPanel('search'),
    },
    settings: {
      id: 'settings',
      icon: <Settings2 size={20} />,
      label: 'Reading',
      onClick: props.onOpenSettings,
    },
    'footer-settings': {
      id: 'footer-settings',
      icon: <LayoutGrid size={20} />,
      label: 'Footer',
      onClick: () => setMode('footer-settings'),
    },
  }

  const visibleActions = reading.footerActionIds
    .map((id) => actionMap[id])
    .filter(Boolean)

  return (
    <nav className="reader-action-bar" aria-label="Reader actions">
      {visibleActions.map((action) => (
        <button
          key={action.id}
          className={`reader-action${action.active ? ' active' : ''}`}
          onClick={action.onClick}
          disabled={action.disabled}
          aria-label={action.label}
          aria-pressed={action.active}
        >
          <span className="reader-action-icon">{action.icon}</span>
          <span className="reader-action-label">{action.label}</span>
        </button>
      ))}
    </nav>
  )
}

// --- TTS sub-panel ---

interface TtsPanelProps extends ReaderActionBarProps {
  onBack: () => void
}

function TtsPanel({
  ttsStatus,
  ttsError,
  ttsSleepMinutes,
  ttsSleepSecondsRemaining,
  onTtsPlay,
  onTtsPause,
  onTtsResume,
  onTtsStop,
  onTtsSetSleep,
  onBack,
}: TtsPanelProps) {
  const ttsPrefs = useSettingsStore((s) => s.tts)
  const setTts = useSettingsStore((s) => s.setTts)
  const voices = useVoices(ttsPrefs.engineId)

  const voiceOptions: SelectOption[] = [
    { value: '', label: 'Default' },
    ...voices.map((v) => ({
      value: v.id,
      label: v.lang ? `${v.name} (${v.lang})` : v.name,
    })),
  ]

  return (
    <div className="reader-footer-panel">
      <div className="reader-footer-panel-header">
        <button className="btn btn-icon" onClick={onBack} aria-label="Back">
          <ChevronLeft size={18} />
        </button>
        <span className="reader-footer-panel-title">Listening</span>
        {ttsError && <span className="muted" style={{ fontSize: 12 }}>{ttsError}</span>}
      </div>

      <div className="reader-footer-tts-controls">
        {ttsStatus === 'idle' && (
          <button className="btn btn-primary" onClick={onTtsPlay}>
            <Play size={16} /> Start
          </button>
        )}
        {ttsStatus === 'loading' && (
          <button className="btn" disabled>
            <Loader2 size={16} className="spin" /> Loading…
          </button>
        )}
        {ttsStatus === 'playing' && (
          <button className="btn" onClick={onTtsPause}>
            <Pause size={16} /> Pause
          </button>
        )}
        {ttsStatus === 'paused' && (
          <button className="btn btn-primary" onClick={onTtsResume}>
            <Play size={16} /> Resume
          </button>
        )}
        {ttsStatus !== 'idle' && ttsStatus !== 'loading' && (
          <button className="btn" onClick={onTtsStop}>
            <Square size={16} /> Stop
          </button>
        )}
      </div>

      <Slider
        label="Speed"
        min={0.5}
        max={2}
        step={0.05}
        value={ttsPrefs.rate}
        onChange={(rate) => setTts({ rate })}
        formatValue={(v) => `${v.toFixed(2)}×`}
      />

      <div className="setting-row" style={{ paddingTop: 8 }}>
        <span>Voice</span>
        <Select
          ariaLabel="Voice"
          value={ttsPrefs.voiceId}
          onChange={(voiceId) => setTts({ voiceId })}
          options={voiceOptions}
          upward
        />
      </div>

      <div className="setting-row">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={14} />
          Sleep timer
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <Select
            ariaLabel="Sleep timer"
            value={String(ttsSleepMinutes ?? 0)}
            onChange={(v) => onTtsSetSleep(Number(v) || null)}
            options={SLEEP_OPTIONS}
            upward
          />
          {ttsSleepSecondsRemaining !== null && (
            <span className="tts-timer-display">
              <Clock size={12} />
              {formatTime(ttsSleepSecondsRemaining)} remaining
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Auto-scroll sub-panel ---

interface AutoScrollPanelProps {
  autoScroll: boolean
  canAutoScroll: boolean
  onToggle: () => void
  speed: number
  onSpeedChange: (speed: number) => void
  onBack: () => void
}

function AutoScrollPanel({
  autoScroll,
  canAutoScroll,
  onToggle,
  speed,
  onSpeedChange,
  onBack,
}: AutoScrollPanelProps) {
  return (
    <div className="reader-footer-panel">
      <div className="reader-footer-panel-header">
        <button className="btn btn-icon" onClick={onBack} aria-label="Back">
          <ChevronLeft size={18} />
        </button>
        <span className="reader-footer-panel-title">Auto-scroll</span>
      </div>

      {!canAutoScroll && (
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Auto-scroll is only available for text and MOBI books.
        </p>
      )}

      <div className="setting-row" style={{ opacity: canAutoScroll ? 1 : 0.45 }}>
        <span>Active</span>
        <Toggle
          ariaLabel="Auto-scroll"
          checked={autoScroll}
          onChange={canAutoScroll ? onToggle : () => {}}
        />
      </div>

      <Slider
        label="Speed"
        min={10}
        max={120}
        step={5}
        value={speed}
        onChange={onSpeedChange}
        formatValue={(v) => `${v} px/s`}
      />
    </div>
  )
}

// --- Footer settings panel ---

interface FooterSettingsPanelProps {
  actionIds: string[]
  onChange: (ids: string[]) => void
  onBack: () => void
}

function FooterSettingsPanel({ actionIds, onChange, onBack }: FooterSettingsPanelProps) {
  const toggle = (id: string) => {
    if (actionIds.includes(id)) {
      onChange(actionIds.filter((a) => a !== id))
    } else {
      const order = ALL_ACTION_META.map((a) => a.id)
      onChange([...actionIds, id].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
    }
  }

  return (
    <div className="reader-footer-panel">
      <div className="reader-footer-panel-header">
        <button className="btn btn-icon" onClick={onBack} aria-label="Back">
          <ChevronLeft size={18} />
        </button>
        <span className="reader-footer-panel-title">Footer actions</span>
      </div>
      {ALL_ACTION_META.map((action) => (
        <div key={action.id} className="setting-row">
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--color-text-muted)' }}>{action.icon}</span>
            {action.label}
          </span>
          <Toggle
            ariaLabel={action.label}
            checked={actionIds.includes(action.id)}
            onChange={() => toggle(action.id)}
          />
        </div>
      ))}
    </div>
  )
}
