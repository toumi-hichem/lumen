import { useMemo, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import type { TtsVoice } from '@/tts/types'

interface VoicePickerDialogProps {
  voices: TtsVoice[]
  value: string
  onChange: (id: string) => void
}

export function VoicePickerDialog({ voices, value, onChange }: VoicePickerDialogProps) {
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
        (v.lang && v.lang.toLowerCase().includes(q)),
    )
  }, [voices, query])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const pick = (id: string) => {
    onChange(id)
    close()
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
              <button
                className={`voice-picker-item${value === '' ? ' selected' : ''}`}
                role="option"
                aria-selected={value === ''}
                onClick={() => pick('')}
              >
                <div className="voice-picker-item-info">
                  <span className="voice-picker-item-name">Default</span>
                </div>
                {value === '' && <Check size={16} className="voice-picker-check" />}
              </button>

              {filtered.map((v) => (
                <button
                  key={v.id}
                  className={`voice-picker-item${v.id === value ? ' selected' : ''}`}
                  role="option"
                  aria-selected={v.id === value}
                  onClick={() => pick(v.id)}
                >
                  <div className="voice-picker-item-info">
                    <span className="voice-picker-item-name">{v.name}</span>
                    {v.lang && <span className="voice-picker-item-lang">{v.lang}</span>}
                  </div>
                  {v.id === value && <Check size={16} className="voice-picker-check" />}
                </button>
              ))}

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
