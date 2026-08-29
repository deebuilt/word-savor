/**
 * Generates the PWA icons from one SVG source.
 *
 * Run with `npm run icons` after changing `public/favicon.svg`. The output is
 * committed, so a normal build and deploy never runs this — a missing icon
 * would only surface as a phone silently refusing to install the app, which is
 * a bad thing to discover from a CI log.
 *
 * Three sizes, and they are not the same picture:
 *
 * - **192 and 512, `any`** — the icon as drawn, corners included.
 * - **512 `maskable`** — Android crops every icon to whatever shape the
 *   launcher uses, which can be a circle. A maskable icon must therefore keep
 *   everything important inside a centre circle covering 80% of the canvas, and
 *   flood the rest with background colour. Shipping the plain icon as maskable
 *   is what produces the letter with its corners sliced off.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const SOURCE = 'public/favicon.svg'
/** Matches `--ws-paper` in `theme.css`, so the padding is invisible. */
const BACKGROUND = '#2f4858'

const svg = readFileSync(SOURCE)

/** The icon as drawn, on a transparent ground. */
async function plain(size, out) {
  const png = await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer()
  writeFileSync(out, png)
  console.log(`${out} — ${size}×${size}`)
}

/**
 * The safe-zone version.
 *
 * The artwork is scaled to 80% and centred on a filled square, so a launcher
 * cropping to a circle still shows the whole mark.
 */
async function maskable(size, out) {
  const inner = Math.round(size * 0.8)
  const art = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer()

  const png = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([{ input: art, gravity: 'centre' }])
    .png()
    .toBuffer()

  writeFileSync(out, png)
  console.log(`${out} — ${size}×${size} maskable`)
}

await plain(192, 'public/icon-192.png')
await plain(512, 'public/icon-512.png')
await maskable(512, 'public/icon-512-maskable.png')
// iOS ignores the manifest's icons and reads this one from a <link> tag. It is
// never masked, so it uses the plain artwork.
await plain(180, 'public/apple-touch-icon.png')
