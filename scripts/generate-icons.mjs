/**
 * Generate PWA icons from public/favicon.svg using sharp.
 *
 * Produces:
 *   public/icon-192.png          (purpose: any)
 *   public/icon-512.png          (purpose: any)
 *   public/icon-maskable-512.png (purpose: maskable; logo inside the 80%
 *                                 safe zone on the app background color)
 *
 * Run: bun run icons
 */
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = await readFile(join(root, 'public', 'favicon.svg'))

const BACKGROUND = '#F7F8FA'

async function plain(size) {
  await sharp(svg)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(root, 'public', `icon-${size}.png`))
  console.log(`icon-${size}.png`)
}

async function maskable(size) {
  // Keep the logo inside the maskable safe zone (~80% central circle).
  const inner = Math.round(size * 0.62)
  const logo = await sharp(svg)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  await sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(join(root, 'public', `icon-maskable-${size}.png`))
  console.log(`icon-maskable-${size}.png`)
}

await plain(192)
await plain(512)
await maskable(512)
