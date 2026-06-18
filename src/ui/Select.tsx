import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './Icon'
import { icons } from './icons'

export interface SelectOption {
  value: string
  label: string
  hint?: string
  disabled?: boolean
}

interface SelectProps {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
  /** Open the popover above the trigger instead of below. */
  upward?: boolean
}

/**
 * Custom listbox dropdown that matches the app's theme tokens instead of the
 * native (unstyleable) `<select>`. Keyboard accessible: Enter/Space/ArrowDown
 * opens, arrows move, Enter selects, Escape closes.
 */
export function Select({ value, options, onChange, ariaLabel, className, upward }: SelectProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const selected = options.find((o) => o.value === value)
  const selectableIndexes = options
    .map((o, i) => (o.disabled ? -1 : i))
    .filter((i) => i >= 0)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const openMenu = () => {
    const current = options.findIndex((o) => o.value === value)
    setActive(current >= 0 ? current : (selectableIndexes[0] ?? 0))
    setOpen(true)
  }

  const move = (dir: 1 | -1) => {
    const pos = selectableIndexes.indexOf(active)
    const next = selectableIndexes[(pos + dir + selectableIndexes.length) % selectableIndexes.length]
    if (next != null) setActive(next)
  }

  const choose = (i: number) => {
    const opt = options[i]
    if (!opt || opt.disabled) return
    onChange(opt.value)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        openMenu()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        move(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        move(-1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        choose(active)
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
    }
  }

  return (
    <div className={`select-wrap ${className ?? ''}`} ref={wrapRef}>
      <button
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="select-value">{selected?.label ?? 'Select…'}</span>
        <Icon path={icons.chevronDown} size={16} className="select-caret" />
      </button>
      {open && (
        <ul className={`select-popover${upward ? ' upward' : ''}`} role="listbox" id={listId} aria-label={ariaLabel}>
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled}
              className={`select-option ${i === active ? 'active' : ''} ${
                o.disabled ? 'disabled' : ''
              }`}
              onMouseEnter={() => !o.disabled && setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(i)
              }}
            >
              <span className="select-option-label">{o.label}</span>
              {o.hint && <small className="muted">{o.hint}</small>}
              {o.value === value && (
                <Icon path={icons.check} size={16} className="select-option-check" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
