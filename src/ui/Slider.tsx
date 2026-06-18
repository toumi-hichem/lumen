interface SliderProps {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
  formatValue?: (value: number) => string
}

export function Slider({ label, min, max, step, value, onChange, formatValue }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100

  return (
    <div className="slider-wrap">
      <div className="slider-header">
        <span className="slider-label">{label}</span>
        <span className="slider-value">{formatValue ? formatValue(value) : value}</span>
      </div>
      <div className="slider-track-wrap">
        <div className="slider-track-bg" />
        <div className="slider-track-fill" style={{ width: `${pct}%` }} />
        <div className="slider-thumb" style={{ left: `${pct}%` }} />
        <input
          type="range"
          className="slider-native"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
        />
      </div>
    </div>
  )
}
