interface IconProps {
  /** Inner SVG markup (paths/circles) drawn on a 24×24 stroke grid. */
  path: string
  size?: number
  className?: string
}

/**
 * Lightweight stroke icon. Icons are stored as inner SVG markup so the whole
 * set lives in plain data (see ui/icons.ts) and inherits `currentColor`.
 */
export function Icon({ path, size = 22, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: path }}
    />
  )
}
