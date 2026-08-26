import { X } from 'lucide-react'
import { ThemePicker } from '../settings/ThemePicker'

interface ThemeDialogProps {
  onClose: () => void
}

/**
 * Full theme chooser as a bottom sheet, opened from the reader footer. It
 * reuses the settings picker so both places offer the same looks and modes.
 */
export function ThemeDialog({ onClose }: ThemeDialogProps) {
  return (
    <div
      className="theme-dialog-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Theme"
    >
      <div className="theme-dialog-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="theme-dialog-header">
          <span className="theme-dialog-title">Theme</span>
          <button className="btn btn-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="theme-dialog-body">
          <ThemePicker />
        </div>
      </div>
    </div>
  )
}
