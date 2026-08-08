export interface CoverGradientStyle {
  background: string
  color: string
}

/** Deterministic hue from a title, shared by every fallback-cover renderer. */
function titleHue(title: string): number {
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) % 360
  return hash
}

/** CSS gradient for book covers with no cover art (library grid, home shelf). */
export function coverGradientCss(title: string): CoverGradientStyle {
  const hue = titleHue(title)
  return {
    background: `linear-gradient(135deg, hsl(${hue} 50% 45%), hsl(${(hue + 40) % 360} 55% 35%))`,
    color: '#fff',
  }
}

/**
 * Rasterize the same gradient (plus the title) as a PNG data URL, for
 * surfaces that can't render CSS — namely the native Android notification's
 * large icon. Returns undefined where canvas 2D isn't available (e.g. jsdom
 * in tests), which callers treat the same as "no cover".
 */
export function renderCoverPlaceholder(title: string, size = 256): string | undefined {
  if (typeof document === 'undefined') return undefined
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined

  const hue = titleHue(title)
  const gradient = ctx.createLinearGradient(0, 0, size, size)
  gradient.addColorStop(0, `hsl(${hue}, 50%, 45%)`)
  gradient.addColorStop(1, `hsl(${(hue + 40) % 360}, 55%, 35%)`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${Math.round(size / 9)}px sans-serif`
  drawWrappedTitle(ctx, title, size / 2, size / 2, size * 0.82, Math.round(size / 7.5))

  return canvas.toDataURL('image/png')
}

/** Word-wraps into at most 3 centered lines; a notification icon is too small for more. */
function drawWrappedTitle(
  ctx: CanvasRenderingContext2D,
  title: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const maxLines = 3
  const words = title.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line)
      line = word
      if (lines.length === maxLines) break
    } else {
      line = candidate
    }
  }
  if (lines.length < maxLines && line) lines.push(line)

  const startY = y - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((text, i) => ctx.fillText(text, x, startY + i * lineHeight))
}
