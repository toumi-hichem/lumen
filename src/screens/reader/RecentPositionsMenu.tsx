import type { JumpEntry } from './useReader'

interface RecentPositionsMenuProps {
  entries: JumpEntry[]
  onSelect: (entry: JumpEntry) => void
  onExit: () => void
  onClose: () => void
}

/**
 * Small safety-net menu shown on the first back press when the reader saw big
 * position jumps (progress-bar seeks, TOC jumps, fast page flips). It offers
 * the positions the user navigated away from, so an accidental jump is one
 * tap to undo instead of lost. "Exit" leaves the reader as the back button
 * normally would.
 */
export function RecentPositionsMenu({
  entries,
  onSelect,
  onExit,
  onClose,
}: RecentPositionsMenuProps) {
  return (
    <div className="recent-positions-backdrop" onClick={onClose}>
      <div
        className="recent-positions-menu"
        onClick={(e) => e.stopPropagation()}
        role="menu"
        aria-label="Recent positions"
      >
        <div className="recent-positions-title">Jump back to</div>
        {entries.map((entry) => (
          <button
            key={`${entry.cfi}-${entry.at}`}
            className="list-item"
            role="menuitem"
            onClick={() => onSelect(entry)}
          >
            <strong>{entry.chapterTitle ?? 'Position'}</strong>
            <span className="muted"> · {Math.round(entry.progress * 100)}%</span>
          </button>
        ))}
        <button className="list-item recent-positions-exit" role="menuitem" onClick={onExit}>
          Exit reader
        </button>
      </div>
    </div>
  )
}
