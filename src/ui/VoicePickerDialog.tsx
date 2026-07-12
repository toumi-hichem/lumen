import { useMemo, useState } from 'react'
import { Check, ChevronDown, Loader2, Search, Square, Volume2, X } from 'lucide-react'
import type { TtsVoice } from '@/tts/types'
import type { VoicePreviewApi } from './voiceHooks'

interface VoicePickerDialogProps {
  voices: TtsVoice[]
  value: string
  onChange: (id: string) => void
  /** Optional per-voice audio preview (a small play button on each row). */
  preview?: VoicePreviewApi
}

function voiceSubtitle(voice: TtsVoice): string | null {
  if (voice.lang) return voice.lang
  if (voice.gender) return voice.gender === 'male' ? 'Male voice' : 'Female voice'
  return null
}

export function VoicePickerDialog({ voices, value, onChange, preview }: VoicePickerDialogProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = voices.find((v) => v.id === value)
  const triggerLabel = selected
    ? selected.lang ? `${selected.name} (${selected.lang})` : selected.name
    : 'Default'

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return voices
    return voices.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.lang && v.lang.toLowerCase().includes(q)) ||
        (v.gender && v.gender.includes(q)),
    )
  }, [voices, query])

  const close = () => {
    preview?.stop()
    setOpen(false)
    setQuery('')
  }

  const pick = (id: string) => {
    onChange(id)
    close()
  }

  const previewButton = (voice: TtsVoice | null) => {
    if (!preview) return null
    const id = voice?.id ?? ''
    const active = preview.previewingId === id
    return (
      <button
        className={`voice-picker-preview${active ? ' active' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          preview.toggle(voice)
        }}
        aria-label={active ? 'Stop preview' : `Preview ${voice?.name ?? 'default voice'}`}
      >
        {active && preview.loading ? (
          <Loader2 size={14} className="spin" />
        ) : active ? (
          <Square size={13} />
        ) : (
          <Volume2 size={14} />
        )}
      </button>
    )
  }

  // Rows are divs (not buttons) so the nested preview button stays valid HTML.
  const row = (voice: TtsVoice | null) => {
    const id = voice?.id ?? ''
    const isSelected = id === value
    return (
      <div
        key={id || 'default'}
        className={`voice-picker-item${isSelected ? ' selected' : ''}`}
        role="option"
        aria-selected={isSelected}
        tabIndex={0}
        onClick={() => pick(id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            pick(id)
          }
        }}
      >
        <div className="voice-picker-item-info">
          <span className="voice-picker-item-name">{voice?.name ?? 'Default'}</span>
          {voice && voiceSubtitle(voice) && (
            <span className="voice-picker-item-lang">{voiceSubtitle(voice)}</span>
          )}
        </div>
        {previewButton(voice)}
        {isSelected && <Check size={16} className="voice-picker-check" />}
      </div>
    )
  }

  return (
    <>
      <button className="select-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="select-value">{triggerLabel}</span>
        <ChevronDown size={16} className="select-caret" />
      </button>

      {open && (
        <div className="voice-picker-backdrop" onClick={close}>
          <div className="voice-picker-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="voice-picker-header">
              <span className="voice-picker-title">Choose voice</span>
              <button className="btn btn-icon" onClick={close} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="voice-picker-search">
              <Search size={15} className="voice-picker-search-icon" />
              <input
                className="voice-picker-search-input"
                type="text"
                placeholder="Search by name or language..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              {query && (
                <button className="btn btn-icon" style={{ padding: 4 }} onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="voice-picker-list" role="listbox" aria-label="Voice options">
              {row(null)}
              {filtered.map((v) => row(v))}
              {filtered.length === 0 && (
                <p className="voice-picker-empty">No voices match</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
