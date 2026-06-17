import { useLayoutEffect, useRef, useState } from 'react'
import type { HighlightColor } from '@/domain/models'
import type { SelectionRect } from '@/reader/types'
import { useTheme } from '@/theme/ThemeProvider'
import { Icon } from '@/ui/Icon'
import { icons } from '@/ui/icons'
import { positionSelectionMenu, type MenuPosition } from '@/lib/selectionMenu'

const COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'purple']

interface SelectionMenuProps {
  text: string
  rect?: SelectionRect
  onHighlight: (color: HighlightColor) => void
  onBookmark: () => void
  onReadHere: () => void
  onDismiss: () => void
}

/** Floating, richer actions shown when text is selected in the reader. */
export function SelectionMenu({
  text,
  rect,
  onHighlight,
  onBookmark,
  onReadHere,
  onDismiss,
}: SelectionMenuProps) {
  const { theme } = useTheme()
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<MenuPosition | null>(null)
  const [copied, setCopied] = useState(false)

  // Measure the rendered menu, then anchor it to the selection within the
  // viewport. Falls back to a fixed top-center position when no rect is known.
  useLayoutEffect(() => {
    if (!rect || !menuRef.current) return
    const { offsetWidth: width, offsetHeight: height } = menuRef.current
    setPos(
      positionSelectionMenu(
        rect,
        { width, height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    )
  }, [rect, text])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard unavailable */
    }
  }

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ text })
      else await copy()
    } catch {
      /* share dismissed */
    }
  }

  const define = () => {
    const term = text.trim().split(/\s+/).slice(0, 3).join(' ')
    window.open(
      `https://www.google.com/search?q=${encodeURIComponent(`define ${term}`)}`,
      '_blank',
      'noopener',
    )
  }

  const style: React.CSSProperties = pos
    ? { top: pos.top, left: pos.left }
    : { top: 72, left: '50%', transform: 'translateX(-50%)' }

  return (
    <div
      ref={menuRef}
      className="selection-menu"
      style={style}
      role="menu"
      aria-label={`Actions for selected text: ${text.slice(0, 40)}`}
    >
      <div className="selection-swatches">
        {COLORS.map((color) => (
          <button
            key={color}
            className="swatch"
            style={{ background: theme.tokens.highlight[color] }}
            aria-label={`Highlight ${color}`}
            onClick={() => onHighlight(color)}
          />
        ))}
      </div>
      <div className="selection-actions">
        <Action icon={icons.copy} label={copied ? 'Copied' : 'Copy'} onClick={() => void copy()} />
        <Action icon={icons.play} label="Read here" onClick={onReadHere} />
        <Action icon={icons.bookmark} label="Bookmark" onClick={onBookmark} />
        <Action icon={icons.define} label="Define" onClick={define} />
        <Action icon={icons.share} label="Share" onClick={() => void share()} />
        <Action icon={icons.close} label="Dismiss" onClick={onDismiss} />
      </div>
    </div>
  )
}

function Action({
  icon,
  label,
  onClick,
}: {
  icon: string
  label: string
  onClick: () => void
}) {
  return (
    <button className="selection-action" onClick={onClick} aria-label={label} role="menuitem">
      <Icon path={icon} size={18} />
      <span>{label}</span>
    </button>
  )
}
