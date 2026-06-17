interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  ariaLabel: string
}

/** Themed on/off switch using the `switch` role for accessibility. */
export function Toggle({ checked, onChange, ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  )
}
