import type { ReactNode } from 'react'

interface SettingSectionProps {
  icon: ReactNode
  title: string
  /** Optional one-line explanation under the title. */
  hint?: string
  children: ReactNode
}

/** A titled settings card: icon + heading, optional hint, then the rows. */
export function SettingSection({ icon, title, hint, children }: SettingSectionProps) {
  return (
    <section className="settings-section card settings-card">
      <header className="settings-card-header">
        <span className="settings-card-icon">{icon}</span>
        <div>
          <h2>{title}</h2>
          {hint && <p className="muted settings-hint">{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}
