import type { HighlightColor } from '@/domain/models'
import { useTheme } from '@/theme/ThemeProvider'

const COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'purple']

interface SelectionMenuProps {
  text: string
  onHighlight: (color: HighlightColor) => void
  onBookmark: () => void
  onReadHere: () => void
  onDismiss: () => void
}

/** Floating actions shown when text is selected in the reader. */
export function SelectionMenu({
  text,
  onHighlight,
  onBookmark,
  onReadHere,
  onDismiss,
}: SelectionMenuProps) {
  const { theme } = useTheme()
  return (
    <div
      className="selection-menu"
      style={{ top: 72, left: '50%', transform: 'translateX(-50%)' }}
      role="menu"
      aria-label={`Actions for selected text: ${text.slice(0, 40)}`}
    >
      {COLORS.map((color) => (
        <button
          key={color}
          className="swatch"
          style={{ background: theme.tokens.highlight[color] }}
          aria-label={`Highlight ${color}`}
          onClick={() => onHighlight(color)}
        />
      ))}
      <button className="btn" onClick={onBookmark}>
        Bookmark
      </button>
      <button className="btn" onClick={onReadHere}>
        ▶ Read here
      </button>
      <button className="btn" onClick={onDismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  )
}
